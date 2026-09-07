/**
 * <FileCard> - the produced file, and whether you can still have it.
 *
 * One of the three genuinely new pieces of UI in the Export Centre. A format
 * tile, the file name, a metadata line (rows · columns · size · availability)
 * and exactly one primary action, which changes with what is actually possible:
 * download it, download it anyway, or run the export again because the bytes
 * are gone. Availability is derived server-side at read time (is_expired /
 * is_purged / is_downloadable) - never inferred here from a date.
 */

import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExportFile } from "@/redux/services/dashboard/exports-types";
import { formatBytes } from "@/utils/format-bytes";
import { daysUntil, formatDay } from "./format";

/** Monospace tabular figures for anything a person compares by eye. */
const NUM = "font-geist-mono tabular-nums";

// What the metadata line says about how long this file is around for. Expiry is
// a fact about the file, so it is stated plainly rather than hidden once it has
// passed - the run still succeeded, and the history is intact.
function availability(file: ExportFile): string {
  if (file.is_purged) return "deleted from storage";
  if (file.is_expired) return `expired ${formatDay(file.available_until)}`;
  const days = daysUntil(file.available_until);
  if (days <= 7) return `available for ${days} more day${days === 1 ? "" : "s"}`;
  return `available until ${formatDay(file.available_until)}`;
}

export function FileCard({
  file,
  columnsRequested,
  downloading,
  canDownload = true,
  onDownload,
  onRunAgain,
  tone = "ready",
  lastDownload,
  className,
}: {
  file: ExportFile;
  /** Columns the run ASKED for. Shown as "4 of 6" when they differ. */
  columnsRequested?: number;
  downloading?: boolean;
  canDownload?: boolean;
  onDownload: () => void;
  onRunAgain?: () => void;
  /** "partial" softens the primary action to "Download anyway". */
  tone?: "ready" | "partial";
  lastDownload?: string;
  className?: string;
}) {
  const produced = file.columns_produced?.length ?? 0;
  const columns =
    columnsRequested && columnsRequested !== produced
      ? `${produced} of ${columnsRequested} columns`
      : `${produced} column${produced === 1 ? "" : "s"}`;

  const gone = file.is_expired || file.is_purged;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-lg border bg-white px-4 py-4 sm:flex-nowrap",
        gone ? "border-white-02" : tone === "partial" ? "border-yellow-01/40" : "border-green-01/30",
        className,
      )}
    >
      {/* Format tile - reads as a file at a glance, in greyscale, at any size. */}
      <div
        aria-hidden
        className="flex h-11 w-9 shrink-0 items-end justify-center rounded border border-gray-02 bg-gray-04 pb-1 font-geist-mono text-[9px] font-semibold uppercase text-gray-06-text"
      >
        {file.format}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-mont text-sm font-semibold text-black-01">{file.name}</p>
        <p className={cn(NUM, "mt-1 text-xs text-gray-06-text")}>
          {file.row_count.toLocaleString("en-GB")} rows · {columns} · {formatBytes(file.size_bytes)} ·{" "}
          {availability(file)}
        </p>
        {file.download_count > 0 && (
          <p className="mt-1.5 font-mont text-xs text-gray-05">
            Downloaded {file.download_count} time{file.download_count === 1 ? "" : "s"}
            {lastDownload ? ` · last by ${lastDownload}` : ""}
          </p>
        )}
      </div>

      {/* Exactly one primary action, and never a dead one: when the bytes are
          gone the only thing that helps is producing them again. */}
      <div className="shrink-0">
        {file.is_downloadable ? (
          <Button
            variant={tone === "partial" ? "white" : "default"}
            onClick={onDownload}
            loading={downloading}
            loadingText="Preparing…"
            disabled={!canDownload}
            title={canDownload ? undefined : "You do not have permission to download export files."}
            className="gap-1.5"
          >
            <Download className="size-4" />
            {tone === "partial" ? "Download anyway" : "Download"}
          </Button>
        ) : onRunAgain ? (
          <Button variant="white" onClick={onRunAgain} className="gap-1.5">
            <RotateCcw className="size-4" /> Run again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
