import type { ReactNode } from "react";
import type { Lang, Section } from "@/types";
import { SECTION_LABEL, ui } from "@/lib/i18n";
import SectionHead, { HeadButton } from "./SectionHead";
import styles from "./SectionBlock.module.css";

type Props = {
  id: Section;
  lang: Lang;
  /** Stories not shown on the page; renders the "+N" button when > 0. */
  more?: number;
  onMore?: () => void;
  children: ReactNode;
};

/** One section column: header (label + "+N") over its stories. On desktop it is a grid cell that clips and gets trimmed by Edition. */
export default function SectionBlock({ id, lang, more = 0, onMore, children }: Props) {
  const u = ui(lang);
  const label = SECTION_LABEL[id][lang];
  return (
    <section className={styles.section} aria-labelledby={`hd-${id}`}>
      <SectionHead id={`hd-${id}`} label={label}>
        {more > 0 && onMore && (
          <HeadButton label={u.moreLabel(label, more)} onClick={onMore}>
            {u.more(more)}
          </HeadButton>
        )}
      </SectionHead>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
