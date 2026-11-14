/**
 * SHARED CONTRACT — the shapes every part of the app agrees on.
 *
 * WHY: 4 people work in parallel (data / AI / UI / insights). If everyone
 * builds against these types, the pieces fit together without constant
 * coordination. TypeScript will flag anyone who breaks the agreed shape.
 *
 * RULE: changing a type here affects everyone. Announce it in the team chat
 * before merging, and keep changes small.
 */

// ─── Data ────────────────────────────────────────────────────────────────

/**
 * The 3 baskets from the S-Bank challenge brief. (Team decided.)
 * - mandatory_regular:   rent, phone, insurance — predictable, recurring
 * - mandatory_irregular: broken washing machine, dentist — necessary but surprise
 * - everyday:            coffee, takeaway, taxis — "slips through your fingers"
 */
export type Basket = "mandatory_regular" | "mandatory_irregular" | "everyday";

export const BASKETS: Basket[] = ["mandatory_regular", "mandatory_irregular", "everyday"];

/** Human-readable basket names for the UI. */
export const BASKET_LABELS: Record<Basket, string> = {
  // WHY short (team call, 14 Nov): same words as the Week tab; "Mandatory &" was long and stiff.
  mandatory_regular: "Regular",
  mandatory_irregular: "Surprising expenses",
  everyday: "Everyday spending",
};

/**
 * One transaction, as the app uses it.
 * Fields mirror tx_junction_transactions.csv (renamed to camelCase), plus `basket`,
 * which WE add in lib/data/baskets.ts (it is not in the dataset).
 */
export type Transaction = {
  customerId: string;
  accountId: string;
  date: string; // "YYYY-MM-DD"
  timestamp: string; // raw tx_timestamp from the CSV
  category: string;
  amountEur: number; // sign convention: see isSpending() in lib/data/index.ts
  balanceAfterEur: number;
  transactionType: string;
  merchantId: string;
  mccCode: string;
  basket: Basket;
};

export type Customer = {
  customerId: string;
  postalCode: string;
  age: number;
};

/** A date range, inclusive on both ends. Dates are "YYYY-MM-DD". */
export type DateRange = { from: string; to: string };

// ─── Home loan (mortgage) ────────────────────────────────────────────────
// Added 14 Nov (new types only — nothing above changed). 200 of the 5,100
// customers applied for a mortgage. Source: data/raw/mtg_*.csv, copied into
// data/demo/<id>.json by scripts/prepare-data.mjs.

export type MortgageDecision = "approved" | "rejected";

/**
 * One step of the mortgage negotiation (a row of mtg_negotiation_history.csv).
 * Empty CSV cells are left out, so most fields are optional.
 */
export type MortgageEvent = {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM:SS"
  type: string; // event_type, e.g. "property_added", "loan_decision"
  propertyId?: string;
  propertyType?: string; // apartment | terraced_house | detached_house
  propertyPriceEur?: number;
  loanAmountEur?: number;
  equityEur?: number;
  collateralType?: string; // apartment | other_apartment
  collateralValueEur?: number;
  collateralStatus?: string; // pending | approved
  decision?: string;
  rejectionReason?: string;
  expenseType?: string; // valuation_fee | transfer_tax | renovation | …
  expenseEur?: number;
  note: string; // the bank's own sentence about the step
};

/** A customer's mortgage: final outcome (mtg_tx_customer_link…csv) + full history. */
export type Mortgage = {
  mortgageId: string; // the mortgage files' own id, e.g. "C0025"
  decision: MortgageDecision;
  rejectionReason: string | null; // insufficient_collateral | insufficient_income | insufficient_equity | existing_debt
  propertyPriceEur: number;
  loanEur: number;
  equityEur: number; // the customer's own money
  collateralValueEur: number;
  requiredMonthlyIncomeEur: number; // the bank's figure, not ours
  loanToValue: number; // 0.82 = the loan is 82 % of the price
  events: MortgageEvent[]; // oldest first
};

