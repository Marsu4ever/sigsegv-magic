"use client";
/**
 * Bottom tab bar. To add a tab: create app/<name>/page.tsx and add it to TABS.
 * WHY bottom tabs: standard mobile pattern, reachable with one thumb.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

// WHY outline icons, not emoji: emoji looked homemade; these match the app.
const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/chat", label: "Chat", icon: "chat" },
  { href: "/week", label: "This week", icon: "calendar" },
  // WHY always shown: customers without a mortgage get a friendly empty state.
  { href: "/loan", label: "Home loan", icon: "home" },
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
            className={`flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] ${
              active ? "font-semibold text-accent" : "text-muted"
            }`}
          >
            <Icon name={tab.icon} size={22} strokeWidth={active ? 2.2 : 1.8} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
