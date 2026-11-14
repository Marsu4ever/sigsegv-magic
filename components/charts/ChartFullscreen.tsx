"use client";
/**
 * Full-screen view of one chart. Shows the chart plus a table of every value.
 * WHY the table too: exact numbers are easier to read than a chart on a
 * small screen, and it's more accessible (screen readers).
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ChartSpec } from "@/lib/types";
import { ChartRenderer } from "./ChartRenderer";
import { ChartTitle } from "./ChartTitle";
import { Icon } from "@/components/ui/Icon";

export function ChartFullscreen({ spec, onClose }: { spec: ChartSpec; onClose: () => void }) {
  // Close with the Escape key (handy when testing on a laptop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // WHY a portal to <body>: an ancestor with a transform (e.g. a chat reply's fade-in)
  // turns "fixed" into "fixed to that ancestor", so the full screen was only as big as the
  // reply: half hidden, jumping back up when scrolled (14 Nov). At <body> nothing can trap it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={spec.title}
        className="flex h-dvh w-full max-w-md flex-col bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-line px-3 py-3">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-accent"
          >
            ← Back
          </button>
          <h2 className="min-w-0 flex-1 truncate font-semibold">
            <ChartTitle spec={spec} />
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
            aria-label="Close"
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <ChartRenderer spec={spec} compact={false} />
          {/* WHY no extra table for heatmap/cumulative/baskets: they show their own details. */}
          {spec.type !== "table" &&
            spec.type !== "heatmap" &&
            spec.type !== "cumulative" &&
            spec.type !== "baskets" &&
            spec.type !== "leaks" && (
              <div className="mt-4">
                <ChartRenderer spec={{ ...spec, type: "table" }} compact={false} />
              </div>
            )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
