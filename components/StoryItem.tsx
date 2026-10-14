import type { Item, Lang } from "@/types";
import { industryTag, ui } from "@/lib/i18n";
import { Fragment, type ReactNode } from "react";
import { fmtNum } from "@/lib/format";
import RelTime from "./RelTime";
import { Glossed, type GlossPlan } from "./Glossary";
import styles from "./StoryItem.module.css";

type Props = {
  item: Item;
  lang: Lang;
  /** Edition generatedAt; relative times are measured against it. */
  generatedAt: string;
  gloss?: GlossPlan;
  dimmed?: boolean;
  onOpen: (item: Item) => void;
};

/** One story in a section list. An empty button stretched over the article is the click target, so glossary terms in the text stay separate controls. */
export default function StoryItem({ item, lang, generatedAt, gloss, dimmed, onOpen }: Props) {
  const u = ui(lang);
  const m = item.metrics;

  const meta: ReactNode[] = [item.source];
  if (item.section === "pulse") {
    if (m?.points != null) meta.push(u.pts(fmtNum(m.points)));
    if (m?.comments != null) meta.push(u.cmt(fmtNum(m.comments)));
  }
  meta.push(<RelTime key="t" iso={item.publishedAt} at={generatedAt} lang={lang} />);

  return (
    <article className={styles.item} data-dim={dimmed || undefined} data-fit={item.section}>
      <h3 className={styles.headline}>
        <span className={styles.clamp}>
          <Glossed text={item.title[lang]} terms={gloss?.get(`${item.id}:t`)} lang={lang} />
        </span>
      </h3>
      <p className={styles.summary}>
        <Glossed text={item.summary[lang]} terms={gloss?.get(`${item.id}:m`)} lang={lang} />
      </p>
      <p className={styles.meta}>
        {item.section === "ax" && item.industry && (
          <>
            <b className={styles.industry}>{industryTag(item.industry, lang)}</b>
            {" · "}
          </>
        )}
        {meta.map((x, k) => (
          <Fragment key={k}>
            {k > 0 && " · "}
            {x}
          </Fragment>
        ))}
      </p>
      <button type="button" className={styles.hit} aria-label={item.title[lang]} onClick={() => onOpen(item)} />
    </article>
  );
}
