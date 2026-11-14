"use client";
/**
 * A number that counts to `value` (from 0 the first time, then from its last
 * value — so a smaller value "rolls" the number down). Owner: UI person.
 * Used by the Leaks chart and the what-if view's "You'd save".
 *
 * whenVisible: wait at 0 until the number scrolls into view, then count.
 * WHY: a number that already finished counting off screen is a wasted moment.
 * Reduced motion (system setting) → jumps straight to the value.
 */
import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function CountUp({
  value,
  format,
  duration = 900,
  delay = 0,
  whenVisible = false,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  delay?: number;
  whenVisible?: boolean;
}) {
  const [shown, setShown] = useState(0);
  const [visible, setVisible] = useState(!whenVisible);
  const el = useRef<HTMLSpanElement>(null);
  const current = useRef(0);
  const first = useRef(true);

  // Start once the number is on screen (only when whenVisible). Never stops again.
  useEffect(() => {
    if (visible || !el.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      // WHY 0.6: count when most of it is in view, not when its top edge peeks in.
      { threshold: 0.6 },
    );
    io.observe(el.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const start = current.current;
    const ms = prefersReducedMotion() ? 0 : duration;
    const wait = first.current ? delay : 0;
    first.current = false;
    let raf = 0;
    let t0: number | null = null;
    const step = (t: number) => {
      if (t0 === null) t0 = t;
      const p = ms === 0 ? 1 : Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // fast, then gently settles
      current.current = start + (value - start) * eased;
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => (raf = requestAnimationFrame(step)), wait);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [value, duration, delay, visible]);

  return <span ref={el}>{format(shown)}</span>;
}
