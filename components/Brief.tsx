import type { Item, Lang } from "@/types";
import { SECTION_LABEL, ui } from "@/lib/i18n";
import { relTime } from "@/lib/format";
import SectionHead from "./SectionHead";
import styles from "./Brief.module.css";

type Props = {
  items: Item[];
  lang: Lang;
  generatedAt: string;
  isDimmed: (item: Item) => boolean;
  onOpen: (item: Item) => void;
};

/** "오늘의 3줄": the at-a-glance core. Each card is one click target (the headline button's ::after covers it). */
export default function Brief({ items, lang, generatedAt, isDimmed, onOpen }: Props) {
  const u = ui(lang);
  return (
    <section className={styles.brief} aria-labelledby="hd-front">
      <SectionHead id="hd-front" label={SECTION_LABEL.front[lang]} />
      <ol className={styles.list} role="list">
        {items.map((item, i) => (
          <li key={item.id} className={styles.card} data-dim={isDimmed(item) || undefined}>
            <span className={styles.no} data-lead={i === 0 || undefined} aria-hidden="true">
              {i + 1}
            </span>
            <p className={styles.meta}>
              {SECTION_LABEL[item.section][lang]} · {item.source} · {relTime(item.publishedAt, generatedAt, lang)}
            </p>
            <h3 className={styles.headline}>
              <button type="button" className={styles.hit} aria-label={item.title[lang]} onClick={() => onOpen(item)}>
                <span className={styles.clamp}>{item.title[lang]}</span>
              </button>
            </h3>
            <p className={styles.summary}>{item.summary[lang]}</p>
            <p className={styles.why}>
              <span className={styles.whyLabel}>{u.why}</span>
              {item.takeaway[lang]}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
