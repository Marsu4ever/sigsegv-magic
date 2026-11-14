/**
 * Human-readable names for the codes in the mortgage data, and small
 * formatters for the Home loan tab. Owner: UI person. Safe in client code.
 *
 * WHY here and not in lib/data: lib/data returns plain codes (e.g.
 * "insufficient_equity"); wording is the UI's job (see lib/data/index.ts).
 */
import type { MortgageEvent } from "@/lib/types";

export const PROPERTY_TYPE: Record<string, string> = {
  apartment: "Apartment",
  terraced_house: "Terraced house",
  detached_house: "Detached house",
};

export const COLLATERAL_TYPE: Record<string, string> = {
  apartment: "Apartment",
  other_apartment: "Other apartment",
};

export const EXPENSE_TYPE: Record<string, string> = {
  transfer_tax: "Transfer tax",
  renovation: "Renovation",
  existing_loan: "Existing loan",
  valuation_fee: "Valuation fee",
  maintenance_fee: "Maintenance fee",
  bank_fee: "Bank fee",
};

/**
 * What each rejection code means, in plain words. These describe the CODE —
 * they are not our own judgement of the case (see lib/data/mortgage.ts).
 */
export const REJECTION: Record<string, { title: string; text: string }> = {
  insufficient_collateral: {
    title: "Not enough collateral",
    text: "The security offered for the loan wasn't valued high enough to cover it.",
  },
  insufficient_income: {
    title: "Income too low for this loan",
    text: "The bank judged that the income wasn't enough for this loan's payments.",
  },
  insufficient_equity: {
    title: "Not enough own money",
    text: "The part of the price paid with your own money (equity) was too small.",
  },
  existing_debt: {
    title: "Existing debt",
    text: "Current loans were too large to take on this one as well.",
  },
};

export const EVENT_TYPE: Record<string, string> = {
  application_created: "Application started",
  customer_contact: "Talked with the bank",
  property_added: "Added a home",
  property_price_updated: "Price estimate updated",
  loan_calculation: "Loan calculated",
  income_information_received: "Income details received",
  expense_recorded: "Cost recorded",
  collateral_added: "Collateral added",
  collateral_valuation: "Collateral valued",
  additional_collateral_requested: "More collateral requested",
  document_received: "Document received",
  loan_decision: "Decision",
};

/** Unknown codes fall back to "some_code" → "Some code", so new data never shows blank. */
export function label(map: Record<string, string>, code: string): string {
  if (map[code]) return map[code];
  const s = code.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 349500 → "349 500 €" (Finnish style, no cents — big amounts read easier). */
export function eur0(n: number): string {
  return n.toLocaleString("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

/** 0.8169 → "82 %" */
export function pct(n: number): string {
  return `${Math.round(n * 100)} %`;
}

/** "2026-04-27" → "27.4.2026" */
export function fiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.${y}`;
}

/** One short line under a timeline step, from the event's own fields. */
export function eventDetail(e: MortgageEvent): string | null {
  switch (e.type) {
    case "property_added":
    case "property_price_updated":
      return [e.propertyType && label(PROPERTY_TYPE, e.propertyType), e.propertyPriceEur && eur0(e.propertyPriceEur)]
        .filter(Boolean)
        .join(" · ");
    case "loan_calculation":
      return e.loanAmountEur !== undefined && e.equityEur !== undefined
        ? `Loan ${eur0(e.loanAmountEur)} · own money ${eur0(e.equityEur)}`
        : null;
    case "collateral_added":
    case "additional_collateral_requested":
      return e.collateralType ? label(COLLATERAL_TYPE, e.collateralType) : null;
    case "collateral_valuation":
      return e.collateralValueEur !== undefined
        ? `${label(COLLATERAL_TYPE, e.collateralType ?? "")} valued at ${eur0(e.collateralValueEur)}`
        : null;
    case "loan_decision":
      return e.decision === "rejected"
        ? `Rejected · ${REJECTION[e.rejectionReason ?? ""]?.title ?? e.rejectionReason ?? ""}`
        : "Approved";
    default:
      return null;
  }
}
