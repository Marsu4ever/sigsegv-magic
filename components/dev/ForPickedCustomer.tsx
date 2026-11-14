/**
 * Team pages: renders `render()` with the customer picked in the app (cookie),
 * so /data, /dev and /customer_profiles show the same person as the app tabs.
 *
 * WHY <Suspense>: with cacheComponents (next.config.ts), reading cookies outside a
 * Suspense boundary is an error. WHY `render` is called inside withPickedCustomer:
 * data functions find the customer only while it runs, so keep all data calls in
 * the page body (not in child server components).
 */
import { Suspense } from "react";
import { withPickedCustomer } from "@/lib/data/request";

async function Picked({ render }: { render: () => React.ReactNode }) {
  return withPickedCustomer(render);
}

export function ForPickedCustomer({ render }: { render: () => React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted">Loading…</p>}>
      <Picked render={render} />
    </Suspense>
  );
}
