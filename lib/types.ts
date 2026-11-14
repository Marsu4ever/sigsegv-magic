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
  mandatory_regular: "Mandatory & regular",
  mandatory_irregular: "Mandatory & irregular",
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
  /** "cumulative" charts: true = this value is a projection, not real yet. */
  projected?: boolean;
  /** "cumulative" charts: average running total by this day over the last 12 months. */
  average?: number;
};

export type ChartSpec = {
  type: ChartType;
  title: string;
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
  }[];
};

/** GET /api/week response body. */
export type WeekSummary = {
  range: DateRange;
  totalSpentEur: number;
  byBasket: Record<Basket, number>;
  byDay: ChartRow[]; // one row per day, label = "Mon", "Tue", ...
  topCategories: ChartRow[];
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

/** GET /api/what-if response body, and ChatMessage.whatIf. Built by lib/insights/whatIfForecast.ts. */
export type WhatIf = {
  target: SpendingTarget;
  cutPct: number; // the selected one of CUT_OPTIONS, e.g. 5
  months: ForecastMonths; // the period shown (always the one asked for)
  monthsWithData: ForecastMonths[]; // which toggle options have spending on the target ([] = none → 🙂 everywhere)
  basedOnMonths: ForecastMonths | null; // history actually used (null = not enough data)
  status: ForecastStatus;
  emptyReason: "short_history" | "no_spending" | null;
  today: string;
  lookback: DateRange | null;
  horizon: DateRange;
  pastEur: number; // spent on the target in the lookback
  noChangeEur: number; // next period, unchanged
  withCutEur: number; // next period, with the cut
  savingEur: number; // noChangeEur − withCutEur
  cutOptions: CutSaving[]; // the same totals for every CUT_OPTIONS % (for the chat message); [] = no data
  points: ProjectionPoint[];
  breakdown: ChartRow[]; // what the target is made of (sub-categories / merchant types), biggest first
  topCategories: CategoryOption[]; // next 2 biggest everyday-basket groups in the lookback (target left out)
};
