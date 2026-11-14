/**
 * PROACTIVE INSIGHTS — things worth telling the customer before they ask. Owner: INSIGHTS
 * person. SERVER ONLY. Shown on the Account tab (GET /api/insights), given to the AI as the
 * proactive_insights tool, and the "help me save" one opens the chat (ChatView).
 *
 * Every insight says WHAT was noticed, WHY (the comparison behind it) and an ACTION.
 * WHY rules in code, not the AI: the numbers must be exact and the same every time
 * (team rule: the AI never calculates). The AI explains them in the chat.
 *
 * The rules (thresholds are our own, chosen to avoid noise; tune them here):
 *   save_help       keeps < 5 % of income over the last 3 full months (or spends more than
 *                   earns) → the biggest everyday categories, and what 20 % less would save
 *   spending_alert  a category ≥ 25 % (and ≥ €30) above its average month of the 12 before
 *   recurring       payments seen in 6+ of the last 12 months (lib/insights/recurring.ts)
 *   unusual         an everyday category this week ≥ 1.6× its usual week; a purchase ≥ 3×
 *                   bigger than 9 in 10 of the year's purchases; spending growing ≥ 10
 *                   points faster than income (last 3 months vs the 3 before)
 */
import type { Basket, ChartRow, Insight, Transaction } from "@/lib/types";
import {
  getDataToday,
  getTransactions,
  isIncome,
  isSpending,
  merchantType,
  round2,
  spentEur,
} from "@/lib/data";
import { addDays, endOfMonth, startOfMonth, toDate } from "@/lib/data/dates";
import { recurringPayments } from "./recurring";

// ─── Small helpers ───────────────────────────────────────────────────────

/** 386.4 → "386 €" (Finnish style, whole euros — easier to read in a card). */
function eur(n: number): string {
  return Math.round(n).toLocaleString("fi-FI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}
/** Money markers for MoneyText: green = in / saved, red = out. */
const plus = (n: number) => `{+${eur(n)}}`;
const minus = (n: number) => `{-${eur(n)}}`;
const pct = (share: number) => `${Math.round(share * 100)} %`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];
const fi = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.`;

/** First day of the month `n` months before the month of `iso`. */
function monthsBefore(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  const i = y * 12 + (m - 1) - n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;
}

const isWeekend = (iso: string) => [0, 6].includes(toDate(iso).getUTCDay());

/** "Groceries" → "grocery" (as in "grocery spending"); other categories just lowercased. */
const NOUN: Record<string, string> = { groceries: "grocery", restaurants: "restaurant" };
const noun = (category: string) => NOUN[category.toLowerCase()] ?? category.toLowerCase();

/** "Restaurant MRC-RES-0068" / "Rent M-LANDLORD" → "Restaurant" / "Rent". */
const withoutMerchantId = (name: string) => name.replace(/ [A-Z]+(-[A-Z0-9]+)+$/, "");

/** Bills (rent, utilities…) aren't something to budget weekly: alerts use purchases only. */
const isPurchase = (t: Transaction) => isSpending(t) && t.transactionType === "purchase";

function sumBy<T>(items: T[], key: (t: T) => string, value: (t: T) => number): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) out.set(key(it), (out.get(key(it)) ?? 0) + value(it));
  return out;
}

/** The last `n` FULL months before the month of `today` (a month still running isn't full). */
function lastFullMonths(today: string, n: number) {
  const thisMonthDone = endOfMonth(today) === today;
  const end = thisMonthDone ? today : addDays(startOfMonth(today), -1);
  return { from: monthsBefore(end, n - 1), to: end, months: n };
}

/** How many months of `range` actually have data (short histories). */
function monthsWithData(txs: Transaction[]): number {
  return new Set(txs.map((t) => t.date.slice(0, 7))).size;
}

// ─── save_help: the customer keeps (almost) nothing ──────────────────────

const SAVE_HELP_KEPT_SHARE = 0.05;
const SAVE_HELP_CUT = 0.2;

type MoneyHealth = {
  range: { from: string; to: string };
  incomePerMonth: number;
  spendingPerMonth: number;
  keptShare: number;
};

function moneyHealth(): MoneyHealth | null {
  const range = lastFullMonths(getDataToday(), 3);
  const txs = getTransactions(range);
  const months = monthsWithData(txs);
  if (months < 2) return null;
  const income = txs.filter(isIncome).reduce((s, t) => s + t.amountEur, 0) / months;
  const spending = txs.reduce((s, t) => s + spentEur(t), 0) / months;
  if (income <= 0) return null; // can't judge saving without income in this account
  return { range, incomePerMonth: income, spendingPerMonth: spending, keptShare: (income - spending) / income };
}

function saveHelp(): Insight | null {
  const h = moneyHealth();
  if (!h || h.keptShare >= SAVE_HELP_KEPT_SHARE) return null;
  const txs = getTransactions(h.range).filter((t) => isSpending(t) && t.basket === "everyday");
  const months = Math.max(1, monthsWithData(getTransactions(h.range)));
  const perCategory = [...sumBy(txs, (t) => t.category, spentEur)]
    .map(([label, total]) => ({ label, perMonth: total / months }))
    .sort((a, b) => b.perMonth - a.perMonth)
    .slice(0, 3);
  if (perCategory.length === 0) return null;
  const table: ChartRow[] = perCategory.map((c) => ({
    label: `${c.label}, 20 % less`,
    value: round2(c.perMonth * SAVE_HELP_CUT),
    tone: "in",
  }));
  const savePerMonth = table.reduce((s, r) => s + r.value, 0);
  const left = h.incomePerMonth - h.spendingPerMonth;
  const overspending = left < 0;
  const top = perCategory[0];
  return {
    id: "save-help",
    kind: "save_help",
    title: overspending ? "You're spending more than you earn" : "You're keeping very little of your income",
    hook: `You could save ${plus(savePerMonth * 12)} a year`,
    detail:
      `In ${monthName(h.range.from)}–${monthName(h.range.to)} you earned ${plus(h.incomePerMonth)} a month and spent ${minus(h.spendingPerMonth)}, ` +
      (overspending ? `so ${minus(-left)} a month more than came in.` : `leaving only ${plus(left)} (${pct(h.keptShare)}).`),
    why:
      `Your income and spending over the last 3 full months. Keeping at least 10 % of your income ` +
      `builds a safety buffer, so surprise costs don't push you short.`,
    action:
      `Start with ${top.label.toLowerCase()} (${minus(top.perMonth)} a month): 20 % less saves about ${plus(top.perMonth * SAVE_HELP_CUT)} a month. ` +
      (perCategory.length > 1
        ? `Doing the same for ${perCategory.length === 3 ? "all three" : "both"} saves ${plus(savePerMonth)} a month.`
        : ""),
    table,
    total: { label: "Could save in a year", value: round2(savePerMonth * 12) },
    ask: "How can I save more each month?",
  };
}

