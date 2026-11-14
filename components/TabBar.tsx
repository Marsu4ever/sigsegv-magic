"use client";
/**
 * Bottom tab bar. To add a tab: create app/<name>/page.tsx and add it to TABS.
 * WHY bottom tabs: standard mobile pattern, reachable with one thumb.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { requestChatReset } from "@/lib/chatReset";
import { tapHaptic } from "@/lib/haptic";

// WHY outline icons, not emoji: emoji looked homemade; these match the app.
const TABS: { href: string; label: string; icon: IconName }[] = [
  // WHY Chat first (far left): the AI coach is the app's main feature (team call).
  { href: "/chat", label: "Chat", icon: "chat" },
  // WHY "Account" + coins, not "Home": the house icon already means Home loan.
  { href: "/account", label: "Account", icon: "coins" },
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
            // Tapping Chat always starts fresh: back to the suggested questions.
            onClick={() => {
              tapHaptic();
              if (tab.href === "/chat") requestChatReset();
            }}
            className={`group flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] transition-colors ${
              active ? "font-semibold text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {/* Icon presses in on tap and lifts a little when its tab becomes active. */}
            <span
              className={`transition-transform duration-200 group-active:scale-90 ${active ? "-translate-y-0.5" : ""}`}
            >
              <Icon name={tab.icon} size={22} strokeWidth={active ? 2.2 : 1.8} />
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
