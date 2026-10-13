import { ViewTransition } from "react";
import { notFound } from "next/navigation";
import type { Lang, Snapshot } from "@/types";
import { DISPLAY, SECTION_ORDER } from "@/config/sources";
import { ui } from "@/lib/i18n";
import { latestSnapshot, listDates, loadSnapshot } from "@/lib/snapshots";
import Edition from "./Edition";
import EmptyState from "./EmptyState";
import TopBar from "./TopBar";
import styles from "./EditionPage.module.css";

type Props = {
  lang: Lang;
  /** Omit for the latest edition. */
  date?: string;
};

/** The note only appears when something went wrong with this edition. */
function noticeOf(s: Snapshot, lang: Lang) {
  const u = ui(lang);
  return [!s.curated && u.uncurated, s.failedSources.length > 0 && u.failedSources(s.failedSources)]
    .filter(Boolean)
    .join(" · ");
}

/** A full edition page (shared by `/`, `/[lang]` and `/[lang]/[date]`), or the empty state before the first one. */
export default function EditionPage({ lang, date }: Props) {
  const u = ui(lang);
  const dates = listDates();
  const snapshot = date ? loadSnapshot(date) : latestSnapshot();
  if (date && !snapshot) notFound();

  return (
    <div className={styles.page}>
      <a className="skip" href="#main">
        {u.skip}
      </a>
      <TopBar lang={lang} dates={dates} date={snapshot?.date} issue={snapshot?.issue} kind="edition" />
      <ViewTransition>
        <main id="main" lang={lang} className={styles.main}>
          {snapshot ? (
            <Edition
              snapshot={snapshot}
              lang={lang}
              sections={SECTION_ORDER}
              display={DISPLAY}
              notice={noticeOf(snapshot, lang) || undefined}
            />
          ) : (
            <EmptyState lang={lang} />
          )}
        </main>
      </ViewTransition>
    </div>
  );
}