/**
 * One line for the AI's system prompt when the customer needs help saving, else null.
 * WHY: the coach should nudge toward saving even when asked about something else.
 */
export function moneyHealthNote(): string | null {
  const h = moneyHealth();
  if (!h || h.keptShare >= SAVE_HELP_KEPT_SHARE) return null;
  const how = h.keptShare < 0 ? "spends more than they earn" : `keeps only ${pct(h.keptShare)} of their income`;
  return `Over the last 3 full months this customer ${how} (income ${eur(h.incomePerMonth)}, spending ${eur(h.spendingPerMonth)} a month).`;
}

// ─── spending_alert: a category clearly above its usual month ────────────

function spendingAlert(): (Insight & { category: string }) | null {
  const today = getDataToday();
  const day = Number(today.slice(8, 10));
  // WHY: judge a month only when it's (almost) done; otherwise use the last full month.
  const useThisMonth = day >= 25;
  const focus = useThisMonth
    ? { from: startOfMonth(today), to: today }
    : { from: monthsBefore(today, 1), to: addDays(startOfMonth(today), -1) };
  const share = useThisMonth ? day / Number(endOfMonth(today).slice(8, 10)) : 1;
  const base = { from: monthsBefore(focus.from, 12), to: addDays(focus.from, -1) };
  const baseTxs = getTransactions(base).filter(isPurchase);
  const baseMonths = monthsWithData(getTransactions(base));
  if (baseMonths < 3) return null;
  const focusTxs = getTransactions(focus).filter(isPurchase);

  const now = sumBy(focusTxs, (t) => t.category, spentEur);
  const avg = sumBy(baseTxs, (t) => t.category, (t) => spentEur(t) / baseMonths);
  let best: { category: string; spent: number; usual: number; expected: number } | null = null;
  for (const [category, spent] of now) {
    const usual = avg.get(category) ?? 0;
    const expected = usual * share;
    if (usual < 40 || spent - expected < 30 || spent / expected - 1 < 0.25) continue;
    if (!best || spent - expected > best.spent - best.expected) best = { category, spent, usual, expected };
  }
  if (!best) return null;
  const { category, spent, usual, expected } = best;
  const inCat = (t: Transaction) => t.category === category;

  // What drove it: the shop type with the biggest increase, and whether it was weekends.
  const label = (t: Transaction) => merchantType(t.mccCode) ?? category;
  const nowBy = sumBy(focusTxs.filter(inCat), label, spentEur);
  const avgBy = sumBy(baseTxs.filter(inCat), label, (t) => (spentEur(t) / baseMonths) * share);
  const driver = [...nowBy]
    .map(([name, v]) => ({ name, up: v - (avgBy.get(name) ?? 0) }))
    .sort((a, b) => b.up - a.up)[0];
  const weekendShare = (txs: Transaction[]) => {
    const total = txs.reduce((s, t) => s + spentEur(t), 0);
    return total ? txs.filter((t) => isWeekend(t.date)).reduce((s, t) => s + spentEur(t), 0) / total : 0;
  };
  const wkNow = weekendShare(focusTxs.filter(inCat));
  const wkUsual = weekendShare(baseTxs.filter(inCat));
  const onWeekends = wkNow >= 0.5 && wkNow - wkUsual >= 0.15;
  // WHY skip a driver that is just the category again ("restaurant" in Restaurants).
  const namesCategory = driver && category.toLowerCase().startsWith(driver.name.toLowerCase().replace(/s$/, ""));
  const driverText =
    driver && driver.up > 0 && !namesCategory
      ? ` Your largest increase came from ${driver.name.toLowerCase()}${onWeekends ? ", mostly on weekends" : ""}.`
      : onWeekends
        ? " Most of it was on weekends."
        : "";
  const weekly = Math.max(5, Math.round(usual / 4.33 / 5) * 5);
  const when = useThisMonth ? "this month" : `in ${monthName(focus.from)}`;

  return {
    id: "spending-alert",
    kind: "spending_alert",
    category,
    title: `Your ${noun(category)} spending increased`,
    hook: `${category} up ${pct(spent / expected - 1)} ${when}`,
    detail: `You've spent ${minus(spent)} on ${category.toLowerCase()} ${when}, ${pct(spent / expected - 1)} more than usual.${driverText}`,
    why: `Compared with your average month for ${category.toLowerCase()}: ${minus(usual)} over the ${baseMonths} months before.`,
    action: `Try a weekly ${noun(category)} budget of about ${eur(weekly)}: your usual month spread over its weeks.`,
    ask: `Why did my ${noun(category)} spending go up ${when}?`,
  };
}

