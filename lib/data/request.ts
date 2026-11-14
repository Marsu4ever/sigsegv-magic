/**
 * Server side of the in-app customer picker (client side: lib/demoCustomer.ts). SERVER ONLY.
 *
 * Every API route and team page that shows customer data wraps its work like this:
 *   return Response.json(await withPickedCustomer(() => getWeekSummary()));
 * so all data functions inside use the customer picked in the app.
 */
import { cookies } from "next/headers";
import { DEMO_CUSTOMER_COOKIE } from "@/lib/demoCustomer";
import { listDemoCustomerIds, withCustomer } from "./load";

/** The customer picked in the app, or undefined (= use the default). Unknown ids are ignored. */
export async function pickedCustomerId(): Promise<string | undefined> {
  const id = (await cookies()).get(DEMO_CUSTOMER_COOKIE)?.value;
  return id && listDemoCustomerIds().includes(id) ? id : undefined;
}

/** Run `fn` (sync or async) with the customer picked in the app. */
export async function withPickedCustomer<T>(fn: () => T): Promise<Awaited<T>> {
  return await withCustomer(await pickedCustomerId(), fn);
}
