import type { Item, Lang } from "@/types";
import { ui } from "@/lib/i18n";
import { fmtCompact, fmtNum, parseRepoTitle, repoDesc } from "@/lib/format";
import { IconFork, IconStar } from "./Icons";
import RelTime from "./RelTime";
import Metric from "./Metric";
import { Glossed, type GlossPlan } from "./Glossary";
import styles from "./RepoItem.module.css";

type Props = {
  item: Item;
  lang: Lang;
  /** Edition generatedAt; the creation date is measured against it. */
  generatedAt: string;
  gloss?: GlossPlan;
  dimmed?: boolean;
  onOpen: (item: Item) => void;
};

/** A rising repo: `owner/repo`, its short description, and ★ / +N per day (plus "재등장 ▲" when it returns). */
export default function RepoItem({ item, lang, generatedAt, gloss, dimmed, onOpen }: Props) {
  const u = ui(lang);
  const m = item.metrics;
  const title = item.title[lang];
  const parsed = parseRepoTitle(title);

  return (
    <article className={styles.item} data-dim={dimmed || undefined} data-fit="repos">
      <h3 className={styles.name}>
        {parsed ? (
          <>
            <span className={styles.owner}>{parsed.owner}/</span>
            <wbr />
            <span className={styles.repo}>{parsed.repo}</span>
          </>
        ) : (
          title
        )}
      </h3>
      <p className={styles.desc}>
        <Glossed text={repoDesc(item, lang)} terms={gloss?.get(`${item.id}:m`)} lang={lang} />
      </p>
      <p className={styles.nums}>
        {(m?.stars != null || m?.forks != null) && (
          <span className={styles.counts}>
            {m?.stars != null && <Metric icon={<IconStar size={12} />} label={u.m.stars} value={fmtCompact(m.stars)} />}
            {m?.forks != null && <Metric icon={<IconFork size={12} />} label={u.m.forks} value={fmtCompact(m.forks)} />}
          </span>
        )}
        {m?.starsPerDay != null && (
          <span className={styles.rate}>
            <span title={u.perDayTip}>{u.perDay(fmtNum(m.starsPerDay))}</span>
            {item.publishedAt && (
              <span className={styles.born}>
                <RelTime iso={item.publishedAt} at={generatedAt} lang={lang} wrap={u.created} />
              </span>
            )}
          </span>
        )}
        {item.returning && (
          <span className={styles.back}>
            {u.returning} <span className={styles.up}>▲{m?.starsDelta != null ? fmtNum(m.starsDelta) : ""}</span>
          </span>
        )}
      </p>
      <button type="button" className={styles.hit} aria-label={title} onClick={() => onOpen(item)} />
    </article>
  );
}
