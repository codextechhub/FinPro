// The four explicit screen states every finance/procurement list/detail must
// handle (spec §4): loading, empty, error (retry), forbidden. Kept tiny and
// composable so pages and <DataTable> share one vocabulary.

import { Ban, Inbox, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SkeletonLoadingLabel,
  SkeletonRow,
  SkeletonText,
} from "@/components/custom/skeletons";
import { ghostWidth } from "@/components/custom/skeleton-widths";

function Centered({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {children}
    </div>
  );
}

/**
 * Block loading state for panels, drawers and detail sections - anywhere the
 * incoming content is NOT a <table>. Pass `columns` when the block previews a
 * tabular/record layout and each ghost row splits into that many ragged cells;
 * omit it (the default) for the stacked field lists drawers show.
 *
 * In-table loading uses <LoadingRows> instead, so the ghosts inherit the real
 * column widths from the header.
 */
export function LoadingState({
  rows = 6,
  columns,
  label = "Loading…",
}: {
  rows?: number;
  columns?: number;
  label?: string;
}) {
  return (
    <div className="p-4">
      <SkeletonLoadingLabel text={label} />
      <div aria-hidden className="space-y-3">
        {Array.from({ length: Math.max(1, rows) }).map((_, r) =>
          columns && columns > 0 ? (
            <div key={r} className="flex items-center gap-3">
              {Array.from({ length: columns }).map((__, c) => (
                <SkeletonText
                  key={c}
                  width={ghostWidth(r * 3 + c)}
                  className="h-4 flex-1"
                />
              ))}
            </div>
          ) : (
            <SkeletonText
              key={r}
              width={ghostWidth(r)}
              className="h-9 rounded-md"
            />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * In-table loading state: real <tr> ghosts, so the cells line up under the real
 * header columns. Render directly inside <TableBody>.
 */
export function LoadingRows({
  rows = 6,
  columns,
  label = "Loading…",
}: {
  rows?: number;
  columns: number;
  label?: string;
}) {
  return (
    <>
      <tr aria-hidden={false}>
        <td colSpan={Math.max(1, columns)} className="h-0 border-0 p-0">
          <SkeletonLoadingLabel text={label} />
        </td>
      </tr>
      {Array.from({ length: Math.max(1, rows) }).map((_, r) => (
        <SkeletonRow key={r} rowIndex={r} columns={columns} />
      ))}
    </>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  message,
}: {
  title?: string;
  message?: string;
}) {
  return (
    <Centered>
      <Inbox className="mb-3 size-8 text-gray-03" />
      <p className="font-mont text-sm font-semibold text-gray-01">{title}</p>
      {message && <p className="mt-1 max-w-md font-mont text-xs text-gray-05">{message}</p>}
    </Centered>
  );
}

export function ErrorState({
  message = "We couldn’t load this. Please try again.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Centered>
      <TriangleAlert className="mb-3 size-8 text-destructive/70" />
      <p className="font-mont text-sm font-medium text-gray-05">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-4 gap-2">
          <RefreshCw className="size-4" /> Retry
        </Button>
      )}
    </Centered>
  );
}

export function ForbiddenState({
  message = "You don’t have permission to view this.",
}: {
  message?: string;
}) {
  return (
    <Centered>
      <Ban className="mb-3 size-8 text-gray-03" />
      <p className="font-mont text-sm font-semibold text-gray-01">Access restricted</p>
      <p className="mt-1 max-w-md font-mont text-xs text-gray-05">{message}</p>
    </Centered>
  );
}
