/**
 * Skeleton loading: grey shapes that gently pulse where the content will appear.
 * WHY instead of "Loading…": the page keeps its shape, so nothing jumps when the real
 * content arrives, and it feels faster. Shapes only need to be roughly right.
 */

/** One grey block. Size and shape come from `className` (e.g. "h-4 w-1/2"). */
export function Skeleton({ className = "" }: { className?: string }) {
  // WHY: a "rounded-full" in className must win over the default corners.
  const corners = className.includes("rounded") ? "" : "rounded-md";
  return <div aria-hidden className={`animate-pulse bg-line ${corners} ${className}`} />;
}

/** Wraps skeleton shapes; screen readers hear "Loading" once instead of nothing. */
export function SkeletonGroup({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={className}>
      {children}
    </div>
  );
}

/** A card with a title line and a few text lines. */
export function SkeletonCard({ lines = 2, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2.5 rounded-xl bg-surface p-4 shadow-sm ${className}`}>
      <Skeleton className="h-4 w-2/5" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-3/5" : "w-full"}`} />
      ))}
    </div>
  );
}

/** List rows: round icon, two text lines, an amount on the right (transactions, suggestions). */
export function SkeletonRows({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <ul className={`divide-y divide-line ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            {/* WHY varied widths: identical bars look like a broken table, not content. */}
            <Skeleton className={`h-3 ${["w-1/2", "w-2/3", "w-2/5"][i % 3]}`} />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-3 w-12" />
        </li>
      ))}
    </ul>
  );
}

/** A coach chat bubble that is still being written. */
export function SkeletonBubble() {
  return (
    <div className="w-[70%] space-y-2 rounded-2xl bg-surface px-3.5 py-3 shadow-sm">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
