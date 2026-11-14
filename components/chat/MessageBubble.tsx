"use client";
import type { ChatMessage } from "@/lib/types";
import { ChartCard } from "@/components/charts/ChartCard";
import { MoneyText } from "./MoneyText";

// WHY no "show chart" link on what-if replies: the what-if panel stays above the chat,
// so the user can just scroll up to it.
export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  // WHY full width with charts: charts and the calendar need the room on a phone.
  const width = message.charts?.length ? "w-full" : "w-[85%] max-w-[85%]";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${
          isUser ? "max-w-[85%] bg-accent text-accent-foreground" : `${width} bg-surface shadow-sm`
        }`}
      >
        {/* WHY whitespace-pre-wrap: keeps the AI's line breaks without
            needing a markdown library. Swap in one later if needed. */}
        <p className="whitespace-pre-wrap">
          {/* Coach replies: amounts in green (money in) or red (spending). */}
          {isUser ? message.text : <MoneyText text={message.text} />}
        </p>
        {message.charts?.map((c, i) => (
          <ChartCard key={i} spec={c} />
        ))}
      </div>
    </div>
  );
}
