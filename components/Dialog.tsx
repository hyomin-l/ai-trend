"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "./Icons";
import styles from "./Dialog.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  label: string;
  closeLabel: string;
  children: ReactNode;
};

/**
 * Native <dialog> shell shared by the item and section dialogs. It stays mounted and is opened/closed
 * imperatively, so the browser handles Esc, the top layer, inertness and focus return to the trigger.
 */
export default function Dialog({ open, onClose, label, closeLabel, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={label}
      onClose={onClose}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // A click that lands on the <dialog> itself (not its content) is a click on the backdrop.
        if (downOnBackdrop.current && e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <button type="button" className={styles.close} onClick={() => ref.current?.close()} aria-label={closeLabel}>
        <IconClose />
      </button>
      <div className={styles.inner}>{open ? children : null}</div>
    </dialog>
  );
}
