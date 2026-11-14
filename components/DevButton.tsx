"use client";
/**
 * Small 🛠 link to the team hub (/dev).
 * - Wide screens: fixed to the far bottom-right of the BROWSER WINDOW — outside the
 *   phone-sized app column, so it doesn't look like part of the product.
 * - Phones (< 768 px): the app fills the screen, so that spot covers the tab bar.
 *   DevHeaderButton shows it at the right of each tab's header instead.
 * Set SHOW_DEV_BUTTON to false before the demo to hide both.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const SHOW_DEV_BUTTON = true;

// Shown highlighted on all team pages.
const DEV_PATHS = ["/dev", "/data", "/customer_profiles"];

export function DevButton() {
  const pathname = usePathname();
  if (!SHOW_DEV_BUTTON) return null;
  const active = DEV_PATHS.some((p) => pathname.startsWith(p));
  return (
    <Link
      href="/dev"
      title="Team hub (dev only)"
      aria-label="Team hub (dev only)"
      className={`fixed right-3 bottom-3 z-40 hidden h-9 w-9 items-center md:flex justify-center rounded-full border border-line bg-surface text-base shadow-sm ${
        active ? "opacity-100" : "opacity-50 hover:opacity-100"
      }`}
    >
      🛠
    </Link>
  );
}

/** Phones only: the 🛠 link at the right side of a tab's header (see top of file). */
export function DevHeaderButton() {
  if (!SHOW_DEV_BUTTON) return null;
  return (
    <Link
      href="/dev"
      title="Team hub (dev only)"
      aria-label="Team hub (dev only)"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-background text-sm opacity-60 hover:opacity-100 md:hidden"
    >
      🛠
    </Link>
  );
}
