import { redirect } from "next/navigation";

// WHY: like a banking app, the app opens on the account overview (balance and
// transactions); the coach is one tap away (Chat tab, or the questions on that page).
export default function Home() {
  redirect("/account");
}
