import type { GlossaryEntry, Item, Snapshot } from "@/types";

export const kstDate = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now); // YYYY-MM-DD

const newest = (previous: Snapshot[], n: number) => [...previous].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);

/** Item id -> stars as of its most recent appearance within the n newest editions. */
export function seenMap(previous: Snapshot[], n: number): Map<string, number | undefined> {
  const seen = new Map<string, number | undefined>();
  for (const s of newest(previous, n)) for (const i of s.items) if (!seen.has(i.id)) seen.set(i.id, i.metrics?.stars);
  return seen;
}

export const recentHeadlines = (previous: Snapshot[], n: number): string[] =>
  newest(previous, n).flatMap((s) => s.items.map((i) => i.title.ko));

/** `previous` must already exclude `date`, so re-running a day neither dedupes against itself nor bumps the issue. */
export function buildSnapshot(a: {
  date: string;
  previous: Snapshot[];
  collected: number;
  failed: string[];
  model: string;
  now: Date;
  curation: { front: string[]; items: Item[]; glossary: GlossaryEntry[]; curated: boolean };
}): Snapshot {
  return {
    date: a.date,
    issue: a.previous.length + 1,
    generatedAt: a.now.toISOString(),
    model: a.model,
    curated: a.curation.curated,
    failedSources: a.failed,
    stats: { collected: a.collected, published: a.curation.items.length },
    front: a.curation.front,
    items: a.curation.items,
    ...(a.curation.glossary.length ? { glossary: a.curation.glossary } : {}), // omitted when empty so old/uncurated editions keep their shape
  };
}
