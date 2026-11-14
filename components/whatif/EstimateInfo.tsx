/**
 * The "How is this estimated?" box behind the ⓘ next to the what-if heading (DECISIONS.md #35).
 * Explains the method in plain words with the user's own numbers. Every number comes from
 * WhatIf (lib/insights/whatIfForecast.ts) — nothing is calculated here.
 * WHY spans with `block`, not <p>: the box sits inside inline content next to the heading.
 */
import type { WhatIf } from "@/lib/types";
import { FORECAST_PERIOD_TEXT } from "@/lib/types";
import { averageBasisText, fiDate, formatValue } from "@/components/charts/format";

export function EstimateInfo({ w }: { w: WhatIf }) {
  const what = w.target.label.toLowerCase();
  const a = w.average;
  const eur = (n: number) => formatValue(n, "€");

  return (
    <>
      <span className="block font-semibold">How is this estimated?</span>
      {a ? (
        <>
          <span className="mt-1.5 block">
            <b>Your typical month:</b> about {eur(a.perMonthEur)} on {what}, the average of{" "}
            {averageBasisText(a.months)} ({fiDate(a.range.from)}–{fiDate(a.range.to)}).
          </span>
          <span className="mt-1.5 block">
            {w.months === 1 ? (
              <>
                Next month, if nothing changes: <b>{eur(w.noChangeEur)}</b>.
              </>
            ) : (
              <>
                Next {FORECAST_PERIOD_TEXT[w.months]}: typical month × {w.months} ={" "}
                <b>{eur(w.noChangeEur)}</b>, if nothing changes.
              </>
            )}
          </span>
          {w.basedOnMonths && (
            <span className="mt-1.5 block text-muted">
              The solid line is what you really spent in the last{" "}
              {FORECAST_PERIOD_TEXT[w.basedOnMonths]}
              {w.pastEur === 0 ? " (nothing on " + what + ")" : ""}. The dashed lines go on from
              today: as now, and {w.cutPct}% less.
            </span>
          )}
          {w.lastYear && (
            <span className="mt-1.5 block text-muted">
              Same time last year you spent {eur(w.lastYear.spentEur)}. It&apos;s shown for
              comparison, not used in the estimate.
            </span>
          )}
          <span className="mt-1.5 block text-muted">
            Why an average? One month can be unusually high or low (a trip, a big purchase). A
            longer period evens that out. It&apos;s still an estimate: real months often differ.
          </span>
        </>
      ) : (
        <span className="mt-1.5 block">
          There isn&apos;t enough data yet. An estimate needs at least a month of history and some
          spending on {what} in the last 12 months.
        </span>
      )}
    </>
  );
}
