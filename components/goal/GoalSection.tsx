"use client";
/**
 * Saving goal + this week's mission, at the top of the This week page (/week, opened from Home). Owner: UI person.
 * Data: GET/POST /api/goal (lib/goals/). Every number comes from the server's GoalView.
 *
 * THE LOOP (DECISIONS.md #53):
 *   set a goal → pick 1 of up to 3 missions (built from your own habits) → the week runs
 *   → won or not, what you spent less than usual can be PUT TOWARD THE GOAL → next week.
 * PSYCHOLOGY, on purpose:
 * - the goal bar is the hero, the level is a small pill (euros and days beat points)
 * - you choose the mission (autonomy); "Sparks joy" habits are never offered
 * - spending less isn't saving: the bar only moves when money is moved
 * - no red, no lost XP, no streak to break; a missed week makes the next one lighter
 *
 * The dark demo strip (only with the DEMO bar on) adds purchases and moves days, because
 * the data is a fixed snapshot (mission weeks are the days after it ends, #53b).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { GoalView, Mission } from "@/lib/types";
import { CategoryTile } from "@/components/charts/categoryIcons";
import { CountUp } from "@/components/ui/CountUp";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { SHOW_CUSTOMER_SWITCHER } from "@/components/CustomerSwitcher";
import { daysText, eur0, fiDay, goalAction, useGoal, weekday } from "./api";
import { GoalSetupSheet, type GoalSetupValues } from "./GoalSetupSheet";

const CARD = "rounded-2xl bg-surface p-4 shadow-sm";
const TRACK = "color-mix(in srgb, var(--accent) 14%, var(--surface))";

export function GoalSection() {
  const { view, error } = useGoal();
  const [setup, setSetup] = useState<{ initial?: GoalSetupValues; editing?: boolean } | null>(null);

  // /week?setup=1&name=…&amount=…&date=… opens the sheet (from the chat, Account, insights);
  // /week#goal scrolls here.
  // WHY a timer + cleanup (same as ChatView's ?ask=): React dev mode runs effects twice.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = setTimeout(() => {
      if (q.get("setup") === "1") {
        setSetup({
          initial: {
            name: q.get("name") ?? undefined,
            amount: q.get("amount") ?? undefined,
            date: q.get("date") ?? undefined,
            start: q.get("start") ?? undefined,
          },
        });
        window.history.replaceState(null, "", "/week#goal");
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  // Scroll to the goal once it's on screen (it appears after GET /api/goal answers).
  const loaded = !!view;
  useEffect(() => {
    if (loaded && window.location.hash === "#goal")
      document.getElementById("goal")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded]);

  if (error) return <p className="text-sm text-danger">⚠️ {error}</p>;
  if (!view) return <SkeletonCard lines={3} />;

  const g = view.goal;
  return (
    <div id="goal" className="scroll-mt-4 space-y-3">
      {g ? (
        <GoalCard
          view={view}
          onEdit={() =>
            setSetup({
              editing: true,
              // WHY start = saved: editing keeps what you already have (it becomes the new start).
              initial: {
                name: g.name,
                emoji: g.emoji,
                amount: String(g.targetEur),
                date: g.byDate,
                start: String(g.savedEur),
              },
            })
          }
          onNew={() => setSetup({})}
        />
      ) : (
        <EmptyGoal onSet={() => setSetup({})} />
      )}

      {view.result ? (
        <ResultCard view={view} />
      ) : view.mission ? (
        <MissionCard view={view} />
      ) : g && !g.reached ? (
        <PickMission view={view} />
      ) : null}

      {setup && (
        <GoalSetupSheet
          today={view.week.today}
          initial={setup.initial}
          editing={setup.editing}
          onClose={() => setSetup(null)}
        />
      )}
    </div>
  );
}

/** No goal yet: one warm invitation, two ways in (form or coach). */
function EmptyGoal({ onSet }: { onSet: () => void }) {
  return (
    <section className={CARD} style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))" }}>
      <p className="text-3xl">🎯</p>
      <h2 className="mt-1 text-lg font-semibold leading-snug">Saving for something?</h2>
      <p className="mt-1 text-sm text-muted">
        Set a goal and get one small mission a week, built from your own spending.
      </p>
      <button
        type="button"
        onClick={onSet}
        className="mt-3 w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-foreground"
      >
        Set a goal
      </button>
      <Link
        href={`/chat?ask=${encodeURIComponent("Help me save for something")}`}
        className="mt-2 block text-center text-sm font-medium text-accent"
      >
        or tell the coach what you want
      </Link>
    </section>
  );
}

