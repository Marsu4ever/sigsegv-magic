/**
 * LESSON CARDS — content + the user's own numbers. SERVER ONLY. Owner: E (financial education).
 * Idea A "Arvaa!" from PLAN-financial-education.md: the coach never writes a lesson; it calls the
 * teach tool and this file builds the card: a question, the user's real number to guess, one line
 * to learn, one thing to do and ONE link to S-Pankki (or Valtiokonttori).
 *
 * RULES (team, see PLAN §2 and DECISIONS.md):
 * - Numbers come from lib/data / lib/insights, never from the AI (same as charts).
 * - No product picks except savings options (säästötili, ASP-tili). No funds, no rates, no returns.
 * - ASP only for users WITHOUT an existing home loan (an approved mortgage).
 * - A lesson the user has seen is not shown again unless they ask about its topic (teachTool).
 *
 * TO ADD A LESSON: add the id to LessonTopic + LESSON_TOPICS (lib/types.ts), then one entry in TOPICS.
 */
import type {
  Basket,
  ChatMessage,
  LessonInfo,
  LessonLang,
  LessonLink,
  LessonSpec,
  LessonTopic,
} from "@/lib/types";
import { LESSON_TOPICS } from "@/lib/types";
import { periodToRange } from "@/lib/data";
import { incomeSummary } from "@/lib/data/money";
import { getMortgageSummary } from "@/lib/data/mortgage";
import { everydayLeaks, habitSkipOne } from "@/lib/insights/leaks";
import { irregularBuffer } from "@/lib/insights/irregular";
import { whatIf } from "@/lib/insights/whatIf";
import { getWhatIf, parseCutPct } from "@/lib/insights/whatIfForecast";
import { resolveTarget } from "@/lib/insights/targets";
import { splitFollowUp } from "@/lib/followUp";
import { euroAmounts } from "@/lib/ai/amounts";
import { guessRange } from "./guess";
import { detectLang } from "./lang";

type Args = Record<string, unknown>;
type Text = Record<LessonLang, string>;

/** What a topic's data function returns: the slider + the filled-in sentences. */
type Built = {
  answer: number;
  unit: "€" | "%";
  /**
   * Slider max ≈ answer × factor, rounded (see guessRange). WHY different per topic (1.7–3.2):
   * with one factor the answer would always sit at the same spot and the game could be "learnt".
   */
  factor: number;
  tolerance: number;
  /** Sentences with the user's numbers filled in. */
  hook: Text;
  label: Text;
  body: Text;
  takeaway: Text;
  /** Fixed slider instead of guessRange (e.g. ASP: a share of the price). */
  range?: { min: number; max: number; step: number; start: number };
};

