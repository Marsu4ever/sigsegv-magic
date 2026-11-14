"use client";
import type { ChatMessage } from "@/lib/types";
import { ChartCard } from "@/components/charts/ChartCard";
import { LessonCard } from "@/components/education/LessonCard";
import { MoneyText } from "./MoneyText";
import { splitFollowUp } from "@/lib/followUp";
import { noLongDashes } from "@/lib/noDashes";
import { euroAfter } from "@/lib/euroAfter";
import { GoalDraftCard } from "@/components/goal/GoalDraftCard";
import { tapHaptic } from "@/lib/haptic";
import { markSeen } from "@/lib/education/progress";

// WHY no "show chart" link on what-if replies: ChatView draws the what-if panel right above
// the reply that opened it.
export function MessageBubble({
  message,
  onFollowUp,
}: {
  message: ChatMessage;
  /** Set only on the latest coach reply: tapping its offer button asks it. */
  onFollowUp?: (text: string) => void;
}) {
  const isUser = message.role === "user";
  // The coach's [[offer]] marker becomes a button (lib/followUp.ts).
  const { body, followUp } = isUser
    ? { body: message.text, followUp: null }
    : splitFollowUp(euroAfter(noLongDashes(message.text)));
  // WHY full width with charts / lessons: charts, the calendar and the guess slider need the room on a phone.
  const width = message.charts?.length || message.lessons?.length ? "w-full" : "w-[85%] max-w-[85%]";
  // A lesson on its own (tapped chip): just the card, no empty bubble around it.
  if (!isUser && !body.trim() && message.lessons?.length) {
    return (
      <div className="w-full">
        {message.lessons.map((l) => (
          <LessonCard key={l.topic} spec={l} />
        ))}
      </div>
    );
  }
  return (
    // msg-in: fades and rises softly when it appears (app/globals.css, "Delight").
    <div className={`msg-in flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${
          isUser ? "max-w-[85%] bg-accent text-accent-foreground" : `${width} bg-surface shadow-sm`
        }`}
      >
        {/* WHY whitespace-pre-wrap: keeps the AI's line breaks without
            needing a markdown library. Swap in one later if needed. */}
        <p className="whitespace-pre-wrap">
          {/* Coach replies: amounts in green (money in) or red (spending). */}
          {isUser ? body : <MoneyText text={body} animate />}
        </p>
        {message.charts?.map((c, i) => (
          <ChartCard key={i} spec={c} />
        ))}
        {/* Saving goal the coach worked out → the user saves it (lib/goals, DECISIONS.md #50). */}
        {message.goalDraft && <GoalDraftCard draft={message.goalDraft} />}
        {/* Lesson cards come after charts: the chart answers, the card teaches. */}
        {message.lessons?.map((l) => (
          <LessonCard key={l.topic} spec={l} />
        ))}
        {/* Lesson chip (set by the server, lib/ai/chat.ts → lessonOfferFor). Tapping it asks for the
            lesson, which shows the "guess the number" card. Only on the latest reply, like the offer. */}
        {message.lessonOffer && onFollowUp && (
          <button
            type="button"
            onClick={() => {
              // WHY here: tapping the chip is opening the lesson, so it counts as seen (progress.ts).
              markSeen(message.lessonOffer!.topic);
              onFollowUp(message.lessonOffer!.text);
            }}
            className="mt-2.5 mr-2 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
          >
            <span aria-hidden="true">🎯</span>
            {message.lessonOffer.text}
          </button>
        )}
        {/* WHY not with a lesson chip: one suggestion per reply (team call). The server already
            drops the button then (lib/ai/chat.ts → finishReply); this also covers older replies. */}
        {followUp && onFollowUp && !message.lessonOffer && (
          <button
            type="button"
            onClick={() => {
              tapHaptic();
              onFollowUp(followUp);
            }}
            className="group mt-2.5 rounded-full border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-all duration-150 hover:bg-accent hover:text-accent-foreground active:scale-95"
          >
            {followUp}{" "}
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </button>
        )}
      </div>
    </div>
  );
}