// ─── recurring: what keeps coming back every month ───────────────────────

function recurring(): Insight | null {
  const items = recurringPayments().items.filter((i) => i.kind !== "automatic_saving");
  if (items.length < 2) return null;
  // "Restaurant MRC-RES-0068" → "Restaurant (regular place)"; repeated names get a number.
  const seen = new Map<string, number>();
  const table: ChartRow[] = items.slice(0, 6).map((i) => {
    const name = withoutMerchantId(i.name);
    const base = i.kind === "habit" ? `${name} (regular place)` : name;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { label: n > 1 ? `${base} ${n}` : base, value: i.perMonthEur, tone: "out" };
  });
  const yearly = items.reduce((s, i) => s + i.perMonthEur, 0) * 12;
  const habits = items.filter((i) => i.kind === "habit" || i.kind === "subscription");
  return {
    id: "recurring",
    kind: "recurring",
    title: `You have ${items.length} recurring payments`,
    hook: `${minus(yearly / 12)} a month goes out on repeat`,
    detail: `Together they cost about ${minus(yearly / 12)} a month.`,
    why: "Each one showed up in 6 or more of the last 12 months.",
    action: habits.length
      ? "Review them to see whether you're still using all of them. Regular places and subscriptions are the easiest to cut."
      : "Review them to see whether you're still using all of them, and compare contracts for the bills.",
    table,
    total: { label: "Potential annual cost", value: round2(yearly) },
    ask: "Show my recurring payments",
  };
}

// ─── unusual: this week, one big purchase, spending vs income ────────────

function unusualThisWeek(today: string): (Insight & { category: string }) | null {
  const week = { from: addDays(today, -6), to: today };
  const before = { from: addDays(today, -90), to: addDays(today, -7) }; // the 12 weeks before
  const everyday = (t: Transaction) => isSpending(t) && t.basket === ("everyday" satisfies Basket);
  const now = sumBy(getTransactions(week).filter(everyday), (t) => t.category, spentEur);
  const usual = sumBy(getTransactions(before).filter(everyday), (t) => t.category, (t) => spentEur(t) / 12);
  let best: { category: string; spent: number; usual: number } | null = null;
  for (const [category, spent] of now) {
    const u = usual.get(category) ?? 0;
    if (u < 10 || spent < u * 1.6 || spent - u < 25) continue;
    if (!best || spent / u > best.spent / best.usual) best = { category, spent, usual: u };
  }
  if (!best) return null;
  const c = best.category.toLowerCase();
  return {
    id: "unusual-week",
    kind: "unusual",
    category: best.category,
    title: `Your ${noun(best.category)} spending is unusually high this week`,
    hook: `${best.category} ${(best.spent / best.usual).toFixed(1)}× your usual week`,
    detail: `${minus(best.spent)} on ${c} in the last 7 days, about ${(best.spent / best.usual).toFixed(1)}× your usual week.`,
    why: `Your usual week for ${c}: ${minus(best.usual)} (average of the 12 weeks before).`,
    action: `Keep ${c} light for the next few days to get back to your usual ${eur(best.usual)} a week.`,
    ask: `Why is my ${noun(best.category)} spending high this week?`,
  };
}

