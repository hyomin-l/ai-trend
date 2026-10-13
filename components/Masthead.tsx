import type { Lang, Snapshot } from "@/types";
import { BRAND, ui } from "@/lib/i18n";
import { fmtDateLong } from "@/lib/format";
import Wordmark from "./Wordmark";
import styles from "./Masthead.module.css";

type Props = { snapshot: Snapshot; lang: Lang };

/** Nameplate strip: issue + date + counts on the left ear, wordmark in the middle, tagline (or the uncurated notice) on the right ear. */
export default function Masthead({ snapshot, lang }: Props) {
  const u = ui(lang);
  const { issue, date, stats, failedSources, curated } = snapshot;
  return (
    <div className={styles.mast}>
      <div className={styles.earL}>
        <p>
          {u.issue(issue)} · {fmtDateLong(date, lang)}
        </p>
        <p>{u.collectedPublished(stats.collected, stats.published)}</p>
        {failedSources.length > 0 && <p className={styles.foot}>{u.failedSources(failedSources)}</p>}
      </div>
      <h1 className={styles.wordmark}>
        <Wordmark />
      </h1>
      {curated ? (
        <p className={styles.earR}>{BRAND.tagline[lang]}</p>
      ) : (
        <p className={`${styles.earR} ${styles.alert}`} role="note">
          {u.uncurated}
        </p>
      )}
    </div>
  );
}
