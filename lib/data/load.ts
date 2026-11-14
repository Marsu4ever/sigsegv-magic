/**
 * Loads customer data from data/demo/<CUSTOMER_ID>.json.
 * SERVER ONLY — never import this from a "use client" component.
 *
 * WHY small per-customer JSON files instead of the full 346 MB CSV:
 * - the big CSV is too large for git, Vercel and fast startup
 * - the app only ever shows ONE person's data ("chat with your own money")
 * scripts/prepare-data.mjs creates these files from the raw CSV.
 *
 * Which customer the app shows: DEMO_CUSTOMER_ID in .env.local.
 * "MOCK" (fake data, generated) is the fallback if it's not set.
 */
import fs from "node:fs";
import path from "node:path";
import type { Customer, Transaction } from "@/lib/types";
import { classifyBasket } from "./baskets";

const DEMO_DIR = path.join(process.cwd(), "data", "demo");

/** Shape of data/demo/<id>.json, written by scripts/prepare-data.mjs. */
type DemoFile = {
  customer: Customer;
  transactions: Omit<Transaction, "basket">[];
};

export type CustomerData = {
  customer: Customer;
  transactions: Transaction[]; // sorted by date, oldest first
};

const cache = new Map<string, CustomerData>();

export function getCustomerId(): string {
  return process.env.DEMO_CUSTOMER_ID || "MOCK";
}

/** All customer ids that have a file in data/demo/ (MOCK last). */
export function listDemoCustomerIds(): string[] {
  if (!fs.existsSync(DEMO_DIR)) return [];
  return fs
    .readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -5))
    .sort((a, b) => (a === "MOCK" ? 1 : b === "MOCK" ? -1 : a.localeCompare(b)));
}

/** Load any demo customer by id. */
export function loadCustomerFile(id: string): CustomerData {
  const cached = cache.get(id);
  if (cached) return cached;

  const file = path.join(DEMO_DIR, `${id}.json`);
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
    .map((t) => ({ ...t, basket: classifyBasket(t.category, t.mccCode) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp));

  const data = { customer: raw.customer, transactions };
  cache.set(id, data);
  return data;
}

/** The customer the app is currently showing (DEMO_CUSTOMER_ID). */
export function loadCustomerData(): CustomerData {
  return loadCustomerFile(getCustomerId());
}

/** Category list with counts across ALL customers (data/demo/_categories.json). */
export function getDatasetCategories(): { category: string; count: number }[] {
  const file = path.join(DEMO_DIR, "_categories.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
}
