/**
 * <DataTable> - the one list primitive every finance/procurement list screen
 * uses. Column-driven over the app's existing <Table>, with server pagination
 * and all four explicit states (loading / empty / error / forbidden). Filters
 * and toolbars live above it on the page; this owns the table + its footer.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { EmptyState, ErrorState, ForbiddenState, LoadingRows } from "./states";
import { SkeletonCard, SkeletonLoadingLabel } from "@/components/custom/skeletons";

/** Ghost rows shown while a list loads. */
const GHOST_ROWS = 6;

export interface Column<T> {
  /** Header label. */
  header: string;
  /** Cell renderer. */
  cell: (row: T) => React.ReactNode;
  /** Right-align (money/numeric columns). */
  align?: "left" | "right";
  className?: string;
}

/**
 * Row selection for a list that acts on several rows at once.
 *
 * Selected rows are named by their `rowKey`, as strings. The header checkbox
 * selects or clears the rows on the page in view and leaves any selected on
 * other pages alone, so a selection can be built across pages.
 */
export interface RowSelection<T> {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** What a row's checkbox is called for a screen reader ("Select JV-0042"). */
  rowLabel: (row: T) => string;
}

/** The selection after the header checkbox is pressed on this page's keys. */
export function toggledPageSelection(selected: ReadonlySet<string>, pageKeys: string[]): Set<string> {
  const next = new Set(selected);
  const allOn = pageKeys.length > 0 && pageKeys.every((k) => next.has(k));
  for (const key of pageKeys) {
    if (allOn) next.delete(key);
    else next.add(key);
  }
  return next;
}

