import type { Item, Lang } from "@/types";
import { ui } from "@/lib/i18n";

/** True only for absolute http(s) URLs; the single gate for anything rendered as an external href. */
export function isWebUrl(u: string): boolean {
  try {
    const p = new URL(u.trim()).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

const WD_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_EN_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_EN_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Calendar parts of a YYYY-MM-DD edition date; timezone-independent, so server and browser agree. */
function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "10월 13일 (화)" / "Oct 13 (Tue)" */
export function fmtDateShort(date: string, lang: Lang) {
  const { m, d, wd } = parts(date);
  return lang === "ko" ? `${m}월 ${d}일 (${WD_KO[wd]})` : `${MON_EN[m - 1]} ${d} (${WD_EN[wd]})`;
}

/** "10.13 (화)" / "Oct 13": the top bar's date on small phones. */
export function fmtDateCompact(date: string, lang: Lang) {
  const { m, d, wd } = parts(date);
  return lang === "ko" ? `${m}.${d} (${WD_KO[wd]})` : `${MON_EN[m - 1]} ${d}`;
}

/** "10.13" / "Oct 13": the smallest form, for the narrowest phones. */
export function fmtDateTiny(date: string, lang: Lang) {
  const { m, d } = parts(date);
  return lang === "ko" ? `${m}.${d}` : `${MON_EN[m - 1]} ${d}`;
}

/** "2026년 10월 13일" / "Oct 13, 2026" */
export function fmtDateYMD(date: string, lang: Lang) {
  const { y, m, d } = parts(date);
  return lang === "ko" ? `${y}년 ${m}월 ${d}일` : `${MON_EN[m - 1]} ${d}, ${y}`;
}

/** "2026년 10월 13일 월요일" / "Monday, October 13, 2026" */
export function fmtDateLong(date: string, lang: Lang) {
  const { y, m, d, wd } = parts(date);
  return lang === "ko" ? `${y}년 ${m}월 ${d}일 ${WD_KO[wd]}요일` : `${WD_EN_LONG[wd]}, ${MON_EN_LONG[m - 1]} ${d}, ${y}`;
}

/** Relative time measured against the edition's generatedAt, never the wall clock (the page is static). */
export function relTime(iso: string, ref: string, lang: Lang) {
  const t = Date.parse(iso);
  const r = Date.parse(ref);
  if (Number.isNaN(t) || Number.isNaN(r)) return "";
  const u = ui(lang);
  const min = Math.max(0, Math.round((r - t) / 60_000));
  if (min < 1) return u.relNow;
  if (min < 60) return u.relMin(min);
  const h = Math.floor(min / 60);
  if (h < 24) return u.relHour(h);
  return u.relDay(Math.floor(h / 24));
}

/** 12,400 (fixed locale so server and client render identically) */
export const fmtNum = (n: number) => n.toLocaleString("en-US");

/** 1.3k / 11.3k from 1,000 up, otherwise plain: one unit per column keeps right-aligned numbers comparable. */
export function fmtCompact(n: number) {
  if (n < 1_000) return fmtNum(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

/** "owner/repo, tagline" or "owner/repo: tagline" (the curator's repo headline); null for anything else. */
export function parseRepoTitle(title: string) {
  const m = /^([\w.-]+)\/([\w.-]+)(?:\s*[,:]\s*(.+))?$/.exec(title.trim());
  return m ? { owner: m[1], repo: m[2], tagline: m[3] ?? "" } : null;
}

/** The one-line description a repo row shows: the headline's tagline, else the summary. */
export const repoDesc = (item: Item, lang: Lang) => parseRepoTitle(item.title[lang])?.tagline || item.summary[lang];
