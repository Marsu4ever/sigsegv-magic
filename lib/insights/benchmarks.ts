/**
 * Peer comparison: "you vs people your age". Owner: INSIGHTS person. SERVER ONLY.
 *
 * Reads data/benchmarks.json (built from ALL 5,100 customers by
 * `npm run benchmarks`) and compares the demo customer against their age group.
 *
 * Not wired into the AI or the UI yet — that's a team decision. To let the AI
 * use it, add a tool in lib/ai/tools.ts that calls compareToPeers().
 */
import fs from "node:fs";
import path from "node:path";
import { getCustomer, getTransactions, isSpending, spentEur } from "@/lib/data";

type Stats = { mean: number; median: number; p25: number; p75: number };
type GroupSummary = {
  customers: number;
  totalSpendingPerMonth: Stats;
  incomePerMonth: Stats;
  categoriesPerMonth: Record<string, Stats>;
};
export type Benchmarks = {
  description: string;
  builtAt: string;
  ageGroups: string[];
  categories: string[];
  groups: Record<string, GroupSummary>;
};

let cache: Benchmarks | null | undefined;

/** The benchmarks file, or null if it hasn't been built. */
export function getBenchmarks(): Benchmarks | null {
  if (cache !== undefined) return cache;
  const file = path.join(process.cwd(), "data", "benchmarks.json");
  cache = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Benchmarks) : null;
  return cache;
}

/** Same age groups as scripts/build-benchmarks.mjs. */
export function ageGroupFor(age: number): string {
  if (age <= 25) return "18-25";
  if (age <= 35) return "26-35";
  if (age <= 50) return "36-50";
  if (age <= 65) return "51-65";
  return "66+";
}

export type PeerComparison = {
  ageGroup: string;
  peers: number; // how many customers are in the comparison group
  rows: {
    category: string;
    youPerMonth: number;
    peersMedian: number;
    peersTypicalRange: [number, number]; // p25–p75
  }[];
};

/**
 * The demo customer's average monthly spending per category, next to the
 * median person of their age group. Uses the customer's WHOLE history,
 * the same way the benchmarks were computed, so the numbers are comparable.
 */
export function compareToPeers(): PeerComparison | null {
  const bench = getBenchmarks();
  if (!bench) return null;
  const group = ageGroupFor(getCustomer().age);
  const peers = bench.groups[group];
  if (!peers) return null;

  const txs = getTransactions();
  if (txs.length === 0) return null;
  const [y1, m1] = txs[0].date.split("-").map(Number);
  const [y2, m2] = txs[txs.length - 1].date.split("-").map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1) + 1;

  const mine = new Map<string, number>();
  for (const t of txs) {
    if (isSpending(t)) mine.set(t.category, (mine.get(t.category) ?? 0) + spentEur(t));
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ageGroup: group,
    peers: peers.customers,
    rows: bench.categories.map((category) => {
      const s = peers.categoriesPerMonth[category];
      return {
        category,
        youPerMonth: r2((mine.get(category) ?? 0) / months),
        peersMedian: s?.median ?? 0,
        peersTypicalRange: [s?.p25 ?? 0, s?.p75 ?? 0] as [number, number],
      };
    }),
  };
}
