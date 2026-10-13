"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/types";
import { SECTION_LABEL, ui } from "@/lib/i18n";
import { fmtDateShort } from "@/lib/format";
import { find, loadIndex, loadStory, prepare, type SearchRow, type Story } from "@/lib/search";
import ItemDialog from "./ItemDialog";
import { IconClose, IconSearch } from "./Icons";
import styles from "./TopSearch.module.css";

const MAX = 6;

/**
 * The search field of the top bar, with live results under it. Typing (after 150ms, from 2 characters) lists up to
 * 6 stories; ↑/↓ highlight, Enter opens the highlighted story (in the dialog, on the current page) or, with none highlighted,
 * the whole result list (`/[lang]/stories/?q=…`). Esc closes the list, then clears the field. The index loads on first
 * focus. Under 1024px the field is an icon that expands over the bar's row. `/` focuses it unless the page has its own
 * field (`#q`).
 */
export default function TopSearch({ lang }: { lang: Lang }) {
  const u = ui(lang);
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [needle, setNeedle] = useState("");
  const [open, setOpen] = useState(false); // the result list is allowed to show
  const [expanded, setExpanded] = useState(false); // narrow screens: the field is expanded over the bar
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [active, setActive] = useState(-1);
  const [story, setStory] = useState<Story | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setNeedle(q.trim()), 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("dialog[open], #q")) return;
      e.preventDefault();
      setExpanded(true);
      input.current?.focus(); // wide screens: the field is always there
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (expanded) input.current?.focus(); // narrow screens: the field only exists once expanded
  }, [expanded]);

  const prepared = useMemo(() => prepare(rows ?? []), [rows]);
  const hits = useMemo(() => (needle.length >= 2 ? find(prepared, needle) : []), [prepared, needle]);
  const shown = open && needle.length >= 2 && needle === q.trim();
  const list = hits.slice(0, MAX);
  const last = list.length; // index of the "see all" row
  const count = list.length + (hits.length ? 1 : 0);

  const optId = (i: number) => `${id}-${i}`;
  const all = () => {
    const t = q.trim();
    if (!t) return;
    setOpen(false);
    router.push(`/${lang}/stories/?q=${encodeURIComponent(t)}`);
  };
  const pick = (i: number) => {
    const r = list[i]; // past the last story: the "see all" row
    if (!r) return all();
    setOpen(false);
    loadStory(r).then(setStory, () => router.push(`/${lang}/stories/?open=${r.d}/${encodeURIComponent(r.id)}`));
  };
  const closeStory = () => {
    setStory(null);
    setExpanded(true); // narrow screens: the field must exist to take focus back
    requestAnimationFrame(() => {
      input.current?.focus();
      setOpen(false);
    });
  };

  return (
    <div
      className={styles.root}
      data-expanded={expanded || undefined}
      role="search"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setOpen(false);
        setExpanded(false);
      }}
    >
      <button
        type="button"
        className={styles.btn}
        aria-label={u.storiesSearchLabel}
        onClick={() => setExpanded(true)}
      >
        <IconSearch size={18} />
      </button>
      <div className={styles.field}>
        <span className={styles.glass}>
          <IconSearch size={16} />
        </span>
        <input
          ref={input}
          className={styles.input}
          type="search"
          role="combobox"
          aria-expanded={shown}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={shown && active >= 0 ? optId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label={u.storiesSearchLabel}
          placeholder={u.topSearchPlaceholder}
          value={q}
          onFocus={() => {
            setOpen(true);
            loadIndex().then(setRows, () => {});
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              if (shown) setOpen(false);
              else if (q) setQ("");
              else input.current?.blur();
            } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && shown && count) {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((a) => (a < 0 ? (step > 0 ? 0 : count - 1) : (a + step + count) % count));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (shown && active >= 0) pick(active);
              else all();
            }
          }}
        />
        <button type="button" className={styles.close} aria-label={u.close} onClick={() => setExpanded(false)}>
          <IconClose size={14} />
        </button>
        {shown && (
          <ul id={`${id}-list`} className={styles.pop} role="listbox" aria-label={u.searchResults}>
            {rows && hits.length === 0 && <li className={styles.note}>{u.searchNone}</li>}
            {rows === null && <li className={styles.note}>{u.loading}</li>}
            {list.map((r, i) => (
              <li
                key={`${r.d}-${r.id}`}
                id={optId(i)}
                role="option"
                aria-selected={active === i}
                className={styles.opt}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className={styles.title}>{r.t[lang]}</span>
                <span className={styles.meta}>
                  {SECTION_LABEL[r.s][lang]} · {fmtDateShort(r.d, lang)} · {r.src}
                </span>
              </li>
            ))}
            {hits.length > 0 && (
              <li
                id={optId(last)}
                role="option"
                aria-selected={active === last}
                className={`${styles.opt} ${styles.all}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={all}
              >
                {u.searchAll}
              </li>
            )}
          </ul>
        )}
      </div>
      <ItemDialog item={story?.item ?? null} lang={lang} generatedAt={story?.generatedAt ?? ""} glossary={story?.glossary} onClose={closeStory} />
    </div>
  );
}
