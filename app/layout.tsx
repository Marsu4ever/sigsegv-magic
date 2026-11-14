/**
 * App shell: a phone-sized column with the tab bar at the bottom.
 *
 * WHY max-w-md centered: on a laptop the app still looks like a phone,
 * which is how judges and S-Bank will imagine it inside S-mobiili.
 * WHY h-dvh: "dynamic viewport height" handles mobile browser toolbars
 * that appear/disappear, so the tab bar doesn't jump off screen.
 */
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TabBar } from "@/components/TabBar";
import { DevButton } from "@/components/DevButton";
import { CustomerSwitcher } from "@/components/CustomerSwitcher";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Money Coach",
  description: "Chat with your own money — Junction 2026 × S-Bank",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // NOTE: we don't block pinch-zoom (accessibility). iOS input auto-zoom is
  // avoided instead by keeping input text at 16px (text-base) in ChatInput.
  // Browser bar color = app background, in light and dark mode (app/globals.css).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1311" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // WHY suppressHydrationWarning: the script below sets data-theme on <html>
    // before React loads, so the server's <html> and the browser's differ on purpose.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Light/dark mode before the first paint, so dark-mode users see no white flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <div className="mx-auto flex h-dvh max-w-md flex-col bg-background">
          {/* Demo-only: whose data is shown + switch customer. */}
          <CustomerSwitcher />
          <main className="min-h-0 flex-1">{children}</main>
          <TabBar />
        </div>
        {/* Team-only shortcut, outside the app column. */}
        <DevButton />
      </body>
    </html>
  );
}
