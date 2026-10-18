import { ARTICLE_READING, CONFIG } from "@/config/sources";
import { SELECTION_PROMPT, WRITING_PROMPT } from "@/config/prompt";
import { SECTION_ORDER } from "@/config/sections";
import { buildPrompt, parseCuration } from "@/lib/curate";
import { shareChars, type ArticleEvidence } from "@/lib/read-articles";
import type { RawItem } from "@/types";

type Selection = { ids: string[]; front: string[]; also: Record<string, string[]> };
type Run = (prompt: string, systemPrompt: string, stage: "select" | "write") => Promise<string>;
type Read = (items: RawItem[]) => Promise<Map<string, ArticleEvidence>>;
const trim = (text: string, max = Infinity) => text.replace(/\s+/g, " ").trim().slice(0, max);
const idsFrom = (value: unknown, allowed: Set<string>, limit: number): string[] =>
  [...new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && allowed.has(id)) : [])].slice(0, limit);

export function parseSelection(text: string, candidates: RawItem[]): Selection | null {
  try {
    const value = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!Array.isArray(value.items)) return null;
    const known = new Set(candidates.map(i => i.id));
    const ids = idsFrom(value.items.map((i: any) => i?.id), known, ARTICLE_READING.maxArticles);
    if (!ids.length) return null;
    const selected = new Set(ids);
    const others = new Set([...known].filter(id => !selected.has(id)));
    const also = Object.fromEntries(ids.map(id => [id, idsFrom(value.items.find((i: any) => i?.id === id)?.also, others, 4)]));
    const front = idsFrom(value.front, selected, 3);
    for (const id of ids) if (front.length < 3 && !front.includes(id)) front.push(id);
    return { ids, front, also };
  } catch { return null; }
}

/** Round-robin across sections, so truncating never drops a section while another still has candidates. */
function balanced(candidates: RawItem[], limit: number): RawItem[] {
  const groups = SECTION_ORDER.map(s => candidates.filter(i => i.section === s));
  const out: RawItem[] = [];
  for (let row = 0; groups.some(g => row < g.length) && out.length < limit; row++)
    for (const group of groups) if (group[row] && out.length < limit) out.push(group[row]);
  return out;
}

function balancedSelection(candidates: RawItem[]): Selection {
  const ids = balanced(candidates, ARTICLE_READING.maxArticles).map(i => i.id);
  return { ids, front: ids.slice(0, 3), also: {} };
}

function boundedEvidence(items: RawItem[], evidence: Map<string, ArticleEvidence>): Map<string, ArticleEvidence> {
  const list = items.slice(0, ARTICLE_READING.maxArticles);
  const texts = shareChars(list.map(item => trim(evidence.get(item.id)?.text || item.snippet)));
  return new Map(list.map((item, i) => {
    const found = evidence.get(item.id);
    return [item.id, {
      text: texts[i],
      reading: found ? { ...found.reading, chars: texts[i].length } : {status:"snippet",via:"snippet",chars:texts[i].length,reason:"body unavailable"},
    } satisfies ArticleEvidence];
  }));
}

/** Untrusted source text is serialized as evidence, never appended to the system instructions. */
export function buildWritingPrompt(items: RawItem[], evidence: Map<string, ArticleEvidence>): string {
  const bounded = boundedEvidence(items, evidence);
  return JSON.stringify({ articles: items.slice(0, ARTICLE_READING.maxArticles).map(i => {
    const { text, reading: { status, via } } = bounded.get(i.id)!; // chars and reason are for the page, not the model
    return { id: i.id, source: trim(i.source, 80), section: i.section, title: trim(i.title, 300), industry: i.industry, metrics: i.metrics, returning: i.returning, text, reading: { status, via } };
  }) });
}

const clip = (v: unknown, max = 300) => trim(typeof v === "string" ? v : JSON.stringify(v) ?? "", max);