/** GET /api/mortgage response body: `{ mortgage: null }` if the customer has none. */
export type MortgageSummary = {
  mortgageId: string;
  decision: MortgageDecision;
  rejectionReason: string | null;
  appliedOn: string; // "YYYY-MM-DD"
  decidedOn: string;
  daysToDecision: number;
  property: { id: string; type: string; priceEur: number };
  loanEur: number;
  equityEur: number;
  loanToValue: number;
  collateralValueEur: number;
  requiredMonthlyIncomeEur: number;
  /** From the customer's own transactions, so the coach can relate the loan to everyday money. */
  monthly: { range: DateRange; incomeEur: number; spendingEur: number };
  propertiesConsidered: {
    id: string;
    type: string;
    firstPriceEur: number;
    lastPriceEur: number;
    chosen: boolean;
  }[];
  /**
   * Each expense the bank recorded; label = expense type code, e.g. "transfer_tax".
   * WHY no total: the items mix one-off costs (transfer tax) with what look like
   * monthly ones (existing_loan ≤ €1,200, maintenance_fee), so a sum would mislead.
   */
  recordedCosts: ChartRow[];
  collateral: { type: string; valueEur: number; status: string }[];
  contactsWithBank: number;
  /** Key steps for a timeline (customer contacts and expenses are summarised elsewhere). */
  timeline: MortgageEvent[];
};

// ─── Demo customer picker ────────────────────────────────────────────────
// Added 14 Nov (new types only). Used by the switcher at the top of the app.

/** One customer in the picker list. */
export type DemoCustomerOption = {
  id: string;
  age: number;
  typeLabel: string; // rough spending type, e.g. "Saver" (lib/data/profiles.ts)
  incomePerMonth: number;
  spendingPerMonth: number;
  mortgage: { decision: MortgageDecision; rejectionReason: string | null; salarySweep: boolean } | null;
};

/** GET /api/customers response body. */
export type DemoCustomersResponse = {
  current: string; // the customer the app shows right now
  defaultId: string; // used when nothing is picked (DEMO_CUSTOMER_ID in .env.local, or MOCK)
  picked: boolean; // true if picked in the app (cookie), false if it's the default
  customers: DemoCustomerOption[]; // real customers; MOCK (fake data) is not listed
};

// ─── Charts ──────────────────────────────────────────────────────────────

/**
 * What the UI needs to draw a chart (or table) in the chat or full screen.
 *
 * WHY: the AI picks the chart TYPE and TITLE, but `rows` always come from
 * our own data functions, never typed by the AI. That keeps numbers exact.
 */
/**
 * "heatmap" = GitHub-style calendar of DAILY spending (rows must be one per
 * day, label "YYYY-MM-DD"). Tapping it opens a month-by-month explorer.
 * "cumulative" = month so far: running total per day of month, with a
 * projection to month end and last month as a dashed line (month_progress).
 */
export type ChartType =
  "bar" | "line" | "pie" | "table" | "heatmap" | "cumulative" | "baskets" | "leaks";

/**
 * One row of a chart. `value2` is optional: when set, the chart compares two
 * series side by side (e.g. "You" vs "Typical for your age").
 */
/**
 * How an amount reads (added 14 Nov): "in" = money coming in, kept or saved — a good
 * outcome (green); "out" = money going out, i.e. spending (red). Unset = neutral.
 * Set by show_chart in lib/ai/tools.ts (rowTone), never by the AI.
 */
export type MoneyTone = "in" | "out";

export type ChartRow = {
  label: string;
  value: number;
  value2?: number;
  /** Green or red in the chat (see MoneyTone). Optional — older charts are unchanged. */
  tone?: MoneyTone;
  /** Same for value2 (e.g. what_if: "20% less" in green next to "As now" in red). Added 14 Nov (additive). */
  tone2?: MoneyTone;
  /** "cumulative" charts: true = this value is a projection, not real yet. */
  projected?: boolean;
  /** "cumulative" charts: average running total by this day over the last 12 months. */
  average?: number;
};

