import { BRAND } from "@/lib/i18n";
import styles from "./Logo.module.css";

/** The desk-pet "mochi" blob in flat magenta (two paper-coloured eyes) + the brand name in the display face. */
export default function Logo() {
  return (
    <span className={styles.logo}>
      <svg className={styles.mark} viewBox="62 40 116 118" aria-hidden="true" focusable="false">
        <path
          d="M120,42 C156,40 178,66 178,102 C178,138 156,158 120,158 C84,158 62,140 62,104 C62,68 84,44 120,42 Z"
          fill="var(--magenta)"
        />
        <rect x="94" y="91" width="10" height="21" rx="5" fill="var(--paper)" />
        <rect x="136" y="91" width="10" height="21" rx="5" fill="var(--paper)" />
      </svg>
      <span className={styles.name}>{BRAND.name}</span>
    </span>
  );
}
