import { spawn } from "node:child_process";
import { CONFIG, SECTION_ORDER } from "@/config/sources";
import type { GlossaryEntry, Industry, Item, L10n, RawItem, Region, Section } from "@/types";

export const SYSTEM_PROMPT = `당신은 「AI Trend」의 편집장이다. 독자는 그룹사에서 AI 전환(AX)을 담당하는 실무자 1인이며, 월·수·금 아침 5분 안에 훑는 AI 신문을 만든다.

입력은 후보 목록(한 줄에 id|source|section|title|snippet)과 직전 판 헤드라인 목록이다. 후보 중에서 골라 아래 형식의 JSON만 출력한다.

섹션
- repos: 급상승 오픈소스 레포
- pulse: 개발자 커뮤니티에서 화제인 이슈와 프로젝트
- newsroom: 국내외 AI·빅테크 주요 뉴스
- ax: 산업별 AI 도입·전환 사례(국내외)
- playbook: AI 작업 방식, 에이전트 활용법, UI/UX 인사이트
후보의 section은 힌트일 뿐이며, 내용에 맞게 위 다섯 중 하나로 바로잡을 수 있다.

선별
- 적게 싣고 잘 고른다. 전체 18~22건: 섹션마다 3~4건(front 3건도 해당 섹션 몫으로 센다). 후보가 적은 섹션은 있는 만큼만 고른다.
- 같은 사건을 다룬 후보가 여럿이면 1건으로 합치고, 가장 믿을 만한 출처(1차 출처·원문에 가까운 것)의 id를 쓴다.
- 직전 판 헤드라인에 이미 실린 사건은 실질적으로 새로운 진전이 있을 때만 포함한다.
- 실무 가치가 높은 것을 우선한다: 구체적 수치가 있는 도입 사례, 도구·업무 방식을 바꾸는 소식, 그룹 AX에 시사점이 있는 것. 홍보성 글, 내용 없는 글, 단순 의견은 뺀다.
- front: 전 섹션을 통틀어 가장 중요한 3건의 id. 첫 번째가 리드다.

항목 작성
- title {ko,en}: 간결한 신문 헤드라인. 한국어는 번역투 없이 자연스럽게 쓰고, 회사·제품·인명 등 고유명사는 원문 표기를 유지한다.
- summary {ko,en}: ko는 3~4문장, en은 2~3문장. 무슨 일인지, 핵심 수치·사실, 배경 한 줄 순으로 쉬운 말로 쓴다. 비전문가도 알도록 전문용어는 그 자리에서 풀어 쓰되 장황하지 않게 한다. repos는 "무엇을 하는 도구인지"와 "왜 주목받는지"(★ 수치가 주어지면 활용)를 쓴다.
- takeaway {ko,en}: 1문장. 기업 AI·AX 실무자에게 왜 중요한가.
- region: 사건의 중심 지역. KR|US|EU|CN|JP|GLOBAL 중 하나.
- industry: section이 ax인 항목에만, 해당하면 construction|finance|logistics|retail|media 중 하나. 그 외에는 생략한다.
- 후보에 없는 사실을 지어내지 않는다. URL은 출력하지 않는다(시스템이 id로 채운다).

용어 풀이
- glossary: 선별한 항목의 제목·요약에 나오는 말 중 똑똑한 비전문가 직장인이 모를 만한 것을 최대 8개 고른다. 어려운 기술 개념(예: 양자화, 추론 단가, MCP)과 새로 나온 모델·서비스·프로젝트·회사 이름이 대상이다. OpenAI, Google, ChatGPT처럼 누구나 아는 이름은 뺀다.
- term: 위 한국어 title·summary·takeaway 본문에 쓴 표기 그대로 적는다(화면에서 본문과 대조해 찾는다).
- desc {ko,en}: 전문용어 없이 쉬운 한 문장. ko는 60자 이내, en은 120자 이내.

출력: 설명, 마크다운, 코드펜스 없이 아래 형식의 minified JSON 하나만 출력한다.
{"front":["id","id","id"],"items":[{"id":"","section":"","region":"","industry":"","title":{"ko":"","en":""},"summary":{"ko":"","en":""},"takeaway":{"ko":"","en":""}}],"glossary":[{"term":"","desc":{"ko":"","en":""}}]}`;

const REGIONS: Region[] = ["KR", "US", "EU", "CN", "JP", "GLOBAL"];
const INDUSTRIES: Industry[] = ["construction", "finance", "logistics", "retail", "media"];
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
    const industry = section === "ax" ? [m.industry, c.industry].find((x) => INDUSTRIES.includes(x)) : undefined;
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

/** One `claude -p` call; the prompt goes through stdin, the answer is the JSON envelope's `.result`. */
export function runClaude(prompt: string, model: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "claude",
      ["-p", "--model", model, "--system-prompt", SYSTEM_PROMPT, "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json"],
      { timeout: CONFIG.timeoutMs }, // kills with SIGTERM, which surfaces below as signal=SIGTERM
    );
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.stdin.on("error", () => {}); // EPIPE if claude dies early; 'close' reports the real failure
    p.on("error", reject);
    p.on("close", (code, signal) => {
      if (code !== 0) {
        // With --output-format json the reason (e.g. expired login) is in stdout's .result, not stderr.
        const reason = err.trim() || out.match(/"result":"([^"]*)"/)?.[1] || "";
        return reject(new Error(`claude exited code=${code} signal=${signal}: ${reason.slice(0, 300)}`));
      }
      try {
        const env = JSON.parse(out);
        if (env.is_error) throw new Error(`claude reported an error: ${String(env.result).slice(0, 300)}`);
        resolve(String(env.result ?? ""));
      } catch (e) {
        reject(e);
      }
    });
    p.stdin.end(prompt);
  });
}

export async function curate(
  candidates: RawItem[],
  recentHeadlines: string[],
  run: (prompt: string) => Promise<string> = (p) => runClaude(p, CONFIG.model),
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
