import { FRONT, INDUSTRIES, SECTIONS } from "@/config/sections";
import type { Industry, Lang, Region, Section } from "@/types";

/**
 * FORK POINT: every user-visible brand string lives here. Renaming the product is a change to this object only
 * (the curator's prompt and the page metadata read `name`). <Logo> renders `name` in the display face next to the blob mark.
 * Colours are elsewhere: the accent (--magenta) and paper tones are tokens in app/globals.css; `paper` below is the
 * browser-chrome copy of --paper and must match it. The favicon (app/icon.svg) and the globe's markers (components/Globe.tsx)
 * carry the accent as literals.
 */
export const BRAND = {
  name: "AI Trend",
  short: "AI Trend",
  description: {
    ko: "평일 아침, 흩어진 AI 트렌드를 한 장의 신문으로 묶어 드립니다.",
    en: "Scattered AI trends, gathered into a single newspaper page every weekday morning.",
  },
  paper: { light: "#F7F7F5", dark: "#111112" },
} as const;

export const LANGS: Lang[] = ["ko", "en"];
export const isLang = (v: string): v is Lang => (LANGS as string[]).includes(v);

export type SectionKey = Section | "front";

/** Section names, used for column headers, dialogs and search filters (defined in config/sections.ts). */
export const SECTION_LABEL: Record<SectionKey, { ko: string; en: string }> = { front: FRONT, ...SECTIONS };

/** Region names; the key order is the tie-break order of the front page's region list. The globe's marker positions live in components/Globe.tsx. */
export const REGION_LABEL: Record<Region, { ko: string; en: string }> = {
  KR: { ko: "한국", en: "Korea" },
  US: { ko: "미국", en: "U.S." },
  EU: { ko: "유럽", en: "Europe" },
  CN: { ko: "중국", en: "China" },
  JP: { ko: "일본", en: "Japan" },
  GLOBAL: { ko: "글로벌", en: "Global" },
};

export const REGIONS = Object.keys(REGION_LABEL) as Region[];

/** "건설" on Korean pages, "Construction" on English ones. */
export const industryTag = (i: Industry, lang: Lang) => INDUSTRIES[i][lang];

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
  why: "왜 중요한가",
  feedOnly: "원문을 확인하지 못해 기존에 확보한 짧은 설명을 바탕으로 작성했습니다.",
  more: (n: number) => `+${n}`,
  moreLabel: (label: string, n: number) => `${label} ${n}건 더 보기`,
  sectionAll: (n: number) => `전체 ${n}건`,
  readOriginal: "원문 보기",
  alsoCovered: (n: number) => `다른 출처 ${n}`,
  close: "닫기",
  regions: "지역",
  regionFilter: "지역별 보기",
  regionCount: (label: string, n: number) => `${label} ${n}건`,
  perDay: (n: string) => `+${n}/일`,
  perWeek: (n: string) => `+${n}/주`,
  returning: "재등장",
  newRepo: "NEW",
  m: { stars: "스타", forks: "포크", perDay: "일 평균 스타", gained: "주간 스타 증가", language: "언어", change: "등락", points: "점수", comments: "댓글", likes: "좋아요", downloads: "다운로드", upvotes: "추천" },
  pts: (n: string) => `${n}점`,
  cmt: (n: string) => `댓글 ${n}`,
  uncurated: "요약 없이 원문 제목으로 발행된 판",
  failedSources: (list: string[]) => `수집 실패 소스: ${list.join(", ")}`,
  emptyTitle: "첫 판을 준비하고 있어요",
  emptyNote: "평일(월~금) 새벽 발행",
  terms: "용어",
  archiveTitle: "지난 호",
  archivePlaceholder: "헤드라인으로 지난 호 찾기",
  archiveSearchLabel: "지난 호 검색",
  storiesTitle: "기사",
  storiesPlaceholder: "기사 검색 · 에이전트, MCP, 금융 AX",
  storiesSearchLabel: "기사 검색",
  topSearchPlaceholder: "검색",
  searchResults: "검색 결과",
  searchAll: "모든 결과 보기",
  searchNone: "결과 없음",
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
  created: (when: string) => `${when} 생성`,
  perDayTip: "생성 후 일 평균 스타",
  perWeekTip: "최근 일주일간 늘어난 스타",
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
  why: "Why it matters",
  feedOnly: "Original text unavailable; based on the previously available short description.",
  more: (n) => `+${n}`,
  moreLabel: (label, n) => `${n} more in ${label}`,
  sectionAll: (n) => `All ${n} stories`,
  readOriginal: "Read original",
  alsoCovered: (n) => `Also covered by ${n}`,
  close: "Close",
  regions: "Regions",
  regionFilter: "Filter by region",
  regionCount: (label, n) => `${label}: ${n} stories`,
  perDay: (n) => `+${n}/day`,
  perWeek: (n) => `+${n}/week`,
  returning: "Back",
  newRepo: "NEW",
  m: { stars: "Stars", forks: "Forks", perDay: "Stars per day", gained: "Stars this week", language: "Language", change: "Move", points: "Points", comments: "Comments", likes: "Likes", downloads: "Downloads", upvotes: "Upvotes" },
  pts: (n) => `${n} pts`,
  cmt: (n) => `${n} comments`,
  uncurated: "Published with original headlines and no summaries",
  failedSources: (list) => `Sources that failed: ${list.join(", ")}`,
  emptyTitle: "Preparing our first edition",
  emptyNote: "Published early every weekday (KST)",
  terms: "Terms",
  archiveTitle: "Archive",
  archivePlaceholder: "Find an edition by headline",
  archiveSearchLabel: "Search editions",
  storiesTitle: "Stories",
  storiesPlaceholder: "Search stories · agents, MCP, finance AX",
  storiesSearchLabel: "Search stories",
  topSearchPlaceholder: "Search",
  searchResults: "Search results",
  searchAll: "See all results",
  searchNone: "No results",
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
  created: (when) => `created ${when}`,
  perDayTip: "Average stars per day since creation",
  perWeekTip: "Stars gained in the past week",
};

