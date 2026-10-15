import { INDUSTRIES, SECTION_ORDER, sectionFlag } from "@/config/sections";
import { findTerm } from "@/lib/format";
import { REGIONS } from "@/lib/i18n";
import type { GlossaryEntry, Industry, Item, L10n, RawItem, Region, Section } from "@/types";

const INDUSTRY_KEYS = Object.keys(INDUSTRIES);
const HANGUL = /[ㄱ-ㆎ가-힣]/;

type Curation = { front: string[]; items: Item[]; glossary: GlossaryEntry[] };

const GLOSSARY_MAX = 12;
const RELATED_MAX = 4;
const TERM_MAX = 40;

const oneLine = (s: string) => s.replace(/\s+/g, " ").replace(/\|/g, "/").trim();

export function buildPrompt(items: RawItem[], recentHeadlines: string[]): string {
  const lines = items.map((i) => {
    const m = i.metrics;
    const stars = m?.stars !== undefined ? ` (★${m.stars}, ★${m.starsGained !== undefined ? `+${m.starsGained} this week` : `${m.starsPerDay ?? 0}/day`}${i.returning ? ", returning" : ""})` : "";
    const hf = m?.likes !== undefined ? ` (♥${m.likes}, ↓${m.downloads ?? 0})` : "";
    const up = m?.upvotes !== undefined ? ` (▲${m.upvotes})` : "";
    return `${i.id}|${oneLine(i.source)}|${i.section}|${oneLine(i.title)}|${oneLine(i.snippet).slice(0, 80)}${stars}${hf}${up}`;
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

/** Invalid entries and terms that appear in none of `texts` (the ko titles and summaries; the page could not mark them) are dropped silently; a missing or garbage glossary is just []. */
function parseGlossary(v: unknown, texts: string[]): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  if (!Array.isArray(v)) return out;
  const seen = new Set<string>();
  for (const g of v) {
    const term = str(g?.term);
    const desc = l10n(g?.desc);
    if (!term || term.length > TERM_MAX || !desc.ko || !desc.en || seen.has(term.toLowerCase()) || !texts.some((t) => findTerm(t, term) >= 0)) continue;
    seen.add(term.toLowerCase());
    out.push({ term, desc });
    if (out.length === GLOSSARY_MAX) break;
  }
  return out;
}

function parseHighlights(value: any, summary: L10n): Item["highlights"] {
  const phrases = (list: unknown, text: string) => [...new Set(Array.isArray(list) ? list.filter((p): p is string => typeof p === "string").map(p => p.trim()) : [])]
    .filter(p => p.length >= 2 && p.length <= 60 && text.includes(p)).slice(0, 2);
  const ko = phrases(value?.ko, summary.ko);
  const en = phrases(value?.en, summary.en);
  return ko.length || en.length ? {ko, en} : undefined;
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
    // an outletsOnly section (newsroom: news outlets and official announcements) takes only candidates whose source is configured there: a candidate whose source is configured elsewhere (Reddit, HN, Google News...)
    // goes back to its own section. Every other reassignment (e.g. playbook <-> pulse) is left to the curator.
    const section: Section = sectionFlag(m.section, "outletsOnly") && c.section !== m.section ? c.section : m.section;
    const industry = section === "ax" ? [m.industry, c.industry].find((x) => INDUSTRY_KEYS.includes(x)) : undefined;
    const item = toItem(c, {
      section,
      region: REGIONS.includes(m.region) ? m.region : regionOf(c),
      title,
      summary: l10n(m.summary, c.snippet),
      takeaway: l10n(m.takeaway),
    });
    const highlights = parseHighlights(m.highlights, item.summary);
    if (highlights) item.highlights = highlights;
    if (industry) item.industry = industry;
    items.push(item);
  }
  if (!items.length) return null;

  // `also`: other candidates on the same event. Only known candidate ids that are not published items; source and url come from the candidate.
  const published = new Set(items.map((i) => i.id));
  const raw = new Map<string, unknown>();
  for (const m of obj.items) if (!raw.has(m?.id)) raw.set(m?.id, m?.also); // the first entry per id is the one that was kept
  for (const item of items) {
    const also = raw.get(item.id);
    if (!Array.isArray(also)) continue;
    const related = [...new Set<unknown>(also)]
      .map((id) => byId.get(id as string))
      .filter((c): c is RawItem => !!c && !published.has(c.id))
      .slice(0, RELATED_MAX)
      .map((c) => ({ source: c.source, url: c.url }));
    if (related.length) item.related = related;
  }

  const ids = new Set(items.map((i) => i.id));
  const front = [...new Set<string>(Array.isArray(obj.front) ? obj.front : [])].filter((id) => ids.has(id)).slice(0, 3);
  for (const i of items) if (front.length < 3 && !front.includes(i.id)) front.push(i.id);
  return { front, items, glossary: parseGlossary(obj.glossary, items.flatMap((i) => [i.title.ko, i.summary.ko])) };
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
