"use client";
/**
 * A small chart inside a chat message. Tap → opens full screen.
 * WHY: keeps the chat readable on a phone, but lets the user dig in.
 */
import { useState } from "react";
import type { ChartSpec } from "@/lib/types";
import { ChartRenderer } from "./ChartRenderer";
import { ChartFullscreen } from "./ChartFullscreen";
import { ChartTitle } from "./ChartTitle";
import { Icon } from "@/components/ui/Icon";

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
          <span className="text-sm font-semibold">
            <ChartTitle spec={spec} />
          </span>
          {/* No arrows on the calendar (team call): the whole card is tappable. */}
          {spec.type !== "heatmap" && (
            // Just the ⤢ arrows (no word); they glimmer now and then to hint "tap to open".
            // WHY the delay from the title: cards in one chat don't all glimmer at once.
            <span
              className="expand-glimmer flex shrink-0 items-center text-muted"
              style={{ animationDelay: `${(spec.title.length % 7) * 0.6 + 1.5}s` }}
              aria-hidden
            >
              <Icon name="expand" size={15} />
            </span>
          )}
        </div>
        {/* WHY pointer-events-none: taps go to the card (open full screen),
            not to chart tooltips, which are fiddly on a phone.
            Exception: the heatmap has its own mouse-only hover popup; a click on
            it still reaches the card and opens full screen. */}
        <div className={spec.type === "heatmap" ? "" : "pointer-events-none"}>
          <ChartRenderer spec={spec} compact />
        </div>
      </button>
      {open && <ChartFullscreen spec={spec} onClose={() => setOpen(false)} />}
    </>
  );
}
