/**
 * The 340px summary rail: This export · Estimate · Preview.
 *
 * The one genuinely new layout piece in VS Export. Below xl it stops being a
 * rail and becomes a sticky bottom bar carrying name · columns · rows · size,
 * because on a laptop the work area needs the width more than the rail does.
 *
 * Its defining behaviour is stale-while-recalculating: when the configuration
 * changes, the PREVIOUS figures stay on screen at 60% opacity with a
 * "recalculating" label and aria-busy, rather than blanking or throwing up a
 * spinner. A number that flickers to nothing on every keystroke is worse than a
 * number that is briefly a few seconds old, and the estimate is the thing the
 * user is here to watch.
 */

import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import type { PreviewResult } from "@/redux/services/dashboard/exports-types";
import { formatBytes } from "@/utils/format-bytes";
import { rowsLabel } from "./helpers";

const NUM = "font-geist-mono tabular-nums";

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 font-mont text-[11px] text-gray-05">{label}</span>
      <span className={cn(NUM, "min-w-0 truncate text-right text-sm font-semibold text-black-01")}>
        {value}
      </span>
    </div>
  );
}

export function SummaryRail({
  name,
  datasetName,
  scopeLabel,
  columns,
  format,
  preview,
  recalculating,
  error,
  className,
}: {
  name: string;
  datasetName: string;
  scopeLabel: string;
  columns: number;
  format: string;
  preview: PreviewResult | null;
  recalculating: boolean;
  /** A configuration problem the estimate cannot get past, in plain words. */
  error?: string | null;
  className?: string;
}) {
  return (
    <aside
      className={cn(INFORMATION_CARD_SURFACE, "space-y-4 rounded-md p-4", className)}
      aria-label="Export summary"
    >
      <section>
        <h2 className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">
          This export
        </h2>
        <div className="divide-y divide-white-02">
          <Line label="Name" value={<span className="font-mont">{name || "Untitled export"}</span>} />
          <Line label="Dataset" value={<span className="font-mont">{datasetName || "-"}</span>} />
          <Line label="Scope" value={<span className="font-mont">{scopeLabel || "-"}</span>} />
          <Line label="Format" value={format.toUpperCase()} />
        </div>
      </section>

      <section
        aria-busy={recalculating}
        className={cn("border-t border-white-02 pt-3.5 transition-opacity", recalculating && "opacity-60")}
      >
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="font-mont text-[11px] uppercase tracking-widest text-gray-05">Estimate</h2>
          {recalculating && (
            <span className="font-mont text-[11px] text-gray-05">Recalculating…</span>
          )}
        </div>

        {error ? (
          <p className="font-mont text-xs leading-relaxed text-error-text">{error}</p>
        ) : (
          <>
            <div className="divide-y divide-white-02">
              <Line label="Matching rows" value={rowsLabel(preview)} />
              <Line label="Columns" value={columns} />
              <Line
                label="Estimated size"
                value={preview ? formatBytes(preview.estimated_bytes) : "-"}
              />
            </div>

            {/* Counting stops being exact above the backend's limit. Saying so is
                the honest fallback - never a spinner where a number should be. */}
            {preview?.estimate_confidence === "bucketed" && (
              <p className="mt-2 font-mont text-[11px] leading-relaxed text-gray-05">
                Too many rows to count exactly. The precise figure is recorded on the run.
              </p>
            )}

            {preview?.warnings.map((w) => (
              <p
                key={w.code}
                className={cn(
                  "mt-2 rounded border-l-[3px] px-2.5 py-2 font-mont text-[11px] leading-relaxed",
                  w.code === "ROW_CAP_EXCEEDED"
                    ? "border-destructive bg-destructive/10 text-error-text"
                    : "border-yellow-01 bg-yellow-01/10 text-yellow-01-text",
                )}
              >
                {w.message}
              </p>
            ))}

            <p className="mt-2.5 border-t border-white-02 pt-2.5 font-mont text-[11px] leading-relaxed text-gray-05">
              Recalculated as you change columns and filters. Actual figures are recorded on the run.
            </p>
          </>
        )}
      </section>

      {preview?.sample?.headers?.length ? (
        <section
          aria-busy={recalculating}
          className={cn("border-t border-white-02 pt-3.5 transition-opacity", recalculating && "opacity-60")}
        >
          <h2 className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">Preview</h2>
          <SamplePreview sample={preview.sample} maxColumns={3} maxRows={4} />
          <p className="mt-2 font-mont text-[11px] text-gray-05">
            First {Math.min(4, preview.sample.rows.length)} rows, first{" "}
            {Math.min(3, preview.sample.headers.length)} columns - values exactly as they will appear
            in the file.
          </p>
        </section>
      ) : null}
    </aside>
  );
}

/** The sample rows, rendered as they will appear in the file. */
export function SamplePreview({
  sample,
  maxColumns = 6,
  maxRows = 4,
}: {
  sample: { headers: string[]; rows: string[][] };
  maxColumns?: number;
  maxRows?: number;
}) {
  const headers = sample.headers.slice(0, maxColumns);
  const rows = sample.rows.slice(0, maxRows);
  if (!headers.length) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-white-02">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-04">
            {headers.map((h) => (
              <th
                key={h}
                className="truncate border-b border-white-02 px-2 py-1.5 text-left font-geist-mono text-[10px] font-semibold uppercase tracking-wide text-gray-05"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-2 py-4 text-center font-mont text-[11px] text-gray-05"
              >
                No rows match these filters yet.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-white-02 last:border-0">
                {row.slice(0, maxColumns).map((cell, j) => (
                  <td
                    key={j}
                    className="max-w-[160px] truncate px-2 py-1.5 font-mont text-[11px] text-gray-01"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Below xl the rail collapses to this: name · columns · rows · size. */
export function SummaryBar({
  name,
  columns,
  preview,
  recalculating,
}: {
  name: string;
  columns: number;
  preview: PreviewResult | null;
  recalculating: boolean;
}) {
  return (
    <div
      aria-busy={recalculating}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-white px-4 py-3 transition-opacity",
        recalculating && "opacity-60",
      )}
    >
      <span className="min-w-0 flex-1 truncate font-mont text-sm font-semibold text-black-01">
        {name || "Untitled export"}
      </span>
      <span className={cn(NUM, "text-xs text-gray-06-text")}>{columns} columns</span>
      <span className={cn(NUM, "text-xs text-gray-06-text")}>{rowsLabel(preview)} rows</span>
      <span className={cn(NUM, "text-xs text-gray-06-text")}>
        {preview ? formatBytes(preview.estimated_bytes) : "-"}
      </span>
      {recalculating && <span className="font-mont text-[11px] text-gray-05">Recalculating…</span>}
    </div>
  );
}
