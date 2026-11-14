"use client";
/**
 * A centered row of round buttons where exactly one is selected, e.g. 5% | 10% | 20%.
 * Same props as SegmentedControl, so the two are easy to swap.
 * Reusable for any 2–4 short options (a few characters each).
 */
export function CircleOptions<T extends string | number>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={props.ariaLabel} className="flex justify-center gap-4">
      {props.options.map((o) => {
        const selected = o.value === props.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => props.onChange(o.value)}
            // WHY h-16 w-16: big, easy targets on a phone. Same light-green fill as the category buttons.
            className={`flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold tabular-nums ${
              selected ? "bg-accent text-accent-foreground" : "bg-accent/10 text-accent"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
