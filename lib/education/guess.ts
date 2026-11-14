/**
 * Slider maths for the "guess the number" lesson cards. Safe in client code (no data access).
 * The server builds the range (lib/education/topics.ts); the card only checks the guess.
 */

/** The smallest "round" number ≥ x: 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ (e.g. 1 130 → 1 500). */
export function niceCeil(x: number): number {
  if (x <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(x));
  const nice = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * pow >= x - 1e-9) ?? 10;
  return nice * pow;
}

/** A slider step that gives about 100 positions: 1, 2, 5, 10, 20, 50… */
export function niceStep(max: number): number {
  const raw = max / 100;
  if (raw <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
}

/**
 * Slider range for an answer. WHY a round max and a per-topic factor: a max of exactly
 * 2 × the answer would put the answer in the same spot every time and give it away.
 */
export function guessRange(answer: number, factor: number, floor = 10) {
  const span = niceCeil(Math.max(Math.abs(answer) * factor, floor));
  const min = answer < 0 ? -span : 0;
  const max = span;
  const step = niceStep(max - min);
  const start = Math.round((min + max) / 2 / step) * step;
  return { min, max, step, start };
}

/** Right if the real number lands inside the range around the guess (± tolerance). */
export function isCloseEnough(guess: number, answer: number, tolerance: number): boolean {
  return Math.abs(guess - answer) <= tolerance + 1e-9;
}
