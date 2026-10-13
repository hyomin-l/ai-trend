import type { Item, Lang } from "@/types";
import { ui } from "@/lib/i18n";
import { fmtCompact, fmtNum } from "@/lib/format";
import styles from "./RepoTicker.module.css";

type Props = {
  items: Item[];
  lang: Lang;
  isDimmed: (item: Item) => boolean;
  onOpen: (item: Item) => void;
};

/** "owner/repo" -> muted owner + strong repo; anything else is shown as-is. */
function RepoName({ title }: { title: string }) {
  const parts = title.split("/");
  if (parts.length !== 2 || /\s/.test(title)) return <>{title}</>;
  return (
    <>
      <span className={styles.owner}>{parts[0]}/</span>
      {parts[1]}
    </>
  );
}

/** ★ quote table: rank, repo, one-line description, total stars, stars per day, move. */
export default function RepoTicker({ items, lang, isDimmed, onOpen }: Props) {
  const u = ui(lang);
  return (
    <div className={styles.ticker}>
      <div className={styles.thead} aria-hidden="true">
        <span>#</span>
        <span>{u.repoHead.repo}</span>
        <span className={styles.r}>{u.repoHead.stars}</span>
        <span className={styles.r}>{u.repoHead.perDay}</span>
        <span className={styles.r}>{u.repoHead.change}</span>
      </div>
      <ol className={styles.rows}>
        {items.map((item, i) => {
          const m = item.metrics;
          return (
            <li key={item.id} className={styles.row} data-dim={isDimmed(item) || undefined} data-fit="repos">
              <span className={styles.rank} aria-hidden="true">
                {i + 1}
              </span>
              <div className={styles.name}>
                <button type="button" className={styles.hit} aria-label={item.title[lang]} onClick={() => onOpen(item)}>
                  <RepoName title={item.title[lang]} />
                </button>
                <p className={styles.desc}>{item.summary[lang]}</p>
              </div>
              <span className={styles.num}>
                <span className="sr-only">{u.m.stars} </span>
                {m?.stars != null ? fmtCompact(m.stars) : "–"}
              </span>
              <span className={styles.num}>
                <span className="sr-only">{u.m.perDay} </span>
                {m?.starsPerDay != null ? fmtNum(m.starsPerDay) : "–"}
              </span>
              <span className={`${styles.num} ${item.returning ? styles.up : styles.fresh}`}>
                <span className="sr-only">{u.m.change} </span>
                {item.returning ? `▲ ${m?.starsDelta != null ? fmtNum(m.starsDelta) : ""}`.trim() : u.newRepo}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
