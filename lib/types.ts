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

export const BASKETS: Basket[] = [
  "mandatory_regular",
  "mandatory_irregular",
  "everyday",
];

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
export type ChartType = "bar" | "line" | "pie" | "table";

export type ChartRow = { label: string; value: number };

export type ChartSpec = {
  type: ChartType;
  title: string;
  unit: string; // e.g. "€"
  rows: ChartRow[];
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

/** GET /api/week response body. */
export type WeekSummary = {
  range: DateRange;
  totalSpentEur: number;
  byBasket: Record<Basket, number>;
  byDay: ChartRow[]; // one row per day, label = "Mon", "Tue", ...
  topCategories: ChartRow[];
};
