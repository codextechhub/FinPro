// Small pure helpers shared by the builder's components. Kept out of the
// component files so fast refresh keeps working.

import type { DatasetFilter, FilterSpec, PreviewResult } from "@/redux/services/dashboard/exports-types";

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
      return spec.min != null || spec.max != null;
    case "boolean":
      return spec.value != null;
    default:
      return !!spec.value;
  }
}

/** Rows, as an exact figure or the honest bucketed fallback. */
export function rowsLabel(preview: PreviewResult | null): string {
  if (!preview) return "-";
  if (preview.matching_rows != null) return preview.matching_rows.toLocaleString("en-GB");
  return preview.rows_bucket ?? "-";
}
