import type { ReactNode } from "react";
import type { Lang } from "@/types";
import { SECTION_LABEL, ui, type SectionKey } from "@/lib/i18n";
import styles from "./SectionBlock.module.css";

type Props = {
  id: SectionKey;
  lang: Lang;
  /** Stories not shown on the page; renders the "+N" button when > 0. */
  more?: number;
  onMore?: () => void;
  children: ReactNode;
};

/** Section header (2px ink rule, mono kicker, label, "+N") plus its body. Focus target for the top-bar nav. */
export default function SectionBlock({ id, lang, more = 0, onMore, children }: Props) {
  const u = ui(lang);
  const info = SECTION_LABEL[id];
  const label = info.title[lang];
  return (
    <section id={`sec-${id}`} className={styles.section} aria-labelledby={`hd-${id}`} tabIndex={-1}>
      <header className={styles.head}>
        <h2 id={`hd-${id}`} className={styles.title}>
          <i className={styles.mark} aria-hidden="true" />
          <span className={styles.kicker}>{info.kicker}</span>
          {lang === "ko" && <span className={styles.label}>{label}</span>}
        </h2>
        {more > 0 && onMore && (
          <button type="button" className={styles.more} onClick={onMore} aria-label={u.moreLabel(label, more)}>
            {u.more(more)}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
