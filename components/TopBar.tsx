"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang, Section } from "@/types";
import { BRAND, LANGS, SECTION_LABEL, ui, type SectionKey } from "@/lib/i18n";
import DateNav from "./DateNav";
import Wordmark from "./Wordmark";
import { IconClose, IconMenu, IconSearch } from "./Icons";
import styles from "./TopBar.module.css";

type Props = {
  lang: Lang;
  /** All edition dates, newest first. */
  dates: string[];
  /** Edition being shown (also set on `/` for the latest one). */
  date?: string;
  /** "edition": section links focus the section in place. "search": they link back to the latest edition. */
  kind: "edition" | "search";
  /** Sections to list after 1면; empty hides the section nav (empty state). */
  sections: Section[];
};

const FLASH_MS = 1400;

/** Sticky 44px bar. One DOM for both layouts: a 3-column grid on desktop, a menu panel under 1100px. */
export default function TopBar({ lang, dates, date, kind, sections }: Props) {
  const u = ui(lang);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<SectionKey | null>(null);

  const home = lang === "ko" ? "/" : `/${lang}/`;
  const langHref = (l: Lang) =>
    kind === "search" ? `/${l}/search/` : date ? `/${l}/${date}/` : l === "ko" ? "/" : `/${l}/`;
  const nav: SectionKey[] = sections.length ? ["front", ...sections] : [];

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /** Desktop shows everything at once, so "go to" means: move focus there and flash it. Mobile also scrolls. */
  const focusSection = (e: MouseEvent, key: SectionKey) => {
    e.preventDefault();
    setOpen(false);
    const el = document.getElementById(`sec-${key}`);
    if (!el) return;
    const desktop = window.matchMedia("(min-width: 1100px)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!desktop) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
    el.dataset.flash = "false";
    void el.offsetWidth; // restart the animation when clicked twice
    el.dataset.flash = "true";
    window.setTimeout(() => delete el.dataset.flash, FLASH_MS);
    setActive(key);
    window.setTimeout(() => setActive((a) => (a === key ? null : a)), FLASH_MS + 400);
  };

  return (
    <header className={styles.bar} lang={lang}>
      <div className={styles.row}>
        <Link href={home} className={styles.wordmark} aria-label={`${BRAND.name}, ${u.home}`}>
          <Wordmark />
        </Link>
        <button
          type="button"
          className={styles.menu}
          aria-expanded={open}
          aria-controls="topbar-panel"
          aria-label={open ? u.menuClose : u.menuOpen}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <IconClose size={20} /> : <IconMenu size={20} />}
        </button>
      </div>

      <div id="topbar-panel" className={styles.panel} data-open={open}>
        {nav.length > 0 && (
          <nav className={styles.sections} aria-label={u.sections}>
            <ul>
              {nav.map((key) => (
                <li key={key}>
                  {kind === "edition" ? (
                    <a
                      href={`#sec-${key}`}
                      className={styles.link}
                      data-active={active === key || undefined}
                      onClick={(e) => focusSection(e, key)}
                    >
                      {SECTION_LABEL[key][lang]}
                    </a>
                  ) : (
                    <Link href={`${home}#sec-${key}`} className={styles.link} onClick={() => setOpen(false)}>
                      {SECTION_LABEL[key][lang]}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className={styles.controls}>
          <DateNav lang={lang} dates={dates} date={date} />
          <Link
            href={`/${lang}/search/`}
            className={styles.search}
            aria-label={u.search}
            aria-current={kind === "search" ? "page" : undefined}
          >
            <IconSearch size={18} />
          </Link>
          <div className={styles.lang} role="group" aria-label={u.language}>
            {LANGS.map((l) =>
              l === lang ? (
                <span key={l} className={`${styles.langCell} ${styles.on}`} aria-current="true">
                  {l.toUpperCase()}
                </span>
              ) : (
                <Link
                  key={l}
                  href={langHref(l)}
                  className={styles.langCell}
                  lang={l}
                  hrefLang={l}
                  aria-label={l === "ko" ? "한국어" : "English"}
                >
                  {l.toUpperCase()}
                </Link>
              ),
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
