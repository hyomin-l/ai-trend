import Link from "next/link";
import type { Lang } from "@/types";
import { BRAND, LANGS, ui } from "@/lib/i18n";
import DateNav from "./DateNav";
import Logo from "./Logo";
import { IconSearch } from "./Icons";
import styles from "./TopBar.module.css";

type Props = {
  lang: Lang;
  /** All edition dates, newest first. */
  dates: string[];
  /** Edition being shown (also set on `/` for the latest one). */
  date?: string;
  /** Issue number of that edition. */
  issue?: number;
  /** Tiny note for editions published without curation or with failed sources. */
  notice?: string;
  kind: "edition" | "search";
};

/** The only chrome: logo, edition picker, (notice), search and language. One row from 640px up, two rows below. */
export default function TopBar({ lang, dates, date, issue, notice, kind }: Props) {
  const u = ui(lang);
  const home = lang === "ko" ? "/" : `/${lang}/`;
  const langHref = (l: Lang) =>
    kind === "search" ? `/${l}/search/` : date ? `/${l}/${date}/` : l === "ko" ? "/" : `/${l}/`;

  return (
    <header className={styles.bar} lang={lang}>
      <Link href={home} className={styles.logo} aria-label={`${BRAND.name}, ${u.home}`}>
        <Logo />
      </Link>
      <div className={styles.date}>
        <DateNav lang={lang} dates={dates} date={date} issue={issue} />
      </div>
      {notice && (
        <p className={styles.notice} role="note">
          {notice}
        </p>
      )}
      <div className={styles.controls}>
        <Link
          href={`/${lang}/search/`}
          className={styles.search}
          aria-label={u.search}
          aria-current={kind === "search" ? "page" : undefined}
        >
          <IconSearch size={18} />
        </Link>
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
