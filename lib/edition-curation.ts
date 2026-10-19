import { ARTICLE_READING, CONFIG } from "@/config/sources";
import { SELECTION_PROMPT, WRITING_PROMPT } from "@/config/prompt";
import { SECTION_ORDER } from "@/config/sections";
import { buildPrompt, parseCuration } from "@/lib/curate";
import { shareChars, type ArticleEvidence } from "@/lib/read-articles";
import type { RawItem } from "@/types";

type Selection = { ids: string[]; reserve: string[]; front: string[]; also: Record<string, string[]> };
type Run = (prompt: string, systemPrompt: string, stage: "select" | "write") => Promise<string>;
type Read = (items: RawItem[]) => Promise<Map<string, ArticleEvidence>>;
const trim = (text: string, max = Infinity) => text.replace(/\s+/g, " ").trim().slice(0, max);
const idsFrom = (value: unknown, allowed: Set<string>, limit: number): string[] =>
  [...new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && allowed.has(id)) : [])].slice(0, limit);

/** Ranked picks: `reserve:true` items (and any primaries beyond maxArticles) are backfill for thin-evidence primaries. */
export function parseSelection(text: string, candidates: RawItem[]): Selection | null {
  try {
    const value = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!Array.isArray(value.items)) return null;
    const known = new Set(candidates.map(i => i.id));
    const all = idsFrom(value.items.map((i: any) => i?.id), known, Infinity);
    const flagged = new Set(value.items.filter((i: any) => i?.reserve === true).map((i: any) => i?.id));
    const main = all.filter(id => !flagged.has(id));
    const ids = main.slice(0, ARTICLE_READING.maxArticles);
    if (!ids.length) return null;
    const reserve = [...main.slice(ARTICLE_READING.maxArticles), ...all.filter(id => flagged.has(id))].slice(0, ARTICLE_READING.reserveArticles);
    const picked = new Set([...ids, ...reserve]);
    const others = new Set([...known].filter(id => !picked.has(id)));
    const also = Object.fromEntries([...ids, ...reserve].map(id => [id, idsFrom(value.items.find((i: any) => i?.id === id)?.also, others, 4)]));
    const front = idsFrom(value.front, new Set(ids), 3);
    for (const id of ids) if (front.length < 3 && !front.includes(id)) front.push(id);
    return { ids, reserve, front, also };
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
  const ranked = balanced(candidates, ARTICLE_READING.maxArticles + ARTICLE_READING.reserveArticles).map(i => i.id);
  const ids = ranked.slice(0, ARTICLE_READING.maxArticles);
  return { ids, reserve: ranked.slice(ARTICLE_READING.maxArticles), front: ids.slice(0, 3), also: {} };
}

function boundedEvidence(items: RawItem[], evidence: Map<string, ArticleEvidence>): Map<string, ArticleEvidence> {
  const list = items.slice(0, ARTICLE_READING.maxReads);
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
  console.log(`[select] reserve=${selection.reserve.length} candidates=${bounded.length} shown=${shown.length} selected=${selected.length} elapsedMs=${Date.now()-started}`);
  const readStarted = Date.now();
  const isThin = (e: ArticleEvidence) => e.reading.status === "snippet" && e.text.length < ARTICLE_READING.minEvidenceChars;
  const pool = selection.reserve.map(id => byId.get(id)!);
  const evidence = new Map<string, ArticleEvidence>();
  const kept: RawItem[] = [];
  let batch = selected, reads = 0, promoted = 0;
  while (batch.length) { // primaries first, then only the reserves that replace thin ones; reads <= ids + reserve <= maxReads
    reads += batch.length;
    let got: Map<string, ArticleEvidence>;
    try { got = boundedEvidence(batch, await read(batch)); }
    catch (error) {
      console.error(`[read] failed; using feed evidence: ${(error as Error).message.slice(0,200)}`);
      got = boundedEvidence(batch, new Map());
    }
    const thin: RawItem[] = [];
    for (const i of batch) { const e = got.get(i.id)!; evidence.set(i.id, e); (isThin(e) ? thin : kept).push(i); }
    if (thin.length) console.warn(`[read] skipped ${thin.length} with thin evidence (<${ARTICLE_READING.minEvidenceChars} chars): ${thin.map(i => i.id).join(", ")}`);
    batch = [];
    for (const t of thin) {
      const at = Math.max(pool.findIndex(r => r.section === t.section), pool.length ? 0 : -1); // same section, else next reserve
      if (at < 0) { console.warn(`[read] no reserve left for ${t.id} (${t.section})`); continue; }
      const [next] = pool.splice(at, 1);
      console.log(`[read] backfill ${t.id} -> ${next.id} (${next.section}${next.section === t.section ? "" : ", other section"})`);
      batch.push(next); promoted++;
    }
  }
  selected = kept;
  console.log(`[read] reads=${reads} promoted=${promoted} kept=${kept.length} body=${[...evidence.values()].filter(e=>e.reading.status==="body").length} elapsedMs=${Date.now()-readStarted}`);
  for (const [id, e] of evidence) console.log(`[read] ${id} ${e.reading.status}/${e.reading.via} chars=${e.text.length}${e.reading.reason ? ` reason=${e.reading.reason.slice(0,160)}` : ""}`);
  if (!selected.length) throw new Error("no selected article has usable evidence");
  const response = await run(buildWritingPrompt(selected, evidence), WRITING_PROMPT, "write");
  const curation = acceptWriting(response, selected);
  if (curation && curation.items.length < selected.length) console.warn(`[write] published ${curation.items.length} of ${selected.length} written candidates (target ${ARTICLE_READING.maxArticles})`);
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
