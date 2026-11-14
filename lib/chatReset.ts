/**
 * "Start a new chat" signal: tapping the Chat tab brings back the start screen
 * with the suggested questions.
 *
 * WHY a counter + event, not just an event: Next keeps the chat page alive (but
 * hidden) while you're on another tab, and a hidden page isn't listening. So
 * ChatView also compares the counter when it becomes visible again.
 */
export const CHAT_RESET_EVENT = "money-coach:new-chat";

let resetCount = 0;

export function requestChatReset() {
  resetCount++;
  window.dispatchEvent(new Event(CHAT_RESET_EVENT));
}

export function getChatResetCount() {
  return resetCount;
}