export type ChartSpec = {
  type: ChartType;
  title: string;
  /**
   * Which data tool + arguments made this chart (set by show_chart). Sent back with the
   * history so a follow-up like "show it over 12 months" knows what "it" was.
   */
  source?: { tool: string; args: Record<string, unknown> };
  unit: string; // e.g. "€"
  rows: ChartRow[];
  /** Names of the two series when rows have value2, e.g. ["You", "Typical"]. */
  seriesNames?: [string, string];
  /** Key numbers shown above/below the chart, e.g. "Spent so far: 1 421 €". */
  facts?: { label: string; value: number }[];
  /** A list shown under the chart in full screen (first 5, tap for more). */
  items?: {
    label: string;
    sub?: string;
    value: number;
    date?: string; // "YYYY-MM-DD" — lets the chart highlight a picked day
    group?: string; // e.g. category — used for the pie view of the list
  }[];
  /**
   * Month-by-month charts ("cumulative"): which month is shown and how far the
   * ‹ › arrows can go. Months are "YYYY-MM". Other months: GET /api/month-progress.
   */
  monthNav?: { shown: string; first: string; last: string };
  /** "leaks" charts: small purchases, habits, skip chips, the drip jar. */
  leaks?: LeaksView;
  /** "baskets" charts: baskets → categories → merchant types, biggest first. */
  baskets?: BasketGroup[];
  /** Human-readable period the chart covers, e.g. "1.9.–29.9.2026". */
  periodLabel?: string;
};

/** Screen data for the "leaks" chart (see lib/insights/leaks.ts). */
export type LeaksView = {
  everydayPerYearEur: number; // the whole "everything else" basket, per year
  smallMaxEur: number;
  smallPerYearEur: number;
  smallCount: number; // small purchases in the period
  smallTotalEur: number; // their total in the period
  periodDays: number;
  /** The 2 weekdays with the most everyday spending and their share (0–1). */
  leakiestDays: { days: [string, string]; share: number } | null;
  habits: {
    name: string; // merchant type, e.g. "Fast food"
    category: string; // for the icon
    timesPerMonth: number;
    averageEur: number;
    perYearEur: number;
    /** What skipping one would save a year, or null if it's too rare. */
    skip: { label: string; savesPerYearEur: number } | null;
  }[];
  /**
   * Every everyday purchase in the period, oldest first — the marbles in the
   * jar. `habit` = the habit card it belongs to (merchant type or category).
   */
  drops: { date: string; amount: number; habit: string }[];
};

/** One basket with its categories and what's inside them (see basketTree.ts). */
export type BasketGroup = {
  basket: Basket;
  label: string;
  total: number;
  categories: {
    name: string;
    total: number;
    count: number;
    merchants: {
      name: string;
      total: number;
      count: number;
      /** Each purchase, oldest first ("YYYY-MM-DD", euros). */
      purchases: { date: string; amount: number }[];
    }[];
  }[];
};

/**
 * One basket in the monthly spending breakdown (Home): its BasketGroup (categories → merchant
 * types → purchases, from basketTree.ts) plus its share of all spending, how many payments,
 * and the same days of the previous month. Added 15 Nov.
 */
export type SpendingBasket = BasketGroup & {
  count: number;
  share: number; // of the month's spending, 0–1
  previousTotal: number | null; // null = no history for the comparison period
  changePct: number | null; // whole %, null when there's nothing to compare with
};

/** GET /api/spending?month=YYYY-MM — the Spending breakdown on Home. Added 15 Nov. */
export type SpendingBreakdown = {
  month: string; // "YYYY-MM"
  first: string; // first month with data (for ‹)
  last: string; // latest month (for ›)
  range: DateRange; // the month, or its first days while it's still going
  inProgress: boolean;
  incomeEur: number; // money in, for the income vs expenses line
  spendingEur: number; // money out = the sum of the baskets
  count: number;
  baskets: SpendingBasket[];
  /** The same days of the month before (or the whole month before, once this one is over). */
  previous: { range: DateRange; spendingEur: number; changePct: number | null } | null;
};

