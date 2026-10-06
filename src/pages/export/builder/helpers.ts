// Small pure helpers shared by the builder's components. Kept out of the
// component files so fast refresh keeps working.

import type { DatasetFilter, FilterSpec, PreviewResult } from "@/redux/services/dashboard/exports-types";
import type { ZonedParts } from "../../../utils/dates";

/** Has this filter actually been given a value? Drives the blocking check.
 *  The value keys are the backend's, not ours - see filter-editor.tsx. */
export function filterIsSet(def: DatasetFilter, spec: FilterSpec | undefined): boolean {
  if (!spec) return false;
  switch (def.type) {
    case "date_range":
      return !!spec.start && !!spec.end;
    case "choice":
      return !!spec.values?.length;
    case "number_range":
      return boundIsSet(spec.min) || boundIsSet(spec.max);
    case "boolean":
      return spec.value != null;
    default:
      return !!spec.value;
  }
}

function boundIsSet(bound: number | string | undefined): boolean {
  return bound != null && String(bound).trim() !== "";
}

/**
 * Why a money bound, typed in naira, would be refused - or null when it is a
 * plain amount with at most two decimal places. Mirrors the server's check so
 * the person hears it while typing rather than after a failed preview; the
 * server stays the judge.
 */
export function moneyBoundError(bound: number | string | undefined): string | null {
  if (!boundIsSet(bound)) return null;
  const text = String(bound).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return "Enter an amount in naira, such as 50000 or 50000.50.";
  const decimals = text.split(".")[1] ?? "";
  if (decimals.replace(/0+$/, "").length > 2) return "Use at most two digits after the decimal point.";
  return null;
}

/** Rows, as an exact figure or the honest bucketed fallback. */
export function rowsLabel(preview: PreviewResult | null): string {
  if (!preview) return "-";
  if (preview.matching_rows != null) return preview.matching_rows.toLocaleString("en-GB");
  return preview.rows_bucket ?? "-";
}

/**
 * The file name a run started at `now` would get, for the builder to show
 * under the pattern field.
 *
 * `{date}` and `{datetime}` both come from the one wall-clock reading, the
 * school's, so the preview never puts a UTC date beside a local hour.
 * `{entity}` and `{run}` are not known until a run exists and read as
 * placeholders.
 */
export function renderFileNamePreview(pattern: string, format: string, now: ZonedParts): string {
  const hhmm = `${String(now.hour).padStart(2, "0")}${String(now.minute).padStart(2, "0")}`;
  return (
    pattern
      .replace("{date}", now.date)
      .replace("{datetime}", `${now.date}-${hhmm}`)
      .replace("{entity}", "entity")
      .replace("{run}", "1") + `.${format}`
  );
}
