import type { ReactNode } from "react";
import styles from "./Metric.module.css";

/** Icon + number with a screen-reader label ("Stars 18.4k"); one format for stars and forks everywhere. */
export default function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <span className={styles.metric}>
      {icon}
      <span className="sr-only">{label} </span>
      {value}
    </span>
  );
}
