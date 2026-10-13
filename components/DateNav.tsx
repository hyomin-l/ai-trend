"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Lang } from "@/types";
import { ui } from "@/lib/i18n";
import { fmtDateShort } from "@/lib/format";
import { IconChevronDown, IconChevronLeft, IconChevronRight } from "./Icons";
import styles from "./DateNav.module.css";

type Props = {
  lang: Lang;
  /** All edition dates, newest first. */
  dates: string[];
  /** Current edition; undefined on pages that are not an edition (search). */
  date?: string;
  /** Issue number of the current edition, shown next to its date. */
  issue?: number;
};

const href = (lang: Lang, date: string) => `/${lang}/${date}/`;

/** ‹ [10월 13일 (화) · 제1호 ▾] › : older / newer edition and a (customizable) <select> of every edition. */
export default function DateNav({ lang, dates, date, issue }: Props) {
  const router = useRouter();
  const u = ui(lang);
  const idx = date ? dates.indexOf(date) : -1;
  const older = idx >= 0 ? dates[idx + 1] : undefined;
  const newer = idx > 0 ? dates[idx - 1] : undefined;

  const step = (to: string | undefined, label: string, icon: ReactNode) =>
    to ? (
      <Link className={styles.step} href={href(lang, to)} aria-label={label} title={label}>
        {icon}
      </Link>
    ) : (
      <button type="button" className={`${styles.step} ${styles.off}`} disabled aria-label={label}>
        {icon}
      </button>
    );

  // Plain text only: browsers without customizable selects drop any markup inside <option>.
  const label = (d: string) => (d === date && issue != null ? `${fmtDateShort(d, lang)} · ${u.issue(issue)}` : fmtDateShort(d, lang));

  return (
    <div className={styles.nav} role="group" aria-label={u.issueSelect}>
      {step(older, u.prevIssue, <IconChevronLeft />)}
      <label className={styles.pick}>
        <span className="sr-only">{u.issueSelect}</span>
        <select
          className={styles.select}
          value={date ?? ""}
          disabled={dates.length === 0}
          onChange={(e) => e.target.value && router.push(href(lang, e.target.value))}
        >
          {!date && (
            <option value="" disabled>
              {u.issuePlaceholder}
            </option>
          )}
          {dates.map((d) => (
            <option key={d} value={d}>
              {label(d)}
            </option>
          ))}
        </select>
        <span className={styles.caret}>
          <IconChevronDown size={12} />
        </span>
      </label>
      {step(newer, u.nextIssue, <IconChevronRight />)}
    </div>
  );
}
