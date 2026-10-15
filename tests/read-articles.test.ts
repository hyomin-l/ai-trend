import {gzipSync,deflateSync,brotliCompressSync} from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RawItem } from "@/types";
import { ARTICLE_READING } from "@/config/sources";
import { readArticles } from "@/lib/read-articles";

const net = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: net.lookup }));
vi.mock("node:https", () => ({ request: net.request }));
const body = "The research team released a model with open weights and evaluated it on realistic tasks. It improves accuracy and explains limitations for deployment. ".repeat(12);
const html = `<html><head><title>Model release</title></head><body><nav>BUY NAVIGATION ${"menu ".repeat(100)}</nav><main><article><h1>Model release</h1><p>${body}</p><p>${body}</p></article></main><script>globalThis.EXECUTED = true</script><footer>FOOTER</footer></body></html>`;
const item = (url = "https://publisher.example/story", extra: Partial<RawItem> = {}): RawItem => ({ id: url, url, source: "Publisher", section: "newsroom", title: "Research team model release", snippet: "Feed fallback", ...extra });
const missingRobots = (url: string) => url.endsWith("/robots.txt");
type Reply = { status?: number; body?: string; bytes?: Buffer; headers?: Record<string, string>; hang?: boolean; hangBody?: boolean; chunks?: string[] };
let calls: { url: string; options: any; at: number }[];
let reply: (url: string) => Reply;
let dir: string;
const originalLimits = { ...ARTICLE_READING };
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "article-reader-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  vi.spyOn(console, "info").mockImplementation(() => {});
  Object.assign(ARTICLE_READING, { perHostDelayMs: 1, requestTimeoutMs: 1000, totalTimeoutMs: 2000 });
  calls = [];
  net.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  reply = (url) => new URL(url).pathname === "/robots.txt" ? { body: "User-agent: *\nAllow: /" } : { body: html, headers: { "content-type": "text/html; charset=utf-8" } };
  net.request.mockImplementation((url: URL, options: any, callback: any) => {
    calls.push({ url: String(url), options, at: Date.now() });
    const req: any = new EventEmitter();
    req.destroy = (error?: Error) => { if (error) queueMicrotask(() => req.emit("error", error)); };
    req.end = () => queueMicrotask(() => {
      const r = reply(String(url));
      if (r.hang) return;
      const res: any = r.hangBody ? new Readable({ read() {} }) : Readable.from(r.bytes ? [r.bytes] : (r.chunks ?? [r.body ?? ""]).map((s) => Buffer.from(s)));
      res.statusCode = r.status ?? 200;
      res.headers = r.headers ?? { "content-type": "text/plain" };
      callback(res);
    });
    return req;
  });
});
afterEach(async () => {
  Object.assign(ARTICLE_READING, originalLimits);
  vi.restoreAllMocks();
  net.request.mockReset(); net.lookup.mockReset();
  await rm(dir, { recursive: true, force: true });
});

