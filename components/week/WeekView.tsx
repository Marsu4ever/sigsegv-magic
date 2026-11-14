"use client";
/**
 * "This week" tab — simple overview, no AI. Owner: UI person.
 * Data comes from GET /api/week (lib/data/index.ts → getWeekSummary).
 *
 * NOTE: shows the LAST 7 DAYS in the dataset (ending on its latest day), not the
 * real calendar week — the data is synthetic and ends mid-week. See getWeekSummary().
 */
import { useEffect, useState } from "react";
import type { WeekSummary } from "@/lib/types";
import { BASKETS, BASKET_LABELS } from "@/lib/types";
import { ChartCard } from "@/components/charts/ChartCard";
import { fiDate, formatValue } from "@/components/charts/format";

const BASKET_DOT: Record<string, string> = {
  mandatory_regular: "var(--basket-regular)",
  mandatory_irregular: "var(--basket-irregular)",
  everyday: "var(--basket-everyday)",
};

export function WeekView() {
  const [data, setData] = useState<WeekSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/week")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error);
        setData(json);
      })
      .catch((err) => setError(String(err.message ?? err)));
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-line bg-surface px-4 py-3">
        <h1 className="font-semibold">Last 7 days</h1>
        {data && (
          <p className="text-xs text-muted">
            {fiDate(data.range.from)} – {fiDate(data.range.to)}
          </p>
        )}
      </header>

      <div className="space-y-4 p-4">
        {error && <p className="text-sm text-danger">⚠️ {error}</p>}
        {!data && !error && <p className="text-sm text-muted">Loading…</p>}

        {data && (
          <>
            <section className="rounded-xl bg-surface p-4 shadow-sm">
              <p className="text-sm text-muted">Spent</p>
              <p className="text-3xl font-bold tabular-nums">
                {formatValue(data.totalSpentEur, "€")}
              </p>
            </section>

            <section className="rounded-xl bg-surface p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold">By basket</h2>
              <ul className="space-y-1.5">
                {BASKETS.map((b) => (
                  <li key={b} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: BASKET_DOT[b] }}
                      />
                      {BASKET_LABELS[b]}
                    </span>
                    <span className="tabular-nums">{formatValue(data.byBasket[b], "€")}</span>
                  </li>
                ))}
              </ul>
            </section>

            <ChartCard spec={{ type: "bar", title: "By day", unit: "€", rows: data.byDay }} />
            <ChartCard
              spec={{ type: "table", title: "Top categories", unit: "€", rows: data.topCategories }}
            />
          </>
        )}
      </div>
    </div>
  );
}
