import type { Item, Lang } from "@/types";
import { SECTION_LABEL, ui } from "@/lib/i18n";
import WhenTime from "./WhenTime";
import { Glossed, type GlossPlan } from "./Glossary";
import SectionHead from "./SectionHead";
import styles from "./Brief.module.css";

type Props = {
  items: Item[];
  lang: Lang;
  generatedAt: string;
  gloss?: GlossPlan;
  notice?: string;
  isDimmed: (item: Item) => boolean;
  onOpen: (item: Item) => void;
};

/**
 * "이번 호 핵심": the at-a-glance core. The card is one click target: an empty button stretched over it, so the text
 * (and any glossary terms in it) stays plain, selectable-looking markup. The takeaway reads "왜 중요한가" on phones and
 * just a magenta arrow on desktop, where the label would repeat three times.
 */
export default function Brief({ items, lang, generatedAt, gloss, notice, isDimmed, onOpen }: Props) {
  const u = ui(lang);
  return (
    <section className={styles.brief} aria-labelledby="hd-front">
      <SectionHead id="hd-front" label={SECTION_LABEL.front[lang]}>
        {notice && (
          <p className={styles.notice} role="note">
            {notice}
          </p>
        )}
      </SectionHead>
      <ol className={styles.list} role="list">
        {items.map((item, i) => (
          <li key={item.id} className={styles.card} data-dim={isDimmed(item) || undefined}>
            <span className={styles.no} data-lead={i === 0 || undefined} aria-hidden="true">
              {i + 1}
            </span>
            <p className={styles.meta}>
              {SECTION_LABEL[item.section][lang]} · <WhenTime iso={item.publishedAt} at={generatedAt} lang={lang} /> · {item.source}
            </p>
            <h3 className={styles.headline}>
              <span className={styles.clamp}>
                <Glossed text={item.title[lang]} terms={gloss?.get(`${item.id}:t`)} lang={lang} />
              </span>
            </h3>
            <p className={styles.summary}>
              <Glossed text={item.summary[lang]} terms={gloss?.get(`${item.id}:m`)} lang={lang} />
            </p>
            <p className={styles.why}>
              <span className={styles.whyLabel}>{u.why}</span>
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
              {item.takeaway[lang]}
            </p>
            <button type="button" className={styles.hit} aria-label={item.title[lang]} onClick={() => onOpen(item)} />
          </li>
        ))}
      </ol>
    </section>
  );
}
