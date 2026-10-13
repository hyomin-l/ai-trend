"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { L10n, Lang, Section } from "@/types";
import { SECTION_LABEL, ui } from "@/lib/i18n";
import { fmtDateYMD } from "@/lib/format";
import { IconArrowUpRight, IconSearch } from "./Icons";
import styles from "./SearchView.module.css";

/** One story in search-index.json (compact keys: the file covers every edition). */
export type SearchRow = {
  d: string; // edition date
  i: number; // issue
  s: Section;
  id: string;
  t: L10n; // title
  m: L10n; // summary
  src: string;
  u: string; // url
};

type Props = { lang: Lang; sections: Section[] };

const PAGE = 60;
const INDEX_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/search-index.json`;

export default function SearchView({ lang, sections }: Props) {
  const u = ui(lang);
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Section | "all">("all");
  const [limit, setLimit] = useState(PAGE);
  const needle = useDeferredValue(q).trim().toLowerCase();

  useEffect(() => {
    const ctl = new AbortController();
    fetch(INDEX_URL, { signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<SearchRow[]>;
      })
      .then(setRows)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setFailed(true);
      });
    return () => ctl.abort();
  }, [attempt]);

  const haystack = useMemo(
    () => rows?.map((r) => `${r.t.ko} ${r.t.en} ${r.m.ko} ${r.m.en} ${r.src}`.toLowerCase()) ?? [],
    [rows],
  );

  const results = useMemo(
    () => (rows ?? []).filter((r, i) => (filter === "all" || r.s === filter) && (!needle || haystack[i].includes(needle))),
    [rows, haystack, filter, needle],
  );

  // Rows arrive newest edition first, so consecutive rows with the same date form one group.
  const groups = useMemo(() => {
    const out: { d: string; i: number; rows: SearchRow[] }[] = [];
    for (const r of results.slice(0, limit)) {
      const last = out[out.length - 1];
      if (last?.d === r.d) last.rows.push(r);
      else out.push({ d: r.d, i: r.i, rows: [r] });
    }
    return out;
  }, [results, limit]);

  const retry = () => {
    setFailed(false);
    setRows(null);
    setAttempt((a) => a + 1);
  };

  const status = failed ? null : rows === null ? u.loading : results.length ? u.resultCount(results.length) : null;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{u.searchTitle}</h1>

      <form className={styles.form} role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="q" className="sr-only">
          {u.searchLabel}
        </label>
        <span className={styles.glass}>
          <IconSearch size={18} />
        </span>
        <input
          id="q"
          className={styles.input}
          type="search"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder={u.searchPlaceholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
        />
      </form>

      <div className={styles.chips} role="group" aria-label={u.filterLabel}>
        {(["all", ...sections] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={styles.chip}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setLimit(PAGE);
            }}
          >
            {key === "all" ? u.filterAll : SECTION_LABEL[key][lang]}
          </button>
        ))}
      </div>

      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>

      {failed && (
        <div className={styles.notice} role="alert">
          <p>{u.error}</p>
          <button type="button" className={styles.retry} onClick={retry}>
            {u.retry}
          </button>
        </div>
      )}
      {!failed && rows !== null && results.length === 0 && <p className={styles.notice}>{u.noResults(q.trim())}</p>}

      {groups.map((g) => (
        <section key={g.d} className={styles.group} aria-labelledby={`g-${g.d}`}>
          <h2 id={`g-${g.d}`} className={styles.groupHead}>
            <Link href={`/${lang}/${g.d}/`}>{u.editionLink(fmtDateYMD(g.d, lang), g.i)}</Link>
          </h2>
          <ul>
            {g.rows.map((r) => (
              <li key={`${r.d}-${r.id}`} className={styles.row}>
                <h3 className={styles.headline}>{r.t[lang]}</h3>
                <p className={styles.summary}>{r.m[lang]}</p>
                <p className={styles.meta}>
                  <span>{r.src}</span>
                  <span>{SECTION_LABEL[r.s][lang]}</span>
                  <a className={styles.original} href={r.u} target="_blank" rel="noopener noreferrer">
                    {u.original}
                    <IconArrowUpRight size={12} />
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {results.length > limit && (
        <button type="button" className={styles.more} onClick={() => setLimit((n) => n + PAGE)}>
          {u.showMore} ({Math.min(PAGE, results.length - limit)})
        </button>
      )}
    </div>
  );
}
