/**
 * MOCK AI — fake replies chosen by keywords. No LLM, no API key needed.
 *
 * WHY: lets the UI person build and test the chat (text + chart cards)
 * before we have a model. It still uses the REAL tools and data, so it
 * also tests the data → chart pipeline end to end.
 *
 * Used automatically when LLM_BASE_URL / LLM_MODEL are not set, or AI_MODE=mock.
 */
import type { ChartSpec, ChatMessage } from "@/lib/types";
import { allMerchantTypes, listCategories } from "@/lib/data";
import { runTool } from "./tools";

function chart(args: Record<string, unknown>): ChartSpec | undefined {
  return runTool("show_chart", args).chart;
}

function total(c?: ChartSpec): string {
  const sum = (c?.rows ?? []).reduce((s, r) => s + r.value, 0);
  return sum.toFixed(2);
}

export function mockReply(history: ChatMessage[]): ChatMessage {
  const q = (history.at(-1)?.text ?? "").toLowerCase();
  const reply = (text: string, c?: ChartSpec): ChatMessage => ({
    role: "assistant",
    text: `[mock AI] ${text}`,
    charts: c ? [c] : [],
  });

  if (q.includes("basket")) {
    const c = chart({
      chart_type: "pie",
      title: "This month by basket",
      data_tool: "basket_breakdown",
      data_args: { period: "this_month" },
    });
    return reply(
      `This month you've spent €${total(c)} in total. Here's how it splits across your 3 baskets.`,
      c,
    );
  }

  if (q.includes("trend") || q.includes("over time")) {
    const c = chart({
      chart_type: "line",
      title: "Weekly spending, last 90 days",
      data_tool: "spend_over_time",
      data_args: { period: "last_90_days", group_by: "week" },
    });
    return reply("Here's your weekly spending over the last 90 days.", c);
  }

  // Match a category or merchant type; "taxis" matches "Taxi" via its stem.
  const category = [...listCategories(), ...allMerchantTypes()].find((cat) =>
    q.includes(cat.toLowerCase()),
  );
  if (category) {
    const c = chart({
      chart_type: "table",
      title: `${category}, last month`,
      data_tool: "spend_by_category",
      data_args: { period: "last_month", category },
    });
    return reply(`Last month you spent €${total(c)} on ${category}.`, c);
  }

  if (q.includes("week")) {
    // WHY last 7 days: the dataset ends mid-week (same rule as the Week tab).
    const c = chart({
      chart_type: "bar",
      title: "Last 7 days by category",
      data_tool: "spend_by_category",
      data_args: { period: "last_7_days" },
    });
    return reply(`In the last 7 days you've spent €${total(c)}.`, c);
  }

  return reply(
    'I\'m a placeholder until the real AI is connected. Try: "my baskets", "this week", ' +
      '"spending trend", or a category name like "taxi".',
  );
}
