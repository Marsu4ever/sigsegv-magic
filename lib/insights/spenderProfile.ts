/**
 * spender_profile — "What kind of spender am I?" Owner: INSIGHTS person.
 *
 * Combines things we already compute:
 * - the spending type + basket split   (lib/data/profiles.ts, whole history)
 * - where you're above / below people your age   (benchmarks)
 * - the small-purchase effect, last 90 days   (everyday_leaks)
 * The AI turns this into a friendly, teaching answer.
 */
import { BASKETS, BASKET_LABELS } from "@/lib/types";
import { getCustomerId, periodToRange } from "@/lib/data";
import { profileFor, SPENDING_TYPES } from "@/lib/data/profiles";
import { compareToPeers } from "./benchmarks";
import { everydayLeaks } from "./leaks";

export function spenderProfile() {
  const p = profileFor(getCustomerId());
  if (!p) return null;
  const type = SPENDING_TYPES.find((t) => t.type === p.type)!;
  const peers = compareToPeers();
  const leaks = everydayLeaks(periodToRange("last_90_days"));

  // Categories clearly above / below the normal range for their age group.
  const above = (peers?.rows ?? [])
    .filter((r) => r.youPerMonth > r.peersTypicalRange[1])
    .sort((a, b) => b.youPerMonth / (b.peersMedian || 1) - a.youPerMonth / (a.peersMedian || 1))
    .slice(0, 3)
    .map((r) => ({ category: r.category, youPerMonth: r.youPerMonth, typical: r.peersMedian }));
  const below = (peers?.rows ?? [])
    .filter((r) => r.youPerMonth < r.peersTypicalRange[0])
    .slice(0, 3)
    .map((r) => ({ category: r.category, youPerMonth: r.youPerMonth, typical: r.peersMedian }));

  return {
    type: type.label,
    typeRule: type.rule,
    incomePerMonthEur: p.incomePerMonth,
    spendingPerMonthEur: p.spendingPerMonth,
    keptShare: Math.round(p.savingsRate * 100) / 100,
    basketShare: Object.fromEntries(
      BASKETS.map((b) => [BASKET_LABELS[b], Math.round(p.basketShare[b] * 100)]),
    ),
    biggestEverydayCategory: p.topEveryday,
    comparedToAgeGroup: peers
      ? { ageGroup: peers.ageGroup, clearlyAbove: above, clearlyBelow: below }
      : null,
    smallPurchasesLast90Days: leaks.smallPurchases,
    basedOn: `${p.firstDate} → ${p.lastDate}`,
    rows: BASKETS.map((b) => ({
      label: BASKET_LABELS[b],
      value: Math.round(p.basketShare[b] * 100),
    })),
    unit: "%",
  };
}
