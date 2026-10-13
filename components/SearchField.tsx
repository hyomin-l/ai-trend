"use client";

import { useEffect, useRef } from "react";
import { IconClose, IconSearch } from "./Icons";
import styles from "./SearchField.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  clearLabel: string;
};

/**
 * The plain search box of the two list pages: magnifier inside, a clear button, a "/" hint. `/` anywhere on the page
 * (outside other fields and dialogs) focuses it; Esc clears it. Focus is a standard grey ring, never magenta.
 */
export default function SearchField({ value, onChange, placeholder, label, clearLabel }: Props) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form className={styles.form} role="search" onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="q" className="sr-only">
        {label}
      </label>
      <span className={styles.glass}>
        <IconSearch size={18} />
      </span>
      <input
        id="q"
        ref={input}
        className={styles.input}
        type="search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className={styles.clear}
          aria-label={clearLabel}
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <IconClose size={14} />
        </button>
      ) : (
        <kbd className={styles.slash} aria-hidden="true">
          /
        </kbd>
      )}
    </form>
  );
}
