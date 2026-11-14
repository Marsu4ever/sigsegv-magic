"use client";
/**
 * Small 🛠 link to the team hub (/dev), fixed to the far bottom-right of the
 * BROWSER WINDOW — outside the phone-sized app column, so it doesn't look
 * like part of the product.
 * Set SHOW_DEV_BUTTON to false before the demo to hide it.
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
      className={`fixed right-3 bottom-3 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-base shadow-sm ${
        active ? "opacity-100" : "opacity-50 hover:opacity-100"
      }`}
    >
      🛠
    </Link>
  );
}
