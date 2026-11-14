"use client";
/**
 * A small chart inside a chat message. Tap → opens full screen.
 * WHY: keeps the chat readable on a phone, but lets the user dig in.
 */
import { useState } from "react";
import type { ChartSpec } from "@/lib/types";
import { ChartRenderer } from "./ChartRenderer";
import { ChartFullscreen } from "./ChartFullscreen";

export function ChartCard({ spec }: { spec: ChartSpec }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-left"
        aria-label={`Open chart: ${spec.title}`}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <span className="text-sm font-semibold">{spec.title}</span>
          <span className="shrink-0 text-xs text-muted">Expand ⤢</span>
        </div>
        {/* WHY pointer-events-none: taps go to the card (open full screen),
            not to chart tooltips, which are fiddly on a phone. */}
        <div className="pointer-events-none">
          <ChartRenderer spec={spec} compact />
        </div>
      </button>
      {open && <ChartFullscreen spec={spec} onClose={() => setOpen(false)} />}
    </>
  );
}
