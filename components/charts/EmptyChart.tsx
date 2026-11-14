"use client";
/**
 * Shown in place of a chart when there is nothing to draw. Same height as the chart,
 * so the layout doesn't jump. Reusable by any chart.
 */
export function EmptyChart({
  message = "Not enough data yet",
  icon = "🙂",
  height = 200,
}: {
  message?: string;
  icon?: string;
  height?: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line"
      style={{ height }}
    >
      <span className="text-4xl" aria-hidden>
        {icon}
      </span>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
