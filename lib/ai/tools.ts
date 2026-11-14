/**
 * TOOLS — the functions the AI is allowed to call. Owner: AI person.
 *
 * HOW IT WORKS:
 * 1. We send the LLM the list of tools below (name + description + JSON schema).
 * 2. The LLM answers "call spend_by_category with {period: 'last_month'}".
 * 3. runTool() runs our real data function and returns the result as JSON.
 * 4. The LLM reads the result and writes the answer.
 *
 * WHY: the AI never does math on raw transactions. Numbers come from tested
 * code in lib/data, so the coach is trustworthy.
 *
 * TO ADD A TOOL (e.g. whatIf, safeToSpend later):
 *   - write the function in lib/data or lib/insights
 *   - add a definition to TOOL_DEFINITIONS
 *   - add a case to runTool()
 */
import type { Basket, ChartSpec, ChartType, DateRange } from "@/lib/types";
import type { ToolDefinition } from "./llm";
import { BASKETS, BASKET_LABELS } from "@/lib/types";
import {
  PERIODS,
  basketBreakdown,
  listTransactions,
  periodToRange,
  spendByCategory,
  spendOverTime,
  type Period,
} from "@/lib/data";

// ─── Shared argument schema pieces ───────────────────────────────────────

const periodArgs = {
  period: {
    type: "string",
    enum: [...PERIODS],
    description: "Named time period, relative to today in the data.",
  },
  from: { type: "string", description: "Optional exact start date YYYY-MM-DD. Overrides period." },
  to: { type: "string", description: "Optional exact end date YYYY-MM-DD. Overrides period." },
} as const;

const DATA_TOOL_NAMES = [
  "spend_by_category",
  "basket_breakdown",
  "spend_over_time",
  "list_transactions",
] as const;
type DataToolName = (typeof DATA_TOOL_NAMES)[number];

// ─── Definitions sent to the LLM ─────────────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "spend_by_category",
      description:
        "Total euros spent per category in a period, biggest first. Optional `category` filters by name (e.g. 'taxi').",
      parameters: {
        type: "object",
        properties: { ...periodArgs, category: { type: "string" } },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "basket_breakdown",
      description:
        "Total euros spent in each of the 3 baskets (mandatory_regular, mandatory_irregular, everyday) in a period.",
      parameters: {
        type: "object",
        properties: { ...periodArgs },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spend_over_time",
      description:
        "Euros spent over time, grouped by day, week or month. Optional `category` filter. Good for trends.",
      parameters: {
        type: "object",
        properties: {
          ...periodArgs,
          group_by: { type: "string", enum: ["day", "week", "month"] },
          category: { type: "string" },
        },
        required: ["period", "group_by"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_transactions",
      description:
        "The most recent individual transactions in a period (newest first). Optional category or basket filter.",
      parameters: {
        type: "object",
        properties: {
          ...periodArgs,
          category: { type: "string" },
          basket: { type: "string", enum: [...BASKETS] },
          limit: { type: "number", description: "Max rows, default 10, max 30." },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_chart",
      description:
        "Show the user a chart or table in the chat. You choose the chart type, title and which data tool + arguments " +
        "provide the numbers. The server runs that tool itself, so the chart is always exact.",
      parameters: {
        type: "object",
        properties: {
          chart_type: { type: "string", enum: ["bar", "line", "pie", "table"] },
          title: { type: "string" },
          data_tool: {
            type: "string",
            enum: ["spend_by_category", "basket_breakdown", "spend_over_time"],
          },
          data_args: {
            type: "object",
            description: "Arguments for data_tool, same as calling it directly.",
            // WHY listed explicitly: some models (e.g. Gemini) reject an
            // "object" parameter that has no properties.
            properties: {
              ...periodArgs,
              group_by: { type: "string", enum: ["day", "week", "month"] },
              category: { type: "string" },
            },
            required: ["period"],
          },
        },
        required: ["chart_type", "title", "data_tool", "data_args"],
      },
    },
  },
];

// ─── Running a tool ──────────────────────────────────────────────────────

export type ToolResult = {
  /** JSON string sent back to the LLM. */
  content: string;
  /** Set only by show_chart — the UI renders it. */
  chart?: ChartSpec;
};

type Args = Record<string, unknown>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * WHY validate: LLMs sometimes send wrong or missing arguments. We fall back
 * to safe defaults instead of crashing, and the LLM sees what range was used.
 */
function rangeFromArgs(args: Args): DateRange {
  const period = (PERIODS as readonly string[]).includes(String(args.period))
    ? (args.period as Period)
    : "last_30_days";
  const range = periodToRange(period);
  if (typeof args.from === "string" && DATE_RE.test(args.from)) range.from = args.from;
  if (typeof args.to === "string" && DATE_RE.test(args.to)) range.to = args.to;
  return range;
}

function optString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** Runs a data tool and returns chart-ready rows (used by show_chart too). */
function runDataTool(name: DataToolName, args: Args) {
  const range = rangeFromArgs(args);
  switch (name) {
    case "spend_by_category":
      return { range, rows: spendByCategory(range, optString(args.category)) };
    case "basket_breakdown": {
      const totals = basketBreakdown(range);
      return {
        range,
        rows: BASKETS.map((b) => ({ label: BASKET_LABELS[b], value: totals[b] })),
      };
    }
    case "spend_over_time": {
      const g = args.group_by;
      const groupBy = g === "day" || g === "week" || g === "month" ? g : "week";
      return { range, rows: spendOverTime(range, groupBy, optString(args.category)) };
    }
    case "list_transactions": {
      const basket = BASKETS.includes(args.basket as Basket) ? (args.basket as Basket) : undefined;
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
      const txs = listTransactions(range, { category: optString(args.category), basket, limit });
      return {
        range,
        // WHY trimmed fields: fewer tokens, and the LLM only needs these.
        transactions: txs.map((t) => ({
          date: t.date,
          category: t.category,
          amountEur: t.amountEur,
          basket: t.basket,
        })),
      };
    }
  }
}

export function runTool(name: string, args: Args): ToolResult {
  if ((DATA_TOOL_NAMES as readonly string[]).includes(name)) {
    return { content: JSON.stringify(runDataTool(name as DataToolName, args)) };
  }

  if (name === "show_chart") {
    const dataTool = String(args.data_tool);
    if (
      !(DATA_TOOL_NAMES as readonly string[]).includes(dataTool) ||
      dataTool === "list_transactions"
    ) {
      return { content: JSON.stringify({ error: `Unknown data_tool "${dataTool}"` }) };
    }
    // WHY parse strings: some models send nested objects as a JSON string.
    let dataArgs: unknown = args.data_args;
    if (typeof dataArgs === "string") {
      try {
        dataArgs = JSON.parse(dataArgs);
      } catch {
        dataArgs = {};
      }
    }
    if (typeof dataArgs !== "object" || dataArgs === null) dataArgs = {};
    const result = runDataTool(dataTool as DataToolName, dataArgs as Args);
    const rows = ("rows" in result && result.rows) || [];
    const type = (["bar", "line", "pie", "table"] as const).includes(args.chart_type as ChartType)
      ? (args.chart_type as ChartType)
      : "bar";
    const chart: ChartSpec = {
      type,
      title: optString(args.title) ?? "Your spending",
      unit: "€",
      rows,
    };
    return {
      content: JSON.stringify({ shown: true, rows: rows.length, range: result.range }),
      chart,
    };
  }

  return { content: JSON.stringify({ error: `Unknown tool "${name}"` }) };
}
