/**
 * basket_details — the 3 baskets → their categories → what's inside each
 * category (merchant types). Owner: INSIGHTS person.
 *
 * Powers the "baskets" chart: one bar in the 3 basket colours, categories as
 * shades inside, tap a category to see what it's made of.
 * Every level is sorted biggest first; the single purchases (3rd level) are in
 * the order they happened.
 */
import type { Basket, BasketGroup, DateRange } from "@/lib/types";
import { BASKETS, BASKET_LABELS } from "@/lib/types";
import { getTransactions, isSpending, merchantType, round2, spentEur } from "@/lib/data";

export function basketTree(range: DateRange): { total: number; baskets: BasketGroup[] } {
  // basket → category → merchant type → { total, count, purchases }
  type Acc = { total: number; count: number; purchases: { date: string; amount: number }[] };
  const tree = new Map<Basket, Map<string, Map<string, Acc>>>();
  for (const b of BASKETS) tree.set(b, new Map());
  for (const t of getTransactions(range)) {
    if (!isSpending(t)) continue;
    const cats = tree.get(t.basket)!;
    if (!cats.has(t.category)) cats.set(t.category, new Map());
    const merchants = cats.get(t.category)!;
    const name = merchantType(t.mccCode) ?? "Other";
    const m = merchants.get(name) ?? { total: 0, count: 0, purchases: [] };
    m.total += spentEur(t);
    m.count += 1;
    m.purchases.push({ date: t.date.slice(0, 10), amount: round2(spentEur(t)) });
    merchants.set(name, m);
  }

  const baskets: BasketGroup[] = BASKETS.map((basket) => {
    const categories = [...tree.get(basket)!.entries()]
      .map(([name, merchants]) => {
        const items = [...merchants.entries()]
          .map(([mName, m]) => ({
            name: mName,
            total: round2(m.total),
            count: m.count,
            purchases: [...m.purchases].sort((a, b) => a.date.localeCompare(b.date)),
          }))
          .sort((a, b) => b.total - a.total);
        return {
          name,
          total: round2(items.reduce((s, m) => s + m.total, 0)),
          count: items.reduce((s, m) => s + m.count, 0),
          merchants: items,
        };
      })
      .sort((a, b) => b.total - a.total);
    return {
      basket,
      label: BASKET_LABELS[basket],
      total: round2(categories.reduce((s, c) => s + c.total, 0)),
      categories,
    };
  });
  return { total: round2(baskets.reduce((s, b) => s + b.total, 0)), baskets };
}
