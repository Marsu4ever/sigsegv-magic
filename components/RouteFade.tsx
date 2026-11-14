"use client";
/**
 * A quick fade when switching tabs, so the new screen eases in instead of snapping.
 * Owner: UI person.
 * WHY animate the wrapper (Web Animations API) and not remount it with a key: remounting
 * would throw away each page's state (e.g. the chat), which Next keeps between tabs.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function RouteFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const el = useRef<HTMLDivElement>(null);
  // WHY compare with the last path (not a "first time" flag): dev mode runs effects twice,
  // which made the flag fade the very first screen too.
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.current?.animate(
      [
        { opacity: 0.35, transform: "translateY(4px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 180, easing: "ease-out" },
    );
  }, [pathname]);
  return (
    <div ref={el} className="h-full">
      {children}
    </div>
  );
}
