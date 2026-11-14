/**
 * Generates data/demo/MOCK.json — FAKE data so the app runs before anyone
 * has the real dataset. Same shape as the files prepare-data.mjs writes.
 *
 * Run: npm run mock-data
 *
 * WHY deterministic (seeded random): everyone on the team gets the exact
 * same mock data, so "I see €42 but you see €57" never happens.
 * WHY 180 days ending 2026-11-13: half a year of history gives trends and
 * "last month" comparisons something to show.
 */
import fs from "node:fs";
import path from "node:path";

let seed = 42;
function rand() {
  // Mulberry32 — tiny seeded random number generator.
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min, max) => Math.round((min + rand() * (max - min)) * 100) / 100;

const END = new Date("2026-11-13T00:00:00Z");
const DAYS = 180;
const iso = (d) => d.toISOString().slice(0, 10);

const transactions = [];
let balance = 2500;
let n = 0;
function add(date, category, amount, mcc, merchant) {
  balance = Math.round((balance + amount) * 100) / 100;
  n++;
  transactions.push({
    customerId: "MOCK",
    accountId: "ACC-MOCK-1",
    date,
    timestamp: `${date}T${String(8 + (n % 12)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00`,
    category,
    amountEur: amount,
    balanceAfterEur: balance,
    transactionType: amount < 0 ? "debit" : "credit",
    merchantId: merchant,
    mccCode: mcc,
  });
}

for (let i = DAYS - 1; i >= 0; i--) {
  const d = new Date(END);
  d.setUTCDate(d.getUTCDate() - i);
  const date = iso(d);
  const dom = d.getUTCDate();
  const dow = d.getUTCDay();

  // Income and mandatory_regular — fixed days each month
  if (dom === 1) add(date, "Salary", 2650, "0000", "M-EMPLOYER");
  if (dom === 2) add(date, "Rent", -890, "6513", "M-LANDLORD");
  if (dom === 5) add(date, "Phone", -24.9, "4814", "M-TELCO");
  if (dom === 10) add(date, "Insurance", -38.5, "6300", "M-INSURER");
  if (dom === 15) add(date, "Electricity", -between(35, 70), "4900", "M-POWER");
  if (dom === 3) add(date, "Public transport", -63.9, "4111", "M-HSL");

  // Groceries 2–3x a week
  if (dow === 1 || dow === 4 || (dow === 6 && rand() < 0.6))
    add(date, "Groceries", -between(18, 85), "5411", "M-GROCER-" + Math.floor(rand() * 3));

  // Everyday spending — the "slips through your fingers" basket
  if (dow >= 1 && dow <= 5 && rand() < 0.55) add(date, "Cafes", -between(3.2, 7.5), "5814", "M-CAFE");
  if (rand() < 0.18) add(date, "Restaurants", -between(12, 48), "5812", "M-RESTO");
  if (rand() < 0.12) add(date, "Takeaway", -between(14, 32), "5814", "M-DELIVERY");
  if ((dow === 5 || dow === 6) && rand() < 0.35) add(date, "Taxi", -between(11, 34), "4121", "M-TAXI");
  if (rand() < 0.06) add(date, "Clothing", -between(25, 110), "5651", "M-CLOTHES");
  if (rand() < 0.07) add(date, "Entertainment", -between(9, 45), "7832", "M-FUN");

  // mandatory_irregular — rare surprises
  if (rand() < 0.012) add(date, "Healthcare", -between(40, 180), "8011", "M-CLINIC");
  if (rand() < 0.02) add(date, "Pharmacy", -between(8, 40), "5912", "M-PHARMACY");
  if (i === 47) add(date, "Home repair", -349, "5722", "M-APPLIANCE"); // broken washing machine
}

const out = {
  customer: { customerId: "MOCK", postalCode: "00100", age: 27 },
  transactions,
};
const file = path.join(process.cwd(), "data", "demo", "MOCK.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`Wrote ${transactions.length} mock transactions to ${file}`);
