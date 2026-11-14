/**
 * Builds data/benchmarks.json — "what's normal" averages from ALL 5,100
 * customers, so the app can say "you spend more on restaurants than most
 * people your age" without storing everyone's data.
 *
 * Run: npm run benchmarks   (needs data/raw/ — see README "Real data setup")
 * Output: data/benchmarks.json (small — commit it)
 *
 * WHAT IT COMPUTES, per customer first, then summarized per group:
 * - average spending PER MONTH in each category (e.g. Restaurants €312/month)
 * - total spending per month, income per month
 * Groups: everyone ("all") + age groups (18-25, 26-35, 36-50, 51-65, 66+).
 * For each number: mean (average), median (the middle person — less
 * skewed by a few big spenders), p25 and p75 (the "typical range").
 *
 * WHY per category and not per basket: categories are facts from the
 * dataset; baskets are our own interpretation and may change. Basket
 * comparisons can add up category means at runtime (see lib/insights).
 *
 * WHY "per month": customers differ in how long they've been in the data;
 * per-month makes everyone comparable. Months = calendar months from a
 * customer's first to last transaction.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const RAW = path.join(process.cwd(), "data", "raw");
const TX_FILE = path.join(RAW, "tx_junction_transactions.csv");
const CUST_FILE = path.join(RAW, "tx_customers_junction.csv");
const OUT = path.join(process.cwd(), "data", "benchmarks.json");

// Same rule as isSpending() in lib/data/index.ts — keep them in sync.
const NOT_SPENDING = new Set(["invest deposit", "invest withdraw", "salary sweep"]);
const INCOME = new Set(["salary", "other income"]);

const AGE_GROUPS = [
  { label: "18-25", min: 18, max: 25 },
  { label: "26-35", min: 26, max: 35 },
  { label: "36-50", min: 36, max: 50 },
  { label: "51-65", min: 51, max: 65 },
  { label: "66+", min: 66, max: 200 },
];

function ageGroup(age) {
  return AGE_GROUPS.find((g) => age >= g.min && age <= g.max)?.label ?? "unknown";
}

// ─── CSV reading (same approach as prepare-data.mjs) ────────────────────
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
async function eachRow(file, onRow) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let header = null;
  for await (const rawLine of rl) {
    const line = header ? rawLine : rawLine.replace(/^﻿/, "");
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (!header) { header = cells.map((h) => h.trim()); continue; }
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    onRow(row);
  }
}
for (const f of [TX_FILE, CUST_FILE]) {
  if (!fs.existsSync(f)) {
    console.error(`Missing ${f}. Download the dataset into data/raw/ first (see README).`);
    process.exit(1);
  }
}

// ─── 1. Customers → age ──────────────────────────────────────────────────
const ageOf = new Map();
await eachRow(CUST_FILE, (r) => ageOf.set(r.customer_id, Number(r.customer_age)));

// ─── 2. Sum per customer ─────────────────────────────────────────────────
console.log("Scanning transactions…");
/** customer → { first, last, spend: {category: €}, income: € } */
const per = new Map();
const categories = new Set();
await eachRow(TX_FILE, (r) => {
  const amount = Number(r.tx_amount_eur);
  if (Number.isNaN(amount)) return;
  let c = per.get(r.customer_id);
  if (!c) per.set(r.customer_id, (c = { first: r.tx_date, last: r.tx_date, spend: {}, income: 0 }));
  if (r.tx_date < c.first) c.first = r.tx_date;
  if (r.tx_date > c.last) c.last = r.tx_date;
  const cat = r.category;
  if (INCOME.has(cat.toLowerCase()) && amount > 0) c.income += amount;
  else if (amount < 0 && !NOT_SPENDING.has(cat.toLowerCase())) {
    c.spend[cat] = (c.spend[cat] ?? 0) + -amount;
    categories.add(cat);
  }
});
const CATS = [...categories].sort();
console.log(`  ${per.size} customers, ${CATS.length} spending categories`);

// ─── 3. Per-customer monthly numbers ─────────────────────────────────────
function monthsBetween(a, b) {
  const [y1, m1] = a.split("-").map(Number);
  const [y2, m2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}
const people = [];
for (const [id, c] of per) {
  const months = monthsBetween(c.first, c.last);
  const monthly = {};
  let total = 0;
  for (const cat of CATS) {
    monthly[cat] = (c.spend[cat] ?? 0) / months;
    total += monthly[cat];
  }
  people.push({ id, group: ageGroup(ageOf.get(id) ?? -1), monthly, total, income: c.income / months });
}

// ─── 4. Summaries ────────────────────────────────────────────────────────
const r2 = (n) => Math.round(n * 100) / 100;
function stats(values) {
  const v = [...values].sort((a, b) => a - b);
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  const mean = v.reduce((s, x) => s + x, 0) / (v.length || 1);
  return { mean: r2(mean), median: r2(q(0.5)), p25: r2(q(0.25)), p75: r2(q(0.75)) };
}
function summarize(group) {
  return {
    customers: group.length,
    totalSpendingPerMonth: stats(group.map((p) => p.total)),
    incomePerMonth: stats(group.map((p) => p.income)),
    categoriesPerMonth: Object.fromEntries(CATS.map((cat) => [cat, stats(group.map((p) => p.monthly[cat]))])),
  };
}
const groups = { all: summarize(people) };
for (const g of AGE_GROUPS) groups[g.label] = summarize(people.filter((p) => p.group === g.label));

const out = {
  description:
    "Monthly spending/income benchmarks from all customers in the S-Bank Junction 2026 dataset. " +
    "Built by scripts/build-benchmarks.mjs. Values in EUR per month. " +
    "mean = average, median = middle person, p25–p75 = typical range.",
  builtAt: new Date().toISOString().slice(0, 10),
  ageGroups: AGE_GROUPS.map((g) => g.label),
  categories: CATS,
  groups,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
for (const [k, g] of Object.entries(groups)) {
  console.log(`  ${k.padEnd(6)} ${String(g.customers).padStart(5)} customers · median spending €${g.totalSpendingPerMonth.median}/month`);
}
