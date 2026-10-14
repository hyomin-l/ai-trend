/**
 * FORK POINT: the newspaper's sections. The key order below is the column order on the front page.
 * `show` is how many stories a column shows on the one-screen page; the rest fold into its "+N" dialog.
 * `brief` is the one-line description the curator's prompt lists for the section (config/prompt.ts builds the list from here).
 * `fresh` keeps only stories inside CONFIG.windowHours after curation (lib/pipeline.ts dropStale).
 * `outletsOnly` means the curator may not move other sections' candidates in (lib/curate.ts): news outlets and official announcements only.
 *
 * Adding a section: add a line here, point sources at it in config/sources.ts. Removing one is the reverse.
 * Types, labels and the prompt's section list follow from this list.
 * Only `repos` (RepoItem) and `pulse` (StoryItem) render differently from the plain story row.
 */
type SectionDef = { ko: string; en: string; show: number; brief: string; fresh?: boolean; outletsOnly?: boolean };

export const SECTIONS = {
  newsroom: { ko: "뉴스룸", en: "Newsroom", show: 4, brief: "국내외 AI·빅테크 주요 뉴스(언론사 기사와 AI 기업의 공식 발표만)", fresh: true, outletsOnly: true },
  playbook: { ko: "AI 플레이북", en: "AI Playbook", show: 4, brief: "AI 작업 방식, 에이전트 활용법, UI/UX 인사이트" },
  ax: { ko: "현장의 AX", en: "AX in the Field", show: 4, brief: "산업별 AI 도입·전환 사례(국내외)", fresh: true },
  repos: { ko: "급상승 레포", en: "Rising Repos", show: 4, brief: "급상승 오픈소스 레포" },
  pulse: { ko: "커뮤니티", en: "Community Pulse", show: 4, brief: "개발자 커뮤니티에서 화제인 이슈와 프로젝트", fresh: true },
} as const satisfies Record<string, SectionDef>;

/** Per-section behavior flags (absent = false). */
export const sectionFlag = (s: keyof typeof SECTIONS, flag: "fresh" | "outletsOnly") => !!(SECTIONS[s] as SectionDef)[flag];

/** The "top stories" band above the columns. Its stories are picked across all sections and not repeated below. */
export const FRONT = { ko: "이번 호 핵심", en: "Top 3", show: 3 } as const;

/** Industry tags of the `ax` section (see AX_QUERIES in config/sources.ts and the curator's prompt). */
export const INDUSTRIES = {
  construction: { ko: "건설", en: "Construction" },
  finance: { ko: "금융", en: "Finance" },
  logistics: { ko: "물류", en: "Logistics" },
  retail: { ko: "유통", en: "Retail" },
  media: { ko: "미디어", en: "Media" },
} as const;

export const SECTION_ORDER = Object.keys(SECTIONS) as (keyof typeof SECTIONS)[];
