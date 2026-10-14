"use client";

import type { GlossaryEntry, Item, Lang } from "@/types";
import { REGION_LABEL, SECTION_LABEL, industryTag, ui } from "@/lib/i18n";
import { fmtNum } from "@/lib/format";
import RelTime from "./RelTime";
import Dialog from "./Dialog";
import { termsIn } from "./Glossary";
import OriginalLink from "./OriginalLink";
import styles from "./ItemDialog.module.css";

type Props = {
  item: Item | null;
  lang: Lang;
  generatedAt: string;
  /** The edition's glossary; terms that occur in this item are listed under "용어". */
  glossary?: GlossaryEntry[];
  onClose: () => void;
};

function Metrics({ item, lang }: { item: Item; lang: Lang }) {
  const u = ui(lang);
  const m = item.metrics;
  if (!m) return null;
  const cells: [string, string][] = [];
  if (m.stars != null) cells.push([u.m.stars, fmtNum(m.stars)]);
  if (m.forks != null) cells.push([u.m.forks, fmtNum(m.forks)]);
  if (m.likes != null) cells.push([u.m.likes, fmtNum(m.likes)]);
  if (m.downloads != null) cells.push([u.m.downloads, fmtNum(m.downloads)]);
  if (m.starsGained != null) cells.push([u.m.gained, fmtNum(m.starsGained)]);
  else if (m.starsPerDay != null) cells.push([u.m.perDay, fmtNum(m.starsPerDay)]);
  if (m.language) cells.push([u.m.language, m.language]);
  if (item.section === "repos" && m.likes == null) {
    cells.push([u.m.change, item.returning ? `▲ ${fmtNum(m.starsDelta ?? 0)}` : u.newRepo]);
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
  const terms = item ? termsIn([item.title[lang], item.summary[lang], item.takeaway[lang]], glossary) : [];
  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      label={item?.title[lang] ?? ""}
      closeLabel={u.close}
      actions={item && <OriginalLink href={item.url} label={u.readOriginal} />}
    >
      {item && (
        <article className={styles.article}>
          <p className={styles.kicker}>{SECTION_LABEL[item.section][lang]}</p>
          <h2 className={styles.headline}>{item.title[lang]}</h2>
          <p className={styles.meta}>
            <span>{item.source}</span>
            <RelTime iso={item.publishedAt} at={generatedAt} lang={lang} />
            <span>{REGION_LABEL[item.region][lang]}</span>
            {item.industry && <span>{industryTag(item.industry, lang)}</span>}
          </p>

          <p className={styles.body}>{item.summary[lang]}</p>
          <section className={styles.block}>
            <h3 className={`${styles.label} ${styles.why}`}>{u.why}</h3>
            <p className={styles.body}>{item.takeaway[lang]}</p>
          </section>

          {terms.length > 0 && (
            <section className={styles.block}>
              <h3 className={styles.label}>{u.terms}</h3>
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

          <Metrics item={item} lang={lang} />
        </article>
      )}
    </Dialog>
  );
}
