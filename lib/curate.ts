import { INDUSTRIES, SECTION_ORDER } from "@/config/sections";
import { REGIONS } from "@/lib/i18n";
import type { GlossaryEntry, Industry, Item, L10n, RawItem, Region, Section } from "@/types";

const INDUSTRY_KEYS = Object.keys(INDUSTRIES);
const HANGUL = /[ㄱ-ㆎ가-힣]/;

type Curation = { front: string[]; items: Item[]; glossary: GlossaryEntry[] };

const GLOSSARY_MAX = 8;
const TERM_MAX = 40;

const oneLine = (s: string) => s.replace(/\s+/g, " ").replace(/\|/g, "/").trim();

export function buildPrompt(items: RawItem[], recentHeadlines: string[]): string {
  const lines = items.map((i) => {
    const m = i.metrics;
    const stars = m?.stars !== undefined ? ` (★${m.stars}, ★${m.starsPerDay ?? 0}/day${i.returning ? ", returning" : ""})` : "";
    return `${i.id}|${oneLine(i.source)}|${i.section}|${oneLine(i.title)}|${oneLine(i.snippet).slice(0, 140)}${stars}`;
  });
  const recent = recentHeadlines.length ? recentHeadlines.map((h) => `- ${oneLine(h)}`).join("\n") : "(없음)";
  return `## 후보\n${lines.join("\n")}\n\n## 직전 판 헤드라인\n${recent}`;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const l10n = (v: any, dflt = ""): L10n => ({ ko: str(v?.ko) || dflt, en: str(v?.en) || dflt });
const regionOf = (c: RawItem): Region => (HANGUL.test(c.title) ? "KR" : "GLOBAL");

/** URL, source, date, metrics and flags always come from the collector's candidate, never from the model. */
function toItem(c: RawItem, over: Pick<Item, "section" | "region" | "title" | "summary" | "takeaway"> & { industry?: Industry }): Item {
  const item: Item = {
    id: c.id, source: c.source, url: c.url,
    publishedAt: c.publishedAt!, // prep drops undated items
    ...over,
  };
  if (c.metrics) item.metrics = c.metrics;
  if (c.returning) item.returning = true;
  return item;
}

/** Invalid entries are dropped silently; a missing or garbage glossary is just []. */
function parseGlossary(v: unknown): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  if (!Array.isArray(v)) return out;
  const seen = new Set<string>();
  for (const g of v) {
    const term = str(g?.term);
    const desc = l10n(g?.desc);
    if (!term || term.length > TERM_MAX || !desc.ko || !desc.en || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    out.push({ term, desc });
    if (out.length === GLOSSARY_MAX) break;
  }
  return out;
}

export function parseCuration(text: string, candidates: RawItem[]): Curation | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  let obj: any;
  try {
    obj = JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(obj?.items)) return null;

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const items: Item[] = [];
  for (const m of obj.items) {
    const c = byId.get(m?.id);
    if (!c || items.some((i) => i.id === c.id)) continue;
    if (!SECTION_ORDER.includes(m.section)) continue;
    const title = l10n(m.title);
    if (!title.ko || !title.en) continue;
    const section: Section = m.section;
    const industry = section === "ax" ? [m.industry, c.industry].find((x) => INDUSTRY_KEYS.includes(x)) : undefined;
    const item = toItem(c, {
      section,
      region: REGIONS.includes(m.region) ? m.region : regionOf(c),
      title,
      summary: l10n(m.summary, c.snippet),
      takeaway: l10n(m.takeaway),
    });
    if (industry) item.industry = industry;
    items.push(item);
  }
  if (!items.length) return null;

  const ids = new Set(items.map((i) => i.id));
  const front = [...new Set<string>(Array.isArray(obj.front) ? obj.front : [])].filter((id) => ids.has(id)).slice(0, 3);
  for (const i of items) if (front.length < 3 && !front.includes(i.id)) front.push(i.id);
  return { front, items, glossary: parseGlossary(obj.glossary) };
}

/** No-LLM edition: original titles and snippets, about 4 per section. */
export function fallbackCuration(candidates: RawItem[]): Curation {
  const items = SECTION_ORDER.flatMap((s) => candidates.filter((c) => c.section === s).slice(0, 4)).map((c) =>
    toItem(c, {
      section: c.section,
      region: regionOf(c),
      title: { ko: c.title, en: c.title },
      summary: { ko: c.snippet, en: c.snippet },
      takeaway: { ko: "", en: "" },
      ...(c.industry && c.section === "ax" ? { industry: c.industry } : {}),
    }),
  );
  return { front: items.slice(0, 3).map((i) => i.id), items, glossary: [] };
}

export async function curate(
  candidates: RawItem[],
  recentHeadlines: string[],
  run: (prompt: string) => Promise<string>,
): Promise<Curation & { curated: boolean }> {
  try {
    const res = parseCuration(await run(buildPrompt(candidates, recentHeadlines)), candidates);
    if (res) return { ...res, curated: true };
    console.error("[curate] response was not valid curation JSON; publishing uncurated edition");
  } catch (e) {
    console.error(`[curate] ${(e as Error).message}; publishing uncurated edition`);
  }
  return { ...fallbackCuration(candidates), curated: false };
}
