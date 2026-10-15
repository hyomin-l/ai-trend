import { request } from "node:https";
import { promisify } from "node:util";
import { gunzip, inflate, brotliDecompress } from "node:zlib";
import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { parseFeed } from "@/lib/rss";
import { ARTICLE_READING as LIMITS } from "@/config/sources";
import type { RawItem, ReadingInfo } from "@/types";

export type ArticleEvidence = { text: string; reading: ReadingInfo };
type Body = { text: string; via: ReadingInfo["via"]; originalUrl?: string };
type Cached = Body | { reason: string };
const USER_AGENT = "ai-trend/0.1";
function fail(reason: string): never { throw new Error(reason); }
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

function plainText(input: string): string {
  const { document } = parseHTML(`<html><body>${input}</body></html>`);
  document.querySelectorAll("script,style,nav,footer,form,iframe,template,noscript").forEach((node) => node.remove());
  return normalize(document.body.textContent ?? "");
}

const LINK = /\[([^\]]*)\]\([^)]*\)/g;
/** README / model-card markdown to prose: no front matter, comments, images or badges, and no lines that are only links (language bars, TOC), tags or rules. */
function markdownText(md: string): string {
  return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .split("\n")
    .filter((line) => /[\p{L}\p{N}]/u.test(line.replace(LINK, "").replace(/<[^>]*>|https?:\/\/\S+/g, "")))
    .map((line) => line.replace(LINK, "$1").replace(/^\s*#+\s*/, ""))
    .join("\n");
}

const decompressors = {gzip: promisify(gunzip), deflate: promisify(inflate), br: promisify(brotliDecompress)};
async function unpack(bytes: Buffer, encoding: string, signal: AbortSignal): Promise<Buffer> {
  if (!encoding || encoding === "identity") return bytes;
  const decompress = decompressors[encoding as keyof typeof decompressors];
  if (!decompress) fail("unsupported-encoding");
  try { return await bounded(decompress(bytes, {maxOutputLength: LIMITS.maxBytes}), signal); }
  catch (error) {
    if (signal.aborted) throw signal.reason;
    fail((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE" ? "body-too-large" : "decompression-failed");
  }
}

/** Decode with the response's own charset (Content-Type, else an early <meta>); unknown labels fall back to UTF-8. */
function decode(bytes: Buffer, contentType = ""): string {
  const label = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(bytes.subarray(0, 2048).toString("latin1"))?.[1];
  try { return new TextDecoder(label).decode(bytes); } catch { return bytes.toString("utf8"); }
}

/** Threads and PR pages are conversation, not the article: the candidate's snippet describes them better than a scraped comment. */
const DISCUSSION = /^(?:github\.com\/[^/]+\/[^/]+\/(?:pull|issues|discussions)\/|news\.ycombinator\.com\/item$|(?:[\w-]+\.)?reddit\.com\/.+\/comments\/)/;

/** Cut texts to the per-article cap and share the total budget fairly (remaining / articles left), so late articles are not left empty. */
export function shareChars(texts: string[]): string[] {
  let remaining = LIMITS.totalChars;
  return texts.map((text, i) => {
    const cut = text.slice(0, Math.min(LIMITS.articleChars, Math.floor(remaining / (texts.length - i))));
    remaining -= cut.length;
    return cut;
  });
}

function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}

function publicUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { return fail("unsafe-url"); }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
    !host.includes(".") && !host.includes(":") || /(^|\.)(localhost|local|internal|lan|home|test)$/i.test(host) ||
    (ipaddr.isValid(host) && !publicAddress(host))) fail("unsafe-url");
  url.hash = "";
  return url;
}

/** Race DNS / host queues against cancellation as those APIs do not accept AbortSignal. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

class Reader {
  private robots = new Map<string, Promise<ReturnType<typeof robotsParser>>>();
  private hosts = new Map<string, Promise<void>>();
  private lastRequest = new Map<string, number>();
  private hostDelay = new Map<string, number>();
  private blockedHosts = new Map<string, string>();
  private inflight = new Map<string, Promise<Cached>>();
  private cacheDir = join(process.cwd(), "_tmp", "article-reading", new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }));
  constructor(private signal: AbortSignal) {}

  private async download(url: URL): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("request-timeout")), LIMITS.requestTimeoutMs);
    const signal = AbortSignal.any([this.signal, controller.signal]);
    const previous = this.hosts.get(url.hostname) ?? Promise.resolve();
    let unlock!: () => void;
    const slot = new Promise<void>((resolve) => { unlock = resolve; });
    this.hosts.set(url.hostname, previous.then(() => slot));
    try {
      await bounded(previous, signal);
      const blocked = this.blockedHosts.get(url.hostname);
      if (blocked) fail(blocked);
      const spacing = Math.max(LIMITS.perHostDelayMs, this.hostDelay.get(url.hostname) ?? 0);
      const delay = Math.max(0, (this.lastRequest.get(url.hostname) ?? 0) + spacing - Date.now());
      if (delay) await pause(delay, signal);
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = ipaddr.isValid(host)
        ? [{ address: host, family: ipaddr.parse(host).kind() === "ipv6" ? 6 : 4 }]
        : await bounded(lookup(host, { all: true, verbatim: true }), signal);
      if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) fail("unsafe-address");
      signal.throwIfAborted();
      this.lastRequest.set(url.hostname, Date.now());
      const pinned = addresses[0];
      return await new Promise((resolve, reject) => {
        const req = request(url, {
          agent: false, // Never reuse a socket resolved outside this validation.
          headers: { "User-Agent": USER_AGENT, Accept: url.hostname === "api.github.com" ? "application/vnd.github.raw+json" : "text/html,text/plain;q=0.9", "Accept-Encoding": "gzip, deflate, br" },
          lookup: (_host, options, callback) => {
            // Node may request an array when autoSelectFamily is enabled.
            if (typeof options === "object" && options.all) callback(null, [pinned] as never);
            else callback(null, pinned.address, pinned.family);
          },
        }, (res) => {
          const status = res.statusCode ?? 0;
          if (status === 403 || status === 429) this.blockedHosts.set(url.hostname, `http-${status}`);
          // Do not download error pages or redirect bodies.
          if (status < 200 || status >= 300) {
            res.destroy();
            resolve({ status, headers: res.headers, text: "" });
            return;
          }
          if (Number(res.headers["content-length"]) > LIMITS.maxBytes) {
            res.destroy(); req.destroy(); reject(new Error("body-too-large")); return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > LIMITS.maxBytes) {
              res.destroy(); req.destroy(); reject(new Error("body-too-large"));
            } else chunks.push(Buffer.from(chunk));
          });
          res.on("end", () => {
            unpack(Buffer.concat(chunks), String(res.headers["content-encoding"] ?? "").trim().toLowerCase(), signal)
              .then(bytes => resolve({status, headers:res.headers, text:decode(bytes, res.headers["content-type"])}), reject);
          });
          res.on("error", reject);
          res.on("aborted", () => reject(new Error("response-aborted")));
        });
        const abort = () => { req.destroy(signal.reason); reject(signal.reason); };
        signal.addEventListener("abort", abort, { once: true });
        req.on("error", reject);
        req.on("close", () => signal.removeEventListener("abort", abort));
        if (signal.aborted) abort();
        else req.end();
      });
    } finally {
      clearTimeout(timer);
      unlock();
    }
  }

  private async permission(url: URL): Promise<void> {
    let policy = this.robots.get(url.origin);
    if (!policy) {
      policy = (async () => {
        const robotsUrl = `${url.origin}/robots.txt`;
        const response = await this.fetch(robotsUrl, false);
        if (response.status === 404 || response.status === 410) return robotsParser(robotsUrl, "");
        if (response.status !== 200) fail(`robots-http-${response.status}`);
        if (/<\s*(html|body|script)\b/i.test(response.text)) fail("robots-unavailable");
        return robotsParser(robotsUrl, response.text);
      })();
      this.robots.set(url.origin, policy);
    }
    const rules = await policy;
    if (rules.isAllowed(url.href, USER_AGENT) === false) fail("robots-denied");
    const crawlDelay = rules.getCrawlDelay(USER_AGENT);
    if (crawlDelay) this.hostDelay.set(url.hostname, Math.max(this.hostDelay.get(url.hostname) ?? 0, crawlDelay * 1000));
  }

  private async fetch(input: string, checkRobots = true) {
    let url = publicUrl(input);
    for (let redirects = 0; ; redirects++) {
      this.signal.throwIfAborted();
      if (checkRobots) await this.permission(url);
      const response = await this.download(url);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects >= LIMITS.maxRedirects) fail("redirect-limit");
        const location = response.headers.location;
        if (typeof location !== "string") fail("redirect-without-location");
        url = publicUrl(new URL(location, url).href);
        continue;
      }
      return { ...response, url };
    }
  }

  private async originalArticle(url: string) {
    try {
      const response = await this.fetch(url);
      if (response.status !== 200) fail(`http-${response.status}`);
      return response;
    } catch (error) { return fail(`publisher-${(error as Error).message}`); }
  }

  /** Read only public links: a Google landing page, then one news RSS lookup if needed. */
  private async googleArticle(item: RawItem, url: URL) {
    let landing;
    try { landing = await this.fetch(url.href); }
    catch { this.signal.throwIfAborted(); } // A blocked intermediary does not forbid reading the publisher.
    if (landing?.status === 200) {
      if (landing.url.hostname !== "news.google.com") return landing;
      const {document} = parseHTML(landing.text);
      const links = [document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
        ...Array.from(document.querySelectorAll("a[href]")).filter(a => /read (?:the )?(?:full|original) article|view (?:the )?(?:full|original) article|원문/i.test(a.textContent ?? "")).map(a => a.getAttribute("href"))];
      for (const href of links) {
        try {
          const target = publicUrl(new URL(href ?? "", landing.url).href);
          if (!/(^|\.)google\.[a-z.]+$/.test(target.hostname) && target.pathname !== "/") return this.originalArticle(target.href);
        } catch { /* Not an explicit public article link. */ }
      }
    }
    let publisher = "";
    try { publisher = publicUrl(item.publisherUrl ?? `https://${item.source}`).hostname.replace(/^www\./, ""); } catch { /* Older snapshots may only have an outlet name. */ }
    const tokens = [...new Set(item.title.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].filter(w => !["the","and","for","with","from","that","of","to","in","is","are","say","says"].includes(w));
    const search = new URL("https://www.bing.com/news/search?format=rss");
    // A short query finds headline variants; the full title and publisher are checked below.
    search.searchParams.set("q", `${tokens.slice(0,6).join(" ")} ${publisher ? `site:${publisher}` : item.source.slice(0,80)}`);
    let results;
    try { results = await this.fetch(search.href); }
    catch (error) { fail(`original-lookup-${(error as Error).message}`); }
    if (results.status !== 200) fail(`original-lookup-http-${results.status}`);
    for (const result of parseFeed(results.text)) {
      try {
        let target = new URL(result.url);
        // The feed exposes the publisher URL as a plain URL query value; no opaque decoding/RPC.
        if (/(^|\.)bing\.com$/.test(target.hostname) && target.pathname === "/news/apiclick.aspx") target = new URL(target.searchParams.get("url") ?? "");
        target = publicUrl(target.href);
        if (/(^|\.)(?:google|bing)\.[a-z.]+$/.test(target.hostname) || target.pathname === "/") continue;
        if (publisher && target.hostname.replace(/^www\./, "") !== publisher && !target.hostname.endsWith(`.${publisher}`)) continue;
        const title = result.title.toLowerCase();
        const hits = tokens.filter(w => title.includes(w)).length;
        if (tokens.length < 2 || hits < Math.max(2, Math.ceil(tokens.length * (publisher ? 0.6 : 0.8)))) continue;
        return this.originalArticle(target.href);
      } catch { /* Ignore malformed, private or mismatched results, not publisher fetch failures. */ }
    }
    return fail("google-news-no-public-link");
  }

  private async readWeb(item: RawItem): Promise<Body> {
    let url = publicUrl(item.url);
    if (DISCUSSION.test(url.hostname + url.pathname)) fail("discussion-page");
    let via: ReadingInfo["via"] = "web";
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.hostname === "github.com" && parts.length === 2) {
      url = new URL(`https://api.github.com/repos/${parts[0]}/${parts[1]}/readme`);
      via = "readme";
    } else if (url.hostname === "huggingface.co" && parts.length === 2 && !["papers", "blog", "spaces", "datasets"].includes(parts[0])) {
      url = new URL(`https://huggingface.co/${parts[0]}/${parts[1]}/raw/main/README.md`);
      via = "model-card";
    }
    const googleNews = url.hostname === "news.google.com";
    const response = googleNews ? await this.googleArticle(item, url) : await this.fetch(url.href);
    if (response.status !== 200) fail(`http-${response.status}`);
    const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
    let text: string;
    if (via !== "web" && /text\/(plain|markdown)|application\/vnd\.github\.raw/.test(contentType)) {
      text = plainText(markdownText(response.text));
    } else if (/text\/html|application\/xhtml/.test(contentType)) {
      if (/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(response.text)) fail("paywall");
      const { document } = parseHTML(response.text);
      document.querySelectorAll("script,style,nav,footer,form,iframe,template,noscript").forEach((node) => node.remove());
      // linkedom parses inert markup only: no JS execution or resource fetching.
      const article = new Readability(document as unknown as Document).parse();
      text = normalize(article?.textContent ?? "");
    } else fail("unsupported-content-type");
    if (text.length < LIMITS.minBodyChars) fail("extraction-failed");
    if (via === "web") { // generic extraction can pick a cookie wall, an error page or another story
      const words = [...new Set(`${item.title} ${item.snippet}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
      const head = text.slice(0, 3000).toLowerCase();
      if (words.length >= 3 && words.filter((w) => head.includes(w)).length < 2) fail("unrelated-body");
    }
    return { text: text.slice(0, LIMITS.articleChars), via, ...(googleNews && {originalUrl: response.url.href}) };
  }

  async read(item: RawItem): Promise<ArticleEvidence> {
    const feed = plainText((item.content ?? "").slice(0, LIMITS.maxBytes));
    if (feed.length >= LIMITS.minBodyChars) {
      const text = feed.slice(0, LIMITS.articleChars);
      return { text, reading: { status: "body", via: /papers/i.test(item.source) || /^https:\/\/(?:huggingface\.co\/papers\/|arxiv\.org\/abs\/)/.test(item.url) ? "abstract" : "rss", chars: text.length } };
    }
    let pending = this.inflight.get(item.url);
    if (!pending) {
      pending = this.cachedRead(item);
      this.inflight.set(item.url, pending);
    }
    const result = await pending;
    if ("reason" in result) {
      const text = plainText(item.snippet).slice(0, LIMITS.articleChars);
      return { text, reading: { status: "snippet", via: "snippet", chars: text.length, reason: result.reason } };
    }
    return { text: result.text, reading: { status: "body", via: result.via, chars: result.text.length, ...(result.originalUrl && {url:result.originalUrl}) } };
  }

  private async cachedRead(item: RawItem): Promise<Cached> {
    const path = join(this.cacheDir, `${createHash("sha256").update(item.url).digest("hex")}.json`);
    try {
      const cached = JSON.parse(await readFile(path, "utf8"));
      const correctedFailure = cached.version === 1 && (cached.reason === "unsupported-encoding" || (new URL(item.url).hostname === "news.google.com" && ["robots-denied", "google-news-no-public-link"].includes(cached.reason)));
      if (!correctedFailure && [1,2].includes(cached.version) && cached.url === item.url &&
        (typeof cached.reason === "string" || (typeof cached.text === "string" && cached.text.length >= LIMITS.minBodyChars && ["web", "readme", "model-card"].includes(cached.via)))) {
        return "reason" in cached ? { reason: cached.reason } : { text: cached.text.slice(0, LIMITS.articleChars), via: cached.via, ...(cached.originalUrl && {originalUrl: publicUrl(cached.originalUrl).href}) };
      }
    } catch { /* A missing/corrupt cache simply requires a fresh safe read. */ }
    let result: Cached;
    try { result = await this.readWeb(item); }
    catch (error) { result = { reason: this.signal.aborted ? "total-timeout" : error instanceof Error ? error.message : "read-failed" }; }
    if ("reason" in result && result.reason === "total-timeout") return result; // transient: a later run should retry
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(path, JSON.stringify({ version: 2, url: item.url, ...result }), "utf8");
    } catch { /* Cache failure must not affect the edition. */ }
    return result;
  }
}

/** Input is already selected: no discovery, retries, browser or credentials. */
export async function readArticles(items: RawItem[]): Promise<Map<string, ArticleEvidence>> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("total-timeout")), LIMITS.totalTimeoutMs);
  const reader = new Reader(controller.signal);
  const selected = items.slice(0, LIMITS.maxArticles);
  const evidence: ArticleEvidence[] = new Array(selected.length);
  let cursor = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(LIMITS.concurrency, selected.length) }, async () => {
      while (cursor < selected.length) {
        const i = cursor++;
        evidence[i] = await reader.read(selected[i]);
      }
    }));
    const texts = shareChars(evidence.map((e) => e.text));
    const result = new Map(selected.map((item, i): [string, ArticleEvidence] => [item.id, { text: texts[i], reading: { ...evidence[i].reading, chars: texts[i].length } }]));
    console.info(`[reading] ${Date.now() - started}ms; ${result.size} articles; ${texts.join("").length} chars; ${[...result.values()].filter((e) => e.reading.status === "body").length} bodies`);
    return result;
  } finally { clearTimeout(timer); }
}
