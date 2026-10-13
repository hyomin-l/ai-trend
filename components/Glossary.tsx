"use client";

import { useId, useRef, type ReactNode } from "react";
import type { GlossaryEntry, Lang } from "@/types";
import styles from "./Glossary.module.css";

/** Lets a plan be built per page: text slots in reading order -> which terms get marked in which slot. */
export type GlossPlan = Map<string, GlossaryEntry[]>;

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

/** Glossary terms that occur in any of the texts, in glossary order. */
export const termsIn = (texts: string[], glossary: GlossaryEntry[] | undefined) =>
  (glossary ?? []).filter((g) => texts.some((t) => findTerm(t, g.term) >= 0));

/** The first slot (reading order) containing each term gets that term; later occurrences stay plain. */
export function planGloss(slots: { key: string; text: string }[], glossary: GlossaryEntry[]): GlossPlan {
  const plan: GlossPlan = new Map();
  for (const g of glossary) {
    const hit = slots.find((s) => findTerm(s.text, g.term) >= 0);
    if (hit) plan.set(hit.key, [...(plan.get(hit.key) ?? []), g]);
  }
  return plan;
}

/** Cut `text` around the first occurrence of each term; where terms overlap the longer one wins. */
function split(text: string, terms: GlossaryEntry[]) {
  const found = terms
    .map((entry) => ({ entry, at: findTerm(text, entry.term) }))
    .filter((f) => f.at >= 0)
    .sort((a, b) => b.entry.term.length - a.entry.term.length);
  const kept: typeof found = [];
  for (const f of found) {
    const end = f.at + f.entry.term.length;
    if (!kept.some((k) => f.at < k.at + k.entry.term.length && end > k.at)) kept.push(f);
  }
  kept.sort((a, b) => a.at - b.at);
  const out: (string | { entry: GlossaryEntry; text: string })[] = [];
  let pos = 0;
  for (const { entry, at } of kept) {
    if (at > pos) out.push(text.slice(pos, at));
    out.push({ entry, text: text.slice(at, at + entry.term.length) });
    pos = at + entry.term.length;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

/** Text with the given terms marked (dotted underline + tooltip). No terms: just the text. */
export function Glossed({ text, terms, lang }: { text: string; terms?: GlossaryEntry[]; lang: Lang }): ReactNode {
  if (!terms?.length) return text;
  return split(text, terms).map((p, i) =>
    typeof p === "string" ? p : (
      <Term key={i} entry={p.entry} lang={lang}>
        {p.text}
      </Term>
    ),
  );
}

/**
 * A marked term. Focusable, so the tooltip works from the keyboard; hover shows it for a mouse, a tap shows it on touch;
 * Esc and a tap elsewhere close it (that is what `popover="auto"` gives for free). The tooltip lives in the top layer, so
 * the clipping of clamped headlines and columns cannot cut it. It is placed by hand: fixed position from the term's box.
 */
function Term({ entry, lang, children }: { entry: GlossaryEntry; lang: Lang; children: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);

  const show = () => {
    const a = anchor.current;
    const t = tip.current;
    if (!a || !t || t.matches(":popover-open")) return;
    const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1; // wide screens zoom the page
    const r = a.getClientRects()[0] ?? a.getBoundingClientRect();
    t.showPopover();
    const w = t.offsetWidth * z;
    const h = t.offsetHeight * z;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
    t.style.left = `${left / z}px`;
    t.style.top = `${top / z}px`;
  };
  const hide = () => {
    if (tip.current?.matches(":popover-open")) tip.current.hidePopover();
  };

  return (
    <span
      ref={anchor}
      className={styles.term}
      tabIndex={0}
      aria-describedby={id}
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
      onFocus={show}
      onBlur={hide}
      onClick={show}
    >
      {children}
      <span ref={tip} id={id} role="tooltip" popover="auto" className={styles.tip}>
        <b>{entry.term}</b> {entry.desc[lang]}
      </span>
    </span>
  );
}
