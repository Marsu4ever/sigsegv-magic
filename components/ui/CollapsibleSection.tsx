"use client";
/**
 * A Home section that can be folded: the title row is a button with a small chevron;
 * tapping it slides the content down (or up). Owner: UI person.
 *
 * WHY: Home holds a lot. People pick how much they see; nothing is removed.
 * WHY remembered per section on this device (localStorage): it's a personal preference,
 * not data. useSyncExternalStore reads it so the server (no localStorage) and the first
 * client render agree — no hydration mismatch — and every section updates when it changes.
 * WHY a grid-rows animation (0fr ↔ 1fr): it slides to the content's real height without
 * measuring it, stays smooth, and is switched off for people who ask for reduced motion.
 * Folded content stays mounted (its data is ready when opened) but is `inert`, so keyboard
 * and screen-reader users don't land in hidden content.
 */
import { useState, useSyncExternalStore } from "react";
import { Icon } from "./Icon";

const KEY = "money-coach:home-sections";
const listeners = new Set<() => void>();
let state: Record<string, boolean> | null = null;
let snapshot = "{}";

function load(): Record<string, boolean> {
  if (state) return state;
  try {
    state = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    state = {};
  }
  snapshot = JSON.stringify(state);
  return state;
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => {
  load();
  return snapshot;
};
const getServerSnapshot = () => "{}";

function setOpen(id: string, open: boolean) {
  state = { ...load(), [id]: open };
  snapshot = JSON.stringify(state);
  try {
    localStorage.setItem(KEY, snapshot);
  } catch {
    // private mode etc.: the choice lasts until the page reloads
  }
  listeners.forEach((l) => l());
}

export function CollapsibleSection({
  id,
  title,
  defaultOpen = true,
  aside,
  children,
}: {
  /** Stable name, used to remember open / closed. */
  id: string;
  title: string;
  defaultOpen?: boolean;
  /** Shown on the right of the title row (a link or small button); not part of the toggle. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const stored = (JSON.parse(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)) as Record<string, boolean>)[id];
  const open = stored ?? defaultOpen;
  // WHY: while sliding the content must be clipped; once open it mustn't be, or rows that
  // bleed to the screen edge (the insight cards) and card shadows get cut off.
  const [sliding, setSliding] = useState(false);
  const contentId = `section-${id}`;

  return (
    <section>
      <div className="flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          onClick={() => {
            // WHY: with reduced motion there's no transition (and no transitionend to stop it).
            setSliding(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
            setOpen(id, !open);
          }}
          aria-expanded={open}
          aria-controls={contentId}
          className="-mx-1 flex min-h-9 items-center gap-1 rounded-lg px-1 text-sm font-semibold"
        >
          {title}
          <Icon
            name="chevron"
            size={15}
            className={`text-muted transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
          />
        </button>
        {aside}
      </div>
      <div
        id={contentId}
        // WHY animate only while sliding: a section remembered as open then appears instantly on
        // load instead of sliding open every time the page opens.
        className={`grid ${sliding ? "transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none" : ""}`}
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        onTransitionEnd={(e) => e.target === e.currentTarget && setSliding(false)}
      >
        <div className={`min-h-0 ${open && !sliding ? "" : "overflow-hidden"}`} inert={!open}>
          <div className="pt-2">{children}</div>
        </div>
      </div>
    </section>
  );
}
