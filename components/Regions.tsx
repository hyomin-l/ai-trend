"use client";

import { useState } from "react";
import type { Lang, Region } from "@/types";
import { REGION_LABEL, ui } from "@/lib/i18n";
import Globe from "./Globe";
import SectionHead, { HeadButton } from "./SectionHead";
import styles from "./Regions.module.css";

type Props = {
  /** Regions with at least one story today, most stories first. */
  regions: { region: Region; count: number }[];
  active: Region | null;
  onSelect: (region: Region | null) => void;
  lang: Lang;
};

/**
 * "지역": a small globe and the region list. Hovering or focusing a row turns the globe to that region and pulses its
 * markers; clicking filters (dims) every other story on the page.
 */
export default function Regions({ regions, active, onSelect, lang }: Props) {
  const u = ui(lang);
  const [hover, setHover] = useState<Region | null>(null);
  return (
    <section className={styles.regions} aria-labelledby="hd-regions">
      <SectionHead id="hd-regions" label={u.regions}>
        {active && <HeadButton onClick={() => onSelect(null)}>{u.filterAll}</HeadButton>}
      </SectionHead>
      <div className={styles.body}>
        <div className={styles.globe}>
          <Globe regions={regions} active={active} hover={hover} />
        </div>
        <ul className={styles.list} aria-label={u.regionFilter}>
          {regions.map(({ region, count }) => (
            <li key={region}>
              <button
                type="button"
                className={styles.row}
                aria-pressed={active === region}
                aria-label={u.regionCount(REGION_LABEL[region][lang], count)}
                onClick={() => onSelect(active === region ? null : region)}
                onMouseEnter={() => setHover(region)}
                onMouseLeave={() => setHover(null)}
                onFocus={(e) => e.currentTarget.matches(":focus-visible") && setHover(region)} // keyboard only: a mouse click must not leave the preview on
                onBlur={() => setHover(null)}
              >
                <span className={styles.name}>{REGION_LABEL[region][lang]}</span>
                <span className={styles.count}>{count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
