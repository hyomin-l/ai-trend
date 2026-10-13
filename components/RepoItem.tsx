import type { Item, Lang } from "@/types";
import { ui } from "@/lib/i18n";
import { fmtCompact, fmtNum, parseRepoTitle } from "@/lib/format";
import styles from "./RepoItem.module.css";

type Props = {
  item: Item;
  lang: Lang;
  dimmed?: boolean;
  onOpen: (item: Item) => void;
};

/** A rising repo: `owner/repo`, its one-line description, and ★ / +N per day (plus "재등장 ▲" when it returns). */
export default function RepoItem({ item, lang, dimmed, onOpen }: Props) {
  const u = ui(lang);
  const m = item.metrics;
  const title = item.title[lang];
  const parsed = parseRepoTitle(title);
  // The curator's headline is "owner/repo, what it does": that tagline is the best short description (the summary is for the dialog).
  const desc = parsed?.tagline || item.summary[lang];

  return (
    <article className={styles.item} data-dim={dimmed || undefined} data-fit="repos">
      <h3 className={styles.name}>
        <button type="button" className={styles.hit} aria-label={title} onClick={() => onOpen(item)}>
          {parsed ? (
            <>
              <span className={styles.owner}>{parsed.owner}/</span>
              <wbr />
              <span className={styles.repo}>{parsed.repo}</span>
            </>
          ) : (
            title
          )}
        </button>
      </h3>
      <p className={styles.desc}>{desc}</p>
      <p className={styles.nums}>
        {m?.stars != null && (
          <span className={styles.stars}>
            <span aria-hidden="true">★ </span>
            <span className="sr-only">{u.m.stars} </span>
            {fmtCompact(m.stars)}
          </span>
        )}
        {m?.starsPerDay != null && <span className={styles.rate}>{u.perDay(fmtNum(m.starsPerDay))}</span>}
        {item.returning && (
          <span className={styles.back}>
            {u.returning} <span className={styles.up}>▲{m?.starsDelta != null ? fmtNum(m.starsDelta) : ""}</span>
          </span>
        )}
      </p>
    </article>
  );
}
