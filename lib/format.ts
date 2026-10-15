import type { Item, Lang } from "@/types";

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

/** "2026-10-13 14:05 KST": the exact time behind a displayed time label (tooltip text). */
export function kstStamp(iso: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const { y, m, d, hh, mm } = kst(t);
  return `${y}-${p2(m)}-${p2(d)} ${p2(hh)}:${p2(mm)} KST`;
}

/**
 * Absolute KST time, measured against the edition's generatedAt only for the year (never the wall clock; the page is static).
 * "10월 14일 14:05" / "Oct 14, 14:05"; the year is added when it differs from the edition's. `dateOnly` drops the clock (repo creation).
 */
export function fmtWhen(iso: string, ref: string, lang: Lang, dateOnly = false) {
  const t = Date.parse(iso);
  const r = Date.parse(ref);
  if (Number.isNaN(t) || Number.isNaN(r)) return "";
  const { y, m, d, hh, mm } = kst(t);
  const year = y !== kst(r).y;
  const clock = `${p2(hh)}:${p2(mm)}`;
  if (lang === "ko") return `${year ? `${y}년 ` : ""}${m}월 ${d}일${dateOnly ? "" : ` ${clock}`}`;
  return `${MON_EN[m - 1]} ${d}${year ? `, ${y}` : ""}${dateOnly ? "" : `, ${clock}`}`;
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

const ASCII_WORD = /[A-Za-z0-9]/;

/** Index of `term` in `text` (case-insensitive), or -1. A term edged by a letter or digit must not be glued to one ("RAG" is not in "storage"). */
export function findTerm(text: string, term: string): number {
  const hay = text.toLowerCase();
  const needle = term.toLowerCase();
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
    const glued =
      (ASCII_WORD.test(term[0]) && ASCII_WORD.test(text[i - 1] ?? "")) ||
      (ASCII_WORD.test(term[term.length - 1]) && ASCII_WORD.test(text[i + term.length] ?? ""));
    if (!glued) return i;
  }
  return -1;
}