/** The hero: what you're saving for and how far you are. */
function GoalCard({ view, onEdit, onNew }: { view: GoalView; onEdit: () => void; onNew: () => void }) {
  const g = view.goal!;
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function deposit() {
    const res = await goalAction({ action: "deposit", eur: Number(amount.replace(",", ".")) });
    if (res.error) return setMsg(res.error);
    setAdding(false);
    setAmount("");
    setMsg(null);
  }
  async function remove() {
    setMenu(false);
    if (window.confirm(`Remove "${g.name}"? Your level and weeks won stay.`)) await goalAction({ action: "reset" });
  }

  return (
    <section className={CARD}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl"
          style={{ background: TRACK }}
          aria-hidden
        >
          {g.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{g.name}</h2>
          <p className="text-xs text-muted">by {fiDay(g.byDate)}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-accent"
          style={{ background: TRACK }}
          title={`${view.weeksWon} mission week${view.weeksWon === 1 ? "" : "s"} won`}
        >
          Level {view.level}
        </span>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu(!menu)}
            aria-label="Goal options"
            aria-expanded={menu}
            className="-mr-1 px-1.5 text-xl leading-none text-muted"
          >
            ⋯
          </button>
          {menu && (
            <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-xl border border-line bg-surface text-sm shadow-lg">
              <button type="button" className="block w-full px-3 py-2 text-left" onClick={() => (setMenu(false), onEdit())}>
                Change goal
              </button>
              <button type="button" className="block w-full px-3 py-2 text-left text-muted" onClick={remove}>
                Remove goal
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-muted">
        <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
          <CountUp value={g.savedEur} format={eur0} />
        </span>{" "}
        of {eur0(g.targetEur)}
      </p>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full" style={{ background: TRACK }}>
        <div className="goal-fill h-full rounded-full bg-accent" style={{ width: `${Math.max(g.pct, g.savedEur > 0 ? 2 : 0)}%` }} />
      </div>

      {g.reached ? (
        <div className="mt-3">
          <p className="font-semibold">You made it 🎉</p>
          <button
            type="button"
            onClick={onNew}
            className="mt-2 w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-foreground"
          >
            Set a new goal
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          <p className="min-w-0">
            <span className="font-semibold tabular-nums">{eur0(g.weeklyNeededEur)}</span>
            <span className="text-muted"> a week gets you there</span>
            {g.daysAhead > 0 && (
              <span className="leak-pop mt-0.5 block font-medium text-accent">✨ {daysText(g.daysAhead)} ahead of plan</span>
            )}
          </p>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
            >
              + Add money
            </button>
          )}
        </div>
      )}

      {adding && (
        <div className="fade-up mt-3 flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-xl border border-line bg-background px-3 focus-within:border-accent">
            <input
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && deposit()}
              inputMode="decimal"
              placeholder={String(Math.round(g.weeklyNeededEur))}
              aria-label="Amount to move to the goal"
              className="w-full bg-transparent py-2 text-[15px] tabular-nums outline-none"
            />
            <span className="text-muted">€</span>
          </div>
          <button type="button" onClick={deposit} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
            Move
          </button>
          <button type="button" onClick={() => setAdding(false)} aria-label="Cancel" className="px-1 text-xl text-muted">
            ×
          </button>
        </div>
      )}
      {msg && <p className="mt-1 text-xs text-warning">{msg}</p>}
    </section>
  );
}

/** "Thu 1.10. – Wed 7.10." */
function weekLabel(view: GoalView) {
  const { from, to } = view.week.range;
  return `${weekday(from)} ${fiDay(from, false)} – ${weekday(to)} ${fiDay(to, false)}`;
}

