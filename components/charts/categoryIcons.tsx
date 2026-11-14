/**
 * Quiet outline icons for spending categories (used in the baskets chart).
 * Owner: UI person.
 *
 * Icon shapes are copied from Lucide (https://lucide.dev, ISC license,
 * Copyright (c) Lucide Contributors) — copied instead of installing the
 * package, so teammates don't need an `npm install`.
 * To add one: copy the icon's SVG children from lucide.dev into ICONS and
 * map the category name (lowercase) in CATEGORY_ICON.
 */
import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  bus: (
    <>
      <path d="M8 6v6" />
      <path d="M15 6v6" />
      <path d="M2 12h19.6" />
      <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
      <circle cx="7" cy="18" r="2" />
      <path d="M9 18h5" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  "car-taxi-front": (
    <>
      <path d="M10 2h4" />
      <path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8" />
      <path d="M7 14h.01" />
      <path d="M17 14h.01" />
      <rect width="18" height="8" x="3" y="10" rx="2" />
      <path d="M5 18v2" />
      <path d="M19 18v2" />
    </>
  ),
  coffee: (
    <>
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
      <path d="M6 2v2" />
    </>
  ),
  "heart-pulse": (
    <>
      <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
      <path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </>
  ),
  house: (
    <>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  laptop: (
    <>
      <path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z" />
      <path d="M20.054 15.987H3.946" />
    </>
  ),
  pill: (
    <>
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </>
  ),
  plane: (
    <>
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </>
  ),
  shield: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </>
  ),
  shirt: (
    <>
      <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
    </>
  ),
  "shopping-cart": (
    <>
      <path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18" />
      <path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25" />
      <circle cx="18" cy="20" r="2" />
      <circle cx="8" cy="20" r="2" />
    </>
  ),
  smartphone: (
    <>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </>
  ),
  tag: (
    <>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </>
  ),
  ticket: (
    <>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </>
  ),
  utensils: (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />
    </>
  ),
  zap: (
    <>
      <path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />
    </>
  ),
};

/** Category (lowercase) → icon. Unknown categories get a tag. */
const CATEGORY_ICON: Record<string, string> = {
  housing: "house",
  rent: "house",
  utilities: "zap",
  electricity: "zap",
  phone: "smartphone",
  insurance: "shield",
  groceries: "shopping-cart",
  transportation: "bus",
  "public transport": "bus",
  taxi: "car-taxi-front",
  health: "heart-pulse",
  healthcare: "heart-pulse",
  pharmacy: "pill",
  "home & tech": "laptop",
  "home repair": "wrench",
  restaurants: "utensils",
  takeaway: "utensils",
  cafes: "coffee",
  entertainment: "ticket",
  lifestyle: "shirt",
  clothing: "shirt",
  travel: "plane",
};

/**
 * Each category's own colour, used for its icon tile.
 * WHY its own colour (not the basket shade): icons should be easy to tell apart
 * at a glance; the basket is already shown by the card and the bar behind the row.
 */
const CATEGORY_COLOR: Record<string, string> = {
  housing: "#4f46e5", // indigo
  rent: "#4f46e5",
  utilities: "#d97706", // amber
  electricity: "#d97706",
  phone: "#0d9488",
  insurance: "#475569",
  groceries: "#16a34a", // green
  transportation: "#0891b2", // cyan
  "public transport": "#0891b2",
  taxi: "#ca8a04",
  health: "#e11d48", // rose
  healthcare: "#e11d48",
  pharmacy: "#db2777",
  "home & tech": "#7c3aed", // violet
  "home repair": "#7c3aed",
  restaurants: "#ea580c", // orange
  takeaway: "#ea580c",
  cafes: "#a16207",
  entertainment: "#c026d3", // fuchsia
  lifestyle: "#9333ea", // purple
  clothing: "#9333ea",
  travel: "#0284c7", // sky
};

export function categoryColor(category: string): string {
  return CATEGORY_COLOR[category.trim().toLowerCase()] ?? "#64748b"; // slate
}

/**
 * A small rounded tile with the category's icon: white card normally, solid
 * colour with a white icon when `active` (the opened category).
 */
export function CategoryTile({
  category,
  active,
  size = 28,
}: {
  category: string;
  active?: boolean;
  size?: number; // px, the tile; the icon scales with it
}) {
  const color = categoryColor(category);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg transition-colors"
      style={{
        width: size,
        height: size,
        borderRadius: size >= 36 ? 12 : 8,
        // Card-coloured chip with a soft shadow (team call); solid colour when opened.
        // var(--surface) = white in light mode, dark in dark mode.
        background: active ? color : "var(--surface)",
        boxShadow: active
          ? `0 1px 3px color-mix(in srgb, ${color} 45%, transparent)`
          : "0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)",
      }}
    >
      <CategoryIcon
        category={category}
        size={Math.round(size * 0.56)}
        strokeWidth={2.4}
        color={active ? "white" : color}
      />
    </span>
  );
}

export function CategoryIcon({
  category,
  size = 14,
  color = "currentColor",
  strokeWidth = 2,
}: {
  category: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const name = CATEGORY_ICON[category.trim().toLowerCase()] ?? "tag";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
