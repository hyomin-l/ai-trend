"use client";

import type { Item, Lang } from "@/types";
import { REGION_LABEL, SECTION_LABEL, industryTag, ui } from "@/lib/i18n";
import { fmtNum, relTime } from "@/lib/format";
import Dialog from "./Dialog";
import { IconArrowUpRight } from "./Icons";
import styles from "./ItemDialog.module.css";

type Props = { item: Item | null; lang: Lang; generatedAt: string; onClose: () => void };

function Metrics({ item, lang }: { item: Item; lang: Lang }) {
  const u = ui(lang);
  const m = item.metrics;
  if (!m) return null;
  const cells: [string, string][] = [];
  if (m.stars != null) cells.push([u.m.stars, fmtNum(m.stars)]);
  if (m.starsPerDay != null) cells.push([u.m.perDay, fmtNum(m.starsPerDay)]);
  if (m.language) cells.push([u.m.language, m.language]);
  if (item.section === "repos") {
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

export default function ItemDialog({ item, lang, generatedAt, onClose }: Props) {
  const u = ui(lang);
  return (
    <Dialog open={item !== null} onClose={onClose} label={item?.title[lang] ?? ""} closeLabel={u.close}>
      {item && (
        <article className={styles.article}>
          <p className={styles.kicker}>{SECTION_LABEL[item.section][lang]}</p>
          <h2 className={styles.headline}>{item.title[lang]}</h2>
          <p className={styles.meta}>
            <span>{item.source}</span>
            <span>{relTime(item.publishedAt, generatedAt, lang)}</span>
            <span>{REGION_LABEL[item.region][lang]}</span>
            {item.industry && <span>{industryTag(item.industry, lang)}</span>}
          </p>

          <section className={styles.block}>
            <h3 className={styles.label}>{u.what}</h3>
            <p className={styles.body}>{item.summary[lang]}</p>
          </section>
          <section className={styles.block}>
            <h3 className={`${styles.label} ${styles.why}`}>{u.why}</h3>
            <p className={styles.body}>{item.takeaway[lang]}</p>
          </section>

          <Metrics item={item} lang={lang} />

          <a className={styles.cta} href={item.url} target="_blank" rel="noopener noreferrer">
            {u.readOriginal}
            <IconArrowUpRight />
          </a>
        </article>
      )}
    </Dialog>
  );
}