describe("selected article evidence", () => {
  it("uses a long RSS body without HTTP, strips scripts and limits evidence to the per-article cap", async () => {
    const evidence = (await readArticles([item(undefined, { content: `<p>${body}</p><script>evil()</script>` })])).values().next().value!;
    expect(evidence.reading).toEqual({ status: "body", via: "rss", chars: 600 });
    expect(evidence.text).toHaveLength(ARTICLE_READING.articleChars);
    expect(evidence.text).not.toContain("evil");
    expect(calls).toHaveLength(0);
  });
  it("uses paper abstracts and never requests their PDF", async () => {
    const result = await readArticles([item("https://huggingface.co/papers/2601.12345", { source: "Hugging Face Papers", content: body })]);
    expect([...result.values()][0].reading.via).toBe("abstract");
    expect(calls).toHaveLength(0);
  });
  it("reads only the first maxArticles selected items and caps total input", async () => {
    const result = await readArticles(Array.from({ length: 23 }, (_, i) => item(`https://p.example/${i}`, { content: body })));
    expect(result.size).toBe(ARTICLE_READING.maxArticles);
    expect([...result.values()].reduce((n, e) => n + e.text.length, 0)).toBe(ARTICLE_READING.totalChars);
    expect([...result.values()].every((e) => e.text.length >= Math.floor(ARTICLE_READING.totalChars / ARTICLE_READING.maxArticles) && e.text.length <= ARTICLE_READING.articleChars)).toBe(true); // the budget is shared, not spent front to back
    expect(calls).toHaveLength(0);
  });
  it("extracts article text while excluding navigation and scripts, pins validated DNS", async () => {
    const evidence = [...(await readArticles([item()])).values()][0];
    expect(evidence.reading.status).toBe("body");
    expect(evidence.reading.via).toBe("web");
    expect(evidence.text).toContain("research team");
    expect(evidence.text).not.toMatch(/BUY NAVIGATION|FOOTER|EXECUTED/);
    const options = calls.find((c) => c.url.endsWith("/story"))!.options;
    expect(options.agent).toBe(false);
    let resolved: unknown;
    options.lookup("publisher.example", {}, (_: unknown, address: unknown) => { resolved = address; });
    expect(resolved).toBe("93.184.216.34");
  });
  it.each(["http://publisher.example/a", "https://user:pass@publisher.example/a", "https://publisher.example:8443/a", "https://127.0.0.1/a", "https://[::1]/a", "https://[::ffff:127.0.0.1]/a", "https://2130706433/a", "https://localhost/a", "https://metadata.google.internal/a"])("falls back without requesting unsafe URL %s", async (url) => {
    const evidence = [...(await readArticles([item(url)])).values()][0];
    expect(evidence.reading.status).toBe("snippet");
    expect(evidence.text).toBe("Feed fallback");
    expect(calls).toHaveLength(0);
  });
  it("rejects public DNS names with any private answer", async () => {
    net.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("unsafe-address");
    expect(calls).toHaveLength(0);
  });
  it("rejects private redirect targets before contacting them", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { body: "User-agent: *\nAllow: /" } : { status: 302, headers: { location: "https://169.254.169.254/latest" } };
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("unsafe-url");
    expect(calls.map((c) => c.url)).toEqual(["https://publisher.example/robots.txt", "https://publisher.example/story"]);
  });
  it("checks robots permission at redirect destinations", async () => {
    reply = (url) => {
      if (url === "https://publisher.example/robots.txt") return { body: "User-agent: *\nAllow: /" };
      if (url === "https://other.example/robots.txt") return { body: "User-agent: *\nDisallow: /" };
      return { status: 302, headers: { location: "https://other.example/article" } };
    };
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("robots-denied");
    expect(calls.some((c) => c.url === "https://other.example/article")).toBe(false);
  });
  it("respects robots disallow and allows a longer matching path", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { body: "User-agent: *\nDisallow: /\nAllow: /public/" } : { body: html, headers: { "content-type": "text/html" } };
    const result = await readArticles([item(), item("https://publisher.example/public/story")]);
    expect(result.get("https://publisher.example/story")?.reading.reason).toBe("robots-denied");
    expect(result.get("https://publisher.example/public/story")?.reading.status).toBe("body");
  });
  it.each([403, 429])("does not retry or bypass article HTTP %s", async (status) => {
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { status };
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe(`http-${status}`);
    expect(calls.filter((c) => c.url.endsWith("/story"))).toHaveLength(1);
  });
  it("treats blocked robots as unavailable permission", async () => {
    reply = () => ({ status: 429 });
    expect([...(await readArticles([item()])).values()][0].reading.status).toBe("snippet");
    expect(calls).toHaveLength(1);
  });
  it("stops a stalled response at the request timeout", async () => {
    ARTICLE_READING.requestTimeoutMs = 20;
    reply = () => ({ hang: true });
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("request-timeout");
  });
  it("bounds DNS waits with the total deadline", async () => {
    ARTICLE_READING.totalTimeoutMs = 20;
    net.lookup.mockImplementation(() => new Promise(() => {}));
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("total-timeout");
    expect(calls).toHaveLength(0);
  });
  it("rejects oversized chunked article responses", async () => {
    ARTICLE_READING.maxBytes = 1000;
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { chunks: ["a".repeat(600), "b".repeat(600)] };
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("body-too-large");
  });
  it("falls back from extraction failure rather than treating navigation as body", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { body: "<html><body><nav>Home About Login</nav></body></html>", headers: { "content-type": "text/html" } };
    const evidence = [...(await readArticles([item()])).values()][0];
    expect(evidence.reading.status).toBe("snippet");
    expect(evidence.text).toBe("Feed fallback");
  });
  it("uses same-day disk cache across reader calls without refetching", async () => {
    await readArticles([item()]);
    const count = calls.length;
    const cached = [...(await readArticles([item()])).values()][0];
    expect(cached.reading.status).toBe("body");
    expect(calls).toHaveLength(count);
  });
  it("reads GitHub README from the public API without auth headers", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { body, headers: { "content-type": "text/plain" } };
    const evidence = [...(await readArticles([item("https://github.com/org/repo", { section: "repos" })])).values()][0];
    expect(evidence.reading.via).toBe("readme");
    expect(calls.some((c) => c.url === "https://api.github.com/repos/org/repo/readme")).toBe(true);
    expect(calls.every((c) => !c.options.headers.Authorization)).toBe(true);
  });
  it("reads a Hugging Face model card", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { body, headers: { "content-type": "text/plain" } };
    const evidence = [...(await readArticles([item("https://huggingface.co/org/model", { section: "repos" })])).values()][0];
    expect(evidence.reading.via).toBe("model-card");
    expect(calls.some((c) => c.url === "https://huggingface.co/org/model/raw/main/README.md")).toBe(true);
  });
  it("only recovers an explicit public publisher article link from Google News", async () => {
    reply = (url) => {
      if (url.endsWith("/robots.txt")) return { status: 404 };
      if (url.startsWith("https://news.google.com")) return { body: '<html><body><a href="https://publisher.example/story" rel="nofollow">Read full article</a></body></html>', headers: { "content-type": "text/html" } };
      return { body: html, headers: { "content-type": "text/html" } };
    };
    expect([...(await readArticles([item("https://news.google.com/rss/articles/abc")])).values()][0].reading.status).toBe("body");
    expect(calls.some((c) => c.url === "https://publisher.example/story")).toBe(true);
  });
  it("keeps failed URLs cached for the day so rate limits are not retried on another run", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { status: 429 };
    await readArticles([item()]);
    const count = calls.length;
    const result = [...(await readArticles([item(undefined, { snippet: "Updated fallback" })])).values()][0];
    expect(result.reading.reason).toBe("http-429");
    expect(result.text).toBe("Updated fallback");
    expect(calls).toHaveLength(count);
  });
  it("does not invent a Google News destination or decode opaque links", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { body: '<html><body><a href="https://publisher.example/story">Related story</a></body></html>', headers: { "content-type": "text/html" } };
    expect([...(await readArticles([item("https://news.google.com/rss/articles/opaque")])).values()][0].reading.reason).toBe("google-news-no-public-link");
    expect(calls.some((c) => c.url.startsWith("https://publisher.example"))).toBe(false);
  });
  it("limits redirects rather than chasing a loop", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { status: 302, headers: { location: "/next" } };
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("redirect-limit");
    expect(calls.filter((c) => !c.url.endsWith("/robots.txt"))).toHaveLength(4);
  });
  it("rejects declared oversized bodies before reading their contents", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { body: html, headers: { "content-length": "1500001", "content-type": "text/html" } };
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("body-too-large");
  });
  it("does not extract a declared paywall", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { body: html.replace("</head>", '<script type="application/ld+json">{"isAccessibleForFree":false}</script></head>'), headers: { "content-type": "text/html" } };
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("paywall");
  });

  it("stops other article requests on a host after a 403 or 429", async () => {
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { status: 429 };
    const result = await readArticles([item("https://publisher.example/first"), item("https://publisher.example/second"), item("https://publisher.example/third")]);
    expect([...result.values()].every((e) => e.reading.status === "snippet")).toBe(true);
    expect(calls.filter((c) => !c.url.endsWith("/robots.txt"))).toHaveLength(1);
  });

  it("keeps the robots crawl delay between articles even with concurrent same-host selections", async () => {
    Object.assign(ARTICLE_READING, { requestTimeoutMs: 4000, totalTimeoutMs: 5000 });
    reply = (url) => url.endsWith("/robots.txt") ? { body: "User-agent: *\nAllow: /\nCrawl-delay: 1" } : { body: html, headers: { "content-type": "text/html" } };
    const result = await readArticles([item("https://publisher.example/first"), item("https://publisher.example/second")]);
    expect([...result.values()].every((e) => e.reading.status === "body")).toBe(true);
    const articles = calls.filter((c) => !c.url.endsWith("/robots.txt"));
    expect(articles[1].at - articles[0].at).toBeGreaterThanOrEqual(990);
  });
  it("runs at most four stalled host requests at once", async () => {
    ARTICLE_READING.requestTimeoutMs = 30;
    reply = () => ({ hang: true });
    const result = await readArticles(Array.from({ length: 8 }, (_, i) => item(`https://host${i}.example/story`)));
    expect(result.size).toBe(8);
    expect([...result.values()].every((e) => e.reading.status === "snippet")).toBe(true);
    expect(calls[4].at - calls[0].at).toBeGreaterThanOrEqual(25);
  });

  it("times out a body stream that never finishes after receiving headers", async () => {
    ARTICLE_READING.requestTimeoutMs = 20;
    reply = (url) => url.endsWith("/robots.txt") ? { status: 404 } : { hangBody: true, headers: { "content-type": "text/html" } };
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("request-timeout");
  });

  it("cleans README markdown before the cap: front matter, comments, badges, link-only and TOC lines", async () => {
    const prose = "This library runs agents on your own servers and keeps every tool call auditable for teams. ".repeat(10);
    const readme = `---\ntitle: x\n---\n<!-- banner -->\n<p align="center"><img src="logo.png"></p>\n# Project\n[![npm](https://img.shields.io/npm.svg)](https://npm.example)\n![logo](logo.png)\n[English](README.md) | [한국어](README.ko.md)\n\n- [Install](#install)\n- [Usage](#usage)\n\n---\n\nSee the [docs](https://docs.example/start) for setup. ${prose}`;
    reply = (url) => missingRobots(url) ? { status: 404 } : { body: readme, headers: { "content-type": "text/plain" } };
    const evidence = [...(await readArticles([item("https://github.com/org/repo", { section: "repos" })])).values()][0];
    expect(evidence.reading).toMatchObject({ status: "body", via: "readme", chars: 600 });
    expect(evidence.text.startsWith("Project See the docs for setup. This library runs agents")).toBe(true);
    expect(evidence.text).not.toMatch(/http|\]\(|!\[|Install|English|banner|title: x/);
  });
  it.each([
    "https://github.com/org/repo/pull/12", "https://github.com/org/repo/issues/3", "https://github.com/org/repo/discussions/9",
    "https://news.ycombinator.com/item?id=123", "https://www.reddit.com/r/LocalLLaMA/comments/abc/some_title/",
  ])("does not treat discussion page %s as an article body", async (url) => {
    const evidence = [...(await readArticles([item(url)])).values()][0];
    expect(evidence.reading).toMatchObject({ status: "snippet", via: "snippet", reason: "discussion-page" });
    expect(evidence.text).toBe("Feed fallback");
    expect(calls).toHaveLength(0);
  });
  it("rejects a generic page that shares fewer than two words with the candidate", async () => {
    const evidence = [...(await readArticles([item(undefined, { title: "Quantum chip fabrication breakthrough", snippet: "lattice qubits wafer" })])).values()][0];
    expect(evidence.reading).toMatchObject({ status: "snippet", reason: "unrelated-body" });
    expect(evidence.text).toBe("lattice qubits wafer");
  });
  it("skips the relevance gate for short candidates and for README / model-card reads", async () => {
    expect([...(await readArticles([item(undefined, { title: "AI", snippet: "ok" })])).values()][0].reading.status).toBe("body");
    reply = (url) => missingRobots(url) ? { status: 404 } : { body, headers: { "content-type": "text/plain" } };
    const readme = item("https://github.com/org/repo", { section: "repos", title: "Quantum chip fabrication breakthrough" });
    expect([...(await readArticles([readme])).values()][0].reading.via).toBe("readme");
  });
  it.each([["header", "text/html; charset=euc-kr", ""], ["meta", "text/html", '<meta charset="euc-kr">']])("decodes a legacy charset from the %s", async (_, type, meta) => {
    const word = Buffer.from([0xc0, 0xce, 0xb0, 0xf8, 0xc1, 0xf6, 0xb4, 0xc9, 0x20]); // "인공지능 " in EUC-KR
    const page = Buffer.concat([Buffer.from(`<html><head>${meta}</head><body><article><p>`), Buffer.concat(Array(150).fill(word)), Buffer.from("</p></article></body></html>")]);
    reply = (url) => missingRobots(url) ? { status: 404 } : { bytes: page, headers: { "content-type": type } };
    const evidence = [...(await readArticles([item(undefined, { title: "인공지능", snippet: "인공지능" })])).values()][0];
    expect(evidence.reading.status).toBe("body");
    expect(evidence.text.startsWith("인공지능 인공지능")).toBe(true);
  });
  it("does not cache a total-timeout failure, so the next run retries", async () => {
    ARTICLE_READING.totalTimeoutMs = 20;
    net.lookup.mockImplementation(() => new Promise(() => {}));
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("total-timeout");
    ARTICLE_READING.totalTimeoutMs = 2000;
    net.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    expect([...(await readArticles([item()])).values()][0].reading.status).toBe("body");
  });
});

