// ponytail: regex parser for the RSS 2.0 / Atom subset our feeds use; no XML namespaces, nested markup in titles is flattened.

export interface FeedItem {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  publishedAt?: string;
  /** <category> / <category term=""> labels; present only when the item has any. */
  categories?: string[];
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? m;
    try {
      return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    } catch {
      return m;
    }
  });

/** Raw element text -> plain text. CDATA holds markup as-is; plain text is entity-escaped markup. */
function text(raw = ""): string {
  const cdata = /<!\[CDATA\[/.test(raw);
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  if (!cdata) s = decode(s);
  return decode(s.replace(/<\/?[a-z!][^>]*>/gi, " ")).replace(/\s+/g, " ").trim();
}

const tag = (block: string, name: string) =>
  block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1];

function link(block: string): string {
  let rss = "";
  for (const m of block.matchAll(/<link(?=[\s>/])([^>]*?)(?:\/>|>([\s\S]*?)<\/link>)/gi)) {
    const href = m[1].match(/\shref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) {
      rss ||= text(m[2]);
      continue;
    }
    const rel = m[1].match(/\srel\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rel || rel === "alternate") return decode(href);
  }
  return rss;
}

function date(block: string): string | undefined {
  const raw = ["pubDate", "published", "updated", "dc:date"].map((n) => text(tag(block, n))).find(Boolean);
  const t = raw ? new Date(raw) : undefined;
  return t && !Number.isNaN(t.getTime()) ? t.toISOString() : undefined;
}

function categories(block: string): string[] {
  return [...block.matchAll(/<category(?=[\s>/])([^>]*?)(?:\/>|>([\s\S]*?)<\/category>)/gi)]
    .map((m) => text(m[2]) || decode(m[1].match(/\sterm\s*=\s*["']([^"']+)["']/i)?.[1] ?? "").trim())
    .filter(Boolean);
}

export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const [block] of xml.matchAll(/<(item|entry)(?=[\s>])[\s\S]*?<\/\1>/gi)) {
    const title = text(tag(block, "title"));
    const url = link(block);
    if (!title || !url) continue;
    const snippet = ["description", "summary", "content:encoded", "content"].map((n) => text(tag(block, n))).find(Boolean) ?? "";
    const explicit = ["content:encoded", "content"].map(n => text(tag(block, n))).find(s => s.length >= 300);
    const rich = explicit ?? ["summary", "description"].map(n => text(tag(block, n))).find(s => s.length >= 600);
    const cats = categories(block);
    out.push({ title, url, snippet: snippet.slice(0, 300), ...(rich && { content: rich.slice(0, 12000) }), publishedAt: date(block), ...(cats.length && { categories: cats }) });
  }
  return out;
}
