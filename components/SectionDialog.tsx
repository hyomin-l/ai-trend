"use client";

import type { Item, Lang, Section } from "@/types";
import { SECTION_LABEL, industryTag, ui } from "@/lib/i18n";
import { fmtCompact, relTime } from "@/lib/format";
import Dialog from "./Dialog";
import styles from "./SectionDialog.module.css";

type Props = {
  section: Section | null;
  items: Item[];
  lang: Lang;
  generatedAt: string;
  onOpen: (item: Item) => void;
  onClose: () => void;
};

function metaOf(item: Item, lang: Lang, generatedAt: string): string[] {
  const u = ui(lang);
  const m = item.metrics;
  const out = [item.source];
  if (item.industry) out.push(industryTag(item.industry, lang));
  if (m?.stars != null) out.push(`★ ${fmtCompact(m.stars)}`);
  if (m?.forks != null) out.push(`${u.m.forks} ${fmtCompact(m.forks)}`);
  if (m?.points != null) out.push(u.pts(String(m.points)));
  out.push(relTime(item.publishedAt, generatedAt, lang));
  return out;
}

/** Every story of one section for the day; opened from the "+N" button in a section header. */
export default function SectionDialog({ section, items, lang, generatedAt, onOpen, onClose }: Props) {
  const u = ui(lang);
  const info = section ? SECTION_LABEL[section] : null;
  const title = info ? info[lang] : "";
  return (
    <Dialog open={section !== null} onClose={onClose} label={title} closeLabel={u.close}>
      {info && (
        <div className={styles.wrap}>
          <header className={styles.head}>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.count}>{u.sectionAll(items.length)}</p>
          </header>
          <ol className={styles.list}>
            {items.map((item, i) => (
              <li key={item.id} className={styles.row}>
                <span className={styles.no} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className={styles.text}>
                  <h3 className={styles.headline}>
                    <button type="button" className={styles.hit} aria-label={item.title[lang]} onClick={() => onOpen(item)}>
                      {item.title[lang]}
                    </button>
                  </h3>
                  <p className={styles.meta}>{metaOf(item, lang, generatedAt).join(" · ")}</p>
                  <p className={styles.summary}>{item.summary[lang]}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Dialog>
  );
}
