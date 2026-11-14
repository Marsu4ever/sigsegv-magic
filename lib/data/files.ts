/**
 * Catalog of the data files in data/ — what each one is, for the /dev hub.
 * SERVER ONLY.
 *
 * WHY: so nobody has to remember file names; the hub lists them all with a
 * "view" link (served read-only by app/api/data-file/route.ts).
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

export type DataFile = {
  path: string; // relative to data/, e.g. "demo/CUST00313.json"
  sizeKb: number;
  description: string;
  viewable: boolean; // served by /api/data-file (small JSON files only)
};

function sizeKb(rel: string): number {
  return Math.round(fs.statSync(path.join(DATA_DIR, rel)).size / 1024);
}

const DESCRIPTIONS: Record<string, string> = {
  "benchmarks.json":
    "Averages from ALL 5,100 customers, per month, by age group (made by npm run benchmarks). Used for 'compared with people your age'.",
  "demo/_categories.json": "The 15 dataset categories with how many transactions each has.",
  "demo/MOCK.json": "Fake customer (generated) — fallback when no real customer is set.",
};

/** Every file in data/ the team might want to look at. */
export function listDataFiles(): DataFile[] {
  const out: DataFile[] = [];
  const add = (rel: string, description: string, viewable: boolean) => {
    if (fs.existsSync(path.join(DATA_DIR, rel))) {
      out.push({ path: rel, sizeKb: sizeKb(rel), description, viewable });
    }
  };

  add("benchmarks.json", DESCRIPTIONS["benchmarks.json"], true);
  add("demo/_categories.json", DESCRIPTIONS["demo/_categories.json"], true);
  add("demo/MOCK.json", DESCRIPTIONS["demo/MOCK.json"], true);

  const demoDir = path.join(DATA_DIR, "demo");
  if (fs.existsSync(demoDir)) {
    for (const f of fs.readdirSync(demoDir).sort()) {
      if (/^CUST\d+\.json$/.test(f)) {
        add(`demo/${f}`, "One demo customer: profile + all their transactions (+ home loan, if any).", true);
      }
    }
  }

  const rawDir = path.join(DATA_DIR, "raw");
  if (fs.existsSync(rawDir)) {
    for (const f of fs.readdirSync(rawDir).sort()) {
      if (f.endsWith(".csv")) {
        add(
          `raw/${f}`,
          f.startsWith("mtg_")
            ? "Original mortgage file (not in git). Its 12+ demo customers are already in data/demo/."
            : "Original dataset file (not in git — too big). Open it from your file browser.",
          false,
        );
      }
    }
  }
  return out;
}

/** Read a viewable file — only names from listDataFiles() are allowed. */
export function readDataFile(rel: string): string | null {
  const file = listDataFiles().find((f) => f.path === rel && f.viewable);
  return file ? fs.readFileSync(path.join(DATA_DIR, file.path), "utf8") : null;
}
