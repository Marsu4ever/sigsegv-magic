"use client";
/**
 * Full-screen view of one chart. Shows the chart plus a table of every value.
 * WHY the table too: exact numbers are easier to read than a chart on a
 * small screen, and it's more accessible (screen readers).
 */
import { useEffect } from "react";
import type { ChartSpec } from "@/lib/types";
import { ChartRenderer } from "./ChartRenderer";

export function ChartFullscreen({ spec, onClose }: { spec: ChartSpec; onClose: () => void }) {
  // Close with the Escape key (handy when testing on a laptop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={spec.title}
        className="flex h-dvh w-full max-w-md flex-col bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">{spec.title}</h2>
          <button type="button" onClick={onClose} className="px-2 text-xl text-muted" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <ChartRenderer spec={spec} compact={false} />
          {spec.type !== "table" && (
            <div className="mt-4">
              <ChartRenderer spec={{ ...spec, type: "table" }} compact={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
