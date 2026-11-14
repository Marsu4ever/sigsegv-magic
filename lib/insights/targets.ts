/**
 * Spending targets for what-ifs: named groups, matching, and turning words into a target.
 * Owner: INSIGHTS. SERVER ONLY.
 */
import type { CategoryOption, DateRange, SpendingTarget, Transaction } from "@/lib/types";
import {
  allMerchantTypes,
  isSpending,
  listCategories,
  merchantType,
  round2,
  spentEur,
} from "@/lib/data";

const EATING_OUT: SpendingTarget = {
  label: "Eating out",
  categories: ["Restaurants", "Cafes", "Takeaway"],
  merchantTypes: [],
};
const TAXI: SpendingTarget = { label: "Taxi", categories: ["Taxi"], merchantTypes: ["Taxi"] };

/**
 * Groups the user can ask for by name (see NAMED_WORDS).
 * WHY: real data has one "Restaurants" category, MOCK splits eating out into three;
 * real taxis are category "Transportation" + MCC 4121, so they need a merchant-type match.
 */
export const NAMED_TARGETS: SpendingTarget[] = [EATING_OUT, TAXI];

/**
 * Groups used for the "What if I spend less on X?" buttons (the next 2).
 * WHY no "Eating out" here (team decided): the chip and the buttons work per category
 * (Restaurants, Cafes, Takeaway separately). Eating out as a whole is only used when the
 * user asks for it ("eating out", "dining"). WHY Taxi: otherwise a real customer's taxi
 * button would read "Transportation".
 */
const GROUP_TARGETS: SpendingTarget[] = [TAXI];

/**
 * Used only when the customer has no everyday spending at all.
 * WHY: the chip and the "unclear" default are the customer's biggest everyday group
 * (getDefaultTarget in whatIfForecast.ts); this is the last resort.
 * WHY groceries: nearly every customer buys groceries, so the view rarely ends up empty.
 */
export const FALLBACK_TARGET: SpendingTarget = {
  label: "Groceries",
  categories: ["Groceries"],
  merchantTypes: [],
};

/** Words that mean a named target (lower case). WHY not "cafe": "only cafes" should narrow to Cafes. */
const NAMED_WORDS: Record<string, string[]> = {
  "Eating out": ["eating out", "eat out", "dining"],
  Taxi: ["taxi"],
};

export function matchesTarget(t: Transaction, target: SpendingTarget): boolean {
  const c = t.category.toLowerCase();
  if (target.categories.some((x) => x.toLowerCase() === c)) return true;
  const mt = merchantType(t.mccCode);
  return !!mt && target.merchantTypes.includes(mt);
}

/** The group a transaction belongs to for the category buttons. */
export function groupTarget(t: Transaction): SpendingTarget {
  return (
    GROUP_TARGETS.find((n) => matchesTarget(t, n)) ?? {
      label: t.category,
      categories: [t.category],
      merchantTypes: [],
    }
  );
}

/**
 * Everyday-basket spending in `range`, one entry per groupTarget(), biggest first.
 * Used for the chip's target and the "What if I spend less on X?" buttons.
 * WHY only everyday: Housing etc. would always top a plain ranking (DECISIONS.md #25).
 */
export function everydayGroups(txs: Transaction[], range: DateRange): CategoryOption[] {
  const groups = new Map<string, CategoryOption>();
  for (const t of txs) {
    if (!isSpending(t) || t.basket !== "everyday" || t.date < range.from || t.date > range.to) {
      continue;
    }
    const g = groupTarget(t);
    const key = targetKey(g);
    groups.set(key, { target: g, spentEur: (groups.get(key)?.spentEur ?? 0) + spentEur(t) });
  }
  return [...groups.values()]
    .map((o) => ({ ...o, spentEur: round2(o.spentEur) }))
    .sort((a, b) => b.spentEur - a.spentEur);
}

/** A stable key for caching and comparing targets. */
export function targetKey(t: SpendingTarget): string {
  return [t.label, t.categories.join(","), t.merchantTypes.join(",")].join("|");
}

/** Free text ("what if I cut cafes…") → target: named words, then categories, then merchant types. */
export function resolveTarget(text: string): SpendingTarget | null {
  const q = text.toLowerCase();
  const named = NAMED_TARGETS.find((n) => NAMED_WORDS[n.label]?.some((w) => q.includes(w)));
  if (named) return named;
  const cat = listCategories().find((c) => q.includes(c.toLowerCase()));
  if (cat) return { label: cat, categories: [cat], merchantTypes: [] };
  const mt = allMerchantTypes().find((m) => q.includes(m.toLowerCase()));
  return mt ? { label: mt, categories: [], merchantTypes: [mt] } : null;
}

/** Exact names (the AI's `only` refinement) → target. Unknown name → null so the AI can retry. */
export function targetFromNames(names: string[], label?: string): SpendingTarget | null {
  const cats = listCategories();
  const mts = allMerchantTypes();
  const categories: string[] = [];
  const merchantTypes: string[] = [];
  for (const n of names) {
    const want = n.trim().toLowerCase();
    const c = cats.find((x) => x.toLowerCase() === want);
    const m = mts.find((x) => x.toLowerCase() === want);
    if (c) categories.push(c);
    else if (m) merchantTypes.push(m);
    else return null;
  }
  if (!categories.length && !merchantTypes.length) return null;
  return {
    label: label ?? [...categories, ...merchantTypes].join(" & "),
    categories,
    merchantTypes,
  };
}

/** All names the AI may use in `category` / `only`, for error messages. */
export function availableNames(): string[] {
  return [...NAMED_TARGETS.map((n) => n.label), ...listCategories(), ...allMerchantTypes()];
}
