/**
 * /dev — TEAM HUB: the one page that links to everything (pages, data files,
 * tools, docs). Reached from the small 🛠 button, far bottom-right of the browser window.
 * Hide it before the demo: SHOW_DEV_BUTTON in components/DevButton.tsx.
 */
import Link from "next/link";
import { getCustomerId } from "@/lib/data";
import { listDataFiles } from "@/lib/data/files";
import { getAiConfig } from "@/lib/ai/config";
import { Code, DevPage, Section } from "@/components/dev/DevPage";
import { ForPickedCustomer } from "@/components/dev/ForPickedCustomer";

const PAGES = [
  {
    href: "/data",
    title: "Data overview",
    text: "Example transactions, the 3 baskets, the 15 categories, every chart type, comparison with people the same age.",
  },
  {
    href: "/customer_profiles",
    title: "Customer profiles",
    text: "All demo customers grouped by spending type — pick one to use.",
  },
  {
    href: "/api/health",
    title: "Health check",
    text: "Is the data loading? Which AI settings are active? (add ?ping=1 to test the AI)",
  },
];

const WHO_OWNS_WHAT = [
  ["Data", "lib/data/", "loading data, baskets, all the number crunching"],
  ["AI", "lib/ai/", "the coach: prompt, tools, talking to the AI"],
  ["UI", "app/, components/", "screens, chat, charts, look & feel"],
  ["Insights", "lib/insights/", "comparisons, benchmarks, spender types"],
];

const viewUrl = (p: string) => `/api/data-file?path=${encodeURIComponent(p)}`;

export default function DevHub() {
  return <ForPickedCustomer render={DevHubBody} />;
}

function DevHubBody() {
  const ai = getAiConfig();
  const files = listDataFiles();
  const current = getCustomerId();
  const general = files.filter(
    (f) => !f.path.startsWith("demo/CUST") && !f.path.startsWith("raw/"),
  );
  const customers = files.filter((f) => f.path.startsWith("demo/CUST"));
  const raw = files.filter((f) => f.path.startsWith("raw/"));

  return (
    <DevPage
      title="Team hub"
      intro={
        <>
          <b>Everything for the team starts here.</b> You only need to remember the small <b>🛠</b>{" "}
          in the far bottom-right corner (or <Code>localhost:3000/dev</Code>). Not part of the
          product.
        </>
      }
    >
      <Section title="Right now">
        <ul className="space-y-1 text-sm">
          <li>
            Demo customer: <Code>{current}</Code>
          </li>
          <li>
            AI: <Code>{ai.mode === "mock" ? "mock (no real AI)" : ai.model}</Code>
          </li>
          <li className="text-xs text-muted">
            Switch customer with the dark <b>DEMO</b> bar at the top (per device; the default is{" "}
            <Code>DEMO_CUSTOMER_ID</Code> in <Code>.env.local</Code>). AI settings are in{" "}
            <Code>.env.local</Code>.
          </li>
        </ul>
      </Section>

      <Section title="Team pages">
        <div className="space-y-2">
          {PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="block rounded-lg border border-line p-3 hover:border-accent"
            >
              <div className="font-medium text-accent">{p.title} →</div>
              <div className="text-xs text-muted">{p.text}</div>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        title="Data files"
        note={
          <>
            Everything in the <Code>data/</Code> folder. &ldquo;View&rdquo; opens the raw file in
            the browser.
          </>
        }
      >
        <div className="space-y-3">
          {general.map((f) => (
            <div key={f.path} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <Code>data/{f.path}</Code>
                <a href={viewUrl(f.path)} target="_blank" className="text-xs text-accent underline">
                  View
                </a>
              </div>
              <p className="mt-1 text-xs text-muted">
                {f.description} · {f.sizeKb} KB
              </p>
            </div>
          ))}

          <div className="rounded-lg border border-line p-3">
            <div className="text-sm">
              <Code>data/demo/CUST….json</Code> — {customers.length} demo customers
            </div>
            <p className="mt-1 text-xs text-muted">
              One file per customer: profile + all their transactions. Summaries on{" "}
              <Link href="/customer_profiles" className="text-accent underline">
                Customer profiles
              </Link>
              . Tap one to view its raw file:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {customers.map((f) => {
                const id = f.path.slice(5, -5);
                return (
                  <a
                    key={f.path}
                    href={viewUrl(f.path)}
                    target="_blank"
                    className={`rounded border px-1.5 py-0.5 text-[11px] ${
                      id === current ? "border-accent font-semibold text-accent" : "border-line"
                    }`}
                  >
                    {id}
                  </a>
                );
              })}
            </div>
          </div>

          {raw.length > 0 && (
            <div className="rounded-lg border border-line p-3">
              <div className="text-sm">
                <Code>data/raw/</Code> — original dataset (not in git)
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {raw.map((f) => (
                  <li key={f.path}>
                    {f.path.slice(4)} · {(f.sizeKb / 1024).toFixed(1)} MB
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted">
            Remake them: <Code>npm run prepare-data</Code> (customers) ·{" "}
            <Code>npm run benchmarks</Code> (benchmarks). Both need <Code>data/raw/</Code> — see
            README.
          </p>
        </div>
      </Section>

      <Section
        title="Who works where"
        note="One person per area → fewer merge conflicts. lib/types.ts is shared by everyone."
      >
        <table className="w-full text-sm">
          <tbody>
            {WHO_OWNS_WHAT.map(([who, where, what]) => (
              <tr key={who} className="border-t border-line align-top">
                <td className="py-1.5 pr-2 font-medium">{who}</td>
                <td className="pr-2">
                  <Code>{where}</Code>
                </td>
                <td className="text-xs text-muted">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Docs in the repo">
        <ul className="space-y-1 text-sm">
          <li>
            <Code>README.md</Code> — setup, how the code runs, git workflow
          </li>
          <li>
            <Code>DECISIONS.md</Code> — why things are the way they are
          </li>
        </ul>
      </Section>
    </DevPage>
  );
}
