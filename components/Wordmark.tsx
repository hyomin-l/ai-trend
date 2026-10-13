import { BRAND } from "@/lib/i18n";
import styles from "./Wordmark.module.css";

/** Brand name in Instrument Serif (set by the parent): first word magenta, the rest ink. */
export default function Wordmark() {
  const [accent, ...rest] = BRAND.name.split(" ");
  return (
    <>
      <span className={styles.accent}>{accent}</span>
      {rest.length > 0 && ` ${rest.join(" ")}`}
    </>
  );
}