// ─── Chat ────────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant";

/** One message in the chat, as the UI stores and displays it. */
export type ChatMessage = {
  role: ChatRole;
  text: string;
  charts?: ChartSpec[]; // only on assistant messages
  whatIf?: WhatIf; // only on assistant messages; opens the what-if view
};

/** POST /api/chat request body. Send the whole conversation so far. */
export type ChatRequest = { messages: ChatMessage[] };

/** POST /api/chat response body. */
export type ChatResponse = {
  reply: ChatMessage;
  mode: "live" | "mock"; // so the UI can show a "mock AI" badge
};

// ─── Week tab ────────────────────────────────────────────────────────────

/** GET /api/day?date=YYYY-MM-DD response body (heatmap day details). */
export type DaySpending = {
  date: string;
  totalEur: number;
  incomeEur: number;
  transactions: {
    category: string;
    merchantType: string | null;
    amountEur: number; // positive = spent
    basket: Basket;
    /** "HH:MM" when the payment was made, null if the timestamp can't be read. Added 14 Nov. */
    time: string | null;
  }[];
};

// ─── Proactive insights ──────────────────────────────────────────────────
// Added (new types only). Things the coach noticed without being asked:
// spending alerts, recurring payments, unusual activity. Built by
// lib/insights/proactive.ts; shown on the Account tab and given to the AI.

/**
 * The category shown on the card. save_help = a savings opportunity; positive = a good habit;
 * risk = something coming up (e.g. bills before payday bigger than the balance).
 * positive + risk added 15 Nov.
 */
export type InsightKind = "save_help" | "spending_alert" | "recurring" | "unusual" | "positive" | "risk";

/** How much it matters: risk = act now, watch = worth a look, info = good to know, good = well done. Added 15 Nov. */
export type InsightSeverity = "risk" | "watch" | "info" | "good";

export type Insight = {
  id: string; // stable per rule, e.g. "spending-alert"
  kind: InsightKind;
  severity: InsightSeverity;
  title: string; // "Your grocery spending increased"
  /**
   * One short line to catch the eye before any detail, e.g. "You could save {+618 €} a year".
   * The Account tab shows only this until the card is tapped.
   */
  hook: string;
  /** What was noticed. Amounts use the money markers {+…} / {-…} (components/chat/MoneyText). */
  detail: string;
  /** Why it was noticed: the comparison behind it, in plain words. */
  why: string;
  /** What the customer could do about it. */
  action: string;
  /** The action in a few words for the card, e.g. "Set a weekly grocery budget". Added 15 Nov. */
  cta: string;
  /** Optional list, e.g. recurring payments per month. */
  table?: ChartRow[];
  /** Optional total under the list, e.g. "Potential annual cost". */
  total?: { label: string; value: number };
  /** A question that opens the coach about this insight. */
  ask: string;
};

/** GET /api/insights response body. */
export type InsightsResponse = { asOf: string; insights: Insight[] };

// ─── Account (home) tab ──────────────────────────────────────────────────
// Added (new types only). The bank-app style overview: balance, month in/out,
// balance history and the transaction list. Built by lib/data/home.ts.

/** One row in the Account tab's transaction list. */
export type AccountTransaction = {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM" ("" if unknown)
  category: string;
  merchantType: string | null; // e.g. "Supermarket", from the MCC code
  amountEur: number; // negative = money out
  kind: "spending" | "income" | "savings_move";
};

/**
 * GET /api/transactions — search the customer's transactions (Activity, and Home's recent list).
 * Query: month (YYYY-MM | latest) or from / to (YYYY-MM-DD), q (merchant type or category),
 * category (exact), type (all | income | expense), sort (newest | oldest), offset, limit. Added 15 Nov.
 */
