/**
 * Turns the big raw CSV (~346 MB) into small per-customer JSON files the app loads.
 *
 * Run: npm run prepare-data                     → picks the 3 customers with the most transactions
 *      npm run prepare-data -- --count 5        → picks the top 5
 *      npm run prepare-data -- --customers CUST00001,CUST00042
 *
 * Input:  data/raw/tx_junction_transactions.csv, data/raw/tx_customers_junction.csv
 * Output: data/demo/<customer_id>.json   (one per customer — commit these)
 *         data/demo/_categories.json     (every category + how often it appears,
 *                                         across ALL customers → use it to fix lib/data/baskets.ts)
 *
 * WHY streaming line by line: loading 346 MB into memory at once is slow and
 * can crash Node. Reading line by line uses little memory.
 * WHY no npm packages: one less thing to install or break at a hackathon.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const RAW = path.join(process.cwd(), "data", "raw");
const OUT = path.join(process.cwd(), "data", "demo");
const TX_FILE = path.join(RAW, "tx_junction_transactions.csv");
const CUST_FILE = path.join(RAW, "tx_customers_junction.csv");

// ─── Args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const wantedIds = argValue("--customers")?.split(",").map((s) => s.trim()).filter(Boolean);
const count = Number(argValue("--count") ?? 3);

// ─── CSV helpers ─────────────────────────────────────────────────────────

/** Parses one CSV line, handling "quoted, values" and "" escapes. */
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

/** Calls onRow(object) for every data row. Strips the UTF-8 BOM (see dataset README). */
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

/**
 * WHY: we haven't seen the real date format yet. Accepts "2026-11-13",
 * "2026-11-13 10:22:00" and Finnish "13.11.2026". Anything else is flagged.
 */
let badDates = 0;
function normalizeDate(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  badDates++;
  return t;
}

/** Accepts "12.50" and "12,50". Counts anything unparseable. */
let badNumbers = 0;
function parseNum(s) {
  const n = Number(String(s).trim().replace(",", "."));
  if (Number.isNaN(n)) badNumbers++;
  return Number.isNaN(n) ? 0 : n;
}

function checkFile(file) {
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file}\nDownload the dataset into data/raw/ first (see README).`);
    process.exit(1);
  }
  const head = fs.readFileSync(file, { encoding: "utf8", flag: "r" }).slice(0, 60);
  if (head.startsWith("version https://git-lfs")) {
    console.error(`${file} is a Git LFS pointer, not the real data. Use "Download raw file" on GitHub (see README).`);
    process.exit(1);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────
checkFile(TX_FILE);
checkFile(CUST_FILE);
fs.mkdirSync(OUT, { recursive: true });

// Pass 1: count transactions per customer and per category.
console.log("Pass 1/2: scanning transactions…");
const perCustomer = new Map();
const perCategory = new Map();
let rows = 0;
await eachRow(TX_FILE, (r) => {
  rows++;
  perCustomer.set(r.customer_id, (perCustomer.get(r.customer_id) ?? 0) + 1);
  perCategory.set(r.category, (perCategory.get(r.category) ?? 0) + 1);
  if (rows % 500000 === 0) console.log(`  ${rows.toLocaleString()} rows…`);
});
console.log(`  ${rows.toLocaleString()} rows, ${perCustomer.size} customers, ${perCategory.size} categories`);

const categories = [...perCategory].sort((a, b) => b[1] - a[1]).map(([category, n]) => ({ category, count: n }));
fs.writeFileSync(path.join(OUT, "_categories.json"), JSON.stringify(categories, null, 1));
console.log("  wrote data/demo/_categories.json");

// Pick customers.
const ids = wantedIds?.length
  ? wantedIds
  : [...perCustomer].sort((a, b) => b[1] - a[1]).slice(0, count).map(([id]) => id);
const missing = ids.filter((id) => !perCustomer.has(id));
if (missing.length) console.warn(`  ⚠️ not found in data: ${missing.join(", ")}`);
const idSet = new Set(ids.filter((id) => perCustomer.has(id)));

// Customer info.
const customers = new Map();
await eachRow(CUST_FILE, (r) => {
  if (idSet.has(r.customer_id)) {
    customers.set(r.customer_id, {
      customerId: r.customer_id,
      postalCode: r.customer_postal_code, // WHY string: keeps leading zeros like "00990"
      age: Number(r.customer_age),
    });
  }
});

// Pass 2: collect those customers' transactions.
console.log(`Pass 2/2: extracting ${idSet.size} customer(s)…`);
const txs = new Map([...idSet].map((id) => [id, []]));
await eachRow(TX_FILE, (r) => {
  const list = txs.get(r.customer_id);
  if (!list) return;
  list.push({
    customerId: r.customer_id,
    accountId: r.bank_account_id,
    date: normalizeDate(r.tx_date),
    timestamp: r.tx_timestamp,
    category: r.category,
    amountEur: parseNum(r.tx_amount_eur),
    balanceAfterEur: parseNum(r.balance_after_eur),
    transactionType: r.transaction_type,
    merchantId: r.merchant_id,
    mccCode: r.mcc_code,
  });
});

for (const [id, list] of txs) {
  const customer = customers.get(id) ?? { customerId: id, postalCode: "", age: 0 };
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ customer, transactions: list }, null, 1));
  console.log(`  wrote data/demo/${id}.json (${list.length} transactions)`);
}
if (badDates) console.warn(`  ⚠️ ${badDates} dates in an unknown format — check normalizeDate()`);
if (badNumbers) console.warn(`  ⚠️ ${badNumbers} amounts could not be parsed — check parseNum()`);

// WHY print a sample: lets you check the sign convention (is spending negative?)
// assumed by isSpending() in lib/data/index.ts.
const sample = [...txs.values()][0]?.slice(0, 5) ?? [];
console.log("\nSample rows (check: is spending negative?):");
for (const t of sample) console.log(`  ${t.date}  ${t.category.padEnd(20)} ${t.amountEur}  (${t.transactionType})`);

console.log(
  `\nDone. To use one, put DEMO_CUSTOMER_ID=${[...idSet][0] ?? "<id>"} in .env.local and restart npm run dev.`,
);
