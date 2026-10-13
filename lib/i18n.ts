import type { Industry, Lang, Region, Section } from "@/types";

/**
 * Every user-visible brand string lives here. Renaming the product is a change to this object only.
 * <Logo> renders `name` in the display face next to the blob mark.
 */
export const BRAND = {
  name: "AI Trend",
  short: "AI Trend",
  description: {
    ko: "월·수·금 아침, 흩어진 AI 트렌드를 한 장의 신문으로 묶어 드립니다.",
    en: "Scattered AI trends, gathered into a single newspaper page every Monday, Wednesday and Friday.",
  },
} as const;

export const LANGS: Lang[] = ["ko", "en"];
export const isLang = (v: string): v is Lang => (LANGS as string[]).includes(v);

export type SectionKey = Section | "front";

/** Section names, used for column headers, dialogs and search filters. */
export const SECTION_LABEL: Record<SectionKey, { ko: string; en: string }> = {
  front: { ko: "오늘의 3줄", en: "Top 3" },
  newsroom: { ko: "뉴스룸", en: "Newsroom" },
  ax: { ko: "현장의 AX", en: "AX in the Field" },
  repos: { ko: "급상승 레포", en: "Rising Repos" },
  pulse: { ko: "커뮤니티 펄스", en: "Community Pulse" },
  playbook: { ko: "플레이북", en: "Playbook" },
};

export const REGION_LABEL: Record<Region, { ko: string; en: string }> = {
  KR: { ko: "한국", en: "Korea" },
  US: { ko: "미국", en: "U.S." },
  EU: { ko: "유럽", en: "Europe" },
  CN: { ko: "중국", en: "China" },
  JP: { ko: "일본", en: "Japan" },
  GLOBAL: { ko: "글로벌", en: "Global" },
};

const INDUSTRY_LABEL: Record<Industry, { ko: string; en: string }> = {
  construction: { ko: "건설", en: "Construction" },
  finance: { ko: "금융", en: "Finance" },
  logistics: { ko: "물류", en: "Logistics" },
  retail: { ko: "유통", en: "Retail" },
  media: { ko: "미디어", en: "Media" },
};

/** "건설" on Korean pages, "Construction" on English ones. */
export const industryTag = (i: Industry, lang: Lang) => INDUSTRY_LABEL[i][lang];

const ko = {
  skip: "본문으로 건너뛰기",
  home: "최신 호로 이동",
  prevIssue: "이전 호",
  nextIssue: "다음 호",
  issueSelect: "발행일 선택",
  issuePlaceholder: "지난 호",
  language: "언어",
  darkMode: "다크 모드",
  menu: "주요 메뉴",
  menuEdition: "지면",
  menuArchive: "지난 호",
  menuStories: "기사",
  issue: (n: number) => `제${n}호`,
  what: "무슨 일",
  why: "왜 중요한가",
  more: (n: number) => `+${n}`,
  moreLabel: (label: string, n: number) => `${label} ${n}건 더 보기`,
  sectionAll: (n: number) => `전체 ${n}건`,
  readOriginal: "원문 보기",
  close: "닫기",
  regions: "지역",
  regionFilter: "지역별 보기",
  regionCount: (label: string, n: number) => `${label} ${n}건`,
  perDay: (n: string) => `+${n}/일`,
  returning: "재등장",
  newRepo: "NEW",
  m: { stars: "스타", perDay: "일 평균 스타", language: "언어", change: "등락", points: "점수", comments: "댓글" },
  pts: (n: string) => `${n}점`,
  cmt: (n: string) => `댓글 ${n}`,
  uncurated: "요약 없이 원문 제목으로 발행된 판",
  failedSources: (list: string[]) => `수집 실패 소스: ${list.join(", ")}`,
  emptyTitle: "첫 판을 준비하고 있어요",
  emptyNote: "월·수·금 05:17 발행",
  terms: "용어",
  archiveTitle: "지난 호",
  archivePlaceholder: "헤드라인으로 지난 호 찾기",
  archiveSearchLabel: "지난 호 검색",
  storiesTitle: "기사",
  storiesPlaceholder: "기사 검색 · 에이전트, MCP, 금융 AX",
  storiesSearchLabel: "기사 검색",
  filterLabel: "섹션 필터",
  clearSearch: "검색어 지우기",
  filterAll: "전체",
  editionCount: (n: number) => `${n}개 호`,
  loading: "색인을 불러오는 중…",
  error: "검색 색인을 불러오지 못했어요.",
  retry: "다시 시도",
  noResults: (q: string) => (q ? `‘${q}’와 일치하는 기사가 없어요.` : "표시할 기사가 없어요."),
  resultCount: (n: number) => `${n}건`,
  showMore: "더 보기",
  original: "원문",
  openFailed: "기사를 불러오지 못했어요. 다시 눌러 주세요.",
  relNow: "방금",
  relMin: (n: number) => `${n}분 전`,
  relHour: (n: number) => `${n}시간 전`,
  relDay: (n: number) => `${n}일 전`,
};

type Dict = typeof ko;

const en: Dict = {
  skip: "Skip to content",
  home: "Go to the latest edition",
  prevIssue: "Previous edition",
  nextIssue: "Next edition",
  issueSelect: "Choose an edition",
  issuePlaceholder: "Past editions",
  language: "Language",
  darkMode: "Dark mode",
  menu: "Main menu",
  menuEdition: "Edition",
  menuArchive: "Archive",
  menuStories: "Stories",
  issue: (n) => `No. ${n}`,
  what: "What happened",
  why: "Why it matters",
  more: (n) => `+${n}`,
  moreLabel: (label, n) => `${n} more in ${label}`,
  sectionAll: (n) => `All ${n} stories`,
  readOriginal: "Read original",
  close: "Close",
  regions: "Regions",
  regionFilter: "Filter by region",
  regionCount: (label, n) => `${label}: ${n} stories`,
  perDay: (n) => `+${n}/day`,
  returning: "Back",
  newRepo: "NEW",
  m: { stars: "Stars", perDay: "Stars per day", language: "Language", change: "Move", points: "Points", comments: "Comments" },
  pts: (n) => `${n} pts`,
  cmt: (n) => `${n} comments`,
  uncurated: "Published with original headlines and no summaries",
  failedSources: (list) => `Sources that failed: ${list.join(", ")}`,
  emptyTitle: "Preparing our first edition",
  emptyNote: "Published Mon, Wed, Fri at 05:17 KST",
  terms: "Terms",
  archiveTitle: "Archive",
  archivePlaceholder: "Find an edition by headline",
  archiveSearchLabel: "Search editions",
  storiesTitle: "Stories",
  storiesPlaceholder: "Search stories · agents, MCP, finance AX",
  storiesSearchLabel: "Search stories",
  filterLabel: "Section filter",
  clearSearch: "Clear search",
  filterAll: "All",
  editionCount: (n) => `${n} editions`,
  loading: "Loading the search index…",
  error: "Could not load the search index.",
  retry: "Try again",
  noResults: (q) => (q ? `No stories match “${q}”.` : "Nothing to show."),
  resultCount: (n) => `${n} results`,
  showMore: "Show more",
  original: "Original",
  openFailed: "Could not load the story. Tap again to retry.",
  relNow: "just now",
  relMin: (n) => `${n}m ago`,
  relHour: (n) => `${n}h ago`,
  relDay: (n) => `${n}d ago`,
};

const DICTS: Record<Lang, Dict> = { ko, en };
export const ui = (lang: Lang): Dict => DICTS[lang];
