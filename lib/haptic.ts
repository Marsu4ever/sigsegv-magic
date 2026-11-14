/**
 * A tiny vibration on tap, so buttons feel physical. Android only (iPhone Safari has no
 * vibrate API); silently does nothing elsewhere. Owner: UI person.
 * WHY so short (8 ms): a tick, not a buzz.
 */
export function tapHaptic() {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (!window.matchMedia("(pointer: coarse)").matches) return; // phones only, not laptops
  try {
    navigator.vibrate(8);
  } catch {
    // some browsers throw when vibration isn't allowed; ignore
  }
}
