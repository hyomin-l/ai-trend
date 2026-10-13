import type { Lang } from "@/types";
import { ui } from "@/lib/i18n";
import Logo from "./Logo";
import styles from "./EmptyState.module.css";

/** Shown while no edition has been published yet. */
export default function EmptyState({ lang }: { lang: Lang }) {
  const u = ui(lang);
  return (
    <div className={styles.empty}>
      <p className={styles.brand}>
        <Logo />
      </p>
      <h1 className={styles.title}>{u.emptyTitle}</h1>
      <p className={styles.note}>{u.emptyNote}</p>
    </div>
  );
}
