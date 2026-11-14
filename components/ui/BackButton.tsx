"use client";
/**
 * The one back button of the app: a round "‹" at the left of a header. Owner: UI person.
 * Use it on pages without their own tab (e.g. /week), full-screen views, and sheets opened
 * from another sheet. Not on the tab pages themselves — the tab bar is the way around there.
 *
 * `onClick` → closes a view (full-screen chart, nested sheet).
 * `fallback` → for pages: goes back in the browser history when there is any (so the user
 * returns to exactly where they were, e.g. an open sheet on Home), else to `fallback`.
 */
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export function BackButton({
  onClick,
  fallback = "/home",
  label = "Back",
}: {
  onClick?: () => void;
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (onClick) return onClick();
        // WHY history.length: opened straight from a link / new tab there's nothing to go back to.
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-surface-2"
    >
      <Icon name="chevron" size={22} className="rotate-180" />
    </button>
  );
}
