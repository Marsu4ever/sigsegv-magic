/**
 * Shared layout for the TEAM pages (/dev, /data, /customer_profiles).
 * These pages are for us while building — not part of the product demo.
 */
import Link from "next/link";

export function DevPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="font-semibold">{title}</h1>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-muted">team page</span>
        </div>
        <nav className="mt-1 flex gap-3 text-xs text-accent">
          <Link href="/dev">Team hub</Link>
          <Link href="/data">Data</Link>
          <Link href="/customer_profiles">Customer profiles</Link>
        </nav>
      </header>
      <div className="space-y-5 p-4 pb-10">
        {intro && <div className="text-sm text-muted">{intro}</div>}
        {children}
      </div>
    </div>
  );
}

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface p-4 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px]">{children}</code>;
}
