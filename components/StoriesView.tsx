"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { GlossaryEntry, Item, Lang, Section, Snapshot } from "@/types";
import { SECTION_LABEL, ui } from "@/lib/i18n";
import { fmtDateShort } from "@/lib/format";
import { parseQuery, prepare, score, type SearchRow } from "@/lib/search";
import ItemDialog from "./ItemDialog";
import OriginalLink from "./OriginalLink";
import SearchField from "./SearchField";
import page from "./ListPage.module.css";
import styles from "./StoriesView.module.css";

type Props = { lang: Lang; sections: Section[] };
type Opened = { item: Item; generatedAt: string; glossary?: GlossaryEntry[] };

const PAGE = 60;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const INDEX_URL = `${BASE}/search-index.json`;
const editionUrl = (date: string) => `${BASE}/editions/${date}/data.json`;

/**
 * 기사: every story of every edition in one scannable list, newest edition first, under a date header per edition.
 * The field and the section chips filter live. A story opens in the same dialog as on the front page; its edition's
 * full JSON is fetched on first click and cached.
 */
export default function StoriesView({ lang, sections }: Props) {
  const u = ui(lang);
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Section | "all">("all");
  const [limit, setLimit] = useState(PAGE);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const editionCache = useRef(new Map<string, Snapshot>());
  const deferred = useDeferredValue(q);

  // The top bar's search lands here as `?q=…` (all results) or `?open=<date>/<id>` (one story).
  const params = useSearchParams();
  const wanted = params.get("open");
  useEffect(() => {
    const initial = params.get("q");
    if (initial) setQ(initial);
  }, [params]);

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

  const prepared = useMemo(() => prepare(rows ?? []), [rows]);
  const tokens = useMemo(() => parseQuery(deferred), [deferred]);
  const results = useMemo(
    () =>
      prepared.filter((p) => (filter === "all" || p.row.s === filter) && (!tokens.length || score(p, tokens) > 0)).map((p) => p.row),
    [prepared, filter, tokens],
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

  const open = async (r: SearchRow) => {
    setBusy(r.id);
    setOpenFailed(false);
    try {
      let snap = editionCache.current.get(r.d);
      if (!snap) {
        const res = await fetch(editionUrl(r.d));
        if (!res.ok) throw new Error(String(res.status));
        snap = (await res.json()) as Snapshot;
        editionCache.current.set(r.d, snap);
      }
      const item = snap.items.find((i) => i.id === r.id);
      if (!item) throw new Error("missing");
      setOpened({ item, generatedAt: snap.generatedAt, glossary: snap.glossary });
    } catch {
      setOpenFailed(true);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!wanted || !rows) return;
    const next = new URLSearchParams(params);
    next.delete("open"); // one-shot, so the same story can be picked again
    window.history.replaceState(null, "", `?${next}`);
    const cut = wanted.indexOf("/");
    const r = rows.find((x) => x.d === wanted.slice(0, cut) && x.id === wanted.slice(cut + 1));
    if (r) void open(r);
  }, [wanted, rows]);

  const status = openFailed ? u.openFailed : failed ? null : rows === null ? u.loading : results.length ? u.resultCount(results.length) : null;

  return (
    <div className={page.wrap}>
      <h1 className={page.title}>{u.storiesTitle}</h1>
      <SearchField
        value={q}
        onChange={(v) => {
          setQ(v);
          setLimit(PAGE);
        }}
        placeholder={u.storiesPlaceholder}
        label={u.storiesSearchLabel}
        clearLabel={u.clearSearch}
      />

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

      <p className={page.status} role="status" aria-live="polite">
        {status}
      </p>

      {failed && (
        <div className={page.notice} role="alert">
          <p>{u.error}</p>
          <button type="button" className={page.retry} onClick={retry}>
            {u.retry}
          </button>
        </div>
      )}
      {!failed && rows !== null && results.length === 0 && <p className={page.notice}>{u.noResults(q.trim())}</p>}

      {groups.map((g) => (
        <section key={g.d} className={styles.group} aria-labelledby={`g-${g.d}`}>
          <h2 id={`g-${g.d}`} className={styles.groupHead}>
            <Link href={`/${lang}/${g.d}/`}>
              {fmtDateShort(g.d, lang)} · {u.issue(g.i)}
            </Link>
          </h2>
          <ul>
            {g.rows.map((r) => (
              <li key={`${r.d}-${r.id}`} className={styles.row} aria-busy={busy === r.id || undefined}>
                <h3 className={styles.headline}>{r.t[lang]}</h3>
                <p className={styles.summary}>{r.m[lang]}</p>
                <p className={styles.meta}>
                  <span>{r.src}</span>
                  <span>{SECTION_LABEL[r.s][lang]}</span>
                </p>
                <button type="button" className={styles.hit} aria-label={r.t[lang]} onClick={() => open(r)} />
                <span className={styles.original}>
                  <OriginalLink href={r.u} label={u.original} small />
                </span>
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

      <ItemDialog
        item={opened?.item ?? null}
        lang={lang}
        generatedAt={opened?.generatedAt ?? ""}
        glossary={opened?.glossary}
        onClose={() => setOpened(null)}
      />
    </div>
  );
}
