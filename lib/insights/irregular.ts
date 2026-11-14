/**
 * irregular_buffer — "How much should I set aside for surprise costs?"
 * Owner: INSIGHTS person. Teaches basket 2 (mandatory & irregular).
 *
 * Looks at the whole history, month by month, of the irregular basket
 * (health, home & tech). Suggests:
 * - set aside per month = the average month
 * - emergency buffer    = the worst month seen, rounded up to €50
 */
import type { ChartRow } from "@/lib/types";
import { getTransactions, isSpending, round2, spentEur } from "@/lib/data";
import { startOfMonth } from "@/lib/data/dates";

export function irregularBuffer() {
  const txs = getTransactions();
  const perMonth = new Map<string, number>();
  if (txs.length) {
    // Every month in the history, including months with zero irregular costs.
    let m = startOfMonth(txs[0].date);
    const last = startOfMonth(txs[txs.length - 1].date);
    while (m <= last) {
      perMonth.set(m.slice(0, 7), 0);
      const [y, mo] = m.split("-").map(Number);
      m = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    }
  }
  for (const t of txs) {
    if (isSpending(t) && t.basket === "mandatory_irregular") {
      const k = t.date.slice(0, 7);
      perMonth.set(k, (perMonth.get(k) ?? 0) + spentEur(t));
    }
  }
  const rows: ChartRow[] = [...perMonth].map(([month, v]) => ({
    label: `${month}-01`,
    value: round2(v),
  }));
  const values = rows.map((r) => r.value);
  const average = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  const worst = rows.reduce<ChartRow | null>((w, r) => (!w || r.value > w.value ? r : w), null);
  const sorted = [...values].sort((a, b) => a - b);

  return {
    months: rows.length,
    monthsWithCosts: values.filter((v) => v > 0).length,
    averagePerMonthEur: round2(average),
    medianPerMonthEur: round2(sorted[Math.floor(sorted.length / 2)] ?? 0),
    worstMonth: worst ? { month: worst.label.slice(0, 7), eur: worst.value } : null,
    suggestion: {
      setAsidePerMonthEur: round2(average),
      emergencyBufferEur: worst ? Math.ceil(worst.value / 50) * 50 : 0,
    },
    rows, // per month (label = first day of month)
  };
}
