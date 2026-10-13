import type { ReactNode } from "react";
import styles from "./SectionHead.module.css";

/** Label (once, no kicker) with an optional action on the right. Shared by the band, the region panel and every section. */
export default function SectionHead({ id, label, children }: { id: string; label: string; children?: ReactNode }) {
  return (
    <header className={styles.head}>
      <h2 id={id} className={styles.label}>
        {label}
      </h2>
      {children}
    </header>
  );
}

/** Small flat button for a header: "+N" (open the section) or "전체" (clear the filter). */
export function HeadButton({ label, onClick, children }: { label?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={styles.action} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}
