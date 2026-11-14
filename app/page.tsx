import { redirect } from "next/navigation";

// WHY: the chat is the main screen, so "/" just sends you there.
export default function Home() {
  redirect("/chat");
}
