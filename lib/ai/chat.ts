/**
 * The chat loop: user question → LLM → tools → LLM → answer. Owner: AI person.
 * SERVER ONLY. Called by app/api/chat/route.ts.
 *
 * WHY a loop: answering one question may take several tool calls
 * (e.g. this month's spending, then last month's, then a chart).
 * We cap the rounds so a confused model can't loop forever.
 *
 * DEBUGGING: every step logs a line starting with [ai] to the terminal
 * running `npm run dev`. If the chat hangs or fails, look there first.
 */
import type { ChartSpec, ChatMessage, GoalDraft, LessonSpec, LessonTopic, WhatIf } from "@/lib/types";
import {
  allMerchantTypes,
  getCustomer,
  getDataToday,
  getTransactions,
  listCategories,
} from "@/lib/data";
import { getAiConfig } from "./config";
import { LlmError, type LlmMessage } from "./llm";
import { askModel, LLM_TIMEOUT_MS } from "./openrouter";
import { getDefaultTarget } from "@/lib/insights/whatIfForecast";
import { buildSystemPrompt } from "./prompt";
import { TOOL_DEFINITIONS, autoChartArgs, isChartable, runTool, usesMonthsRange } from "./tools";
import { goalDraftText, mockReply, mockReplyWithTools } from "./mock";
import {
  answerAlreadyShown,
  askedAbout,
  buildLesson,
  lessonAskedFor,
  lessonInChat,
  lessonIsOpen,
  lessonLang,
  lessonOffer,
  lessonPromptInfo,
  lessonRequested,
  teachableTopic,
  type TeachContext,
} from "@/lib/education/topics";
import { splitFollowUp } from "@/lib/followUp";
import { noLongDashes } from "@/lib/noDashes";
import { euroAfter } from "@/lib/euroAfter";
import { moneyHealthNote } from "@/lib/insights/proactive";
import { getGoalState } from "@/lib/goals/state";
import { dropSentencesWith, euroAmounts, numbersIn, unsupportedAmounts } from "./amounts";

const MAX_TOOL_ROUNDS = 7;

/** The question points at the previous answer: "show IT over 12 months", "try AGAIN", "as a line". */
const REFERS_BACK = /\b(it|that|this|same|again|those)\b|^\s*(as|in) a\b/i;

/** The user asked to SEE something (a chart), not just for an answer. */
// WHY no plain "show": the coach's own buttons say "Show me how I could save", which isn't
// a chart request; it caused extra rounds and a "couldn't draw a chart" note.
const WANTS_CHART = /\b(graph|chart|plot|visuali[sz]e|diagram|line|bars?|pie)\b/i;

/** Data the server always draws if the model forgets show_chart: trends and the spender pie. */
const ALWAYS_DRAW = new Set(["money_over_time", "spender_profile"]);

/**
 * "last 7 months", "past 12 months", "half a year" in the question → 7 / 12 / 6.
 * WHY: the model sometimes turns "7 months" into last_7_days. The server reads the number
 * from the user's own words and puts it in the tool arguments.
 */
function monthsAsked(question: string): number | null {
  if (/\bhalf (a )?year\b|puoli vuotta/i.test(question)) return 6;
  const m = question.match(/\b(\d{1,2})\s*(months?|mo\b|kk\b|kuukau)/i);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 36 ? n : null;
}

/** Put the asked number of months into a tool's arguments, unless exact dates were given. */
function withMonths(args: Record<string, unknown>, months: number | null): Record<string, unknown> {
  if (!months || args.from || args.to || args.months === months) return args;
  const { period: _p, ...rest } = args;
  void _p;
  return { ...rest, months };
}


// WHY re-exported: /api/health imports it from here.
export { LLM_TIMEOUT_MS };

/**
 * Turns any LLM error into one clear sentence: what failed + the likely fix.
 * Shown in the chat and in the terminal.
 */
