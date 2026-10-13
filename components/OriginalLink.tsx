import { IconArrowUpRight } from "./Icons";
import styles from "./OriginalLink.module.css";

/** "원문 보기 ↗": the one calm way to leave for the source (item dialog and archive results). Plain muted text with the arrow, no box; darker and underlined on hover. */
export default function OriginalLink({ href, label, small }: { href: string; label: string; small?: boolean }) {
  return (
    <a className={`${styles.link} ${small ? styles.small : ""}`} href={href} target="_blank" rel="noopener noreferrer">
      {label}
      <IconArrowUpRight size={small ? 12 : 14} />
    </a>
  );
}
