/**
 * Which demo customer the app shows, picked in the app itself (top bar, or /customer_profiles).
 * Safe in client code. The server side is lib/data/request.ts.
 *
 * WHY a cookie: the browser sends it with every request, so the API routes and team pages
 * all see the same choice, and each device (laptop, phone) can show a different customer.
 * No cookie → DEMO_CUSTOMER_ID from .env.local → "MOCK".
 */
export const DEMO_CUSTOMER_COOKIE = "demo_customer";

/** Switch the whole app to another customer (null = back to the default) and reload. */
export function switchDemoCustomer(id: string | null): void {
  const maxAge = id ? 60 * 60 * 24 * 30 : 0; // 30 days; 0 deletes the cookie
  document.cookie = `${DEMO_CUSTOMER_COOKIE}=${id ?? ""}; path=/; max-age=${maxAge}; samesite=lax`;
  // WHY reload: every tab and the chat start fresh with the new person's data.
  window.location.reload();
}
