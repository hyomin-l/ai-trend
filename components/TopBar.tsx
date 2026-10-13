import Link from "next/link";
import type { Lang } from "@/types";
import { BRAND, LANGS, ui } from "@/lib/i18n";
import DateNav from "./DateNav";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import styles from "./TopBar.module.css";

type Props = {
  lang: Lang;
  /** All edition dates, newest first. */
  dates: string[];
  /** Edition being shown (also set on `/` for the latest one). */
  date?: string;
  /** Issue number of that edition. */
  issue?: number;
  kind: "edition" | "archive" | "stories";
};

/**
 * The only chrome, always one row: logo, the three menu items (지면 | 지난 호 | 기사), then edition picker (editions only),
 * theme toggle and language. Every item is centred on the same line; controls are 32px tall.
 */
export default function TopBar({ lang, dates, date, issue, kind }: Props) {
  const u = ui(lang);
  const home = lang === "ko" ? "/" : `/${lang}/`;
  const langHref = (l: Lang) =>
    kind === "edition" ? (date ? `/${l}/${date}/` : l === "ko" ? "/" : `/${l}/`) : `/${l}/${kind}/`;

  return (
    <header className={styles.bar} lang={lang}>
      <Link href={home} className={styles.logo} aria-label={`${BRAND.name}, ${u.home}`}>
        <Logo />
      </Link>
      <nav className={styles.menu} aria-label={u.menu}>
        <Link href={home} className={styles.item} aria-current={kind === "edition" ? "page" : undefined}>
          {u.menuEdition}
        </Link>
        <Link href={`/${lang}/archive/`} className={styles.item} aria-current={kind === "archive" ? "page" : undefined}>
          {u.menuArchive}
        </Link>
        <Link href={`/${lang}/stories/`} className={styles.item} aria-current={kind === "stories" ? "page" : undefined}>
          {u.menuStories}
        </Link>
      </nav>
      <div className={styles.tools}>
        {kind === "edition" && <DateNav lang={lang} dates={dates} date={date} issue={issue} />}
        <ThemeToggle lang={lang} />
        <div className={styles.lang} role="group" aria-label={u.language}>
          {LANGS.map((l) =>
            l === lang ? (
              <span key={l} className={`${styles.langCell} ${styles.on}`} aria-current="true">
                {l.toUpperCase()}
              </span>
            ) : (
              <Link
                key={l}
                href={langHref(l)}
                className={styles.langCell}
                lang={l}
                hrefLang={l}
                aria-label={l === "ko" ? "한국어" : "English"}
              >
                {l.toUpperCase()}
              </Link>
            ),
          )}
        </div>
      </div>
    </header>
  );
}
