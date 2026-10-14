"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconClose } from "./Icons";
import styles from "./Dialog.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  label: string;
  closeLabel: string;
  /** Calm controls shown left of the close button, pinned to the dialog's top-right corner (they do not scroll). */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Native <dialog> shell shared by the item and section dialogs. It stays mounted and is opened/closed
 * imperatively, so the browser handles Esc, the top layer, inertness and focus return to the trigger.
 */
export default function Dialog({ open, onClose, label, closeLabel, actions, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  // The parents drop their content the moment they close; keep the last content until the fade-out ends.
  const [held, setHeld] = useState<ReactNode>(null);
  if (open && held !== children) setHeld(children);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.focus({ focusVisible: false } as FocusOptions); // showModal() focuses the first control (×); park focus on the dialog so no ring shows until Tab
    }
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={label}
      tabIndex={-1}
      onClose={onClose}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !e.currentTarget.open) setHeld(null);
      }}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // A click that lands on the <dialog> itself (not its content) is a click on the backdrop.
        if (downOnBackdrop.current && e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className={styles.chrome}>
        <button type="button" className={styles.close} onClick={() => ref.current?.close()} aria-label={closeLabel}>
          <IconClose />
        </button>
        {actions}
      </div>
      <div className={styles.inner}>{open ? children : held}</div>
    </dialog>
  );
}