function unusualPurchase(today: string): (Insight & { category: string }) | null {
  const purchases = (r: { from: string; to: string }) =>
    getTransactions(r).filter((t) => isSpending(t) && t.transactionType === "purchase");
  const year = purchases({ from: addDays(today, -365), to: addDays(today, -31) })
    .map(spentEur)
    .sort((a, b) => a - b);
  if (year.length < 30) return null;
  const p90 = year[Math.floor(year.length * 0.9)];
  const recent = purchases({ from: addDays(today, -30), to: today });
  const big = recent.reduce<Transaction | null>((b, t) => (!b || spentEur(t) > spentEur(b) ? t : b), null);
  if (!big || spentEur(big) < Math.max(150, p90 * 3)) return null;
  const what = merchantType(big.mccCode) ?? big.category;
  return {
    id: "unusual-purchase",
    kind: "unusual",
    category: big.category,
    title: "A purchase much larger than usual",
    hook: `One ${minus(spentEur(big))} purchase stood out`,
    detail: `You paid ${minus(spentEur(big))} for ${what.toLowerCase()} on ${fi(big.date)}, much more than your usual purchase.`,
    why: `9 in 10 of your purchases in the past year were under ${eur(p90)}.`,
    action: "If you don't recognise it, check it with the bank. If it was planned, set a little aside each month so big buys don't surprise you.",
    ask: `Tell me about my ${what.toLowerCase()} purchase on ${fi(big.date)}`,
  };
}

function spendingOutgrowsIncome(today: string): Insight | null {
  const recent = lastFullMonths(today, 3);
  const earlier = { from: monthsBefore(recent.from, 3), to: addDays(recent.from, -1) };
  const per = (r: { from: string; to: string }) => {
    const txs = getTransactions(r);
    const m = monthsWithData(txs);
    if (m < 2) return null;
    return {
      income: txs.filter(isIncome).reduce((s, t) => s + t.amountEur, 0) / m,
      spending: txs.reduce((s, t) => s + spentEur(t), 0) / m,
    };
  };
  const a = per(earlier);
  const b = per(recent);
  if (!a || !b || a.spending <= 0 || a.income <= 0) return null;
  const spendGrowth = b.spending / a.spending - 1;
  const incomeGrowth = b.income / a.income - 1;
  if (spendGrowth < 0.1 || spendGrowth - incomeGrowth < 0.1) return null;
  const span = (r: { from: string; to: string }) => `${monthName(r.from)}–${monthName(r.to)}`;
  return {
    id: "unusual-growth",
    kind: "unusual",
    title: "Your spending is growing faster than your income",
    hook: `Spending up ${pct(spendGrowth)}, income ${incomeGrowth < 0 ? "down" : "up"} ${pct(Math.abs(incomeGrowth))}`,
    detail:
      `Your spending went up ${pct(spendGrowth)}, while your income ` +
      (incomeGrowth < 0 ? `fell ${pct(-incomeGrowth)}.` : `grew only ${pct(incomeGrowth)}.`),
    why: `${span(recent)}: ${minus(b.spending)} spent and ${plus(b.income)} earned a month, vs ${span(earlier)}: ${minus(a.spending)} and ${plus(a.income)}.`,
    action: "Find the basket that grew the most and give it a monthly limit before the gap gets bigger.",
    ask: "Why is my spending growing faster than my income?",
  };
}

// ─── All of them ─────────────────────────────────────────────────────────

/** Everything worth telling the customer right now, most important first. */
export function proactiveInsights(): Insight[] {
  const today = getDataToday();
  const alert = spendingAlert();
  // WHY: a week or a big purchase in the same category as the alert tells the same story twice.
  const sameAsAlert = (i: { category: string } | null) => (alert && i?.category === alert.category ? null : i);
  const strip = <T extends Insight & { category?: string }>(i: T | null): Insight | null => {
    if (!i) return null;
    const { category: _category, ...insight } = i;
    void _category;
    return insight;
  };
  return [
    saveHelp(),
    strip(alert),
    strip(sameAsAlert(unusualThisWeek(today)) as (Insight & { category: string }) | null),
    strip(sameAsAlert(unusualPurchase(today)) as (Insight & { category: string }) | null),
    spendingOutgrowsIncome(today),
    recurring(),
  ].filter((i): i is Insight => i !== null);
}