type Topic = {
  id: LessonTopic;
  basket?: Basket;
  title: Text;
  /** The coach's follow-up button that leads to this lesson (2–6 words, what the user would say). */
  offer: Text;
  /** A question that asks for this lesson — For you uses it to open the coach. */
  ask: Text;
  /** When the coach should offer it (for the system prompt). */
  after: string;
  /** Data tools that make this a good moment to offer the lesson. */
  afterTools: string[];
  /** The user is asking about this topic (EN + FI). Lets a seen lesson be shown again. */
  about: RegExp;
  link: Record<LessonLang, LessonLink>;
  /** Why this is allowed under "no product picks" (for reviewers). */
  compliance: string;
  /** null = no data for this customer, or the lesson isn't for them. */
  build: (args: Args, history: ChatMessage[]) => Built | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────

/** 1234.5 → "1 235 €" (Finnish style, whole euros, € after the number: DECISIONS #42). */
const eur = (n: number) => `${Math.round(n).toLocaleString("fi-FI")} €`;
// WHY month names, not "4/2026": easier to read at a glance (E, 14 Nov).
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Finnish "in April" = "huhtikuussa": every month name ends in -kuu, so "+ ssa" is always right.
const MONTHS_FI = ["tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu", "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu"];
/** "2026-04" → "April 2026" */
const monthEn = (ym: string) => `${MONTHS_EN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
/** "2026-04" → "huhtikuussa 2026" (in April 2026) */
const inMonthFi = (ym: string) => `${MONTHS_FI[Number(ym.slice(5, 7)) - 1]}ssa ${ym.slice(0, 4)}`;
const last90 = () => periodToRange("last_90_days");

const SPANKKI = "https://www.s-pankki.fi/fi";
const LINKS = {
  // Verified 14 Nov 2026: "Säästä ostosten yhteydessä … 0,5–5 euroa jokaisesta debit-korttiostoksestasi".
  saastaja: `${SPANKKI}/saastaminen-ja-sijoittaminen/saastaja/`,
  startSaving: `${SPANKKI}/saastaminen-ja-sijoittaminen/nain-aloitat-saastamisen-ja-sijoittamisen/`,
  // Verified 14 Nov 2026: "säästä vähintään 10 % tulevan asuntosi hankintahinnasta".
  asp: `${SPANKKI}/tilit/asp-tili/`,
};

const sPankki = (url: string, fi: string, en: string): Record<LessonLang, LessonLink> => ({
  fi: { label: fi, url, source: "s-pankki" },
  en: { label: en, url, source: "s-pankki" },
});

/** Does the customer already have a home loan? (ASP is for first-home buyers only.) */
function hasExistingMortgage(): boolean {
  return getMortgageSummary()?.decision === "approved";
}

/**
 * The monthly saving the compound_growth lesson grows, in this order:
 * 1. the what_if / what_if_spending the coach just ran (same args, recomputed: never the AI's number);
 * 2. the last what-if already on screen in this chat;
 * 3. the customer's biggest "skip one" habit from the leaks chart.
 */
type Saving = { eur: number };

function monthlySaving(args: Args, history: ChatMessage[]): Saving | null {
  const amount = monthlySavingFromWhatIf(args, history);
  if (amount !== null) return { eur: amount };
  // WHY habits you can skip weekly or monthly first: "every 2nd" is for rare buys (e.g. flights),
  // which don't feel like a small everyday saving.
  const rank = (label: string) => (label === "Skip every 2nd" ? 1 : 0);
  const best = everydayLeaks(last90())
    .groups.filter((g) => g.skipOne && g.skipOne.savesPerYearEur > 0)
    .sort(
      (a, b) =>
        rank(a.skipOne!.label) - rank(b.skipOne!.label) || b.skipOne!.savesPerYearEur - a.skipOne!.savesPerYearEur,
    )[0];
  return best ? { eur: best.skipOne!.savesPerYearEur / 12 } : null;
}

function monthlySavingFromWhatIf(args: Args, history: ChatMessage[]): number | null {
  const range = last90();
  const category = typeof args.category === "string" ? args.category.trim() : "";
  if (category && (args.skip_one === true || args.skip_one === "true")) {
    const skip = habitSkipOne(range, category);
    if (skip) {
      const w = whatIf({ range, changePercent: -skip.pct, habit: skip.habit });
      if (w.savingPerMonthEur > 0) return w.savingPerMonthEur;
    }
  } else if (category && Number.isFinite(Number(args.change_percent)) && Number(args.change_percent) < 0) {
    const w = whatIf({ range, changePercent: Number(args.change_percent), category });
    if (w.savingPerMonthEur > 0) return w.savingPerMonthEur;
  } else if (category) {
    const target = resolveTarget(category);
    if (target) {
      const w = getWhatIf(target, 1, parseCutPct(args.cut_pct));
      if (w.savingEur > 0) return w.savingEur;
    }
  }
  for (const m of [...history].reverse()) {
    if (m.whatIf && m.whatIf.savingEur > 0) return m.whatIf.savingEur / m.whatIf.months;
    // what_if's own bar chart: first row = one month, as now (value) vs after (value2).
    const bars = m.charts?.find((c) => c.seriesNames?.[0] === "As now" && c.rows[0]?.value2 !== undefined);
    if (bars) {
      const saving = bars.rows[0].value - (bars.rows[0].value2 ?? 0);
      if (saving > 0) return saving;
    }
  }
  return null;
}

// ─── The lessons ─────────────────────────────────────────────────────────

// WHY short, everyday words: the cards are written for someone new to money talk (no "income share",
// "buffer" or "interest on interest"). One idea per sentence.
const TOPICS: Topic[] = [
  {
    id: "micro_saving",
    basket: "everyday",
    title: { en: "Small buys add up", fi: "Pienet ostot kertyvät" },
    offer: { en: "Guess what your small buys cost in a year", fi: "Arvaa paljonko pienet ostoksesi maksavat vuodessa" },
    ask: { en: "How much do my small buys cost in a year?", fi: "Paljonko pienet ostokseni maksavat vuodessa?" },
    // WHY not after the leaks chart: that chart already shows small purchases per year.
    after: "the baskets chart, the spending calendar or a category's spending",
    afterTools: ["basket_details", "basket_breakdown", "spend_over_time", "spend_by_category"],
    about: /micro.?sav|mikrosäästö|small (buys|purchases) (add up|cost)|pien(et|ten|iä) ost\w* (kertyy|kertyvät|maksa|hinta)/i,
    // WHY Säästäjä, not the glossary: the lesson's tip is "save a little on every card buy", and
    // Säästäjä is the S-Bank feature that does exactly that. A page you can act on beats a definition.
    link: sPankki(LINKS.saastaja, "Säästäjä: säästä ostosten yhteydessä", "Säästäjä: save as you shop (S-Bank)"),
    compliance:
      "Names Säästäjä as an existing S-Bank feature (PLAN §2.5), link only. No fund named; Säästäjä also offers a savings account (Säästäjä-tavoitetili).",
    build: () => {
      const s = everydayLeaks(last90()).smallPurchases;
      if (s.perYearEur <= 0) return null;
      // WHY 1 € per buy: Säästäjä lets you pick 0,50–5 €; 1 € keeps the sum easy to follow.
      // Only the small buys are counted, so the real saving (all card buys) would be bigger.
      const onePerBuyEur = Math.round(s.timesPerMonth * 12);
      return {
        answer: Math.round(s.perYearEur),
        unit: "€",
        factor: 3.2,
        tolerance: Math.max(1, Math.round(s.perYearEur * 0.15)),
        hook: {
          en: `Think of all your small buys under ${s.maxEur} €. How much do they cost you in one year?`,
          fi: `Mieti kaikkia alle ${s.maxEur} € ostoksiasi. Paljonko ne maksavat sinulle vuodessa?`,
        },
        label: { en: "Per year", fi: "Vuodessa" },
        body: {
          en: `You made ${s.count} small buys in the last 3 months. Each one feels like nothing, but together they add up.`,
          fi: `Teit ${s.count} pientä ostosta viimeisen 3 kuukauden aikana. Yksi ei tunnu missään, mutta yhdessä niistä kertyy paljon.`,
        },
        takeaway: {
          en: `Turn on saving from purchases in Säästäjä (S-mobiili). If 1 € goes to savings every time you pay by card, your small buys alone save about ${eur(onePerBuyEur)} a year.`,
          fi: `Ota S-mobiilin Säästäjässä käyttöön ostoksista säästäminen. Jos jokaisesta korttiostoksesta siirtyy 1 € säästöön, pelkistä pienistä ostoksistasi kertyy noin ${eur(onePerBuyEur)} vuodessa.`,
        },
      };
    },
  },
  {
    id: "emergency_buffer",
    basket: "mandatory_irregular",
    title: { en: "Surprise costs", fi: "Yllätyskulut" },
    // WHY "you": the app offers the lesson to the user, so it speaks to them.
    offer: { en: "Guess your worst month for surprise costs", fi: "Arvaa pahin yllätyskulujen kuukautesi" },
    ask: { en: "How do I get ready for surprise costs?", fi: "Miten varaudun yllätyskuluihin?" },
    // WHY not after irregular_buffer: that reply already names the worst month.
    after: "safe_to_spend (it keeps a surprise buffer) or income_summary",
    afterTools: ["safe_to_spend", "income_summary", "recurring_payments"],
    about: /emergency (fund|buffer|savings)|rainy.?day|buffer fund|puskuri|vararahasto|hätävara|priciest surprise|kallein yllätys|ready for surprise|prepare for surprise|varaudu\w* yllätys/i,
    link: sPankki(LINKS.startSaving, "Näin aloitat säästämisen, S-Pankki", "How to start saving, S-Bank"),
    compliance: "General principle (keep a buffer). No product named.",
    build: () => {
      const b = irregularBuffer();
      if (!b.worstMonth || b.worstMonth.eur <= 0) return null;
      return {
        answer: Math.round(b.worstMonth.eur),
        unit: "€",
        factor: 1.7,
        tolerance: Math.max(1, Math.round(b.worstMonth.eur * 0.15)),
        hook: {
          en: "Some costs come as a surprise, like a doctor's visit or a broken phone. In your worst month, how much did they cost?",
          fi: "Osa kuluista tulee yllätyksenä, kuten lääkärikäynti tai rikki mennyt puhelin. Paljonko ne maksoivat pahimpana kuukautenasi?",
        },
        label: { en: `In ${monthEn(b.worstMonth.month)}`, fi: inMonthFi(b.worstMonth.month).replace(/^./, (c) => c.toUpperCase()) },
        body: {
          en: `That was in ${monthEn(b.worstMonth.month)}: health, home and tech costs. About ${eur(b.suggestion.emergencyBufferEur)} kept aside for surprises would have paid for it.`,
          fi: `Se oli ${inMonthFi(b.worstMonth.month)}: terveys-, koti- ja tekniikkakuluja. Noin ${eur(b.suggestion.emergencyBufferEur)} sivussa yllätyksiä varten olisi riittänyt.`,
        },
        takeaway: {
          en: `If you put about ${eur(b.suggestion.setAsidePerMonthEur)} aside every month then surprises don't hurt so much.`,
          fi: `Jos laitat sivuun noin ${eur(b.suggestion.setAsidePerMonthEur)} joka kuukausi, yllätykset eivät satu niin paljon.`,
        },
      };
    },
  },
  {
    id: "pay_yourself_first",
    title: { en: "Money left over", fi: "Rahaa jää yli" },
    offer: { en: "Guess how much money you have left over", fi: "Arvaa paljonko rahaa sinulle jää yli" },
    ask: { en: "How much of my money is left over?", fi: "Paljonko rahoistani jää yli?" },
    // WHY not after spender_profile / income_summary: those replies already give the kept share.
    after: "month_progress, compare_periods, balance or irregular_buffer",
    afterTools: ["month_progress", "compare_periods", "balance_over_time", "irregular_buffer"],
    about: /pay yourself first|maksa (ensin )?itsellesi|how much (of my income )?do i keep|share of (my )?income|savings rate|säästöaste|tuloistani jää|how much (i|you) keep|paljonko (minulle|sinulle) jää|how much of my money is left over|rahoistani jää yli/i,
    link: sPankki(LINKS.startSaving, "Näin aloitat säästämisen, S-Pankki", "How to start saving, S-Bank"),
    compliance: "Habit (save on payday). No product named.",
    build: () => {
      const i = incomeSummary(last90());
      if (i.incomeEur <= 0) return null;
      const pct = Math.round(i.keptShare * 100);
      const kept = i.keptEur >= 0;
      return {
        answer: pct,
        unit: "%",
        factor: 1.8,
        // WHY ±3 points: a share is harder to guess than euros; 3 points is still "close".
        tolerance: Math.max(3, Math.round(Math.abs(pct) * 0.15)),
        hook: {
          en: "Money came in and money went out. In the last 3 months, what percent of your money was left over?",
          fi: "Rahaa tuli ja rahaa meni. Montako prosenttia rahoistasi jäi yli viimeisen 3 kuukauden aikana?",
        },
        label: { en: "Left over", fi: "Jäi yli" },
        body: kept
          ? {
              en: `You got ${eur(i.incomeEur)} and spent ${eur(i.spendingEur)}. So ${eur(i.keptEur)} was left over.`,
              fi: `Sait ${eur(i.incomeEur)} ja käytit ${eur(i.spendingEur)}. Yli jäi siis ${eur(i.keptEur)}.`,
            }
          : {
              en: `You got ${eur(i.incomeEur)} and spent ${eur(i.spendingEur)}. That's ${eur(-i.keptEur)} more than you got.`,
              fi: `Sait ${eur(i.incomeEur)} ja käytit ${eur(i.spendingEur)}. Se on ${eur(-i.keptEur)} enemmän kuin sait.`,
            },
        takeaway: {
          en: "On payday, move a set amount to savings first. Spend only what's left.",
          fi: "Siirrä palkkapäivänä ensin tietty summa säästöön. Käytä vain se, mitä jää.",
        },
      };
    },
  },
  {
    id: "compound_growth",
    basket: "everyday",
    title: { en: "Small saving, long time", fi: "Pieni säästö, pitkä aika" },
    // WHY not "that saving": the chip also follows replies that named no saving (e.g. spender type).
    offer: { en: "Guess what saving a little adds up to", fi: "Arvaa paljonko pienestä säästöstä kertyy" },
    ask: { en: "How much would I have if I saved every month for 10 years?", fi: "Paljonko minulla olisi, jos säästäisin joka kuukausi 10 vuotta?" },
    after: "a saving (what_if, what_if_spending), the leaks chart or spender_profile",
    afterTools: ["what_if", "what_if_spending", "everyday_leaks", "spender_profile"],
    about: /compound(ing| interest| growth)?|korkoa korolle|saving (could )?becomes?|pienestä säästöstä kertyy|säästö\w* voisi kertyä|in 10 years|for 10 years|10 vuodessa|10 vuotta/i,
    // WHY Säästäjä, not the glossary: the tip is "make it automatic", and Säästäjä's monthly saving
    // does that. A page the user can act on beats a definition (DECISIONS #67).
    link: sPankki(LINKS.saastaja, "Säästäjä: säästä automaattisesti", "Säästäjä: save automatically (S-Bank)"),
    // WHY no interest rate at all: the team's open question 1 (PLAN §9). Contributions only is the
    // safest version, so nothing here looks like a promised return.
    compliance:
      "Saved money only (monthly × 120), no rate or return. Links Säästäjä as an existing S-Bank feature (PLAN §2.5); no fund named.",
    build: (args, history) => {
      const saving = monthlySaving(args, history);
      const perMonth = saving === null ? 0 : Math.round(saving.eur);
      if (!saving || perMonth < 1) return null;
      const total = perMonth * 120;
      return {
        answer: total,
        unit: "€",
        factor: 2.4,
        tolerance: Math.max(1, Math.round(total * 0.15)),
        // WHY two short sentences and no habit name: written for someone new to money talk.
        hook: {
          en: `You save ${eur(perMonth)} every month. How much money do you have after 10 years?`,
          fi: `Säästät ${eur(perMonth)} joka kuukausi. Paljonko rahaa sinulla on 10 vuoden päästä?`,
        },
        label: { en: "After 10 years", fi: "10 vuoden päästä" },
        body: {
          en: "That's only the money you put aside. In a savings account it also earns a little interest, so you'd have a bit more.",
          fi: "Tämä on vain sivuun laittamasi raha. Säästötilillä se saa myös vähän korkoa, joten sitä olisi hieman enemmän.",
        },
        takeaway: {
          en: `Make it automatic: set up a monthly saving of ${eur(perMonth)} in Säästäjä (S-mobiili), so it happens without thinking.`,
          fi: `Tee siitä automaattinen: aseta S-mobiilin Säästäjässä ${eur(perMonth)} kuukausisäästö, niin se tapahtuu itsestään.`,
        },
      };
    },
  },
  {
    id: "asp_account",
    basket: "mandatory_regular",
    title: { en: "Saving for a first home (ASP)", fi: "Säästä ensimmäiseen kotiin (ASP)" },
    offer: { en: "Guess how much of a first home you save yourself", fi: "Arvaa paljonko ensimmäisen kodin hinnasta säästät itse" },
    ask: { en: "How do I save for my first home?", fi: "Miten säästän ensimmäiseen kotiin?" },
    after: "mortgage_status, or when the user talks about buying a first home",
    afterTools: ["mortgage_status"],
    about: /\basp\b|asuntosäästö|first.?home sav|ensiasunno?n säästö|säästää ensiasun|save for (my |a )?first home|säästä\w* ensimmäiseen kotiin/i,
    link: sPankki(LINKS.asp, "ASP-tili, S-Pankki", "ASP account, S-Bank"),
    compliance: "A savings option (allowed by the team rule). No rate shown. Only for users without a home loan.",
    build: () => {
      if (hasExistingMortgage()) return null;
      const m = getMortgageSummary(); // a rejected application, or null = never applied
      const own = m && m.property.priceEur > 0 ? Math.round((m.equityEur / m.property.priceEur) * 100) : null;
      return {
        // WHY a fixed 10: the ASP rule (unchanged by the 1.6.2026 reform; S-Pankki's ASP page).
        answer: 10,
        unit: "%",
        factor: 3,
        tolerance: 2,
        range: { min: 0, max: 30, step: 1, start: 15 },
        hook: {
          en: "ASP is a special savings account for buying your first home. How much of the home's price do you save yourself?",
          fi: "ASP-tili on erityinen säästötili ensimmäisen kodin ostoon. Kuinka suuren osan kodin hinnasta säästät itse?",
        },
        label: { en: "Of the price", fi: "Hinnasta" },
        body: {
          en:
            "The bank lends the rest. With ASP you pay no tax on the interest, and the state backs your home loan for free." +
            (own !== null ? ` In your loan application, ${own} % of the price was your own money.` : ""),
          fi:
            "Pankki lainaa loput. ASP-tilin korosta ei makseta veroa, ja valtio takaa asuntolainasi ilmaiseksi." +
            (own !== null ? ` Lainahakemuksessasi omaa rahaa oli ${own} % hinnasta.` : ""),
        },
        takeaway: {
          en: "Start early: you need to save on the ASP account for at least 20 months.",
          fi: "Aloita ajoissa: ASP-tilille pitää säästää vähintään 20 kuukauden ajan.",
        },
      };
    },
  },
];

