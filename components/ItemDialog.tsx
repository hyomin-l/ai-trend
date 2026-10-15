"use client";

import type { ReactNode } from "react";
import type { GlossaryEntry, Item, Lang } from "@/types";
import { REGION_LABEL, SECTION_LABEL, industryTag, readingNotice, ui } from "@/lib/i18n";
import { fmtNum } from "@/lib/format";
import WhenTime from "./WhenTime";
import Dialog from "./Dialog";
import { emphasisRanges, termsIn } from "./Glossary";
import OriginalLink from "./OriginalLink";
import styles from "./ItemDialog.module.css";

type Props = {
  item: Item | null;
  lang: Lang;
  generatedAt: string;
  /** The edition's glossary; terms that occur in this item are listed in the glossary section. */
  glossary?: GlossaryEntry[];
  onClose: () => void;
};

function HighlightedSummary({ text, phrases, terms }: { text: string; phrases: string[]; terms: string[] }) {
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const {start, end} of emphasisRanges(text, phrases, terms)) {
    pieces.push(text.slice(cursor, start), <mark key={start} className={styles.highlight}>{text.slice(start, end)}</mark>);
    cursor = end;
  }
  pieces.push(text.slice(cursor));
  return pieces;
}

function Metrics({ item, lang }: { item: Item; lang: Lang }) {
  const u = ui(lang);
  const m = item.metrics;
  if (!m) return null;
  const cells: [string, string][] = [];
  if (m.stars != null) cells.push([u.m.stars, fmtNum(m.stars)]);
  if (m.forks != null) cells.push([u.m.forks, fmtNum(m.forks)]);
  if (m.likes != null) cells.push([u.m.likes, fmtNum(m.likes)]);
  if (m.downloads != null) cells.push([u.m.downloads, fmtNum(m.downloads)]);
  if (m.upvotes != null) cells.push([u.m.upvotes, fmtNum(m.upvotes)]);
  if (m.starsGained != null) cells.push([u.m.gained, fmtNum(m.starsGained)]);
  else if (m.starsPerDay != null) cells.push([u.m.perDay, fmtNum(m.starsPerDay)]);
  if (m.language) cells.push([u.m.language, m.language]);
  if (item.section === "repos" && m.likes == null) {
    cells.push([u.m.change, item.returning ? `▲ ${m.starsDelta != null ? fmtNum(m.starsDelta) : u.returning}` : u.newRepo]);
  }
  if (m.points != null) cells.push([u.m.points, fmtNum(m.points)]);
  if (m.comments != null) cells.push([u.m.comments, fmtNum(m.comments)]);
  if (!cells.length) return null;
  return (
    <dl className={styles.metrics}>
      {cells.map(([label, value]) => (
        <div key={label} className={styles.metric}>
          <dt>{label}</dt>
          <dd className={label === u.m.change && value.startsWith("▲") ? styles.up : undefined}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ItemDialog({ item, lang, generatedAt, glossary, onClose }: Props) {
  const u = ui(lang);
  const terms = item ? termsIn([item.title[lang], item.summary[lang]], glossary) : [];
  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      label={item?.title[lang] ?? ""}
      closeLabel={u.close}
      actions={item && <OriginalLink href={item.reading?.url ?? item.url} label={u.readOriginal} accent />}
    >
      {item && (
        <article className={styles.article}>
          <p className={styles.kicker}>{SECTION_LABEL[item.section][lang]}</p>
          <h2 className={styles.headline}>{item.title[lang]}</h2>
          <p className={styles.meta}>
            <span>{item.source}</span>
            <WhenTime iso={item.publishedAt} at={generatedAt} lang={lang} />
            <span>{REGION_LABEL[item.region][lang]}</span>
            {item.industry && <span>{industryTag(item.industry, lang)}</span>}
          </p>

          <div className={styles.block}>
            <p className={styles.body}><HighlightedSummary text={item.summary[lang]} phrases={item.highlights?.[lang] ?? []} terms={terms.map(g => g.term)} /></p>
          </div>

          {item.reading?.status === "snippet" && <p className={styles.readingNote}>{readingNotice(item.reading.reason, lang, item.url)}</p>}

          {terms.length > 0 && (
            <section className={styles.block} aria-label={u.terms}>
              <dl className={styles.terms}>
                {terms.map((g) => (
                  <div key={g.term}>
                    <dt>{g.term}</dt>
                    <dd>{g.desc[lang]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {!!item.related?.length && (
            <section className={`${styles.block} ${terms.length > 0 ? styles.sourcesDivider : ""}`} aria-label={u.alsoCovered(item.related.length)}>
              <ul className={styles.also}>
                {item.related.map((r) => (
                  <li key={r.url}>
                    <OriginalLink href={r.url} label={r.source} small />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Metrics item={item} lang={lang} />
        </article>
      )}
    </Dialog>
  );
}
