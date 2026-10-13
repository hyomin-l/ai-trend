import { notFound } from "next/navigation";
import type { Lang } from "@/types";
import { DISPLAY, SECTION_ORDER } from "@/config/sources";
import { ui } from "@/lib/i18n";
import { latestSnapshot, listDates, loadSnapshot } from "@/lib/snapshots";
import Edition from "./Edition";
import EmptyState from "./EmptyState";
import Masthead from "./Masthead";
import TopBar from "./TopBar";
import styles from "./EditionPage.module.css";

type Props = {
  lang: Lang;
  /** Omit for the latest edition. */
  date?: string;
};

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
      <TopBar lang={lang} dates={dates} date={snapshot?.date} kind="edition" sections={snapshot ? SECTION_ORDER : []} />
      <main id="main" lang={lang} className={styles.main}>
        {snapshot ? (
          <>
            <Masthead snapshot={snapshot} lang={lang} />
            <div className={styles.edition}>
              <Edition snapshot={snapshot} lang={lang} display={DISPLAY} />
            </div>
          </>
        ) : (
          <EmptyState lang={lang} />
        )}
      </main>
    </div>
  );
}
