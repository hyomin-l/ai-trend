import type { Item, Lang } from "@/types";
import { industryTag, ui } from "@/lib/i18n";
import { fmtNum, relTime } from "@/lib/format";
import styles from "./StoryItem.module.css";

type Props = {
  item: Item;
  lang: Lang;
  /** Edition generatedAt; relative times are measured against it. */
  generatedAt: string;
  dimmed?: boolean;
  onOpen: (item: Item) => void;
};

/** One story in a section list. The headline is a <button> whose ::after covers the whole article. */
export default function StoryItem({ item, lang, generatedAt, dimmed, onOpen }: Props) {
  const u = ui(lang);
  const m = item.metrics;

  const meta: string[] = [item.source];
  if (item.section === "pulse") {
    if (m?.points != null) meta.push(u.pts(fmtNum(m.points)));
    if (m?.comments != null) meta.push(u.cmt(fmtNum(m.comments)));
  }
  meta.push(relTime(item.publishedAt, generatedAt, lang));

  return (
    <article className={styles.item} data-dim={dimmed || undefined} data-fit={item.section}>
      <h3 className={styles.headline}>
        <button type="button" className={styles.hit} aria-label={item.title[lang]} onClick={() => onOpen(item)}>
          <span className={styles.clamp}>{item.title[lang]}</span>
        </button>
      </h3>
      <p className={styles.summary}>{item.summary[lang]}</p>
      <p className={styles.meta}>
        {item.section === "ax" && item.industry && (
          <>
            <b className={styles.industry}>{industryTag(item.industry, lang)}</b>
            {" · "}
          </>
        )}
        {meta.join(" · ")}
      </p>
    </article>
  );
}
