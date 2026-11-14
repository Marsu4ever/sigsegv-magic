import { Suspense } from "react";
import { ActivityRoute } from "@/components/account/ActivityView";

// WHY <Suspense>: ActivityView reads the URL (?month, ?category…) with useSearchParams, which
// Next.js only allows inside a Suspense boundary on a prerendered page.
export default function ActivityPage() {
  return (
    <Suspense>
      <ActivityRoute />
    </Suspense>
  );
}
