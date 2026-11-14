/**
 * Customer profiles — a short summary of every demo customer, plus a rough
 * "spending type" label. Used by the /customer_profiles team page to pick
 * good demo customers. SERVER ONLY.
 *
 * ⚠️ The type labels are OUR rough rules (thresholds below), meant to help
 * the team find interesting customers — not financial science. Change freely.
 */
import type { Basket } from "@/lib/types";
import { BASKETS } from "@/lib/types";
import { isSpending, listDemoCustomerIds, loadCustomerFile, spentEur } from "./index";

export type SpendingType =
  "saver" | "spends_more_than_earns" | "everyday_heavy" | "fixed_costs_heavy" | "balanced";

/** Rules, checked top to bottom — the first that matches wins. */
export const SPENDING_TYPES: { type: SpendingType; label: string; rule: string }[] = [
  { type: "saver", label: "Saver", rule: "keeps 15% or more of income" },
  {
    type: "spends_more_than_earns",
    label: "Spends more than earns",
    rule: "spending is higher than income",
  },
  {
    type: "everyday_heavy",
    label: "Everyday-heavy",
    rule: "37% or more of spending is in the everyday basket",
  },
  {
    type: "fixed_costs_heavy",
    label: "Fixed-costs heavy",
    rule: "58% or more of spending is mandatory & regular",
  },
  { type: "balanced", label: "Balanced", rule: "none of the above" },
];

/** Applies the SPENDING_TYPES rules above, top to bottom. */
export function classifySpendingType(
  savingsRate: number,
  share: Record<Basket, number>,
): SpendingType {
  if (savingsRate >= 0.15) return "saver";
  if (savingsRate < 0) return "spends_more_than_earns";
  if (share.everyday >= 0.37) return "everyday_heavy";
  if (share.mandatory_regular >= 0.58) return "fixed_costs_heavy";
  return "balanced";
}

export type CustomerProfile = {
  id: string;
  age: number;
  postalCode: string;
  firstDate: string;
  lastDate: string;
  months: number;
  transactions: number;
  incomePerMonth: number;
  spendingPerMonth: number;
  savingsRate: number; // share of income NOT spent, e.g. 0.12 = 12%
  basketShare: Record<Basket, number>; // share of spending, sums to ~1
  topEveryday: string; // biggest category in the everyday basket
  type: SpendingType;
};

function monthsBetween(a: string, b: string): number {
  const [y1, m1] = a.split("-").map(Number);
  const [y2, m2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

export function profileFor(id: string): CustomerProfile | null {
  const { customer, transactions: t } = loadCustomerFile(id);
  if (t.length === 0) return null;
  const months = monthsBetween(t[0].date, t[t.length - 1].date);

  let income = 0;
  const byBasket = Object.fromEntries(BASKETS.map((b) => [b, 0])) as Record<Basket, number>;
  const everydayCats = new Map<string, number>();
  for (const x of t) {
    const c = x.category.toLowerCase();
    if ((c === "salary" || c === "other income") && x.amountEur > 0) income += x.amountEur;
    if (!isSpending(x)) continue;
    byBasket[x.basket] += spentEur(x);
    if (x.basket === "everyday") {
      everydayCats.set(x.category, (everydayCats.get(x.category) ?? 0) + spentEur(x));
    }
  }
  const spending = BASKETS.reduce((s, b) => s + byBasket[b], 0);
  const share = Object.fromEntries(
    BASKETS.map((b) => [b, spending ? byBasket[b] / spending : 0]),
  ) as Record<Basket, number>;
  const savingsRate = income ? (income - spending) / income : 0;

  const type = classifySpendingType(savingsRate, share);

  const r = (n: number) => Math.round(n);
  return {
    id,
    age: customer.age,
    postalCode: customer.postalCode,
    firstDate: t[0].date,
    lastDate: t[t.length - 1].date,
    months,
    transactions: t.length,
    incomePerMonth: r(income / months),
    spendingPerMonth: r(spending / months),
    savingsRate,
    basketShare: share,
    topEveryday: [...everydayCats].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "–",
    type,
  };
}

/** Profiles for every customer in data/demo/ (excluding the fake MOCK one). */
export function allProfiles(): CustomerProfile[] {
  return listDemoCustomerIds()
    .filter((id) => id !== "MOCK")
    .map(profileFor)
    .filter((p): p is CustomerProfile => p !== null);
}
