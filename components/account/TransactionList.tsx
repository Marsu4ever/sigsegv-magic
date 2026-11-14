"use client";
/**
 * Transactions grouped by day, like a bank statement. Used by Home ("Recent transactions")
 * and Activity (one month at a time). Data: AccountSummary.transactions (GET /api/account).
 * Owner: UI person.
 */
import type { AccountTransaction } from "@/lib/types";
import { CategoryTile } from "@/components/charts/categoryIcons";
import { formatValue, weekdayDate } from "@/components/charts/format";
import { Icon } from "@/components/ui/Icon";

const eur = (n: number) => formatValue(n, "€");

/** "2026-10-01" → "2026-09-30". WHY local: lib/data is server-only by team rule. */
function previousDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Day heading in the list. "Today" = the latest day in the data, as everywhere in the app. */
function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === previousDay(today)) return "Yesterday";
  return weekdayDate(date, date.slice(0, 4) !== today.slice(0, 4));
}

function groupByDay(txs: AccountTransaction[]): { date: string; items: AccountTransaction[] }[] {
  const groups: { date: string; items: AccountTransaction[] }[] = [];
  for (const t of txs) {
    const last = groups.at(-1);
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }
  return groups;
}

function TransactionRow({ t }: { t: AccountTransaction }) {
  const title = t.merchantType ?? t.category;
  const sub = [t.merchantType ? t.category : null, t.kind === "savings_move" ? "to savings" : null, t.time]
    .filter(Boolean)
    .join(" · ");
  // WHY these colours: like a bank statement — money in green, spending plain,
  // moves to your own savings greyed out (it isn't spending).
  const amountClass =
    t.kind === "income"
      ? "font-semibold text-money-in"
      : t.kind === "savings_move"
        ? "text-muted"
        : "text-foreground";
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
      {t.kind === "spending" ? (
        <CategoryTile category={t.category} size={36} />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon name={t.kind === "income" ? "coins" : "piggy"} size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
      <span className={`shrink-0 text-sm tabular-nums ${amountClass}`}>
        {t.amountEur > 0 ? "+" : ""}
        {eur(t.amountEur)}
      </span>
    </li>
  );
}

/** Newest first, with a small heading per day ("Today", "Yesterday", "Mon 21.9."). */
export function TransactionDayList({ txs, today }: { txs: AccountTransaction[]; today: string }) {
  return (
    <>
      {groupByDay(txs).map((g) => (
        <div key={g.date}>
          <p className="bg-background px-4 py-1.5 text-xs font-medium text-muted">{dayLabel(g.date, today)}</p>
          <ul>
            {g.items.map((t, i) => (
              <TransactionRow key={`${t.date}-${t.time}-${i}`} t={t} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
