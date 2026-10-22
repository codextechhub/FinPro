/**
 * Format a decimal-backed quantity without leaking fixed database scale (8.0000 → 8).
 *
 * A missing value (null, undefined, an empty string or a number that is not a
 * number) reads as "-", never as 0. The server sends null for a quantity that
 * does not apply, such as the receipt quantity of a bill line matched against
 * every posted receipt rather than one, and showing that as 0 says nothing was
 * accepted. A caller whose missing value genuinely means zero passes 0 itself.
 */
export function formatQuantity(value: string | number | null | undefined): string {
  if (value == null || value === "") return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return typeof value === "number" ? "-" : String(value);
  return parsed.toLocaleString("en-NG", { maximumFractionDigits: 4 });
}
