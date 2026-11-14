/**
 * Loads the demo customer's data from data/demo/<CUSTOMER_ID>.json.
 * SERVER ONLY — never import this from a "use client" component.
 *
 * WHY small per-customer JSON files instead of the full 346 MB CSV:
 * - the big CSV is too large for git, Vercel and fast startup
 * - the app only ever shows ONE person's data ("chat with your own money")
 * scripts/prepare-data.mjs creates these files from the raw CSV.
 *
 * WHY "MOCK" is the default: data/demo/MOCK.json is generated fake data that
 * is committed to the repo, so the app runs before anyone has downloaded
 * the real dataset. Set DEMO_CUSTOMER_ID in .env.local to use a real customer.
 */
import fs from "node:fs";
import path from "node:path";
import type { Customer, Transaction } from "@/lib/types";
import { classifyBasket } from "./baskets";

/** Shape of data/demo/<id>.json, written by scripts/prepare-data.mjs. */
type DemoFile = {
  customer: Customer;
  transactions: Omit<Transaction, "basket">[];
};

export type CustomerData = {
  customer: Customer;
  transactions: Transaction[]; // sorted by date, oldest first
};

let cache: { id: string; data: CustomerData } | null = null;

export function getCustomerId(): string {
  return process.env.DEMO_CUSTOMER_ID || "MOCK";
}

export function loadCustomerData(): CustomerData {
  const id = getCustomerId();
  if (cache && cache.id === id) return cache.data;

  const file = path.join(process.cwd(), "data", "demo", `${id}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `No data file for customer "${id}" at ${file}. ` +
        `Run "npm run prepare-data" (see README) or unset DEMO_CUSTOMER_ID.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as DemoFile;

  // WHY baskets are added here, not in the prepare script: changing the
  // basket rules in baskets.ts then takes effect immediately, with no need
  // to re-run the slow CSV preparation.
  const transactions = raw.transactions
    .map((t) => ({ ...t, basket: classifyBasket(t.category) }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp),
    );

  const data = { customer: raw.customer, transactions };
  cache = { id, data };
  return data;
}
