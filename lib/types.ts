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
export type ChartType = "bar" | "line" | "pie" | "table" | "heatmap" | "cumulative";

/**
 * One row of a chart. `value2` is optional: when set, the chart compares two
 * series side by side (e.g. "You" vs "Typical for your age").
 */
export type ChartRow = {
  label: string;
  value: number;
  value2?: number;
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
};

// ─── Chat ────────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant";

/** One message in the chat, as the UI stores and displays it. */
export type ChatMessage = {
  role: ChatRole;
  text: string;
  charts?: ChartSpec[]; // only on assistant messages
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
