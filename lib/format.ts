import type { Lang } from "@/types";
import { ui } from "@/lib/i18n";

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
const pad = (n: number) => String(n).padStart(2, "0");

/** "10.13 (월)" / "10.13 Mon" */
export function fmtDateShort(date: string, lang: Lang) {
  const { m, d, wd } = parts(date);
  return lang === "ko" ? `${pad(m)}.${pad(d)} (${WD_KO[wd]})` : `${pad(m)}.${pad(d)} ${WD_EN[wd]}`;
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

/** 12.4k above 10,000, otherwise plain */
export function fmtCompact(n: number) {
  if (n < 10_000) return fmtNum(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}
