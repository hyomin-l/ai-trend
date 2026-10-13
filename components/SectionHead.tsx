import type { ReactNode } from "react";
import styles from "./SectionHead.module.css";

/** Label (once, no kicker) with an optional action on the right. Shared by the band, the region panel and every section. `quiet` = ink-3 label (the five section columns). */
export default function SectionHead({
  id,
  label,
  quiet,
  children,
}: {
  id: string;
  label: string;
  quiet?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={styles.head}>
      <h2 id={id} className={`${styles.label} ${quiet ? styles.quiet : ""}`}>
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
