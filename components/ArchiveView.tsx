"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import type { Lang } from "@/types";
import { ui } from "@/lib/i18n";
import { fmtDateShort } from "@/lib/format";
import SearchField from "./SearchField";
import page from "./ListPage.module.css";
import styles from "./ArchiveView.module.css";

/** One line of the edition list: its date, issue and 오늘의 3줄 headlines (already in the page language). */
export type ArchiveEdition = { date: string; issue: number; heads: string[] };

type Props = { lang: Lang; editions: ArchiveEdition[] };

/**
 * 지난 호: every edition, newest first, each with its three lead headlines; a row opens that edition.
 * The field narrows the list by headline text. (Every single story lives on the 기사 page.)
 */
export default function ArchiveView({ lang, editions }: Props) {
  const u = ui(lang);
  const [q, setQ] = useState("");
  const needle = useDeferredValue(q).trim().toLowerCase();

  const shown = useMemo(
    () => (needle ? editions.filter((e) => e.heads.some((h) => h.toLowerCase().includes(needle))) : editions),
    [editions, needle],
  );

  return (
    <div className={page.wrap}>
      <h1 className={page.title}>{u.archiveTitle}</h1>
      <SearchField
        value={q}
        onChange={setQ}
        placeholder={u.archivePlaceholder}
        label={u.archiveSearchLabel}
        clearLabel={u.clearSearch}
      />
      <p className={page.status} role="status" aria-live="polite">
        {shown.length ? u.editionCount(shown.length) : null}
      </p>
      {shown.length === 0 && <p className={page.notice}>{u.noResults(q.trim())}</p>}

      <ol className={styles.editions}>
        {shown.map((e) => (
          <li key={e.date} className={styles.edition}>
            <h2 className={styles.head}>
              <Link href={`/${lang}/${e.date}/`} className={styles.link}>
                {fmtDateShort(e.date, lang)}
                <span className={styles.issue}> · {u.issue(e.issue)}</span>
              </Link>
            </h2>
            <ol className={styles.heads}>
              {e.heads.map((h, i) => (
                <li key={i}>
                  <span className={styles.no} aria-hidden="true">
                    {i + 1}
                  </span>
                  {h}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
