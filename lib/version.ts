/**
 * Which build of the app is running — shown on /dev, in /api/health and at the bottom of
 * the DEMO customer list, so you can tell whether the newest version is live.
 * The values are baked in at build time by next.config.ts (env). Safe in client code.
 */
export const APP_VERSION = {
  version: process.env.APP_VERSION ?? "dev",
  /** Short git commit of the TEAM repo this build came from (see next.config.ts). */
  commit: process.env.APP_COMMIT ?? "unknown",
  /** ISO time the build was made ("" in some dev setups). */
  builtAt: process.env.APP_BUILT_AT ?? "",
};

/** "v0.1.0 · a1b2c3d · built 14.11. 15:42" (Finnish time). */
export function versionLabel(): string {
  return `v${APP_VERSION.version} · ${APP_VERSION.commit} · built ${builtTime()}`;
}

/** "14.11. 15:42" in Finland's time zone. WHY by hand: "fi-FI" formatting adds "klo". */
function builtTime(): string {
  if (!APP_VERSION.builtAt) return "?";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Helsinki",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(APP_VERSION.builtAt));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}. ${get("hour")}:${get("minute")}`;
}
