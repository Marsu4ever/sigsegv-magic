"use client";
/**
 * "Baskets" chart — the 3 baskets, each in its own colour, with the
 * categories inside as lighter shades of that colour. Owner: UI person.
 * Data: basket_details (lib/insights/basketTree.ts).
 *
 *   chat card:   one bar (all categories, grouped by basket) + 3 basket totals
 *   full screen: the same bar + one card per basket; tap a category to open
 *                what's inside it (merchant types), and its piece of the bar
 *                lights up; tap a merchant type to see each purchase by date
 *   both:        a bracket under the bar shows each basket's share in %
 */
import { useState } from "react";
import type { Basket, BasketGroup, ChartSpec } from "@/lib/types";
import { CategoryTile } from "./categoryIcons";

const eur = (n: number) => n.toLocaleString("fi-FI", { style: "currency", currency: "EUR" });
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const shortDate = (d: string) =>
  `${WEEKDAYS[new Date(d + "T00:00:00Z").getUTCDay()]} ${Number(d.slice(8))}.${Number(d.slice(5, 7))}.`;

// WHY the team's own words here: "regular / irregular / everything else" is how
// we explain the baskets to people.
const BASKET_TEXT: Record<Basket, { name: string; meaning: string; color: string }> = {
  mandatory_regular: {
    name: "Regular",
    meaning: "Same bills every month",
    color: "var(--basket-regular)",
  },
  mandatory_irregular: {
    name: "Irregular",
    meaning: "Needed, but surprise timing",
    color: "var(--basket-irregular)",
  },
  everyday: {
    name: "Everything else",
    meaning: "Your choices — easiest to change",
    color: "var(--basket-everyday)",
  },
};

/** Category shades: the biggest category gets the full basket colour, the rest lighter. */
const SHADES = [100, 72, 52, 38, 28, 20];
const shade = (basket: Basket, i: number) =>
  `color-mix(in srgb, ${BASKET_TEXT[basket].color} ${SHADES[Math.min(i, SHADES.length - 1)]}%, white)`;

