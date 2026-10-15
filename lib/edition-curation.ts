import { ARTICLE_READING, CONFIG } from "@/config/sources";
import { SELECTION_PROMPT, WRITING_PROMPT } from "@/config/prompt";
import { SECTION_ORDER } from "@/config/sections";
import { buildPrompt, fallbackCuration, parseCuration } from "@/lib/curate";
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
  const selected = selection.ids.map(id => byId.get(id)!);
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
  let curation;
  let curated = false;
  try {
    const response = await run(buildWritingPrompt(selected, evidence), WRITING_PROMPT, "write");
    const written = JSON.parse(response.slice(response.indexOf("{"), response.lastIndexOf("}") + 1));
    const expected = new Set(selected.map(i => i.id));
    const bilingual = (value: any) => ["ko", "en"].every(lang => typeof value?.[lang] === "string" && value[lang].trim());
    if (!Array.isArray(written.items) || written.items.length !== expected.size ||
      !written.items.every((i: any) => expected.delete(i?.id) && bilingual(i?.title) && bilingual(i?.summary)))
      throw new Error("writing must include every selected ID and explicit ko/en titles and summaries");
    curation = parseCuration(response, selected);
    if (!curation || curation.items.length !== selected.length) throw new Error("invalid writing output");
    curated = true;
  } catch (error) {
    console.error(`[write] failed; publishing uncurated feed text: ${(error as Error).message.slice(0,200)}`);
    curation = fallbackCuration(selected);
  }
  const published = new Set(curation.items.map(i => i.id));
  const items = curation.items.map(item => {
    const related = (selection.also[item.id] ?? []).filter(id=>!published.has(id)).map(id=>byId.get(id)!).filter(Boolean).map(i=>({source:i.source,url:i.url}));
    return { ...item, related: related.length ? related : undefined, reading: evidence.get(item.id)!.reading };
  });
  const front = selection.front.filter(id=>published.has(id));
  for (const item of items) if (front.length < 3 && !front.includes(item.id)) front.push(item.id);
  return { ...curation, front, items, curated };
}
