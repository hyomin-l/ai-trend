import { sectionFlag } from "@/config/sections";
import { CONFIG } from "@/config/sources";
import { itemId } from "@/lib/prep";
import type { GlossaryEntry, Item, Snapshot } from "@/types";

export const kstDate = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now); // YYYY-MM-DD

const newest = (previous: Snapshot[], n: number) => [...previous].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);

/** Most recent appearance of an item: its stars then, and how many editions back (1 = newest edition). */
export type Seen = { stars?: number; ago: number };

/** Item id -> its most recent appearance within the n newest editions. */
export function seenMap(previous: Snapshot[], n: number): Map<string, Seen> {
  const seen = new Map<string, Seen>();
  newest(previous, n).forEach((s, k) => {
    for (const i of s.items) {
      if (!seen.has(i.id)) seen.set(i.id, { stars: i.metrics?.stars, ago: k + 1 });
      // other-source versions of a published event must not return next edition as new candidates
      for (const r of i.related ?? []) {
        const id = itemId(r.url);
        if (!seen.has(id)) seen.set(id, { ago: k + 1 });
      }
    }
  });
  return seen;
}

export const recentHeadlines = (previous: Snapshot[], n: number): string[] =>
  newest(previous, n).flatMap((s) => s.items.map((i) => i.title.ko));

/**
 * Post-curation freshness guard: the curator may move an older item (e.g. a week-old Reddit post) into a fresh section, so the FINAL section decides. The sections flagged `fresh` in config/sections.ts keep only items <= CONFIG.windowHours old; playbook (slow feeds)
 * and repos (ranked by star growth) are exempt. Dropped ids leave `front`, which is refilled from the remaining items.
 */
export function dropStale(
  c: { front: string[]; items: Item[] },
  now: Date,
): { front: string[]; items: Item[] } {
  const limit = CONFIG.windowHours * 3_600_000;
  const items = c.items.filter(
    (i) => !sectionFlag(i.section, "fresh") || now.getTime() - Date.parse(i.publishedAt) <= limit,
  );
  if (items.length === c.items.length) return c;
  const ids = new Set(items.map((i) => i.id));
  const front = c.front.filter((id) => ids.has(id));
  for (const i of items) if (front.length < Math.min(3, items.length) && !front.includes(i.id)) front.push(i.id);
  return { front, items };
}

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
  const { front, items } = dropStale(a.curation, a.now);
  return {
    date: a.date,
    issue: a.previous.length + 1,
    generatedAt: a.now.toISOString(),
    model: a.model,
    curated: a.curation.curated,
    failedSources: a.failed,
    stats: { collected: a.collected, published: items.length },
    front,
    items,
    ...(a.curation.glossary.length ? { glossary: a.curation.glossary } : {}), // omitted when empty so old/uncurated editions keep their shape
  };
}
