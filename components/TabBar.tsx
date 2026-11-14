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
// WHY this order (changes the old "Chat first" call): the usual bank-app layout — Home
// first, then the history, then the coach. Home merges the old Account + This week tabs.
// `also`: pages without their own tab that light up this one (e.g. /week opens from Home).
const TABS: { href: string; label: string; icon: IconName; also?: string[] }[] = [
  { href: "/home", label: "Home", icon: "home", also: ["/week", "/account"] },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/chat", label: "Coach", icon: "chat" },
  // WHY a key: the house icon now means Home. Always shown: customers without a mortgage
  // get a friendly empty state.
  { href: "/loan", label: "Home loan", icon: "key" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    // WHY not position:fixed: the app shell (app/layout.tsx) is a full-height column, so the bar
    // always sits at the bottom and pages scroll above it — nothing is ever hidden behind it.
    <nav aria-label="Main" className="flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => {
        const active = [tab.href, ...(tab.also ?? [])].some((p) => pathname.startsWith(p));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            // Tapping Chat always starts fresh: back to the suggested questions.
            onClick={() => {
              tapHaptic();
              if (tab.href === "/chat") requestChatReset();
            }}
            className={`group flex flex-1 flex-col items-center gap-0.5 pt-1.5 pb-1.5 text-[11px] transition-colors ${
              active ? "font-semibold text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {/* Icon presses in on tap and lifts a little when its tab becomes active.
                WHY the soft pill behind the active icon: colour alone is easy to miss. */}
            <span
              className={`flex h-7 w-14 items-center justify-center rounded-full transition-all duration-200 group-active:scale-90 ${
                active ? "-translate-y-0.5 bg-accent/12" : ""
              }`}
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
