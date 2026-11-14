"use client";
import type { ChatMessage } from "@/lib/types";
import { ChartCard } from "@/components/charts/ChartCard";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${
          isUser ? "bg-accent text-accent-foreground" : "w-[85%] bg-surface shadow-sm"
        }`}
      >
        {/* WHY whitespace-pre-wrap: keeps the AI's line breaks without
            needing a markdown library. Swap in one later if needed. */}
        <p className="whitespace-pre-wrap">{message.text}</p>
        {message.charts?.map((c, i) => <ChartCard key={i} spec={c} />)}
      </div>
    </div>
  );
}
