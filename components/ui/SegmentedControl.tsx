"use client";
/**
 * A row of buttons where exactly one is selected (iOS style).
 * Reusable for any small set of options, e.g. Month | 3 months | 6 months.
 *
 * The selected look is one "thumb" that slides under the buttons.
 * WHY a sliding thumb (not a background per button): the eye follows the move,
 * so switching feels smooth instead of jumping. Equal-width buttons (flex-1) let the
 * thumb move by whole widths: translateX(index × 100 %).
 */
export function SegmentedControl<T extends string | number>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const n = props.options.length;
  const idx = Math.max(
    0,
    props.options.findIndex((o) => o.value === props.value),
  );
  return (
    <div
      role="group"
      aria-label={props.ariaLabel}
      className="relative flex rounded-full border border-line bg-background p-0.5"
    >
      <span
        aria-hidden
        // WHY calc(100% - 4px): the thumb sits inside the 2 px padding (p-0.5) on both sides.
        className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full bg-accent shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ width: `calc((100% - 4px) / ${n})`, transform: `translateX(${idx * 100}%)` }}
      />
      {props.options.map((o) => {
        const selected = o.value === props.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => props.onChange(o.value)}
            // WHY min-h-9: easy to tap on a phone. relative: above the thumb.
            className={`relative min-h-9 flex-1 rounded-full px-3 text-sm font-medium transition-colors duration-300 ${
              selected ? "text-accent-foreground" : "text-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
