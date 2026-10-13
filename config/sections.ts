/**
 * FORK POINT: the newspaper's sections. The key order below is the column order on the front page.
 * `show` is how many stories a column shows on the one-screen page; the rest fold into its "+N" dialog.
 *
 * Adding a section: add a line here, point sources at it in config/sources.ts, and describe it in the
 * curator's prompt (config/prompt.ts). Removing one is the reverse. Types and labels follow from this list.
 * Only `repos` (RepoItem) and `pulse` (StoryItem) render differently from the plain story row.
 */
export const SECTIONS = {
  newsroom: { ko: "뉴스룸", en: "Newsroom", show: 4 },
  playbook: { ko: "AI 플레이북", en: "AI Playbook", show: 4 },
  pulse: { ko: "커뮤니티", en: "Community Pulse", show: 4 },
  repos: { ko: "급상승 레포", en: "Rising Repos", show: 4 },
  ax: { ko: "현장의 AX", en: "AX in the Field", show: 4 },
} as const;

/** The "top stories" band above the columns. Its stories are picked across all sections and not repeated below. */
export const FRONT = { ko: "오늘의 3줄", en: "Top 3", show: 3 } as const;

/** Industry tags of the `ax` section (see AX_QUERIES in config/sources.ts and the curator's prompt). */
export const INDUSTRIES = {
  construction: { ko: "건설", en: "Construction" },
  finance: { ko: "금융", en: "Finance" },
  logistics: { ko: "물류", en: "Logistics" },
  retail: { ko: "유통", en: "Retail" },
  media: { ko: "미디어", en: "Media" },
} as const;

export const SECTION_ORDER = Object.keys(SECTIONS) as (keyof typeof SECTIONS)[];
