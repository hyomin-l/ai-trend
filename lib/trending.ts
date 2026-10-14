export type TrendingRepo = {
  fullName: string; // owner/repo
  description: string;
  language?: string;
  stars?: number;
  forks?: number;
  starsGained?: number; // "N stars this week"
};

/** Upper bound for any scraped count; anything above is treated as a parse error, not a real value. */
export const MAX_COUNT = 10_000_000;

const text = (s: string) =>
  s.replace(/<(svg|script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();

/** "1,234" -> 1234, "1.2k" -> 1200. Whole string must be one number; undefined when malformed or outside [0, MAX_COUNT). */
export function parseCount(s?: string): number | undefined {
  const m = text(s ?? "").match(/^(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?\s*([kKmM])?$/);
  if (!m) return undefined;
  const base = Number(`${m[1].replace(/,/g, "")}${m[2] ? `.${m[2]}` : ""}`);
  const n = Math.round(base * (m[3] ? (m[3].toLowerCase() === "k" ? 1e3 : 1e6) : 1));
  return Number.isSafeInteger(n) && n >= 0 && n < MAX_COUNT ? n : undefined;
}

/** Parses github.com/trending HTML (unofficial markup). Articles missing a valid name or weekly gain are skipped; invalid stars/forks are dropped. */
export function parseTrending(html: string): TrendingRepo[] {
  const out: TrendingRepo[] = [];
  for (const raw of html.split("<article").slice(1)) {
    const block = raw.split("</article>")[0];
    const name = block.match(/<h2\b[\s\S]*?<a\b[^>]*\bhref="\/([\w.-]+\/[\w.-]+)"/)?.[1];
    const gained = parseCount(block.match(/([\d,.]+\s*[kKmM]?)\s+stars?\s+this\s+week/i)?.[1]);
    if (!name || gained === undefined) continue;
    const link = (tail: string) => block.match(new RegExp(`<a\\b[^>]*\\bhref="/[^"]+/${tail}"[^>]*>([\\s\\S]*?)</a>`))?.[1];
    out.push({
      fullName: name,
      description: text(block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ""),
      language: block.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</)?.[1]?.trim() || undefined,
      stars: parseCount(link("stargazers")),
      forks: parseCount(link("forks")),
      starsGained: gained,
    });
  }
  return out;
}
