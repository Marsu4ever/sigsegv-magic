/**
 * Which lessons this user has seen and guessed — saved on the device. CLIENT ONLY.
 *
 * "Seen" = the user OPENED the lesson: tapped its 🎯 button in the chat, "Try it" / "Again" on
 * Home, or touched the card (slider or Guess). WHY not "the card reached the screen" (E, 14 Nov):
 * a card the user scrolled past wasn't really seen, and it used up the lesson for good.
 *
 * WHY localStorage (PLAN-financial-education.md §4.8): no accounts in the demo. Keyed by the demo
 * customer (cookie), so switching customers in the app shows that person's own progress, and it
 * survives reloads and "new chat". The chat sends the seen list to the server (ChatRequest.seenLessons),
 * which never replays a seen lesson unless the user asks about its topic.
 * To move this to a server later, keep these function names and change only this file.
 */
import { useSyncExternalStore } from "react";
import type { LessonSpec, LessonTopic } from "@/lib/types";
import { LESSON_TOPICS } from "@/lib/types";
import { DEMO_CUSTOMER_COOKIE } from "@/lib/demoCustomer";

export type LessonRecord = {
  seenAt: string; // ISO time the user first opened the lesson (see the top of this file)
  /** The latest guess, if the user made one. */
  guess?: { value: number; answer: number; unit: "€" | "%"; close: boolean; at: string };
  /** Ever guessed close enough (kept when a later replay misses). */
  everClose?: boolean;
};

export type LessonProgress = Partial<Record<LessonTopic, LessonRecord>>;

const CHANGED = "money-coach:lessons";
const EMPTY: LessonProgress = {};

function storageKey(): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${DEMO_CUSTOMER_COOKIE}=([^;]*)`));
  return `edu:v1:${(m && decodeURIComponent(m[1])) || "default"}`;
}

/** Raw stored text. WHY try/catch everywhere: storage can be off (private mode) or full. */
function readRaw(): string {
  try {
    return `${storageKey()}|${localStorage.getItem(storageKey()) ?? ""}`;
  } catch {
    return "";
  }
}

function parse(raw: string): LessonProgress {
  try {
    const json = JSON.parse(raw.slice(raw.indexOf("|") + 1) || "{}");
    if (!json || typeof json !== "object") return {};
    // Keep only known topics with a seenAt (older or hand-edited data can't break the app).
    const out: LessonProgress = {};
    for (const t of LESSON_TOPICS) {
      if (json[t] && typeof json[t].seenAt === "string") out[t] = json[t];
    }
    return out;
  } catch {
    return {};
  }
}

let cache = { raw: "", value: EMPTY };

export function readProgress(): LessonProgress {
  if (typeof window === "undefined") return EMPTY;
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, value: parse(raw) };
  return cache.value;
}

function write(p: LessonProgress) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(p));
  } catch (err) {
    console.warn("[lessons] could not save progress:", err);
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** The lessons the user has seen (sent with every chat request). */
export function seenTopics(): LessonTopic[] {
  return Object.keys(readProgress()) as LessonTopic[];
}

/** Call when the user opens or touches a lesson. A replay keeps the earlier guess. */
export function markSeen(topic: LessonTopic) {
  const p = readProgress();
  if (p[topic]) return; // already seen: nothing to save (and no re-render)
  write({ ...p, [topic]: { seenAt: new Date().toISOString() } });
}

/** Call when the user locks in a guess. */
export function markGuessed(spec: LessonSpec, value: number, close: boolean) {
  const p = { ...readProgress() };
  const prev = p[spec.topic];
  const at = new Date().toISOString();
  p[spec.topic] = {
    seenAt: prev?.seenAt ?? at,
    guess: { value, answer: spec.guess.answer, unit: spec.guess.unit, close, at },
    everClose: close || prev?.everClose || undefined,
  };
  write(p);
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange); // another tab
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Live progress for React components (re-renders when a lesson is seen or guessed). */
export function useLessonProgress(): LessonProgress {
  return useSyncExternalStore(subscribe, readProgress, () => EMPTY);
}

// ─── Hiding the Home row ─────────────────────────────────────────────────
// WHY only a flag: the row hides only while every lesson is done (LessonProgress), so a new
// lesson brings it back by itself. Per demo customer, like the progress.

const hiddenKey = () => `${storageKey()}:hidden`;

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(hiddenKey()) === "1";
  } catch {
    return false;
  }
}

/** Hide the Money lessons row on Home (after all lessons are done). */
export function hideLessonsRow() {
  try {
    localStorage.setItem(hiddenKey(), "1");
  } catch (err) {
    console.warn("[lessons] could not save hide:", err);
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Live: has the user hidden the Money lessons row? */
export function useLessonsRowHidden(): boolean {
  return useSyncExternalStore(subscribe, readHidden, () => false);
}
