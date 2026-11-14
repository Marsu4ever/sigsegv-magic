"use client";
/**
 * A small, quiet circled "i" that opens a box with more detail. Reusable next to any heading
 * or label: pass the box content as children.
 *
 * Opens on mouse hover; a tap / click (or Enter / Space) pins it open until tapped again,
 * tapped outside or Esc. WHY tap too: phones have no hover, and the app is mobile first.
 *
 * LAYOUT: the box is `absolute` against the nearest `relative` parent, full width of that
 * parent (left-0 right-0). Put the InfoTip inside a `relative` row as wide as the box should be,
 * e.g. a card's heading row. WHY not against the icon: an icon at the end of a heading can sit
 * near the right edge, and a box anchored to it would run off a 390 px screen.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function InfoTip({
  label,
  children,
}: {
  /** Screen-reader name of the button, e.g. "How is this estimated?" */
  label: string;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  const boxId = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const closeOutside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setPinned(false);
    };
    const closeOnEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEsc);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEsc);
    };
  }, [pinned]);

  return (
    // WHY pointer events with pointerType "mouse": a phone tap also fires mouse-enter, which
    // would leave the box stuck open after a second tap.
    <span
      ref={root}
      className="inline-flex align-middle"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={boxId}
        onClick={() => setPinned((p) => !p)}
        // WHY h-8 w-8 with negative margins: a finger-sized target that doesn't push the heading's lines apart.
        className={`-my-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          open ? "text-accent" : "text-muted/70 hover:text-muted"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v5.5" />
          <circle cx="12" cy="7.75" r="0.6" fill="currentColor" />
        </svg>
      </button>
      {/* WHY pt-1.5 padding, not margin: the gap belongs to this span, so moving the mouse
          from the icon down into the box doesn't close it on the way. */}
      <span
        id={boxId}
        role="note"
        hidden={!open}
        className="absolute left-0 right-0 top-full z-20 pt-1.5 text-left font-normal"
      >
        <span className="fade-up block rounded-xl border border-line bg-background p-3 text-sm leading-relaxed shadow-lg">
          {children}
        </span>
      </span>
    </span>
  );
}