export type TransactionSearch = {
  range: DateRange; // the dates searched (defaults to all the data)
  dataRange: DateRange | null; // first … last transaction (min / max for date pickers); null = no data
  asOf: string;
  /** Categories in the searched dates (before the category filter), for the filter list. */
  categories: { name: string; count: number }[];
  count: number; // all matching transactions (not just this page)
  incomeEur: number; // money in among the matches
  spendingEur: number; // money out among the matches (moves to own savings are neither)
  transactions: AccountTransaction[]; // this page, in the requested order
  nextOffset: number | null; // null = this was the last page
};

/** GET /api/account?month=YYYY-MM response body. */
export type AccountSummary = {
  /** null when the customer has no transactions at all (never shown as a made-up value). Changed 15 Nov. */
  accountId: string | null;
  /** After the latest transaction; null when there are no transactions. Changed 15 Nov (was 0). */
  balanceEur: number | null;
  asOf: string; // the latest day in the data ("today" in this app)
  /**
   * This month so far, from the transactions. net = income − spending (both as on the In / Out
   * tiles; moves to the customer's own savings are neither, listed apart). Added 15 Nov: netEur,
   * movedToSavingsEur.
   */
  month: {
    range: DateRange;
    incomeEur: number;
    spendingEur: number;
    netEur: number;
    movedToSavingsEur: number;
  };
  /**
   * The balance at the end of last month and how much it has changed since (for the up / down
   * indicator). null when the history starts this month. Added 15 Nov.
   */
  previousMonth: { endDate: string; balanceEur: number; changeEur: number } | null;
  balanceHistory: ChartRow[]; // end-of-day balance, last 90 days
  lowest: { date: string; balanceEur: number } | null; // lowest point in balanceHistory
  /**
   * The month shown in the transaction list ("YYYY-MM"), how far the ‹ › arrows can go,
   * and that month's money in / out. Changed 15 Nov: was offset paging ("Show more").
   */
  list: { month: string; first: string; last: string; incomeEur: number; spendingEur: number };
  transactions: AccountTransaction[]; // that month, newest first
};

/** GET /api/week response body. */
export type WeekSummary = {
  range: DateRange;
  totalSpentEur: number;
  byBasket: Record<Basket, number>;
  byDay: ChartRow[]; // one row per day, label = "Mon", "Tue", ...
  /** Same days, split by basket (for the stacked "By day" chart). */
  byDayBasket: ({ label: string } & Record<Basket, number>)[];
  topCategories: ChartRow[];
  /** Basket of each top category (same order) — for colour-coding on the Week tab. */
  topCategoryBaskets: Basket[];
};

// ─── Home tab ────────────────────────────────────────────────────────────

/**
 * Safe to spend (lib/insights/safeToSpend.ts — the same function as the coach's
 * safe_to_spend tool, so Home and the chat always agree). Every line adds up to the cent:
 *   balanceEur − fixedCostsBeforePaydayEur − surpriseBufferEur = leftAfterCostsEur
 *   safeUntilPaydayEur = leftAfterCostsEur if ≥ 0, else 0 (and shortfallEur = what's missing)
 *   safePerDayEur × coveredDays = safeForRequestedDaysEur
 * Added 14 Nov; breakdown fields 15 Nov.
 */
