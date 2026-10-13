import type { Item, Lang } from "@/types";
import { SECTION_LABEL, industryTag, ui } from "@/lib/i18n";
import { fmtNum, relTime } from "@/lib/format";
import styles from "./StoryItem.module.css";

export type StoryVariant = "lead" | "sub" | "news" | "ax" | "pulse" | "playbook";

type Props = {
  item: Item;
  lang: Lang;
  /** Edition generatedAt; relative times are measured against it. */
  generatedAt: string;
  variant: StoryVariant;
  /** First story of its section: keeps its summary when the column is short. */
  first?: boolean;
  dimmed?: boolean;
  onOpen: (item: Item) => void;
};

/** One story on the page. The headline is a <button> whose ::after covers the whole article. */
export default function StoryItem({ item, lang, generatedAt, variant, first, dimmed, onOpen }: Props) {
  const u = ui(lang);
  const time = relTime(item.publishedAt, generatedAt, lang);
  const isFront = variant === "lead" || variant === "sub";
  const m = item.metrics;

  const meta: string[] = [item.source];
  if (variant === "pulse") {
    if (m?.points != null) meta.push(u.pts(fmtNum(m.points)));
    if (m?.comments != null) meta.push(u.cmt(fmtNum(m.comments)));
  }
  meta.push(time);

  return (
    <article
      className={`${styles.item} ${styles[variant]}`}
      data-dim={dimmed || undefined}
      data-first={first || undefined}
      data-fit={isFront ? undefined : item.section}
    >
      {isFront && (
        <p className={styles.kicker}>
          <i className={styles.mark} aria-hidden="true" />
          <span>
            {SECTION_LABEL[item.section].kicker} · {item.source}
          </span>
          <span className={styles.time}>{time}</span>
        </p>
      )}
      <h3 className={styles.headline}>
        <button type="button" className={styles.hit} aria-label={item.title[lang]} onClick={() => onOpen(item)}>
          <span className={styles.clamp}>{item.title[lang]}</span>
        </button>
      </h3>
      <p className={styles.summary}>{item.summary[lang]}</p>
      {variant === "lead" && (
        <p className={styles.why}>
          <span className={styles.whyLabel}>{u.why}</span>
          {item.takeaway[lang]}
        </p>
      )}
      {!isFront && (
        <p className={styles.meta}>
          {variant === "ax" && item.industry && <span className={styles.tag}>{industryTag(item.industry, lang)}</span>}
          <span>{meta.join(" · ")}</span>
        </p>
      )}
    </article>
  );
}