/** Keeps the written items that name a selected ID once and have non-empty ko/en title and summary; logs each rejection. */
export function acceptWriting(response: string, selected: RawItem[]): ReturnType<typeof parseCuration> {
  let written: any;
  try { written = JSON.parse(response.slice(response.indexOf("{"), response.lastIndexOf("}") + 1)); }
  catch (error) {
    console.error(`[write] JSON parse error: ${(error as Error).message.slice(0, 200)}; response starts: ${clip(response)}`);
    return null;
  }
  if (!Array.isArray(written?.items)) { console.error(`[write] no items array; response starts: ${clip(response)}`); return null; }
  const open = new Set(selected.map(i => i.id));
  const filled = (value: any) => (["ko", "en"] as const).filter(lang => !(typeof value?.[lang] === "string" && value[lang].trim()));
  const kept = written.items.filter((i: any) => {
    if (!open.has(i?.id)) { console.error(`[write] dropped ${clip(i?.id, 60)}: ${i?.id ? "unknown or duplicate id" : "missing id"}`); return false; }
    const empty = [...filled(i.title).map(l => `title.${l}`), ...filled(i.summary).map(l => `summary.${l}`)];
    if (empty.length) { console.error(`[write] dropped ${i.id}: empty ${empty.join(", ")}`); return false; }
    open.delete(i.id);
    return true;
  });
  if (open.size) console.error(`[write] missing ids: ${[...open].join(", ")}`);
  return parseCuration(JSON.stringify({ ...written, items: kept }), selected);
}

/** Exactly one selection attempt and one writing attempt; no LLM or network retries here. */
export async function curateEdition(candidates: RawItem[], recent: string[], run: Run, read: Read) {
  const started = Date.now();
  const bounded = candidates.slice(0, CONFIG.totalCap).map(i => ({ ...i, title:trim(i.title,300),source:trim(i.source,80),snippet:trim(i.snippet,300) }));
  const shown = balanced(bounded, CONFIG.selectCap);
  let selection: Selection;
  try {
    const result = parseSelection(await run(buildPrompt(shown, recent), SELECTION_PROMPT, "select"), shown);
    if (!result) throw new Error("invalid selected IDs");
    selection = result;
  } catch (error) {
    console.error(`[select] failed; using bounded section-balanced selection: ${(error as Error).message.slice(0,200)}`);
    selection = balancedSelection(bounded);
  }
  const byId = new Map(bounded.map(i => [i.id, i]));
  let selected = selection.ids.map(id => byId.get(id)!);
  console.log(`[select] candidates=${bounded.length} shown=${shown.length} selected=${selected.length} elapsedMs=${Date.now()-started}`);
  const readStarted = Date.now();
  let evidence: Map<string, ArticleEvidence>;
  try { evidence = boundedEvidence(selected, await read(selected)); }
  catch (error) {
    console.error(`[read] failed; using feed evidence: ${(error as Error).message.slice(0,200)}`);
    evidence = boundedEvidence(selected, new Map());
  }
  console.log(`[read] body=${[...evidence.values()].filter(e=>e.reading.status==="body").length} fallback=${[...evidence.values()].filter(e=>e.reading.status==="snippet").length} chars=${[...evidence.values()].reduce((n,e)=>n+e.text.length,0)} elapsedMs=${Date.now()-readStarted}`);
  for (const [id, e] of evidence) console.log(`[read] ${id} ${e.reading.status}/${e.reading.via} chars=${e.text.length}${e.reading.reason ? ` reason=${e.reading.reason.slice(0,160)}` : ""}`);
  const thin = selected.filter(i => { const e = evidence.get(i.id)!; return e.reading.status === "snippet" && e.text.length < ARTICLE_READING.minEvidenceChars; });
  if (thin.length) {
    console.warn(`[read] skipped ${thin.length} with thin evidence (<${ARTICLE_READING.minEvidenceChars} chars): ${thin.map(i => i.id).join(", ")}`);
    selected = selected.filter(i => !thin.includes(i));
  }
  if (!selected.length) throw new Error("no selected article has usable evidence");
  const response = await run(buildWritingPrompt(selected, evidence), WRITING_PROMPT, "write");
  const curation = acceptWriting(response, selected);
  const need = Math.min(CONFIG.minCurated, selected.length);
  if (!curation || curation.items.length < need) {
    const got = curation?.items.length ?? 0;
    throw new Error(`writing produced ${got} valid items, need at least ${need}; not publishing an uncurated edition`);
  }
  const published = new Set(curation.items.map(i => i.id));
  const items = curation.items.map(item => {
    const related = (selection.also[item.id] ?? []).filter(id=>!published.has(id)).map(id=>byId.get(id)!).filter(Boolean).map(i=>({source:i.source,url:i.url}));
    return { ...item, related: related.length ? related : undefined, reading: evidence.get(item.id)!.reading };
  });
  const front = selection.front.filter(id=>published.has(id));
  for (const item of items) if (front.length < 3 && !front.includes(item.id)) front.push(item.id);
  return { ...curation, front, items, curated: true };
}