function closerText(m: Mission, goalName?: string) {
  if (m.daysCloser === null || !goalName) return `keeps ~${eur0(m.keepsEur)}`;
  return `keeps ~${eur0(m.keepsEur)} → ${daysText(m.daysCloser)} closer to ${goalName}`;
}

/** Pick 1 of up to 3 missions. You choose; the first saves the most. */
function PickMission({ view }: { view: GoalView }) {
  const [busy, setBusy] = useState<string | null>(null);
  const pick = async (id: string) => {
    setBusy(id);
    await goalAction({ action: "pickMission", id });
    setBusy(null);
  };
  return (
    <section className={CARD}>
      <h2 className="font-semibold">Pick this week&apos;s mission</h2>
      <p className="text-xs text-muted">
        Week {view.week.n} · {weekLabel(view)} · one small change, your choice
      </p>
      {view.candidates.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Your everyday spending is already lean, so there&apos;s nothing to trim this week. Moving money with “Add
          money” is the way forward.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {view.candidates.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => pick(m.id)}
                disabled={!!busy}
                className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left transition hover:border-accent disabled:opacity-60"
              >
                <CategoryTile category={m.category} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium leading-snug">{m.title}</span>
                    {i === 0 && view.candidates.length > 1 && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                        Biggest step
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    Usually {eur0(m.baselineEur)} ·{" "}
                    <span className="font-medium text-accent">{closerText(m, view.goal?.name)}</span>
                  </span>
                  {m.dayHint && <span className="mt-0.5 block text-xs text-muted">{m.dayHint}</span>}
                </span>
                <span className="self-center text-muted">{busy === m.id ? "…" : "›"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {view.skippedForJoy.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          ✨ Not suggesting {view.skippedForJoy.join(", ")}: you said it sparks joy.
        </p>
      )}
    </section>
  );
}

/** The running mission: how much is left, day by day. */
function MissionCard({ view }: { view: GoalView }) {
  const m = view.mission!;
  const used = Math.min(100, (m.spentEur / m.capEur) * 100);
  const color =
    m.status === "on_track" ? "var(--accent)" : m.status === "close" ? "var(--basket-irregular)" : "var(--muted)";
  return (
    <section className={CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">This week&apos;s mission</h2>
        <span className="text-xs text-muted tabular-nums">Day {view.week.day} of 7</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <CategoryTile category={m.category} size={36} />
        <p className="font-medium leading-snug">{m.title}</p>
      </div>

      <div className="mt-3 h-3 w-full overflow-hidden rounded-full" style={{ background: TRACK }}>
        <div className="goal-fill h-full rounded-full" style={{ width: `${used}%`, background: color }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
        <span>{eur0(m.spentEur)} spent</span>
        <span>limit {eur0(m.capEur)}</span>
      </div>

      <p className="mt-2 text-sm">
        {m.status === "over" ? (
          <span className="text-muted">Over the limit this time, and that&apos;s okay. Every purchase you skip still counts.</span>
        ) : (
          <>
            <span className="font-semibold tabular-nums">{eur0(m.leftEur)}</span>
            <span className="text-muted">
              {" "}
              left for {m.daysLeft} day{m.daysLeft === 1 ? "" : "s"}
              {m.status === "close" ? ". Nearly there, go easy" : ""}
            </span>
          </>
        )}
      </p>
      {m.dayHint && <p className="mt-1 text-xs text-muted">💡 {m.dayHint}</p>}

      {m.purchases.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-2 text-sm">
          {m.purchases.map((p, i) => (
            <li key={i} className="fade-up flex justify-between tabular-nums">
              <span className="text-muted">
                {weekday(p.date)} {fiDay(p.date, false)} · {m.habit}
              </span>
              <span>{eur0(p.eur)}</span>
            </li>
          ))}
        </ul>
      )}

      {SHOW_CUSTOMER_SWITCHER && <DemoStrip view={view} />}
    </section>
  );
}

/**
 * Demo controls: a purchase on the mission's habit, the next day, the end of the week.
 * WHY dark like the DEMO bar: the audience should see it isn't part of the bank app.
 */
function DemoStrip({ view }: { view: GoalView }) {
  const m = view.mission!;
  const small = m.typicalPurchaseEur;
  const big = Math.max(small + 5, Math.round(small * 1.8));
  const btn = "rounded-full bg-chrome-foreground/15 px-2.5 py-1 font-semibold";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-chrome px-2.5 py-2 text-xs text-chrome-foreground">
      <span className="mr-0.5 rounded bg-chrome-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">DEMO</span>
      <button type="button" className={btn} onClick={() => goalAction({ action: "addPurchase", eur: small })}>
        +{small} €
      </button>
      <button type="button" className={btn} onClick={() => goalAction({ action: "addPurchase", eur: big })}>
        +{big} €
      </button>
      <span className="flex-1" />
      <button type="button" className={btn} onClick={() => goalAction({ action: "nextDay" })}>
        {view.week.day >= 7 ? "End week" : "Next day ›"}
      </button>
      {view.week.day < 7 && (
        <button type="button" className={btn} onClick={() => goalAction({ action: "endWeek" })}>
          End week ⏩
        </button>
      )}
    </div>
  );
}

/** A few dots that fly out once (CSS .goal-burst, off with reduced motion). */
function Burst() {
  const dots = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { dx: Math.cos(a) * 46, dy: Math.sin(a) * 46, c: i % 2 ? "var(--accent)" : "#f5b301" };
  });
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {dots.map((d, i) => (
        <span
          key={i}
          className="goal-burst absolute h-2 w-2 rounded-full"
          style={{ background: d.c, ["--dx" as string]: `${d.dx}px`, ["--dy" as string]: `${d.dy}px` }}
        />
      ))}
    </span>
  );
}

