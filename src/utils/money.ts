/**
 * Money handling for the Finance & Procurement consoles.
 *
 * NON-NEGOTIABLE RULE (mirrors the backend's vs_finance/money.py):
 * every monetary value crossing the API is an INTEGER number of minor units
 * (kobo) - ₦1 = 100 kobo. We convert once, here, at the UI boundary and never
 * do float arithmetic on money beyond these helpers.
 *
 *   toNaira(kobo)        → major-unit number for display maths only
 *   toKobo(naira)        → integer kobo to submit to the API
 *   formatMoney(kobo)    → "₦1,234,567.00" (grouped, 2dp, currency-aware)
 */

const KOBO_PER_MAJOR = 100;

// Symbols for the currencies the platform's entities use. base_currency arrives
// as a 3-letter ISO code (its PK on the backend); we fall back to the code
// itself for anything not mapped, so an unknown currency degrades gracefully.
const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
  GHS: "₵",
  KES: "KSh",
  ZAR: "R",
};

export function currencySymbol(currency?: string | null): string {
  if (!currency) return CURRENCY_SYMBOLS.NGN;
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
}

/** Integer kobo → major-unit number (naira). For display/derivation only. */
export function toNaira(kobo: number): number {
  return (kobo ?? 0) / KOBO_PER_MAJOR;
}

/**
 * Major-unit input (naira) → integer kobo for the API. Accepts a number or a
 * user-typed string; rounds to the nearest kobo via string-quantisation so we
 * never ship a binary-float artefact (0.1 + 0.2). Returns 0 for blank/invalid.
 */
export function toKobo(naira: number | string): number {
  if (naira === "" || naira == null) return 0;
  const n = typeof naira === "number" ? naira : Number(String(naira).replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  // Round on the 2dp string so 1.005 → "1.01" rather than the float 1.00499…
  return Math.round(Number(n.toFixed(2)) * KOBO_PER_MAJOR);
}

const groupFormatter = new Intl.NumberFormat("en-NG", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Integer kobo → grouped, 2dp, currency-prefixed display string. */
export function formatMoney(kobo: number, currency?: string | null): string {
  const value = groupFormatter.format(Math.abs(toNaira(kobo)));
  const sign = kobo < 0 ? "-" : "";
  return `${sign}${currencySymbol(currency)}${value}`;
}