export type SafeToSpendSummary = {
  today: string;
  /** null = no salary rhythm found; then daysToPayday is an assumed 30 (the UI says so). */
  nextPayday: string | null;
  daysToPayday: number;
  balanceEur: number;
  /** The bills / subscriptions / savings counted below (due up to and including payday). */
  fixedCosts: UpcomingPayment[];
  fixedCostsBeforePaydayEur: number;
  /** Average irregular ("surprise") costs per month — the reserve's basis. */
  surpriseAvgPerMonthEur: number;
  surpriseBufferEur: number; // that average for the days until payday
  leftAfterCostsEur: number; // balance − fixed − reserve; negative = not enough
  safeUntilPaydayEur: number;
  shortfallEur: number; // > 0 only when fixed costs + reserve are more than the balance
  safePerDayEur: number;
  requestedDays: number;
  /** Days of the requested period before payday (≤ requestedDays): only these get money. */
  coveredDays: number;
  safeForRequestedDaysEur: number;
  /** One entry per requested day, today first. */
  plan: SafeDay[];
};

/** One day of the safe-to-spend plan. allowanceEur null = on / after payday (new budget). */
export type SafeDay = {
  date: string;
  allowanceEur: number | null;
  isPayday: boolean;
  payments: UpcomingPayment[]; // fixed costs expected that day
};

/**
 * A bill, subscription or automatic saving expected soon (from recurring payments). Added 14 Nov;
 * prediction details 15 Nov.
 * WHY `status`: everything in the demo data is a PREDICTION from past payments — there are no
 * bank-scheduled payments. "scheduled" is kept for a real bank feed; the UI labels both clearly.
 */
export type UpcomingPayment = {
  name: string; // "Housing", "Streaming"
  category: string;
  kind: "bill" | "subscription" | "automatic_saving";
  status: "predicted" | "scheduled";
  date: string; // expected date: its usual day of the month, next time it comes round
  inDays: number;
  /** The last payment when it's always (almost) the same, else the average (amountIsEstimate). */
  amountEur: number;
  amountIsEstimate: boolean;
  minAmountEur: number; // over the last 12 months
  maxAmountEur: number;
  dayRange: [number, number]; // earliest / latest day of the month it was paid
  monthsSeen: number; // of the last 12
  /** Why it counts as recurring, in plain words. */
  reason: string;
  /** Its payments over the last 12 months, newest first (positive euros). */
  history: { date: string; amountEur: number }[];
};

/** GET /api/home — the Home tab parts no other endpoint has. safeToSpend null = no transactions. Added 14 Nov. */
export type HomeExtrasResponse = {
  safeToSpend: SafeToSpendSummary | null;
  upcoming: UpcomingPayment[]; // next 31 days, by date
  upcomingTotalEur: number; // their sum (added 15 Nov)
};

// ─── What-if / forecast ──────────────────────────────────────────────────

/** How far ahead a forecast looks — and how much history it is based on. */
export type ForecastMonths = 1 | 3 | 6;

/** Toggle order in the UI, left → right. The first one is the default. */
export const FORECAST_MONTHS: ForecastMonths[] = [1, 3, 6];

/** Toggle labels. */
export const FORECAST_LABELS: Record<ForecastMonths, string> = {
  1: "Month",
  3: "3 months",
  6: "6 months",
};

/** For sentences: "next " + text / "last " + text → "next month", "last 3 months". */
export const FORECAST_PERIOD_TEXT: Record<ForecastMonths, string> = {
  1: "month",
  3: "3 months",
  6: "6 months",
};

/**
 * ok = based on the same length of history as asked.
 * fallback = the customer's history is shorter; a shorter period was scaled up.
 * not_enough_data = nothing to show (see WhatIf.emptyReason).
 */
export type ForecastStatus = "ok" | "fallback" | "not_enough_data";

/**
 * WHAT a what-if is about. A transaction matches if its category OR its merchant type
 * (MCC, see lib/data/merchantTypes.ts) is listed. WHY not just a category: lets the AI
 * narrow or widen it (e.g. only "Fast food", or "Eating out" = Restaurants + Cafes +
 * Takeaway) with the same components.
 */
export type SpendingTarget = {
  label: string; // shown to the user, e.g. "Restaurants"
  categories: string[]; // dataset categories, e.g. ["Restaurants"]
  merchantTypes: string[]; // e.g. ["Fast food"]
};

