"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/types";
import { ui } from "@/lib/i18n";
import { IconMoon, IconSun } from "./Icons";
import styles from "./ThemeToggle.module.css";

/** Same key as the boot script in app/layout.tsx. */
const KEY = "ai-trend-theme";

type Theme = "light" | "dark";

/** What the page is showing right now: the pinned choice, else the system preference. */
const effective = (): Theme => {
  const pinned = document.documentElement.dataset.theme;
  if (pinned === "light" || pinned === "dark") return pinned;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

/** Icon button in the top bar. The icon is chosen by CSS (so it is right before hydration); state only drives aria-pressed. */
export default function ThemeToggle({ lang }: { lang: Lang }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setTheme(effective());
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const toggle = () => {
    const next: Theme = effective() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    setTheme(next);
  };

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={ui(lang).darkMode}
      aria-pressed={theme === null ? undefined : theme === "dark"}
      onClick={toggle}
    >
      <span className={styles.sun}>
        <IconSun />
      </span>
      <span className={styles.moon}>
        <IconMoon />
      </span>
    </button>
  );
}