const DICTS: Record<Lang, Dict> = { ko, en };
export const ui = (lang: Lang): Dict => DICTS[lang];

/** Explain collection failures without exposing internal exception text. Old snapshots remain supported. */
export function readingNotice(reason: string | undefined, lang: Lang, url = ""): string {
  if (!reason) return ui(lang).feedOnly;
  const publisher = reason.startsWith("publisher-");
  const r = (publisher ? reason.slice("publisher-".length) : reason).toLowerCase();
  const messages = {
    lookup: ["공개된 원문 주소를 찾지 못했습니다.", "A matching public original URL could not be found."],
    searchBlocked: ["공개 원문 주소 검색이 제한됐습니다.", "Public original-URL lookup was restricted."],
    google: ["Google News 중계 주소가 자동 수집을 제한했습니다.", "The Google News intermediary restricted automated access."],
    blocked: ["사이트에서 자동 수집을 제한했습니다.", "The site restricted automated access."],
    rate: ["사이트의 요청 횟수 제한에 도달했습니다.", "The site's request limit was reached."],
    auth: ["원문을 읽으려면 인증이 필요합니다.", "Authentication is required to read the original."],
    paywall: ["유료 열람이 필요한 원문입니다.", "The original requires paid access."],
    timeout: ["원문을 읽는 제한 시간을 초과했습니다.", "The original could not be read within the time limit."],
    compression: ["원문의 압축 응답을 처리하지 못했습니다.", "The compressed response could not be decoded."],
    discussion: ["토론·댓글 페이지는 기사 본문으로 사용하지 않았습니다.", "A discussion page was not used as an article body."],
    mismatch: ["기사와 일치하는 본문을 확인하지 못했습니다.", "A body matching this article could not be verified."],
    size: ["원문이 수집 크기 제한을 초과했습니다.", "The original exceeded the collection size limit."],
    missing: ["원문 주소에서 기사를 찾지 못했습니다.", "The article was not found at its original URL."],
    permission: ["사이트의 수집 허용 여부를 확인하지 못했습니다.", "The site's collection permission could not be verified."],
    extraction: ["원문에서 읽을 수 있는 본문을 추출하지 못했습니다.", "Readable article text could not be extracted."],
  };
  let key: keyof typeof messages;
  if (r.includes("timeout")) key = "timeout";
  else if (r.includes("429")) key = "rate";
  else if (r.startsWith("original-lookup-")) key = "searchBlocked";
  else if (r === "google-news-no-public-link") key = "lookup";
  else if (r === "http-401") key = "auth";
  else if (r === "paywall") key = "paywall";
  else if (r === "robots-denied" || r === "http-403") key = !publisher && /^https:\/\/news\.google\.com\//.test(url) ? "google" : "blocked";
  else if (r.startsWith("robots-")) key = "permission";
  else if (r === "unsupported-encoding" || r === "decompression-failed") key = "compression";
  else if (r === "discussion-page") key = "discussion";
  else if (r === "unrelated-body") key = "mismatch";
  else if (r === "body-too-large") key = "size";
  else if (r === "http-404" || r === "http-410") key = "missing";
  else if (r === "extraction-failed" || r === "unsupported-content-type") key = "extraction";
  else return ui(lang).feedOnly;
  return `${messages[key][lang === "ko" ? 0 : 1]} ${lang === "ko" ? "피드 설명을 바탕으로 작성했습니다." : "Written from the feed description."}`;
}
