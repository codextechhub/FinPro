/** Format decimal-backed quantities without leaking fixed database scale (8.0000 → 8). */
export function formatQuantity(value: string | number | null | undefined): string {
  if (value == null || value === "") return "0";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return parsed.toLocaleString("en-NG", { maximumFractionDigits: 4 });
}
