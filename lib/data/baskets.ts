/**
 * Sorting transactions into the 3 baskets. Owner: DATA person.
 *
 * WHY a simple lookup table: easy to read, easy to argue about as a team,
 * easy to show judges. Improve later (e.g. detect recurring payments from
 * the same merchant every month → mandatory_regular).
 *
 * Categories below are the REAL ones from the S-Bank dataset
 * (see data/demo/_categories.json for all 15 + counts).
 */
import type { Basket } from "@/lib/types";

const CATEGORY_TO_BASKET: Record<string, Basket> = {
  // ── mandatory_regular — predictable, recurring ─────────────────────────
  housing: "mandatory_regular", // rent / mortgage (transaction_type housing_payment)
  utilities: "mandatory_regular", // electricity, phone… (utilities_payment)
  // Debatable — needed every week, but part of a grocery bill can be treats. Team call.
  groceries: "mandatory_regular",
  // Fuel, public transport, parking. Taxis are moved to "everyday" by MCC below.
  transportation: "mandatory_regular",

  // ── mandatory_irregular — necessary, but surprise timing/amount ────────
  health: "mandatory_irregular", // pharmacy, doctors, dentist
  // Hardware, electronics, furniture — "the broken washing machine". Debatable.
  "home & tech": "mandatory_irregular",

  // ── everyday — the stuff that "slips through your fingers" ─────────────
  restaurants: "everyday", // incl. fast food (MCC 5814) and bars (5813)
  entertainment: "everyday",
  lifestyle: "everyday", // clothing, sports, hobbies
  travel: "everyday",

  // ── categories used only by the fake MOCK customer ─────────────────────
  rent: "mandatory_regular",
  electricity: "mandatory_regular",
  phone: "mandatory_regular",
  insurance: "mandatory_regular",
  "public transport": "mandatory_regular",
  healthcare: "mandatory_irregular",
  pharmacy: "mandatory_irregular",
  "home repair": "mandatory_irregular",
  cafes: "everyday",
  takeaway: "everyday",
  taxi: "everyday",
  clothing: "everyday",
};

/**
 * Merchant-type overrides by MCC code (a standard 4-digit merchant type
 * code on every card payment). Checked BEFORE the category table.
 * WHY: "Transportation" mixes bus tickets (needed) with taxis (a classic
 * slips-through-your-fingers cost).
 */
const MCC_TO_BASKET: Record<string, Basket> = {
  "4121": "everyday", // taxis & limousines
};

/**
 * WHY default to "everyday": an unknown category is most likely discretionary
 * spending. It also makes gaps in the table visible (everything piles up in
 * one basket), instead of silently hiding them.
 */
const DEFAULT_BASKET: Basket = "everyday";

/** Plain-language explanation of each basket, for UI and docs. */
export const BASKET_DESCRIPTIONS: Record<Basket, { meaning: string; example: string }> = {
  mandatory_regular: {
    meaning: "Bills you must pay, and that come every month at roughly the same size.",
    example: "Rent, electricity, groceries, bus card",
  },
  mandatory_irregular: {
    meaning: "Costs you can't avoid, but that hit at unpredictable times.",
    example: "Broken washing machine, dentist, new phone",
  },
  everyday: {
    meaning: 'Small, optional spending that "slips through your fingers" and adds up.',
    example: "Coffees, takeaway, taxis, cinema",
  },
};

/** The merchant-code overrides, for display (e.g. on the /data page). */
export function listMccOverrides(): { mcc: string; basket: Basket }[] {
  return Object.entries(MCC_TO_BASKET).map(([mcc, basket]) => ({ mcc, basket }));
}

export function classifyBasket(category: string, mccCode = ""): Basket {
  return (
    MCC_TO_BASKET[mccCode.trim()] ??
    CATEGORY_TO_BASKET[category.trim().toLowerCase()] ??
    DEFAULT_BASKET
  );
}