describe("compressed responses and public originals", () => {
  it.each(["gzip", "deflate", "br"])("reads %s responses within the same size and time bounds", async (encoding) => {
    const compress = {gzip:gzipSync,deflate:deflateSync,br:brotliCompressSync}[encoding as "gzip"];
    reply = url => missingRobots(url) ? {status:404} : {bytes:compress(Buffer.from(html)),headers:{"content-type":"text/html","content-encoding":encoding}};
    const e=[...(await readArticles([item()])).values()][0];
    expect(e.reading.status).toBe("body");expect(e.text).toContain("research team");
  });
  it("also decompresses robots responses", async () => {
    reply=(url):Reply=>missingRobots(url)?{bytes:gzipSync(Buffer.from("User-agent: *\nDisallow: /")),headers:{"content-encoding":"gzip","content-type":"text/plain"}}:{body:html,headers:{"content-type":"text/html"}};
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("robots-denied");
    expect(calls).toHaveLength(1);
  });
  it("rejects decompression output over the byte limit", async () => {
    ARTICLE_READING.maxBytes=1000;
    reply=url=>missingRobots(url)?{status:404}:{bytes:gzipSync(Buffer.from("a".repeat(20000))),headers:{"content-type":"text/html","content-encoding":"gzip"}};
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("body-too-large");
  });
  it("reports a corrupt compressed response separately", async () => {
    reply=url=>missingRobots(url)?{status:404}:{body:"not gzip",headers:{"content-type":"text/html","content-encoding":"gzip"}};
    expect([...(await readArticles([item()])).values()][0].reading.reason).toBe("decompression-failed");
  });
  it("finds a matching public original when Google News disallows collection", async () => {
    const direct="https://publisher.example/story";
    reply=url=>{
      if(url==="https://news.google.com/robots.txt")return {body:"User-agent: *\nDisallow: /"};
      if(missingRobots(url))return {status:404};
      if(url.startsWith("https://www.bing.com/news/search?"))return {body:`<rss><channel><item><title>Research team model release</title><link>http://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(direct)}</link></item></channel></rss>`,headers:{"content-type":"application/rss+xml"}};
      return {body:html,headers:{"content-type":"text/html"}};
    };
    const e=[...(await readArticles([item("https://news.google.com/rss/articles/opaque",{publisherUrl:"https://publisher.example"} as any)])).values()][0];
    expect(e.reading).toMatchObject({status:"body",url:direct});
    expect(calls.filter(c=>c.url.includes("/news/search?"))).toHaveLength(1);
    expect(calls.some(c=>c.url.includes("/rss/articles/"))).toBe(false);
    const count=calls.length;
    const cached=[...(await readArticles([item("https://news.google.com/rss/articles/opaque",{publisherUrl:"https://publisher.example"} as any)])).values()][0];
    expect(cached.reading.url).toBe(direct);expect(calls).toHaveLength(count);
  });
  it.each([
    ["https://wrong.example/story","Research team model release"],
    ["https://publisher.example/story","Unrelated sports results today"],
    ["https://127.0.0.1/story","Research team model release"],
  ])("rejects mismatched or unsafe search results %s",async(url,title)=>{
    reply=u=>u==="https://news.google.com/robots.txt"?{body:"User-agent: *\nDisallow: /"}:missingRobots(u)?{status:404}:{body:`<rss><channel><item><title>${title}</title><link>${url}</link></item></channel></rss>`,headers:{"content-type":"application/rss+xml"}};
    const e=[...(await readArticles([item("https://news.google.com/rss/articles/opaque",{publisherUrl:"https://publisher.example"} as any)])).values()][0];
    expect(e.reading).toMatchObject({status:"snippet",reason:"google-news-no-public-link"});
    expect(calls.some(c=>c.url===url)).toBe(false);
  });
  it.each(["http-403", "robots-denied"])("identifies publisher %s after a successful original lookup", async (reason) => {
    reply = url => {
      if (url === "https://news.google.com/robots.txt") return {body:"User-agent: *\nDisallow: /"};
      if (url === "https://publisher.example/robots.txt" && reason === "robots-denied") return {body:"User-agent: *\nDisallow: /"};
      if (missingRobots(url)) return {status:404};
      if (url.includes("/news/search?")) return {body:'<rss><channel><item><title>Research team model release</title><link>https://publisher.example/story</link></item></channel></rss>'};
      return {status:403};
    };
    const e = [...(await readArticles([item("https://news.google.com/rss/articles/opaque", {publisherUrl:"https://publisher.example"})])).values()][0];
    expect(e.reading.reason).toBe(`publisher-${reason}`);
    expect(calls.filter(c => c.url.includes("/news/search?"))).toHaveLength(1);
  });
  it("honors search provider robots restrictions without requesting search",async()=>{
    reply=()=>({body:"User-agent: *\nDisallow: /"});
    const e=[...(await readArticles([item("https://news.google.com/rss/articles/opaque")])).values()][0];
    expect(e.reading.reason).toBe("original-lookup-robots-denied");
    expect(calls.some(c=>c.url.includes("/news/search?"))).toBe(false);
  });
});
