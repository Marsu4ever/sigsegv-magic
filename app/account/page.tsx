import { redirect } from "next/navigation";

// WHY a redirect: the Account tab became Home (overview) + Activity (all transactions).
// Old links and bookmarks to /account still land somewhere sensible.
export default function AccountPage() {
  redirect("/home");
}
