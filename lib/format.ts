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
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

const KST_MS = 9 * 3_600_000;
const kst = (ms: number) => {
  const d = new Date(ms + KST_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
};
const p2 = (n: number) => String(n).padStart(2, "0");

/** "2026-10-13 14:05 KST": the exact time behind a relative or date-only label (tooltip text). */
export function kstStamp(iso: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const { y, m, d, hh, mm } = kst(t);
  return `${y}-${p2(m)}-${p2(d)} ${p2(hh)}:${p2(mm)} KST`;
}

/**
 * Time measured against the edition's generatedAt, never the wall clock (the page is static).
 * Under 24h: relative ("방금", "n분 전", "n시간 전"). From 24h: the KST calendar date, with the year only when it differs from the edition's.
 */
export function relTime(iso: string, ref: string, lang: Lang) {
  const t = Date.parse(iso);
  const r = Date.parse(ref);
  if (Number.isNaN(t) || Number.isNaN(r)) return "";
  const u = ui(lang);
  const min = Math.max(0, Math.round((r - t) / 60_000));
  if (min < 1) return u.relNow;
  if (min < 60) return u.relMin(min);
  if (min < 24 * 60) return u.relHour(Math.floor(min / 60));
  const { y, m, d } = kst(t);
  if (lang === "ko") return y === kst(r).y ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
  return y === kst(r).y ? `${MON_EN[m - 1]} ${d}` : `${MON_EN[m - 1]} ${d}, ${y}`;
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
