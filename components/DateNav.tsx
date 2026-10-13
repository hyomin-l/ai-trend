"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import type { Lang } from "@/types";
import { ui } from "@/lib/i18n";
import { fmtDateCompact, fmtDateShort, fmtDateTiny } from "@/lib/format";
import { IconChevronLeft, IconChevronRight } from "./Icons";
import styles from "./DateNav.module.css";

type Props = {
  lang: Lang;
  /** All edition dates, newest first. */
  dates: string[];
  /** Current edition. */
  date?: string;
  /** Issue number of the current edition, shown next to its date. */
  issue?: number;
};

const href = (lang: Lang, date: string) => `/${lang}/${date}/`;

/**
 * ‹ [10월 13일 (화) · 제1호] › : older / newer edition, and a button that opens the list of every edition.
 * The list is a native popover (light dismiss, Esc, top layer for free) of plain links, so it works the same in every browser.
 * The label is rendered in all its lengths and CSS picks one, which keeps the top bar on one line on phones.
 */
export default function DateNav({ lang, dates, date, issue }: Props) {
  const u = ui(lang);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const idx = date ? dates.indexOf(date) : -1;
  const older = idx >= 0 ? dates[idx + 1] : undefined;
  const newer = idx > 0 ? dates[idx - 1] : undefined;

  // Centre the list under the stepper when it opens (the popover is fixed-position in the top layer) and focus the current edition.
  useEffect(() => {
    const pop = list.current;
    const trigger = btn.current;
    if (!pop || !trigger) return;
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState !== "open") return;
      const r = trigger.parentElement!.getBoundingClientRect(); // the whole ‹ date › group: its centre is the bar's centre
      const bar = trigger.closest("header")?.getBoundingClientRect() ?? r;
      const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1; // wide screens zoom the page
      pop.style.top = `${(bar.bottom + 4) / z}px`;
      const w = pop.getBoundingClientRect().width; // content-sized, so measure after it is shown
      pop.style.left = `${Math.max(8, Math.min(r.left + (r.width - w) / 2, window.innerWidth - w - 8)) / z}px`;
      pop.querySelector<HTMLElement>('[aria-current="page"], a')?.focus({ preventScroll: false });
    };
    const onResize = () => pop.hidePopover(); // the card is placed once; a resize would leave it off-centre
    pop.addEventListener("toggle", onToggle);
    window.addEventListener("resize", onResize);
    return () => {
      pop.removeEventListener("toggle", onToggle);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const close = () => list.current?.hidePopover();
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = [...e.currentTarget.querySelectorAll<HTMLElement>("a")];
    const at = links.indexOf(document.activeElement as HTMLElement);
    links[(at + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length]?.focus();
    e.preventDefault();
  };

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

  return (
    <div className={styles.nav} role="group" aria-label={u.issueSelect}>
      {step(older, u.prevIssue, <IconChevronLeft />)}
      <button
        ref={btn}
        type="button"
        className={styles.pick}
        popoverTarget={id}
        disabled={dates.length === 0}
        aria-label={u.issueSelect}
      >
        {date ? (
          <>
            <span className={styles.full}>{fmtDateShort(date, lang)}</span>
            <span className={styles.compact}>{fmtDateCompact(date, lang)}</span>
            <span className={styles.tiny}>{fmtDateTiny(date, lang)}</span>
            {issue != null && <span className={styles.issue}>· {u.issue(issue)}</span>}
          </>
        ) : (
          u.issuePlaceholder
        )}
      </button>
      {step(newer, u.nextIssue, <IconChevronRight />)}
      <div id={id} ref={list} popover="auto" className={styles.list}>
        <ul onKeyDown={onKey}>
          {dates.map((d) => (
            <li key={d}>
              <Link href={href(lang, d)} aria-current={d === date ? "page" : undefined} onClick={close}>
                {fmtDateShort(d, lang)}
                {d === date && issue != null && <span className={styles.issueInList}> · {u.issue(issue)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
