import { IconArrowUpRight } from "./Icons";
import { isWebUrl } from "@/lib/format";
import styles from "./OriginalLink.module.css";

/** "원문 보기 ↗": the one calm way to leave for the source (item dialog and the stories list). Plain text with the arrow, no box; the item dialog action uses the accent colour. */
export default function OriginalLink({ href, label, small, accent }: { href: string; label: string; small?: boolean; accent?: boolean }) {
  if (!isWebUrl(href)) return null;
  return (
    <a className={`${styles.link} ${small ? styles.small : ""} ${accent ? styles.accent : ""}`} href={href} target="_blank" rel="noopener noreferrer">
      {label}
      <IconArrowUpRight size={small ? 12 : 14} />
    </a>
  );
}