/** The selection after one row's checkbox is pressed. */
export function toggledRowSelection(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** A row's checkbox. Stops the click so ticking a row never opens it. */
function RowCheckbox({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={label} />
    </span>
  );
}

/** One row as a stacked label/value card - the phone rendering of a list row. */
function RowCard<T>({ columns, row, onClick, select }: {
  columns: Column<T>[]; row: T; onClick?: () => void; select?: React.ReactNode;
}) {
  const [first, ...rest] = columns;
  // A column that renders nothing for this row contributes no card line. In a
  // table an empty cell is just whitespace under a header; on a card it is a
  // label with nothing beside it, repeated down the whole list. Cells that mean
  // "no value" should render an em dash - this only drops the truly absent.
  const lines = rest
    .map((col) => ({ header: col.header, value: col.cell(row) }))
    .filter(({ value }) => value !== null && value !== undefined && value !== false && value !== "");
  return (
    <div
      onClick={onClick}
      className={cn(
        "space-y-2 border-b border-white-02 px-3.5 py-3 last:border-0",
        onClick && "cursor-pointer transition-colors active:bg-primary/5",
      )}
    >
      <div className="flex items-start gap-2.5">
        {select}
        <div className="min-w-0 flex-1 font-mont text-sm font-semibold text-black-01">{first.cell(row)}</div>
      </div>
      {lines.map((line, i) => (
        <div key={i} className="flex items-start justify-between gap-3">
          <span className="shrink-0 font-mont text-[11px] text-gray-05">{line.header}</span>
          <span className="min-w-0 text-right font-mont text-sm font-medium text-black-01">{line.value}</span>
        </div>
      ))}
    </div>
  );
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: boolean;
  forbidden?: boolean;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyMessage?: string;
  forbiddenMessage?: string;
  // Server pagination (omit to hide the footer).
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  /** Phone rendering (<md). "cards" (default) stacks each row as a label/value
   *  card; "scroll" keeps the table with horizontal scroll - for dense
   *  ledger/report-style tables where column alignment carries meaning. */
  mobile?: "cards" | "scroll";
  /** Custom phone card for one row; overrides the generic label/value card. */
  mobileCard?: (row: T) => React.ReactNode;
  /** Keep cards through tablet widths when a persistent side rail narrows the content area. */
  cardBreakpoint?: "md" | "lg";
  /** Checkboxes for acting on several rows at once; omit for a plain list. */
  selection?: RowSelection<T>;
}

export const headCls =
  "text-gray-01 bg-[#F1F1F1] font-semibold font-mont text-xs lg:text-sm whitespace-nowrap pt-3 pb-2";
export const cellCls = "text-black-01 border-white-02 font-medium font-mont text-sm border-y-5";

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  forbidden,
  onRetry,
  onRowClick,
  emptyTitle,
  emptyMessage,
  forbiddenMessage,
  page,
  totalPages,
  onPageChange,
  mobile = "cards",
  mobileCard,
  cardBreakpoint = "md",
  selection,
}: DataTableProps<T>) {
  const colCount = columns.length + (selection ? 1 : 0);
  // Defensive: the backend returns `{}` (not `[]`) for an empty list endpoint,
  // so a caller may hand us a non-array. Never let `.map` throw.
  const safeRows: T[] = Array.isArray(rows) ? rows : [];
  // Card-mode lists own the phone viewport in every state. Keeping empty,
  // error and forbidden states inside the desktop table leaves the table's
  // minimum width active and clips their messages on narrow screens.
  const cardsOnPhone = mobile === "cards";
  const pageKeys = safeRows.map((row) => String(rowKey(row)));
  const pageSelected = selection ? pageKeys.filter((k) => selection.selected.has(k)).length : 0;
  const selectCell = (row: T) => {
    if (!selection) return null;
    const key = String(rowKey(row));
    return (
      <RowCheckbox
        checked={selection.selected.has(key)}
        label={selection.rowLabel(row)}
        onToggle={() => selection.onChange(toggledRowSelection(selection.selected, key))}
      />
    );
  };

  const body = () => {
    if (forbidden) {
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colCount} className="h-56 p-0">
            <ForbiddenState message={forbiddenMessage} />
          </TableCell>
        </TableRow>
      );
    }
    if (loading) {
      // Real <tr> ghosts, so the cells sit under the real header columns.
      return <LoadingRows rows={GHOST_ROWS} columns={colCount} />;
    }
    if (error && safeRows.length === 0) {
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colCount} className="h-56 p-0">
            <ErrorState onRetry={onRetry} />
          </TableCell>
        </TableRow>
      );
    }
    if (safeRows.length === 0) {
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colCount} className="h-56 p-0">
            <EmptyState title={emptyTitle} message={emptyMessage} />
          </TableCell>
        </TableRow>
      );
    }
    return safeRows.map((row) => (
      <TableRow
        key={rowKey(row)}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        className={cn(onRowClick && "cursor-pointer transition-colors hover:bg-primary/5")}
      >
        {selection && <TableCell className={cn(cellCls, "w-10")}>{selectCell(row)}</TableCell>}
        {columns.map((col, ci) => (
          <TableCell
            key={ci}
            className={cn(cellCls, col.align === "right" && "text-right", col.className)}
          >
            {col.cell(row)}
          </TableCell>
        ))}
      </TableRow>
    ));
  };

  return (
    <div className={cn(INFORMATION_CARD_SURFACE, "overflow-hidden rounded-md")}>
      {cardsOnPhone && loading && (
        <div className={cardBreakpoint === "lg" ? "lg:hidden" : "md:hidden"}>
          <SkeletonLoadingLabel />
          {Array.from({ length: GHOST_ROWS }).map((_, i) => (
            <SkeletonCard key={i} rowIndex={i} lines={Math.max(1, colCount - 2)} />
          ))}
        </div>
      )}
      {cardsOnPhone && !loading && forbidden && (
        <div className={cardBreakpoint === "lg" ? "lg:hidden" : "md:hidden"}>
          <ForbiddenState message={forbiddenMessage} />
        </div>
      )}
      {cardsOnPhone && !loading && !forbidden && error && safeRows.length === 0 && (
        <div className={cardBreakpoint === "lg" ? "lg:hidden" : "md:hidden"}>
          <ErrorState onRetry={onRetry} />
        </div>
      )}
      {cardsOnPhone && !loading && !forbidden && !error && safeRows.length === 0 && (
        <div className={cardBreakpoint === "lg" ? "lg:hidden" : "md:hidden"}>
          <EmptyState title={emptyTitle} message={emptyMessage} />
        </div>
      )}
      {cardsOnPhone && !loading && !forbidden && safeRows.length > 0 && (
        <div className={cardBreakpoint === "lg" ? "lg:hidden" : "md:hidden"}>
          {safeRows.map((row) =>
            mobileCard ? (
              <div
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-white-02 px-3.5 py-3 last:border-0",
                  onRowClick && "cursor-pointer transition-colors active:bg-primary/5",
                )}
              >
                {mobileCard(row)}
              </div>
            ) : (
              <RowCard
                key={rowKey(row)}
                columns={columns}
                row={row}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                select={selectCell(row)}
              />
            ),
          )}
        </div>
      )}
      <Table containerClassName={cn(cardsOnPhone && (cardBreakpoint === "lg" ? "max-lg:hidden" : "max-md:hidden"))}>
        <TableHeader className="border-0">
          <TableRow>
            {selection && (
              <TableHead className={cn(headCls, "w-10")}>
                <Checkbox
                  checked={
                    pageSelected === 0 ? false : pageSelected === pageKeys.length ? true : "indeterminate"
                  }
                  disabled={pageKeys.length === 0}
                  onCheckedChange={() => selection.onChange(toggledPageSelection(selection.selected, pageKeys))}
                  aria-label="Select every row on this page"
                />
              </TableHead>
            )}
            {columns.map((col, i) => (
              <TableHead key={i} className={cn(headCls, col.align === "right" && "text-right")}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="bg-white">{body()}</TableBody>
      </Table>

      {!!page && !!totalPages && totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-end gap-2 px-3 py-3.5">
          <button
            onClick={() => page > 1 && onPageChange(page - 1)}
            disabled={page <= 1}
            className={cn(
              "grid h-7.5 place-content-center rounded-md px-2.5 text-sm font-medium transition-colors",
              page <= 1 ? "cursor-not-allowed text-gray-300" : "cursor-pointer text-black-02 hover:bg-gray-100",
            )}
          >
            Prev
          </button>
          <span className="font-mont text-sm text-gray-01">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => page < totalPages && onPageChange(page + 1)}
            disabled={page >= totalPages}
            className={cn(
              "grid h-7.5 place-content-center rounded-md px-2.5 text-sm font-medium transition-colors",
              page >= totalPages ? "cursor-not-allowed text-gray-300" : "cursor-pointer text-black-02 hover:bg-gray-100",
            )}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
