/**
 * AI connection doctor. Runs OUTSIDE Next.js, straight from Node, and tries
 * the AI provider several different ways so we can see exactly which way works.
 *
 * Run: npm run diagnose
 * Reads OPENROUTER_API_KEY / OPENROUTER_MODEL from .env.local. Never prints the key.
 * Free models only (same rule as lib/ai/config.ts): anything else is refused before sending.
 *
 * WHY: `curl` reached Gemini fine but the app (Node) timed out. This isolates
 * whether it's DNS, IPv4 vs IPv6, or Node's fetch (which the app uses).
 */
import fs from "node:fs";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";

// ─── Load .env.local (simple KEY=VALUE parser) ──────────────────────────
const env = {};
try {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.error("Could not read .env.local — run this from the project folder.");
  process.exit(1);
}
const base = "https://openrouter.ai/api/v1/";
const key = env.OPENROUTER_API_KEY;
// WHY not imported from lib/ai/config.ts: this plain Node script can't load TypeScript.
const model = env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free";
if (!key) {
  console.error("OPENROUTER_API_KEY must be set in .env.local");
  process.exit(1);
}
if (!model.endsWith(":free") && model !== "openrouter/free") {
  console.error(`Refusing "${model}": only free models (":free" or openrouter/free). See lib/ai/config.ts.`);
  process.exit(1);
}
const url = new URL("chat/completions", base);
const body = JSON.stringify({ model, messages: [{ role: "user", content: "Reply with just: ok" }] });
const TIMEOUT = 20_000;

console.log(`Node ${process.version} | host ${url.host} | model ${model} | key ${key ? "set" : "NOT set"}\n`);

// ─── Helpers ─────────────────────────────────────────────────────────────
function summarize(status, text) {
  let snippet = text.replace(/\s+/g, " ").slice(0, 120);
  try {
    const j = JSON.parse(text);
    snippet = j.choices?.[0]?.message?.content ?? j.error?.message ?? j[0]?.error?.message ?? snippet;
  } catch {}
  return `HTTP ${status} — ${String(snippet).slice(0, 120)}`;
}

/** Raw request with node:http(s), forcing IPv4 (family 4) or IPv6 (family 6). */
function rawRequest(family) {
  return new Promise((resolve) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "POST",
        family,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        timeout: TIMEOUT,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(summarize(res.statusCode, data)));
      },
    );
    req.on("timeout", () => req.destroy(new Error(`no answer in ${TIMEOUT / 1000}s`)));
    req.on("error", (e) => resolve(`FAILED — ${e.code ?? ""} ${e.message}`));
    req.end(body);
  });
}

async function viaFetch() {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return summarize(res.status, await res.text());
  } catch (e) {
    return `FAILED — ${e.name}: ${e.cause?.code ?? ""} ${e.message}`;
  }
}

async function step(name, fn) {
  const start = Date.now();
  const result = await fn();
  console.log(`${name.padEnd(28)} ${String(Date.now() - start).padStart(6)}ms  ${result}`);
}

// ─── Tests (one after another so they don't disturb each other) ─────────
await step("1. DNS lookup", async () => {
  try {
    const all = await dns.lookup(url.hostname, { all: true });
    return all.map((a) => `IPv${a.family}`).join(", ");
  } catch (e) {
    return `FAILED — ${e.message}`;
  }
});
await step("2. raw request over IPv4", () => rawRequest(4));
await step("3. raw request over IPv6", () => rawRequest(6));
await step("4. Node fetch (the app's way)", viaFetch);

console.log("\nPaste this whole output to Claude / the team.");
