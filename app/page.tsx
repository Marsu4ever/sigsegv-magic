import { redirect } from "next/navigation";

// WHY: like a banking app, the app opens on the Home dashboard (balance, what's safe to
// spend, what's coming); the coach is one tap away (Coach tab, or the insights on Home).
export default function Home() {
  redirect("/home");
}