export function BasketsChart({ spec, compact }: { spec: ChartSpec; compact: boolean }) {
  const baskets = spec.baskets ?? [];
  const total = baskets.reduce((s, b) => s + b.total, 0);
  // Opened category, as "basket/category" (tap again to close).
  const [open, setOpen] = useState<string | null>(null);

  if (total <= 0) return <p className="py-6 text-center text-sm text-muted">No spending.</p>;

  return (
    <div className="space-y-3">
      {spec.periodLabel && (
        <div className="flex items-baseline justify-between text-xs text-muted">
          <span>{spec.periodLabel}</span>
          <span className="text-sm font-semibold text-foreground tabular-nums">{eur(total)}</span>
        </div>
      )}

      <StackedBar
        baskets={baskets}
        total={total}
        tall={!compact}
        open={open}
        onTap={compact ? undefined : (key) => setOpen(open === key ? null : key)}
      />
      <BasketBrackets baskets={baskets} total={total} />

      {compact ? (
        <div className="grid grid-cols-3 gap-1">
          {baskets.map((b) => (
            // WHY plain (no box, no %): the brackets above already show the %.
            <div key={b.basket}>
              <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: BASKET_TEXT[b.basket].color }}
                />
                {BASKET_TEXT[b.basket].name}
              </div>
              <div className="text-sm font-semibold tabular-nums">{eur(b.total)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-xs text-muted">Tap a category to see what&apos;s in it</p>
          {baskets.map((b) => (
            <BasketCard
              key={b.basket}
              group={b}
              total={total}
              open={open}
              onToggle={(key) => setOpen(open === key ? null : key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A thin bracket under each basket's part of the bar, with its share in %.
 * WHY: the shades split the bar into many pieces; the brackets show where
 * each basket starts and ends.
 */
function BasketBrackets({ baskets, total }: { baskets: BasketGroup[]; total: number }) {
  return (
    <div className="-mt-1.5 flex w-full gap-0.5" aria-hidden="true">
      {baskets
        .filter((b) => b.total > 0)
        .map((b) => {
          const color = BASKET_TEXT[b.basket].color;
          return (
            <div
              key={b.basket}
              className="flex min-w-0 flex-col items-center"
              style={{ width: `${(b.total / total) * 100}%` }}
            >
              <div
                className="h-1.5 w-full rounded-b-sm border-x-2 border-b-2"
                style={{ borderColor: color }}
              />
              <span className="mt-0.5 text-[11px] font-semibold tabular-nums" style={{ color }}>
                {pct(b.total, total)}%
              </span>
            </div>
          );
        })}
    </div>
  );
}

/** One bar: baskets side by side, each split into its categories (shades). */
function StackedBar({
  baskets,
  total,
  tall,
  open,
  onTap,
}: {
  baskets: BasketGroup[];
  total: number;
  tall: boolean;
  open: string | null;
  onTap?: (key: string) => void;
}) {
  // The opened category's position on the bar, for the label above it.
  let start = 0;
  let picked: { name: string; color: string; share: number; center: number } | null = null;
  for (const b of baskets)
    b.categories.forEach((c) => {
      const share = c.total / total;
      if (`${b.basket}/${c.name}` === open)
        picked = {
          name: c.name,
          color: BASKET_TEXT[b.basket].color,
          share,
          center: start + share / 2,
        };
      start += share;
    });
  const label = picked as { name: string; color: string; share: number; center: number } | null;

  return (
    <div>
      {/* Full screen: name + % of all spending above the opened category's piece.
          WHY the row is always there: the bar doesn't jump when a label appears. */}
      {tall && (
        <div className="relative mb-1 h-6">
          {label && (
            <span
              className="absolute top-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white shadow-sm"
              style={{
                background: label.color,
                // Centred over the piece, but kept inside the screen at the ends.
                left: `${Math.min(Math.max(label.center * 100, 12), 88)}%`,
                transform: "translateX(-50%)",
              }}
            >
              {label.name} {Math.round(label.share * 100)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`flex w-full gap-0.5 overflow-hidden rounded-lg ${tall ? "h-9" : "h-5"}`}
        role="img"
        aria-label="Spending split into the 3 baskets and their categories"
      >
        {baskets.flatMap((b) =>
          b.categories.map((c, i) => {
            const key = `${b.basket}/${c.name}`;
            const dim = open !== null && open !== key;
            const Seg = onTap ? "button" : "div";
            return (
              <Seg
                key={key}
                {...(onTap ? { type: "button" as const, onClick: () => onTap(key) } : {})}
                title={`${c.name}: ${eur(c.total)}`}
                className="h-full transition-opacity"
                style={{
                  width: `${(c.total / total) * 100}%`,
                  minWidth: 3,
                  background: shade(b.basket, i),
                  opacity: dim ? 0.3 : 1,
                  // The opened category's piece gets an outline so it's easy to spot.
                  boxShadow: open === key ? "inset 0 0 0 2px var(--foreground)" : undefined,
                }}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}

function BasketCard({
  group,
  total,
  open,
  onToggle,
}: {
  group: BasketGroup;
  total: number;
  open: string | null;
  onToggle: (key: string) => void;
}) {
  const t = BASKET_TEXT[group.basket];
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-baseline justify-between gap-2">
        {/* % next to the name, total alone on the right (they were too close). */}
        <span className="flex items-center gap-2 font-semibold">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
          {t.name}
          <span className="text-xs font-semibold tabular-nums" style={{ color: t.color }}>
            {pct(group.total, total)}%
          </span>
        </span>
        <span className="font-semibold tabular-nums">{eur(group.total)}</span>
      </div>
      <p className="mb-2 ml-5 text-xs text-muted">{t.meaning}</p>

      {group.categories.length === 0 ? (
        <p className="ml-5 text-sm text-muted">Nothing this period.</p>
      ) : (
        <ul className="space-y-1">
          {group.categories.map((c, i) => {
            const key = `${group.basket}/${c.name}`;
            const isOpen = open === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onToggle(key)}
                  aria-expanded={isOpen}
                  className={`relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-left text-sm ${
                    isOpen ? "ring-2" : ""
                  }`}
                  style={isOpen ? { ["--tw-ring-color" as string]: t.color } : undefined}
                >
                  {/* Bar behind the row: this category's share of its basket.
                      Opened → darker (like its piece of the top bar); the
                      other rows fade a little, same as the top bar. */}
                  <span
                    className="absolute inset-y-0 left-0 transition-opacity"
                    style={{
                      width: `${Math.max(3, (c.total / group.total) * 100)}%`,
                      background: shade(group.basket, i),
                      opacity: isOpen ? 0.75 : open ? 0.15 : 0.3,
                    }}
                  />
                  <span className="relative flex items-center gap-2">
                    <CategoryTile category={c.name} active={isOpen} />
                    <span className={isOpen ? "font-semibold" : ""}>{c.name}</span>
                  </span>
                  <span className="relative font-medium tabular-nums">{eur(c.total)}</span>
                </button>

                {/* What's inside the category, biggest first. */}
                {isOpen && (
                  <ul
                    className="mt-1 mb-2 ml-5 space-y-0.5 border-l-2 pl-2 text-sm"
                    style={{ borderColor: shade(group.basket, i) }}
                  >
                    {c.merchants.map((m) => (
                      <Merchant key={m.name} m={m} color={t.color} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One merchant type in an open category; tap it to see each purchase by date. */
function Merchant({
  m,
  color,
}: {
  m: BasketGroup["categories"][number]["merchants"][number];
  color: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left ${
          open ? "bg-background font-medium" : ""
        }`}
      >
        <span>
          {m.name}
          <span className="ml-1 text-xs text-muted">{m.count}×</span>
        </span>
        <span className="tabular-nums">{eur(m.total)}</span>
      </button>
      {open && (
        <ul className="mt-0.5 mb-1 ml-3 space-y-0.5 text-xs">
          {m.purchases.map((p, i) => (
            <li key={i} className="flex items-center justify-between gap-2 px-1.5 py-0.5">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                {shortDate(p.date)}
              </span>
              <span className="tabular-nums">{eur(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
