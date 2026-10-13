import type { GlossaryEntry, Item, L10n, Section, Snapshot } from "@/types";

/** One story in search-index.json (compact keys: the file covers every edition). `d` + `id` locate the full story in /editions/<d>/data.json. */
export type SearchRow = {
  d: string; // edition date
  i: number; // issue
  s: Section;
  id: string;
  t: L10n; // title
  m: L10n; // summary
  src: string;
  u: string; // url
};

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const INDEX_URL = `${BASE}/search-index.json`;

/** One searchable text: lower-cased NFKC form, the same with everything but letters/digits removed, and its words. */
type Field = { n: string; c: string; w: string[] };
/** A row with its fields normalized once, in rank order: title, summary, source. */
export type Prepared = { row: SearchRow; f: Field[] };

const norm = (s: string) => s.normalize("NFKC").toLowerCase(); // NFKC also folds full-width forms to half-width
const compact = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");
const field = (s: string): Field => {
  const n = norm(s);
  return { n, c: compact(n), w: n.split(/[^\p{L}\p{N}]+/u).filter(Boolean) };
};

export const prepare = (rows: SearchRow[]): Prepared[] =>
  rows.map((row) => ({
    row,
    f: [field(`${row.t.ko} ${row.t.en}`), field(`${row.m.ko} ${row.m.en}`), field(row.src)],
  }));

/** The query's tokens (whitespace-separated, punctuation-only ones dropped) as [as typed, compacted]. */
export const parseQuery = (q: string) =>
  norm(q)
    .split(/\s+/)
    .map((t): [string, string] => [t, compact(t)])
    .filter(([, c]) => c);

/** True when a and b differ by at most one insertion, deletion, substitution or adjacent swap. */
export function near(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return true;
  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

const HANGUL = /[\uac00-\ud7a3]/;

/** 3 = substring, 2 = substring once spaces/punctuation are ignored, 1 = one typo, 0 = none. */
function kind(f: Field, t: string, c: string) {
  if (f.n.includes(t)) return 3;
  if (f.c.includes(c)) return 2;
  if (HANGUL.test(c)) {
    if (c.length < 3) return 0; // 3+ syllables: one syllable may differ or be missing/extra
    for (let i = 0; i < f.c.length; i++) {
      for (let len = c.length - 1; len <= c.length + 1; len++) if (near(c, f.c.slice(i, i + len))) return 1;
    }
    return 0;
  }
  return c.length >= 4 && f.w.some((w) => near(c, w)) ? 1 : 0;
}

/** 0 when any token is missing from the row (all tokens must match, each anywhere); else higher is better. A token scores by where it hits (title 3 > summary 2 > source 1), then how (substring > compact > typo). */
export function score(p: Prepared, tokens: [string, string][]) {
  let sum = 0;
  for (const [t, c] of tokens) {
    let best = 0;
    for (let i = 0; i < 3 && best < 30; i++) {
      const k = kind(p.f[i], t, c);
      if (k) best = Math.max(best, (3 - i) * 10 + k);
    }
    if (!best) return 0;
    sum += best;
  }
  return sum;
}

/** Matching rows, best first; rows are newest first and the sort is stable, so ties stay newest first. */
export function find(ps: Prepared[], q: string) {
  const tokens = parseQuery(q);
  if (!tokens.length) return [];
  return ps
    .map((p) => [p.row, score(p, tokens)] as const)
    .filter(([, s]) => s)
    .sort((x, y) => y[1] - x[1])
    .map(([r]) => r);
}

let index: Promise<SearchRow[]> | null = null;

/** The whole index, fetched once per page load; a failure is forgotten so the next call retries. */
export function loadIndex() {
  index ??= fetch(INDEX_URL)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<SearchRow[]>;
    })
    .catch((e: unknown) => {
      index = null;
      throw e;
    });
  return index;
}

export type Story = { item: Item; generatedAt: string; glossary?: GlossaryEntry[] };
const editions = new Map<string, Promise<Snapshot>>();

/** What ItemDialog needs for a row: the full story from its edition's data.json (each edition fetched once). */
export async function loadStory(r: SearchRow): Promise<Story> {
  let snap = editions.get(r.d);
  if (!snap) {
    snap = fetch(`${BASE}/editions/${r.d}/data.json`).then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<Snapshot>;
    });
    editions.set(r.d, snap);
    snap.catch(() => editions.delete(r.d));
  }
  const { items, generatedAt, glossary } = await snap;
  const item = items.find((i) => i.id === r.id);
  if (!item) throw new Error("missing");
  return { item, generatedAt, glossary };
}
