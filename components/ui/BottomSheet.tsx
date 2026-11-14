"use client";
/**
 * A sheet that slides up from the bottom (phone pattern for details): dimmed backdrop,
 * a small label + title, a close button. Tap outside or press Esc to close. Owner: UI person.
 * Used by the coach insights, the account details and the money lessons on Home.
 */
import { useEffect, useId, useRef } from "react";
import { Icon } from "./Icon";
import { BackButton } from "./BackButton";

/** Open sheets, oldest first. WHY: a sheet can open another (fixed costs → one payment); Esc closes only the top one. */
const openSheets: string[] = [];

export function BottomSheet({
  label,
  title,
  onClose,
  onBack,
  children,
}: {
  /** Small grey line above the title, e.g. "Spending alert". */
  label?: string;
  title: string;
  onClose: () => void;
  /** Set for a sheet opened from another sheet: a back button replaces ✕ (back = to that sheet). */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const id = useId();
  // WHY a ref: parents pass a new onClose on every render; re-running the effect below
  // would move this sheet to the top of the stack.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    openSheets.push(id);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openSheets.at(-1) === id && close.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      openSheets.splice(openSheets.indexOf(id), 1);
    };
  }, [id]);

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
          {onBack && <BackButton onClick={onBack} />}
          <div className="min-w-0 flex-1">
            {label && <p className="text-xs font-medium text-muted">{label}</p>}
            <h2 className="mt-0.5 text-lg font-semibold leading-snug">{title}</h2>
          </div>
          {!onBack && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
            >
              <Icon name="close" size={20} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
