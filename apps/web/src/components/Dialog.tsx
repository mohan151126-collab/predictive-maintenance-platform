import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, onClose, children }: DialogProps) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  // Read before autoFocus or the effect below moves focus into the dialog.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const element = box.current;

    if (element && !element.contains(document.activeElement)) {
      (element.querySelector<HTMLElement>(FOCUSABLE) ?? element).focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !element) return;

      const items = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && opener !== document.body && document.contains(opener)) opener.focus();
    };
  }, [opener]);

  // Rendered on <body>: an ancestor with backdrop-filter or a transform would
  // otherwise become the containing block of the fixed backdrop and clip it.
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        className="dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
