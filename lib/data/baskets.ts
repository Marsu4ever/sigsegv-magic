/**
 * Sorting transactions into the 3 baskets. Owner: DATA person.
 *
 * WHY a simple lookup table first: it is easy to read, easy to argue about
 * as a team, and easy to show judges. Improve it later (e.g. detect
 * recurring payments from the same merchant every month → mandatory_regular).
 *
 * ⚠️ TODO (data person, first task): the category names below are GUESSES
 * made before we could see the real dataset. Run `npm run prepare-data`,
 * open data/demo/_categories.json to see the real category names and counts,
 * then update this table.
 */
import type { Basket } from "@/lib/types";

const CATEGORY_TO_BASKET: Record<string, Basket> = {
  // mandatory_regular — predictable, recurring
  rent: "mandatory_regular",
  housing: "mandatory_regular",
  utilities: "mandatory_regular",
  electricity: "mandatory_regular",
  phone: "mandatory_regular",
  internet: "mandatory_regular",
  insurance: "mandatory_regular",
  loan: "mandatory_regular",
  "public transport": "mandatory_regular",
  // Debatable — groceries are needed every week, but part of a grocery bill
  // can be "everyday" treats. Team call.
  groceries: "mandatory_regular",

  // mandatory_irregular — necessary, but surprise timing/amount
  healthcare: "mandatory_irregular",
  pharmacy: "mandatory_irregular",
  "home repair": "mandatory_irregular",
  "car repair": "mandatory_irregular",
  appliances: "mandatory_irregular",

  // everyday — the stuff that "slips through your fingers"
  cafes: "everyday",
  restaurants: "everyday",
  takeaway: "everyday",
  taxi: "everyday",
  entertainment: "everyday",
  clothing: "everyday",
  shopping: "everyday",
};

/**
 * WHY default to "everyday": an unknown category is most likely discretionary
 * spending. It also makes gaps in the table visible (everything piles up in
 * one basket), instead of silently hiding them.
 */
const DEFAULT_BASKET: Basket = "everyday";

export function classifyBasket(category: string): Basket {
  return CATEGORY_TO_BASKET[category.trim().toLowerCase()] ?? DEFAULT_BASKET;
}
