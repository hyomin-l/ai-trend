export type TrendingRepo = {
  fullName: string; // owner/repo
  description: string;
  language?: string;
  stars?: number;
  forks?: number;
  starsGained?: number; // "N stars this week"
};

const num = (s?: string) => (s ? Number(s.replace(/[^\d]/g, "")) || undefined : undefined);
const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();

/** Parses github.com/trending HTML (unofficial markup). Articles missing a name or the weekly gain are skipped. */
export function parseTrending(html: string): TrendingRepo[] {
  const out: TrendingRepo[] = [];
  for (const block of html.split("<article").slice(1)) {
    const name = block.match(/<h2[^>]*>[\s\S]*?href="\/([^"/\s]+\/[^"/\s]+)"/)?.[1];
    const gained = num(block.match(/([\d,]+)\s+stars?\s+this\s+week/i)?.[1]);
    if (!name || gained === undefined) continue;
    out.push({
      fullName: name,
      description: text(block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ""),
      language: block.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</)?.[1]?.trim() || undefined,
      stars: num(block.match(/href="\/[^"]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/)?.[1]),
      forks: num(block.match(/href="\/[^"]+\/forks"[^>]*>([\s\S]*?)<\/a>/)?.[1]),
      starsGained: gained,
    });
  }
  return out;
}
