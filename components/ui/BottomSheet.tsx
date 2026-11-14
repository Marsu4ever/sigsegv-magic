"use client";
/**
 * A sheet that slides up from the bottom (phone pattern for details): dimmed backdrop,
 * a small label + title, a close button. Tap outside or press Esc to close. Owner: UI person.
 * Used by the coach insights and the account details on Home.
 */
import { useEffect } from "react";
import { Icon } from "./Icon";

export function BottomSheet({
  label,
  title,
  onClose,
  children,
}: {
  /** Small grey line above the title, e.g. "Spending alert". */
  label?: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-md flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            {label && <p className="text-xs font-medium text-muted">{label}</p>}
            <h2 className="mt-0.5 text-lg font-semibold leading-snug">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