const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

export function isLessonTopic(v: unknown): v is LessonTopic {
  return LESSON_TOPICS.includes(v as LessonTopic);
}

// ─── Building a card ─────────────────────────────────────────────────────

/** The card for one topic, or null if this customer has no data for it (or it isn't for them). */
export function buildLesson(
  topic: LessonTopic,
  lang: LessonLang,
  args: Args = {},
  history: ChatMessage[] = [],
): LessonSpec | null {
  const t = BY_ID.get(topic);
  const b = t?.build(args, history);
  if (!t || !b) return null;
  const range = b.range ?? guessRange(b.answer, b.factor, b.unit === "%" ? 10 : 50);
  return {
    topic,
    lang,
    ...(t.basket ? { basket: t.basket } : {}),
    title: t.title[lang],
    hook: b.hook[lang],
    body: b.body[lang],
    takeaway: b.takeaway[lang],
    link: t.link[lang],
    guess: { label: b.label[lang], answer: b.answer, unit: b.unit, tolerance: b.tolerance, ...range },
  };
}

/** Lessons this customer can do (has data, and it's for them). For the For you progress list. */
export function availableLessons(lang: LessonLang = "en"): LessonInfo[] {
  return TOPICS.filter((t) => t.build({}, []) !== null).map((t) => ({
    topic: t.id,
    title: t.title[lang],
    ask: t.ask[lang],
  }));
}