export function explainLlmError(err: unknown, model: string): string {
  if (!(err instanceof LlmError)) {
    return `Unexpected error in the AI code: ${err instanceof Error ? err.message : String(err)}`;
  }
  const from = `(model "${model}"${err.status ? `, HTTP ${err.status}` : ""})`;
  switch (err.kind) {
    case "timeout":
      return `LLM gave no answer within ${LLM_TIMEOUT_MS / 1000}s ${from}. Try again or try another model.`;
    case "network":
      return `Could not reach OpenRouter: ${err.message}. Check your internet.`;
    case "auth":
      return `OpenRouter rejected the API key ${from}: ${err.message}. Check OPENROUTER_API_KEY.`;
    case "not_found":
      return `OpenRouter says the model doesn't exist or has no free provider now ${from}: ${err.message}. Try another model from FREE_MODELS (lib/ai/config.ts).`;
    case "rate_limit":
      // WHY separate: "upstream" 429s mean the free model's shared pool is busy for everyone
      // (we hit this with Gemma, 16 Nov); our own daily quota is untouched.
      if (err.limitSource?.startsWith("upstream")) {
        return `The free AI model is busy right now. Please try again in a minute. ${from}: ${err.message}`;
      }
      // WHY worded for users: on the demo site this is the most likely error (free tier: 20
      // requests a minute, 50 a day). It's shown in the chat. Never solved by paying.
      return `The free AI quota is used up for now. Please try again in a minute; if it keeps happening, the daily free limit is reached and the coach is back tomorrow. ${from}: ${err.message}`;
    case "payment":
      return `OpenRouter asked for credits ${from}: ${err.message}. This app only uses free models and never pays, so the request was dropped. Check OPENROUTER_MODEL.`;
    case "overloaded":
      return `LLM is overloaded right now ${from}: ${err.message}. Try again in a moment or try another model.`;
    default:
      return `LLM error ${from}: ${err.message}`;
  }
}

function ms(start: number): string {
  return `${Date.now() - start}ms`;
}

/**
 * Chart safety net. WHY: real models sometimes answer in text only and forget
 * show_chart (Qwen did for "How are my 3 baskets looking?"). For the questions
 * the mock understands (baskets, calendar, month so far, slips away…) we add
 * the chart the mock would show — same keywords, same real data, same tools —
 * so the app looks the same with or without the real AI. The AI's text stays.
 */
/** Only the app's special views; a plain bar/pie from keywords could show the wrong period. */
const FALLBACK_TYPES = new Set(["baskets", "heatmap", "cumulative", "leaks"]);

function fallbackCharts(
  history: ChatMessage[],
  fetched: { tool: string; args: Record<string, unknown> } | null = null,
): ChartSpec[] {
  try {
    const found = (mockReply(history).charts ?? [])
      .filter((c) => FALLBACK_TYPES.has(c.type))
      // WHY: the baskets chart said "90 days" while the AI's text said "last 30 days".
      // Redraw it for the same period the AI looked at.
      .map((c) => {
        if (c.type !== "baskets" || !fetched || !/^basket_(breakdown|details)$/.test(fetched.tool)) return c;
        const same = runTool("show_chart", {
          chart_type: "baskets",
          title: "Your spending types",
          data_tool: "basket_details",
          data_args: fetched.args,
        }).chart;
        return same ?? c;
      });
    if (found.length > 0) {
      console.log(
        `[ai] model drew no chart — added ${found.map((c) => c.type).join(", ")} (keyword fallback)`,
      );
    }
    return found;
  } catch (err) {
    console.warn("[ai] chart fallback failed:", err);
    return [];
  }
}

/**
 * {measure: "income", months: 6} → "measure=income, months=6".
 * WHY: lets "now over 12 months" / "as a line" redo the same chart with changed arguments.
 * No brackets, so withoutOnScreenNotes() can still find the note's end.
 */
