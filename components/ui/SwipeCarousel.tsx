"use client";
/**
 * One card at a time, swipe left / right for the next. Owner: UI person.
 * Used by: coach insights on Home (components/insights/InsightCards.tsx).
 *
 * - Swipe with a finger or drag with the mouse; dots and ‹ › buttons below do the same,
 *   and ← / → work when focus is inside.
 * - Every slide is exactly as wide as the page content (no bleed past the screen edge).
 * - Taps on a card still work: a click only counts if the pointer didn't drag first.
 * WHY pointer events and not CSS scroll-snap: scroll-snap can't be dragged with a mouse,
 * and the demo runs on laptops as much as phones.
 * WHY touch-action: pan-y: vertical swipes still scroll the page; sideways ones are ours.
 * WHY hidden slides are `inert`: keyboard and screen-reader users only reach the shown card.
 * If an item is removed (e.g. a hidden insight), the shown position stays and clamps to the last.
 */
import { useRef, useState } from "react";
import { Icon } from "./Icon";

/** A swipe longer than this share of the width moves to the next card. */
const SWIPE_SHARE = 0.2;
/** A quick flick (shorter than this many ms) needs only FLICK_PX. */
const FLICK_MS = 250;
const FLICK_PX = 30;
/** How far (px) the pointer moves before we decide: sideways swipe or page scroll. */
const SLOP = 8;
/** Space between slides while swiping (px). Must match the track's gap-3. */
const GAP = 12;

type Drag = { x: number; y: number; t: number; id: number; axis: "x" | "y" | null };

export function SwipeCarousel<T>({
  items,
  getKey,
  renderItem,
  label,
  itemLabel = "item",
}: {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  /** What the whole carousel is, for screen readers ("Coach insights"). */
  label: string;
  /** What one slide is called in button labels ("insight" → "Show insight 2 of 4"). */
  itemLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);

  const count = items.length;
  const current = Math.min(index, Math.max(count - 1, 0));
  const go = (to: number) => setIndex(Math.max(0, Math.min(count - 1, to)));

  function reset() {
    drag.current = null;
    setDx(0);
    setDragging(false);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (count < 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, axis: null };
    dragged.current = false;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
      d.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (d.axis === "y") return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragged.current = true;
      setDragging(true);
    }
    if (d.axis !== "x") return;
    // WHY resistance at the ends: shows there's nothing more that way.
    const atEdge = (current === 0 && mx > 0) || (current === count - 1 && mx < 0);
    setDx(atEdge ? mx / 3 : mx);
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || d.axis !== "x") return reset();
    const mx = e.clientX - d.x;
    const width = viewport.current?.offsetWidth ?? 1;
    const quick = e.timeStamp - d.t < FLICK_MS;
    const far = Math.abs(mx) > width * SWIPE_SHARE || (quick && Math.abs(mx) > FLICK_PX);
    if (far) go(current + (mx < 0 ? 1 : -1));
    reset();
  }

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(current - 1);
        else if (e.key === "ArrowRight") go(current + 1);
      }}
    >
      <div
        ref={viewport}
        className="touch-pan-y select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onDragStart={(e) => e.preventDefault()}
        // WHY capture: a drag that ends over a card's button must not also open it.
        onClickCapture={(e) => {
          if (dragged.current) {
            e.preventDefault();
            e.stopPropagation();
            dragged.current = false;
          }
        }}
      >
        <div
          className={`flex gap-3 ${dragging ? "" : "transition-transform duration-300 ease-out motion-reduce:transition-none"}`}
          style={{ transform: `translateX(calc(${-current} * (100% + ${GAP}px) + ${dx}px))` }}
        >
          {items.map((item, i) => (
            <div
              key={getKey(item)}
              className="w-full shrink-0"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              inert={i !== current}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-1 flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => go(current - 1)}
            disabled={current === 0}
            aria-label={`Previous ${itemLabel}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted disabled:opacity-30"
          >
            <Icon name="chevron" size={15} className="rotate-180" />
          </button>
          {items.map((item, i) => (
            <button
              key={getKey(item)}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${itemLabel} ${i + 1} of ${count}`}
              aria-current={i === current}
              className="flex h-6 w-4 items-center justify-center"
            >
              <span
                className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                  i === current ? "w-4 bg-accent" : "w-1.5 bg-line"
                }`}
              />
            </button>
          ))}
          <button
            type="button"
            onClick={() => go(current + 1)}
            disabled={current === count - 1}
            aria-label={`Next ${itemLabel}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted disabled:opacity-30"
          >
            <Icon name="chevron" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
