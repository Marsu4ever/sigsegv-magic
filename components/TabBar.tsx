"use client";
/**
 * Bottom tab bar. To add a tab: create app/<name>/page.tsx and add it to TABS.
 * WHY bottom tabs: standard mobile pattern, reachable with one thumb.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/week", label: "This week", icon: "📅" },
  // WHY always shown: customers without a mortgage get a friendly empty state.
  { href: "/loan", label: "Home loan", icon: "🏠" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              active ? "font-semibold text-accent" : "text-muted"
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
