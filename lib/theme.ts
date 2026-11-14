/**
 * Light / dark mode. Safe in client code. The colors themselves are in app/globals.css.
 *
 * How it works: <html data-theme="light|dark">. The script below runs in <head>
 * before the page is drawn (no white flash), using the user's saved pick or else
 * the phone's own setting. components/ThemeToggle.tsx lets the user switch.
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** The phone's / computer's own setting. */
export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The user's saved pick, or null to follow the system. */
export function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null; // WHY: some private-browsing modes block localStorage
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * Inline script for app/layout.tsx. Plain old JS in a string because it runs
 * before React loads. Keep in sync with savedTheme()/systemTheme() above.
 */
export const THEME_INIT_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}
if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}
document.documentElement.dataset.theme=t})()`;
