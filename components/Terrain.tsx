import type { Lang, Region } from "@/types";
import { REGION_LABEL, ui } from "@/lib/i18n";
import Globe from "./Globe";
import styles from "./Terrain.module.css";

type Props = {
  /** Regions with at least one story today, most stories first. */
  regions: { region: Region; count: number }[];
  active: Region | null;
  onSelect: (region: Region | null) => void;
  lang: Lang;
};

/** "오늘의 지형": globe plus a region list whose buttons filter the whole edition. */
export default function Terrain({ regions, active, onSelect, lang }: Props) {
  const u = ui(lang);
  const max = Math.max(1, ...regions.map((r) => r.count));
  return (
    <section className={styles.terrain} aria-labelledby="hd-terrain">
      <header className={styles.head}>
        <h2 id="hd-terrain" className={styles.title}>
          <i className={styles.mark} aria-hidden="true" />
          <span className={styles.kicker}>{u.terrainKicker}</span>
          {lang === "ko" && <span className={styles.label}>{u.terrain}</span>}
        </h2>
        {active && (
          <button type="button" className={styles.clear} onClick={() => onSelect(null)}>
            {u.filterAll}
          </button>
        )}
      </header>
      <div className={styles.body}>
        <div className={styles.globe}>
          <Globe regions={regions} active={active} />
        </div>
        <ul className={styles.list} aria-label={u.regionFilter}>
          {regions.map(({ region, count }) => (
            <li key={region}>
              <button
                type="button"
                className={styles.region}
                aria-pressed={active === region}
                aria-label={u.regionCount(REGION_LABEL[region][lang], count)}
                onClick={() => onSelect(active === region ? null : region)}
              >
                <span className={styles.code}>{region === "GLOBAL" ? "GL" : region}</span>
                <span className={styles.name}>{REGION_LABEL[region][lang]}</span>
                <span className={styles.bar} aria-hidden="true">
                  <i style={{ width: `${(count / max) * 100}%` }} />
                </span>
                <span className={styles.count}>{count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
