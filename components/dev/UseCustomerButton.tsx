"use client";
/** "Use in app" button on /customer_profiles — same as picking in the top bar. */
import { switchDemoCustomer } from "@/lib/demoCustomer";

export function UseCustomerButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => switchDemoCustomer(id)}
      className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
    >
      Use in app
    </button>
  );
}
