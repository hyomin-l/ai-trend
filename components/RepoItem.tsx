import type { Item, Lang } from "@/types";
import { ui } from "@/lib/i18n";
import { fmtCompact, fmtNum, parseRepoTitle, repoDesc } from "@/lib/format";
import { Glossed, type GlossPlan } from "./Glossary";
import styles from "./RepoItem.module.css";

type Props = {
  item: Item;
  lang: Lang;
  gloss?: GlossPlan;
  dimmed?: boolean;
  onOpen: (item: Item) => void;
};

/** A rising repo: `owner/repo`, its short description, and ★ / +N per day (plus "재등장 ▲" when it returns). */
export default function RepoItem({ item, lang, gloss, dimmed, onOpen }: Props) {
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
      <button type="button" className={styles.hit} aria-label={title} onClick={() => onOpen(item)} />
    </article>
  );
}