/** The week is over: celebrate (or shrug kindly), then offer to move what was kept. */
function ResultCard({ view }: { view: GoalView }) {
  const r = view.result!;
  const g = view.goal;
  const [busy, setBusy] = useState(false);
  const act = async (action: string) => {
    setBusy(true);
    await goalAction({ action });
    setBusy(false);
  };
  const canMove = !!g && r.keptEur >= 1 && r.movedEur === null;
  return (
    <section className={`${CARD} fade-up text-center`}>
      <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full text-3xl" style={{ background: TRACK }}>
        {r.won ? "🏆" : "🌱"}
        {r.won && <Burst />}
      </div>
      <h2 className="mt-2 text-lg font-semibold">{r.won ? "Mission complete!" : "Not this time"}</h2>
      {r.won ? (
        <p className="leak-pop mt-0.5 text-sm font-semibold text-accent">+1 week won · Level {view.level}</p>
      ) : (
        <p className="mt-0.5 text-sm text-muted">Next week&apos;s mission will be a bit lighter.</p>
      )}
      <p className="mt-2 text-sm">
        You spent <span className="font-semibold tabular-nums">{eur0(r.spentEur)}</span> on {r.habit.toLowerCase()} (limit{" "}
        {eur0(r.capEur)}).
        {r.keptEur >= 1 && (
          <>
            {" "}
            That&apos;s <span className="font-semibold text-accent tabular-nums">{eur0(r.keptEur)}</span> less than your
            usual week.
          </>
        )}
      </p>

      {canMove ? (
        <div className="mt-3 space-y-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => act("moveToGoal")}
            className="w-full rounded-full bg-accent py-3 text-sm font-semibold text-accent-foreground"
          >
            Put {eur0(r.keptEur)} toward {g!.name} {g!.emoji}
          </button>
          <button type="button" disabled={busy} onClick={() => act("skipMove")} className="w-full py-1.5 text-sm text-muted">
            Not now
          </button>
          {/* WHY say it: spending less isn't saving until the money actually moves. */}
          <p className="text-xs text-muted">Spending less only becomes saving once you move it.</p>
        </div>
      ) : (
        <>
          {!!r.movedEur && (
            <p className="leak-pop mt-2 text-sm font-semibold text-accent">
              ✓ {eur0(r.movedEur)} moved to {g?.name ?? "your goal"}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => act("nextWeek")}
            className="mt-3 w-full rounded-full border border-line py-2.5 text-sm font-semibold"
          >
            Start next week
          </button>
        </>
      )}
    </section>
  );
}