function argsText(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("/") : String(v)}`)
    .join(", ");
}

/**
 * Goal safety net. WHY: Qwen sometimes answered "save 1000 for a trip by June" with its own
 * arithmetic and no plan_goal call; the app check then got an empty reply. The mock parses the
 * sentence and calls the real plan_goal tool, so the card's numbers are exact.
 */
function fallbackGoal(history: ChatMessage[]): { goalDraft: GoalDraft } | null {
  try {
    const r = mockReply(history);
    if (!r.goalDraft) return null;
    console.log(`[ai] model made no goal draft — added "${r.goalDraft.name}" (keyword fallback)`);
    return { goalDraft: r.goalDraft };
  } catch (err) {
    console.warn("[ai] goal fallback failed:", err);
    return null;
  }
}

/**
 * Lesson safety net (PLAN-financial-education.md §4.6). WHY: the model may answer "What is an
 * emergency buffer?" in text and forget teach. When the user clearly asked for a lesson (tapped
 * its offer, or asked about its topic) we add the card. A clear ask may replay a seen lesson.
 */
function fallbackLessons(history: ChatMessage[]): LessonSpec[] {
  try {
    const topic = lessonAskedFor(history);
    const lesson = topic && buildLesson(topic, lessonLang(history), {}, history);
    if (!lesson) return [];
    console.log(`[ai] model called no teach — added lesson ${lesson.topic} (the user asked for it)`);
    return [lesson];
  } catch (err) {
    console.warn("[ai] lesson fallback failed:", err);
    return [];
  }
}

/**
 * The lesson chip under a reply (ChatMessage.lessonOffer), or undefined.
 * WHY decided here and not by the AI: Qwen kept its own "where could I save" button and almost
 * never offered a lesson, so lessons never came up in live mode. Now the same rule runs for the
 * mock and the real model: a teachable data tool ran this turn (e.g. the leaks chart) → offer that
 * lesson, unless it's been seen, a card is already shown, or the coach's own button offers it.
 */
function lessonOfferFor(
  history: ChatMessage[],
  seen: LessonTopic[],
  tools: string[],
  reply: ChatMessage,
): ChatMessage["lessonOffer"] {
  if (reply.lessons?.length) return undefined;
  const topic = teachableTopic(tools);
  if (!topic || !lessonIsOpen(topic, seen) || lessonInChat(topic, history)) return undefined;
  if (answerAlreadyShown(topic, history, reply.text)) return undefined;
  const followUp = splitFollowUp(reply.text).followUp;
  if (followUp && askedAbout(topic, followUp)) return undefined;
  console.log(`[ai] lesson chip: ${topic}`);
  return { topic, text: lessonOffer(topic, lessonLang(history)) };
}

/** Data tools behind the charts on a reply (for lessonOfferFor), e.g. a "leaks" chart → everyday_leaks. */
function toolsBehindCharts(charts: ChartSpec[]): string[] {
  return charts.flatMap((c) => (c.type === "leaks" ? ["everyday_leaks"] : []));
}

/**
 * At most ONE card per reply (team call, DECISIONS #68): a chart, the what-if view, a goal card
 * or a lesson card. WHY: two cards on a ~390 px phone pushed the answer off screen.
 * Which one stays, in this order:
 * 1. a lesson the user clearly asked for (tapped its chip, or asked about its topic);
 * 2. the goal card (it has the Save button: the user's next step);
 * 3. the what-if view (it is the chart for that answer);
 * 4. the first chart (the model's main one; later ones were extras);
 * 5. a lesson the model added on its own.
 * Returns the lesson that was dropped, so it can still be offered as a chip.
 */
function oneCard(reply: ChatMessage, history: ChatMessage[]): { reply: ChatMessage; droppedLesson?: LessonTopic } {
  const lesson = reply.lessons?.[0];
  const charts = reply.charts ?? [];
  const keep = (r: ChatMessage, why: string) => {
    console.log(`[ai] one card per reply: kept ${why}`);
    return r;
  };
  const cards = charts.length + (reply.whatIf ? 1 : 0) + (reply.goalDraft ? 1 : 0) + (lesson ? 1 : 0);
  if (cards <= 1 && (reply.lessons?.length ?? 0) <= 1) return { reply };
  const none = { charts: [], whatIf: undefined, goalDraft: undefined, lessons: undefined };
  if (lesson && lessonAskedFor(history) === lesson.topic) {
    return { reply: keep({ ...reply, ...none, lessons: [lesson] }, `lesson ${lesson.topic} (asked for)`) };
  }
  const droppedLesson = lesson?.topic;
  if (reply.goalDraft) return { reply: keep({ ...reply, ...none, goalDraft: reply.goalDraft }, "goal card"), droppedLesson };
  if (reply.whatIf) return { reply: keep({ ...reply, ...none, whatIf: reply.whatIf }, "what-if view"), droppedLesson };
  if (charts.length) return { reply: keep({ ...reply, ...none, charts: [charts[0]] }, `chart ${charts[0].type}`), droppedLesson };
  return { reply: keep({ ...reply, ...none, lessons: [lesson!] }, `lesson ${lesson!.topic}`) };
}

/** The reply text without its [[follow-up]] button and the short question just before it. */
function withoutFollowUp(text: string): string {
  const withoutButton = text.replace(/\s*\[\[.+?\]\]\s*/g, " ").trim();
  // Drop the matching question too ("Want to see how you could save?"), if it ends the reply.
  const sentences = withoutButton.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1 && sentences[sentences.length - 1].trim().endsWith("?")) sentences.pop();
  return sentences.join(" ").trim();
}

/**
 * Last step for every reply (live and mock): one card, then the lesson chip.
 * A dropped lesson becomes the chip (it was relevant, just not as a second card).
 * WHY no follow-up button with a lesson chip (team call): two suggestions in one reply split
 * the user's attention; the lesson is the one we want them to try. The button is removed from
 * the text too, so the model's history matches what the user saw.
 */
function finishReply(
  raw: ChatMessage,
  history: ChatMessage[],
  seen: LessonTopic[],
  tools: string[],
): ChatMessage {
  const { reply, droppedLesson } = oneCard(raw, history);
  const offer =
    droppedLesson &&
    lessonIsOpen(droppedLesson, seen) &&
    !lessonInChat(droppedLesson, history) &&
    !answerAlreadyShown(droppedLesson, history, reply.text)
      ? { topic: droppedLesson, text: lessonOffer(droppedLesson, lessonLang(history)) }
      : lessonOfferFor(history, seen, [...tools, ...toolsBehindCharts(reply.charts ?? [])], reply);
  if (!offer) return reply;
  console.log(`[ai] lesson chip ${offer.topic}: follow-up button removed`);
  return { ...reply, text: withoutFollowUp(reply.text), lessonOffer: offer };
}

/**
 * Mock AI + lessons, so the demo works without a model: a clear ask shows the card; otherwise the
 * mock's answer, with a lesson chip when it used a teachable tool (lessonOfferFor, same as live).
 */
function mockWithLessons(history: ChatMessage[], seen: LessonTopic[]): ChatMessage {
  const lang = lessonLang(history);
  const asked = lessonAskedFor(history);
  const lesson = asked && buildLesson(asked, lang, {}, history);
  if (lesson) {
    console.log(`[ai] mock: lesson ${lesson.topic}`);
    // WHY no text: the card is the whole answer (team call: nothing written above it).
    return { role: "assistant", text: "", charts: [], lessons: [lesson] };
  }
  const { reply, tools } = mockReplyWithTools(history);
  return finishReply(reply, history, seen, tools);
}

/**
 * One line telling the model what the user already sees under an earlier reply.
 * WHY: we send old replies as text only (charts would cost tokens), so the model didn't know
 * the leaks chart was already on screen and drew it again for every follow-up about a habit.
 */
function onScreen(m: ChatMessage): string {
  const shown = [
    ...(m.charts ?? []).map(
      (c) => `${c.type} chart "${c.title}"${c.source ? ` (made from ${c.source.tool}: ${argsText(c.source.args)})` : ""}`,
    ),
    ...(m.whatIf ? [`what-if view: ${m.whatIf.target.label}, ${m.whatIf.cutPct}% less`] : []),
    ...(m.goalDraft ? [`goal card "${m.goalDraft.name}" with a Save button`] : []),
    ...(m.lessons ?? []).map((l) => `lesson card ${l.topic}`),
  ];
  return shown.length ? `\n[On screen: ${shown.join("; ")}]` : "";
}

/**
 * "Couldn't get that number" sentences, from the app or copied by the model.
 * WHY strip them (from history AND replies): Qwen copies its own earlier replies, so one such
 * sentence turned into the same "I couldn't get that exact number…" on every answer (14 Nov).
 */
const COULDNT_GET = /(Sorry, )?I couldn'?t (get|work) (that|those)[^.!?\n]{0,30} from your data[.!]?\s*/gi;

function withoutCouldntGet(text: string): string {
  return text.replace(COULDNT_GET, "").trim();
}

/** Something besides the follow-up question and [[button]]? */
function hasStatement(text: string): boolean {
  return text
    .split("\n")
    .filter((l) => !/^\s*\[\[.*\]\]\s*$/.test(l))
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .some((sentence) => sentence.trim() && !sentence.trim().endsWith("?") && !/\[\[/.test(sentence));
}

// ─── No repeated follow-up buttons ───────────────────────────────────────

/** Words that don't say WHAT is offered ("Show me how I could save" → "save"). */
const FILLER = new Set(
  "show me my the a an i you we how where what could would can to on for of in and or see let s want more"
    .split(" "),
);

/** "Show me restaurant savings" → {"restaurant", "sav"} (lowercase, rough plural/verb ending cut). */
function offerWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-zåäö0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w && !FILLER.has(w))
      .map((w) => w.replace(/(ings|ing|es|s|e)$/, "")),
  );
}

/** Same offer? Equal content words, or 80 % overlap. */
function sameOffer(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  const shared = [...a].filter((w) => b.has(w)).length;
  return shared / new Set([...a, ...b]).size >= 0.8;
}

/**
 * Removes the [[button]] (and the question before it) when it offers something the user
 * already asked or tapped in this chat. WHY in code: Qwen kept offering "Show me how I could
 * save" after the user had tapped it, so the chat looped (14 Nov). No button is fine.
 */
function withoutRepeatedOffer(text: string, history: ChatMessage[]): string {
  const button = text.match(/\[\[(.+?)\]\]/);
  if (!button) return text;
  const offer = offerWords(button[1]);
  const asked = history.filter((m) => m.role === "user").map((m) => offerWords(m.text));
  if (!asked.some((words) => sameOffer(offer, words))) return text;
  console.log(`[ai] follow-up "${button[1]}" was already asked — button removed`);
  return withoutFollowUp(text);
}

/**
 * "**85 €**" → "85 €". WHY: the chat bubble shows plain text (no markdown), so the stars showed
 * as-is. Qwen never used them; the free Nemotron model bolds amounts (16 Nov). Amounts are
 * already bold via the {±…} color markers (MoneyText).
 */
function withoutBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
}

/**
 * "{‑85 €}" → "{-85 €}". WHY: Nemotron writes the money-color marker with a non-breaking hyphen
 * (U+2011) or hyphen (U+2010), which MoneyText doesn't read as a sign, so the amount lost its red.
 */
function plainMarkerSigns(text: string): string {
  return text.replace(/\{(\s*)[\u2010\u2011]/g, "{$1-");
}

/** The model sometimes copies onScreen()'s note into its own reply; it's not for the user. */
function withoutOnScreenNotes(text: string): string {
  return text.replace(/\s*\[On screen:[^\]\n]*\]/g, "").trim();
}

/**
 * seenLessons: lessons the user has already seen (saved on their device). They are not offered
 * or shown again unless the user asks about the topic (lib/education/topics.ts → teachTool).
 */
export async function runChat(
  history: ChatMessage[],
  seenLessons: LessonTopic[] = [],
): Promise<{
  reply: ChatMessage;
  mode: "live" | "mock";
}> {
  const config = getAiConfig();

  // A tapped lesson chip / For you "Try it" → the card alone: no text above it, no LLM call
  // (faster, and the model can't paraphrase the lesson). WHY before the model: team call.
  const requested = lessonRequested(history);
  const card = requested && buildLesson(requested, lessonLang(history), {}, history);
  if (card) {
    console.log(`[ai] lesson requested: ${card.topic} (card only, no LLM)`);
    return { reply: { role: "assistant", text: "", charts: [], lessons: [card] }, mode: config.mode === "live" ? "live" : "mock" };
  }

  if (config.mode === "blocked") {
    // WHY throw (→ ⚠️ in the chat): a paid or unknown model is a setup mistake to fix, not to hide.
    console.error(`[ai] mode=blocked — ${config.reason}`);
    throw new Error(config.reason);
  }

  if (config.mode === "mock") {
    console.log("[ai] mode=mock (set OPENROUTER_API_KEY in .env.local for the real model)");
    const reply = mockWithLessons(history, seenLessons);
    return { reply: { ...reply, text: euroAfter(noLongDashes(reply.text)) }, mode: "mock" };
  }

  // WHY log host + model but never the key: enough to spot a typo, safe to share.
  console.log(
    `[ai] mode=live model=${config.model} host=${new URL(config.baseURL).host}` +
      (config.reasoningEffort ? ` reasoning_effort=${config.reasoningEffort}` : ""),
  );

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        today: getDataToday(),
        firstDay: getTransactions()[0]?.date ?? getDataToday(),
        categories: listCategories(),
        merchantTypes: allMerchantTypes(),
        age: getCustomer().age,
        whatIfDefault: getDefaultTarget().label,
        // WHY: lets the coach help someone save before they ask (lib/insights/proactive.ts).
        moneyNote: moneyHealthNote(),
        // WHY only the name: numbers in the prompt aren't tool results (amounts.ts would flag them).
        goalName: getGoalState().goal?.name ?? null,
        lessons: lessonPromptInfo(seenLessons),
      }),
    },
    // WHY only text from history: earlier charts are already on screen; re-sending their
    // data would waste tokens. onScreen() names them in one line instead.
    ...history.map((m): LlmMessage => ({
      role: m.role,
      content: m.role === "assistant" ? withoutCouldntGet(m.text) + onScreen(m) : m.text,
    })),
  ];
  const question = history.at(-1)?.text ?? "";
  // The chart under the latest earlier reply, and how it was made (for "show it over 12 months").
  const prevSource = [...history]
    .reverse()
    .find((m) => m.role === "assistant" && m.charts?.some((c) => c.source))
    ?.charts?.find((c) => c.source)?.source;
  let redone = false;
  const wantsChart = WANTS_CHART.test(question);
  const askedMonths = monthsAsked(question);
  // The last chartable data the model fetched this turn: drawn by the server if it forgets show_chart.
  let lastChartable: { tool: string; args: Record<string, unknown> } | null = null;

  const charts: ChartSpec[] = [];
  let whatIfBars = false; // what_if draws its own bar chart; a show_chart of it would be a twin
  let toolCallsThisTurn = 0;
  // Numbers the reply may use: from this turn's tool results + amounts already in the chat
  // (the user's own, or the coach's from earlier turns — checked when they were written).
  const knownNumbers: number[] = history.flatMap((m) => euroAmounts(m.text).map((a) => a.value));
  let nudged = false;
  // The answer before the nudge. WHY: Qwen sometimes returns nothing after a forced tool call;
  // then this answer (minus any unverified amounts) is used instead of an empty reply.
  let firstAnswer = "";
  // WHY force a tool after the nudge: Qwen ignored the plain "[App check]" message and wrote
  // the same made-up €89.64 again (14.94 × 6 from its own earlier text).
  let forceTool = false;
  let whatIf: WhatIf | undefined; // the last what_if_spending result opens the what-if view
  let goalDraft: GoalDraft | undefined; // the last plan_goal result → "Save goal" card
  let emptyRetried = false; // asked once again after an empty final answer
  // Every sentence had an unverified amount. WHY not the apology right away: "300 e for
  // iphone 13" made Qwen write "300 €" (the user's "e" isn't read as euros), and the reply
  // became an apology above a correct goal card. With a card, the draft's sentence is used.
  let couldntWork = false;
  const lessons: LessonSpec[] = []; // teach results: lesson cards (one per reply)
  const teachCtx: TeachContext = { history, seen: seenLessons };
  const toolsUsed: string[] = []; // data tools this turn (incl. show_chart's data_tool), for the lesson chip

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
    console.log(`[ai] round ${round}: asking LLM…`);
    const start = Date.now();
    let msg;
    const ask = (toolChoice?: "required") =>
      askModel({ config, messages, tools: TOOL_DEFINITIONS, toolChoice });
    try {
      try {
        msg = await ask(forceTool ? "required" : undefined);
      } catch (err) {
        // WHY: not every provider accepts tool_choice "required"; then ask once without it.
        if (!forceTool || !(err instanceof LlmError) || err.kind !== "http") throw err;
        console.warn(`[ai] round ${round}: tool_choice=required refused (${err.message}), asking without it`);
        msg = await ask();
      }
      forceTool = false;
    } catch (err) {
      const explained = explainLlmError(err, config.model);
      console.error(`[ai] round ${round}: FAILED after ${ms(start)} — ${explained}`);
      throw new Error(explained);
    }

    const toolCalls = (msg.tool_calls ?? []).filter((c) => c.type === "function");

    // "Show it over 12 months" answered without any tool: re-run the previous chart's data with
    // the new months and give the model those numbers. WHY: Qwen re-used (or made up) numbers
    // from its own earlier text and called them 12 months (14 Nov). The server knows what "it" was.
    if (
      toolCalls.length === 0 &&
      toolCallsThisTurn === 0 &&
      REFERS_BACK.test(question) &&
      prevSource &&
      usesMonthsRange(prevSource.tool) &&
      !redone &&
      round < MAX_TOOL_ROUNDS
    ) {
      redone = true;
      const args = withMonths(prevSource.args, askedMonths);
      const id = "app-redo-1";
      const redo = runTool(prevSource.tool, args);
      console.log(`[ai] round ${round}: follow-up without a tool — re-ran ${prevSource.tool}(${JSON.stringify(args)})`);
      lastChartable = { tool: prevSource.tool, args };
      toolCallsThisTurn += 1;
      knownNumbers.push(...numbersIn(redo.content));
      messages.push(
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id, type: "function", function: { name: prevSource.tool, arguments: JSON.stringify(args) } }],
        },
        { role: "tool", tool_call_id: id, content: redo.content },
      );
      continue;
    }

    // Made-up numbers → ask once to redo the answer with tools:
    // a € amount that is in no tool result of this turn and nowhere earlier in the chat.
    // WHY not "any digit without a tool call" (removed): it fired on real numbers repeated from
    // earlier in the chat, the forced retry came back empty, and the user got a blank reply.
    // WHY: Qwen invented "Cafes €48.20" (it had called show_chart only, which used to return no
    // data) and "€142.30" (after what_if returned an error) for CUST01350, who never paid at a
    // cafe. A false alarm only costs one extra round.
    if (toolCalls.length === 0 && !nudged) {
      const text = msg.content ?? "";
      const invented = unsupportedAmounts(text, knownNumbers);
      if (invented.length > 0) {
        nudged = true;
        firstAnswer = text;
        // WHY no forceTool (tool_choice "required") any more: on the Modal Qwen server the forced
        // retry came back EMPTY 3 times out of 3 (14 Nov logs). A plain, specific nudge works.
        console.warn(
          `[ai] round ${round}: amounts not from any tool: ${invented.join(", ")} — asking again`,
        );
        messages.push(msg, {
          role: "user",
          content:
            `[App check, not from the user] These amounts are in no tool result: ${invented.join(", ")}. ` +
            "Call the tool that returns them, or write the answer again without them. Use only " +
            "numbers from tool results. Never mention tools in your answer.",
        });
        continue;
      }
    }

    // No tool calls → the model has written its final answer.
    if (toolCalls.length === 0) {
      // Fetched chartable data but didn't draw it, and the user wants a chart (or it's a trend
      // over time) → the server draws exactly that data. No guessing, no extra LLM round.
      if (
        charts.length === 0 &&
        !whatIf &&
        lastChartable &&
        (wantsChart || ALWAYS_DRAW.has(lastChartable.tool))
      ) {
        const auto = runTool("show_chart", {
          ...autoChartArgs(lastChartable.tool, lastChartable.args),
          data_tool: lastChartable.tool,
          data_args: lastChartable.args,
        });
        // WHY ≥ 2 rows: one number ("salary in March") needs no chart.
        if (auto.chart && auto.chart.rows.length >= 2) {
          console.log(`[ai] model drew no chart — drew ${lastChartable.tool} itself (${auto.chart.title})`);
          charts.push(auto.chart);
        }
      }
      // Asked for a chart but no chartable data was fetched at all → ask once to fetch and draw it.
      if (wantsChart && charts.length === 0 && !whatIf && !nudged && round < MAX_TOOL_ROUNDS) {
        nudged = true;
        console.warn(`[ai] round ${round}: chart asked for but none drawn — asking again`);
        messages.push(msg, {
          role: "user",
          content:
            "[App check, not from the user] The user asked to see a chart, but none was drawn. " +
            "Fetch the data with the right tool (money_over_time covers income, spending, kept and " +
            "balance for any number of months) and call show_chart. Never mention tools in your answer.",
        });
        continue;
      }
      // Never send an empty reply: fall back to the answer from before the nudge.
      const empty = !(msg.content ?? "").trim();
      if (empty && firstAnswer) console.warn("[ai] retry came back empty — using the first answer");
      let text = withoutCouldntGet(
        withoutOnScreenNotes(empty && firstAnswer ? firstAnswer : (msg.content ?? "")),
      );
      const stillInvented = unsupportedAmounts(text, knownNumbers);
      if (stillInvented.length > 0) {
        console.warn(
          `[ai] warning: final answer still has amounts not from a tool: ${stillInvented.join(", ")} — sentences dropped`,
        );
        // WHY no apology opener: Qwen copied it into every later answer. If only the follow-up
        // question is left, say so once, without a button (a button would invite a loop).
        const rest = dropSentencesWith(text, stillInvented).trim();
        // "" = nothing usable left: a goal card below gets its sentence from the draft instead.
        text = hasStatement(rest) ? rest : "";
        couldntWork = !text;
      } else if (toolCallsThisTurn === 0 && /\d/.test(text)) {
        console.warn("[ai] warning: final answer has numbers but still no tool call");
      }
      console.log(
        `[ai] round ${round}: final answer in ${ms(start)} (${(msg.content ?? "").length} chars)`,
      );
      // Lesson cards: from teach, or the safety net when the user clearly asked for one.
      const cards = lessons.length > 0 ? lessons : fallbackLessons(history);
      // Goal safety net (same idea as fallbackCharts): a "save X for Y" question answered
      // without plan_goal still gets the Save card from the mock's parse (real tool, real numbers).
      // WHY the draft's sentence replaces the model's text: without plan_goal, Qwen's text didn't
      // match the card (its own arithmetic, a repeat of its last question, or "provide a date"
      // above a card that already has one). No date given → ~6 months; the card's "Change" edits it.
      if (!goalDraft) {
        const g = fallbackGoal(history);
        if (g) {
          goalDraft = g.goalDraft;
          text = goalDraftText(g.goalDraft);
        }
      }
      if (couldntWork && !goalDraft && cards.length === 0) {
        text = "Sorry, I couldn't work that out from your data. Try asking about one habit, like restaurants or fast food.";
      }
      // Empty answer → never an empty bubble. WHY: Qwen answered "300 e for iphone 13" (after
      // "what are you saving for?") with no text at all. With a goal card, code writes the
      // sentence from the draft; otherwise ask the model once more, then a fixed sentence.
      // WHY not with a lesson card: the card is the whole answer (team call: nothing written above it).
      if (!splitFollowUp(text).body.trim() && cards.length === 0) {
        if (goalDraft) {
          console.warn("[ai] warning: final answer is empty — wrote the goal sentence from the draft");
          text = goalDraftText(goalDraft);
        } else if (!emptyRetried && round < MAX_TOOL_ROUNDS) {
          emptyRetried = true;
          console.warn(`[ai] round ${round}: empty answer — asking again`);
          messages.push(msg, {
            role: "user",
            content: "[App check, not from the user] Your reply was empty. Answer the user's last message now.",
          });
          continue;
        } else {
          console.warn("[ai] warning: final answer is empty again — fixed sentence");
          text = "Sorry, I couldn't work that out from your data. Try asking in a different way.";
        }
      }
      // WHY a fixed offer with a goal card: the model kept offering "Save for my trip", which
      // duplicates the card's Save button. The habits behind the missions are the next step.
      if (goalDraft) text = `${splitFollowUp(text).body.trim()}\n[[Where does my money slip away?]]`;
      // No chart from the model → safety net adds one, unless the what-if view opens, or a goal
      // card or a lesson card shows (each already is the visual for that answer).
      const shown =
        charts.length > 0 || whatIf || goalDraft || cards.length > 0 ? charts : fallbackCharts(history, lastChartable);
      // Asked for a chart and still none: say so instead of pretending.
      const noChartNote =
        wantsChart && shown.length === 0 && !whatIf && cards.length === 0
          ? "\n\nI couldn't draw a chart for that. Try e.g. \"income vs spending last 6 months\"."
          : "";
      const reply: ChatMessage = {
        role: "assistant",
        // WHY: team style, no long dashes and "85 €" not "€85"; the prompt asks, these make
        // sure (lib/noDashes.ts, lib/euroAfter.ts).
        text: euroAfter(noLongDashes(plainMarkerSigns(withoutBold(withoutRepeatedOffer(text, history))))) + noChartNote,
        charts: shown,
        whatIf,
        goalDraft,
        ...(cards.length > 0 ? { lessons: cards } : {}),
      };
      return { reply: finishReply(reply, history, seenLessons, toolsUsed), mode: "live" };
    }

    console.log(
      `[ai] round ${round}: LLM replied in ${ms(start)}, wants ${toolCalls.length} tool(s)`,
    );

    // Run every requested tool and send the results back to the model.
    toolCallsThisTurn += toolCalls.length;
    messages.push(msg);
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(call.function.arguments || "{}");
        // WHY: valid JSON can still be a string/array/null; tools expect an object.
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        console.warn(
          `[ai]   ${call.function.name}: bad JSON arguments, using defaults:`,
          call.function.arguments,
        );
      }
      // The user's own "N months" wins over what the model guessed.
      if (askedMonths) {
        if (
          call.function.name === "show_chart" &&
          usesMonthsRange(String(args.data_tool)) &&
          args.data_args &&
          typeof args.data_args === "object"
        ) {
          args = { ...args, data_args: withMonths(args.data_args as Record<string, unknown>, askedMonths) };
        } else if (usesMonthsRange(call.function.name)) {
          args = withMonths(args, askedMonths);
        }
      }
      let result;
      try {
        result = runTool(call.function.name, args, teachCtx);
        toolsUsed.push(call.function.name);
        if (call.function.name === "show_chart" && typeof args.data_tool === "string") {
          toolsUsed.push(args.data_tool);
        }
      } catch (err) {
        // WHY catch per tool: a bug in one data function shouldn't kill the
        // whole answer. The LLM is told the tool failed and can say so.
        console.error(`[ai]   ${call.function.name}: TOOL CRASHED —`, err);
        result = {
          content: JSON.stringify({
            error: `Tool failed: ${err instanceof Error ? err.message : err}`,
          }),
        };
      }
      console.log(
        `[ai]   ${call.function.name}(${JSON.stringify(args)}) → ${result.content.slice(0, 150)}`,
      );
      if (isChartable(call.function.name)) lastChartable = { tool: call.function.name, args };
      if ("chart" in result && result.chart) {
        const isWhatIfBars =
          call.function.name === "what_if" ||
          (call.function.name === "show_chart" && args.data_tool === "what_if");
        if (isWhatIfBars && whatIfBars) {
          console.log("[ai]   skipped a second what_if bar chart");
        } else {
          charts.push(result.chart);
          whatIfBars ||= isWhatIfBars;
        }
      }
      if ("whatIf" in result && result.whatIf) whatIf = result.whatIf;
      if ("goalDraft" in result && result.goalDraft) goalDraft = result.goalDraft;
      if ("lesson" in result && result.lesson) {
        if (lessons.length === 0) lessons.push(result.lesson);
        else console.log("[ai]   skipped a second lesson card (one per reply)");
      }
      knownNumbers.push(...numbersIn(result.content));
      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
    }
  }

  console.warn(`[ai] stopped after ${MAX_TOOL_ROUNDS} rounds without a final answer`);
  const stuck: ChatMessage = {
    role: "assistant",
    text: "Sorry, I got stuck working that out. Could you ask in a different way?",
    charts,
    whatIf,
    goalDraft,
    ...(lessons.length > 0 ? { lessons } : {}),
  };
  return { reply: oneCard(stuck, history).reply, mode: "live" };
}