/** One point of a projection chart. Running totals in €; null = this line has no value here. */
export type ProjectionPoint = {
  date: string; // "YYYY-MM-DD"
  actual: number | null; // past: what was really spent
  noChange: number | null; // future: if nothing changes
  withCut: number | null; // future: if spending drops by cutPct
};

/** The % options under the what-if chart, left → right. The first one is the default. */
export const CUT_OPTIONS: number[] = [5, 10, 20];

/**
 * CUT_OPTIONS plus `extra` (e.g. 17 % from "skip one visit a week"), sorted. Added 14 Nov (additive).
 * WHY: the AI may open the view on another %; it then gets its own circle next to 5 / 10 / 20.
 * Shared by the server (WhatIf.cutOptions) and the panel (the circles), so they always match.
 */
export function cutOptionsWith(extra: number): number[] {
  return CUT_OPTIONS.includes(extra) ? CUT_OPTIONS : [...CUT_OPTIONS, extra].sort((a, b) => a - b);
}

/** Next period's totals for one cut %. */
export type CutSaving = { cutPct: number; withCutEur: number; savingEur: number };

/** A "What if I spend less on X?" option. */
export type CategoryOption = { target: SpendingTarget; spentEur: number };

/**
 * One purchase of a what-if target — GET /api/what-if/purchases (the list behind a tapped
 * point on the what-if chart). Added 14 Nov (new type only).
 */
export type TargetPurchase = {
  date: string; // "YYYY-MM-DD"
  merchant: string; // merchant type from the MCC (e.g. "Fast food"), else the category
  amountEur: number; // positive = spent
};

/**
 * What the what-if estimate is based on: the target's average month over the last 12 months,
 * or over all the history when it is shorter (DECISIONS.md #34). Added 14 Nov (new type, additive).
 */
export type MonthlyAverage = {
  range: DateRange; // the last 12 months, or from the customer's first day of data
  months: number; // length of range in months, 1 decimal (12 = a full year)
  perMonthEur: number; // spent on the target in an average month
};

/**
 * The target's spending in the forecast window one year earlier. A fact for the coach
 * ("last December you spent…"), NOT part of the estimate (DECISIONS.md #34). Added 14 Nov (additive).
 */
export type LastYearSpending = { range: DateRange; spentEur: number };

/** GET /api/what-if response body, and ChatMessage.whatIf. Built by lib/insights/whatIfForecast.ts. */
export type WhatIf = {
  target: SpendingTarget;
  cutPct: number; // the selected %, e.g. 5 — one of CUT_OPTIONS, or any whole % 1–100 the AI picked
  months: ForecastMonths; // the period shown (always the one asked for)
  monthsWithData: ForecastMonths[]; // which toggle options show an estimate (spending on the target in the last 12 months; [] = none → 🙂 everywhere)
  basedOnMonths: ForecastMonths | null; // the chart's past period = lookback (null = not enough data); the estimate uses `average`
  status: ForecastStatus;
  emptyReason: "short_history" | "no_spending" | null; // no_spending = none in the last 12 months (or the shorter history)
  today: string;
  lookback: DateRange | null;
  horizon: DateRange;
  pastEur: number; // spent on the target in the lookback (the chart's past line; may be 0 when average > 0)
  noChangeEur: number; // next period, unchanged = average.perMonthEur × months
  withCutEur: number; // next period, with the cut
  savingEur: number; // noChangeEur − withCutEur
  cutOptions: CutSaving[]; // the same totals for every cutOptionsWith(cutPct) % (for the chat message); [] = no data
  points: ProjectionPoint[];
  average: MonthlyAverage | null; // what noChangeEur is based on (null = not enough data)
  lastYear: LastYearSpending | null; // same window a year ago; null = not fully in the history
  breakdown: ChartRow[]; // what the target is made of (sub-categories / merchant types), biggest first
  topCategories: CategoryOption[]; // next 2 biggest everyday-basket groups in the lookback (target left out)
};
