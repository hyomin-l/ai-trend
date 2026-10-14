import { createHash } from "node:crypto";
import { SECTION_ORDER } from "@/config/sections";
import { CONFIG, SOURCES } from "@/config/sources";
import { isWebUrl } from "@/lib/format";
import type { RawItem } from "@/types";

/**
 * RawItem has no source id (only the display name, shared by e.g. all Google News queries), so fetchAll tags
 * each item with the SourceDef id. prep reads it for per-source window/cap; untagged items fall back to
 * section defaults and no cap. It never reaches a snapshot: curation builds Items field by field.
 */
export type Candidate = RawItem & { sourceId?: string };

const DEFS = new Map(SOURCES.map((s) => [s.id, s]));
const DROP = /^(utm_|fbclid$|gclid$|ref$)/;

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u.trim());
    for (const k of [...url.searchParams.keys()]) if (DROP.test(k)) url.searchParams.delete(k);
    return url.origin + url.pathname.replace(/\/+$/, "") + url.search;
  } catch {
    return u.trim();
  }
}

export const itemId = (u: string) => createHash("sha1").update(normalizeUrl(u)).digest("hex").slice(0, 12);

const heat = (i: RawItem) => i.metrics?.starsGained ?? i.metrics?.starsPerDay ?? 0;
const bySpeed = (a: RawItem, b: RawItem) => heat(b) - heat(a);

function group<T>(xs: T[], key: (x: T) => string): T[][] {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    let g = m.get(k);
    if (!g) m.set(k, (g = []));
    g.push(x);
  }
  return [...m.values()];
}

/** a1,b1,c1,a2,b2,... so that truncating the result never drops one list entirely. */
function roundRobin<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

export function prep(raw: Candidate[], opts: { now: Date; seen: Map<string, number | undefined> }): Candidate[] {
  const ids = new Set<string>();
  const kept: Candidate[] = [];
  for (const it of raw) {
    if (!isWebUrl(it.url)) continue; // javascript:, data:, relative or malformed links never become items
    if (ids.has(it.id)) continue;
    ids.add(it.id);

    const t = it.publishedAt ? Date.parse(it.publishedAt) : NaN;
    if (Number.isNaN(t)) continue; // freshness unverifiable
    // Repos are ranked by recent star growth; their creation date never gates selection.
    const hours = DEFS.get(it.sourceId ?? "")?.windowHours ?? CONFIG.windowHours;
    if (it.section !== "repos" && opts.now.getTime() - t > hours * 3_600_000) continue;

    if (!opts.seen.has(it.id)) {
      kept.push(it);
      continue;
    }
    const before = opts.seen.get(it.id);
    const stars = it.metrics?.stars;
    if (it.section === "repos" && before !== undefined && stars !== undefined && stars >= before * CONFIG.returningGrowth)
      kept.push({ ...it, returning: true, metrics: { ...it.metrics, starsDelta: stars - before } });
  }

  // cap after the seen filter so already-published items do not use up a source's quota
  const capped = group(kept, (i) => `${i.sourceId ?? i.source}|${i.section}`).flatMap((g) => {
    if (g[0].section === "repos") g.sort(bySpeed);
    return g.slice(0, DEFS.get(g[0].sourceId ?? "")?.cap ?? Infinity);
  });

  const sections = SECTION_ORDER.map((s) => {
    const inSection = capped.filter((i) => i.section === s);
    return s === "repos" ? inSection.sort(bySpeed) : roundRobin(group(inSection, (i) => i.sourceId ?? i.source));
  });
  return roundRobin(sections).slice(0, CONFIG.totalCap);
}