// ─── When the user asks ──────────────────────────────────────────────────

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|kyllä|joo|juu|näytä)\b/i;
const QUESTION = /\b(what|what's|whats|explain|tell me|how does|how do|mikä|mitä|selitä|kerro|miten|kuinka)\b|\?/i;

/**
 * What the user really asked in their last message: a "yes" means the coach's last offer
 * (the [[button]]), exactly like the mock does.
 */
export function lastAsk(history: ChatMessage[]): string {
  const text = (history.at(-1)?.text ?? "").trim();
  if (!YES.test(text)) return text;
  const prev = history.slice(0, -1).findLast((m) => m.role === "assistant");
  return (prev && splitFollowUp(prev.text).followUp) || text;
}

/**
 * The card's language. WHY both texts: "kyllä" to an English button is still a Finnish speaker,
 * and a tapped Finnish button ("Arvaa…") is Finnish even though "yes" isn't.
 */
export function lessonLang(history: ChatMessage[]): LessonLang {
  return detectLang(`${history.at(-1)?.text ?? ""} ${lastAsk(history)}`);
}

/** Is this text about the topic? Used to let a seen lesson be shown again. */
export function askedAbout(topic: LessonTopic, text: string): boolean {
  const t = BY_ID.get(topic);
  if (!t) return false;
  const q = text.trim().toLowerCase();
  const exact = [t.offer.en, t.offer.fi, t.ask.en, t.ask.fi].some((s) => s.toLowerCase() === q);
  return exact || t.about.test(text);
}

/**
 * The lesson the user clearly asked for: they tapped its offer / For you button, or asked a
 * question about its topic ("What is an emergency buffer?"). null = no clear ask.
 * WHY stricter than askedAbout: this attaches a card without the AI choosing it (safety net + mock).
 */
export function lessonAskedFor(history: ChatMessage[]): LessonTopic | null {
  const text = lastAsk(history);
  const q = text.trim().toLowerCase();
  for (const t of TOPICS) {
    const exact = [t.offer.en, t.offer.fi, t.ask.en, t.ask.fi].some((s) => s.toLowerCase() === q);
    if (exact || (QUESTION.test(text) && t.about.test(text))) return t.id;
  }
  return null;
}

/**
 * The user tapped a lesson chip or a For you "Try it" button (their message is exactly its text,
 * or a "yes" to it). Then the reply is the card alone, no text (lib/ai/chat.ts).
 */
export function lessonRequested(history: ChatMessage[]): LessonTopic | null {
  const q = lastAsk(history).trim().toLowerCase();
  const t = TOPICS.find((x) => [x.offer.en, x.offer.fi, x.ask.en, x.ask.fi].some((s) => s.toLowerCase() === q));
  return t?.id ?? null;
}

/**
 * Is the lesson's answer already written in the chat? Then guessing it is pointless.
 * WHY: e.g. "What kind of spender am I?" already says "you keep 56 % of your income".
 */
export function answerAlreadyShown(topic: LessonTopic, history: ChatMessage[], replyText: string): boolean {
  const l = buildLesson(topic, "en", {}, history);
  if (!l) return false;
  const text = [...history.map((m) => m.text), replyText].join("\n");
  const a = l.guess.answer;
  if (l.guess.unit === "%") {
    return [...text.matchAll(/(-?\d+(?:[.,]\d+)?)\s?%/g)].some((m) => Math.abs(Number(m[1].replace(",", ".")) - a) < 1);
  }
  return euroAmounts(text).some((x) => Math.abs(x.value - a) <= 1);
}

/** The lesson that fits after these data tools ran (first match), or null. */
export function teachableTopic(tools: string[]): LessonTopic | null {
  return TOPICS.find((t) => t.afterTools.some((name) => tools.includes(name)))?.id ?? null;
}

/**
 * Is this lesson's card already in this chat? WHY: "seen" now means the user opened the lesson
 * (lib/education/progress.ts), so a card they scrolled past isn't seen; it shouldn't be offered
 * or shown again in the same chat while it's still there to try.
 */
export function lessonInChat(topic: LessonTopic, history: ChatMessage[]): boolean {
  return history.some((m) => m.lessons?.some((l) => l.topic === topic));
}

/** Can this lesson be offered now: not seen yet, has data and is for this user (ASP rule)? */
export function lessonIsOpen(topic: LessonTopic, seen: LessonTopic[]): boolean {
  return !seen.includes(topic) && buildLesson(topic, "en") !== null;
}

/** The chip text that offers a lesson (ChatMessage.lessonOffer). */
export function lessonOffer(topic: LessonTopic, lang: LessonLang): string {
  return BY_ID.get(topic)?.offer[lang] ?? "";
}

// ─── The teach tool ──────────────────────────────────────────────────────

export type TeachContext = {
  history: ChatMessage[];
  /** Lessons the user has already seen (from the device, ChatRequest.seenLessons). */
  seen: LessonTopic[];
};

/**
 * Runs teach({ topic, … }). The model gets a tiny result on purpose: if it got the card's text it
 * would paraphrase it into the bubble (PLAN §4.3).
 */
export function teachTool(args: Args, ctx: TeachContext): { content: string; lesson?: LessonSpec } {
  const reply = (o: object) => JSON.stringify(o);
  const topic = args.topic;
  if (!isLessonTopic(topic)) {
    return { content: reply({ error: "Unknown topic", available: LESSON_TOPICS }) };
  }
  const ask = lastAsk(ctx.history);
  if ((ctx.seen.includes(topic) || lessonInChat(topic, ctx.history)) && !askedAbout(topic, ask)) {
    return {
      content: reply({
        shown: false,
        reason: "The user has already seen this lesson. Show it again only if they ask about this topic. Answer without it, and don't offer it.",
      }),
    };
  }
  if (topic === "asp_account" && hasExistingMortgage()) {
    return {
      content: reply({ shown: false, reason: "The user already has a home loan, so ASP is not for them. Don't mention ASP." }),
    };
  }
  const lesson = buildLesson(topic, lessonLang(ctx.history), args, ctx.history);
  if (!lesson) return { content: reply({ shown: false, reason: "No data for this lesson for this user." }) };
  return {
    content: reply({
      shown: true,
      topic,
      note: "A card under your reply asks the user to guess and explains the topic. Don't explain it, don't give its number, don't describe the card.",
    }),
    lesson,
  };
}

/** For the system prompt: which lessons to offer when, which are done, and whether ASP may be named. */
export function lessonPromptInfo(seen: LessonTopic[]) {
  const available = new Set(availableLessons().map((l) => l.topic));
  return {
    offers: TOPICS.filter((t) => available.has(t.id) && !seen.includes(t.id)).map((t) => ({
      topic: t.id,
      after: t.after,
      offerEn: t.offer.en,
      offerFi: t.offer.fi,
    })),
    seen: seen.filter((t) => available.has(t)),
    aspAllowed: !hasExistingMortgage(),
  };
}

export type LessonPromptInfo = ReturnType<typeof lessonPromptInfo>;
