/**
 * The stock-movement ledger as a reader is allowed to see it.
 *
 * The server leaves a value out of a movement instead of blanking it: a transfer
 * leg that booked an inter-branch document drops its value, balance, narration,
 * reference, date and journal when the matching `finance.interbranch` switch is
 * hidden, and the receiving store's leg drops the store and its running balance
 * for a sender who cannot reach that store. A column is therefore offered only
 * when at least one row carries its key, header and cells come from one
 * definition so they cannot drift apart, and a cell whose row lacks the key
 * shows a dash, never "undefined" or a computed zero.
 */
import { Money, StatusPill, type Column } from "@/components/finance-ui";
import { cn } from "@/lib/utils";
import type { StockMovement } from "@/redux/services/procurement/procurement-types";
import { EmptyPanel } from "./sourcing/shared";
import { useDates } from "../../lib/display-prefs";

// Quantities arrive as 14,4 decimal strings ("10.0000"); show them trimmed.
export const num = (value?: string | null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
export const fmtQty = (value?: string | null) => {
  const n = num(value);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
};
// Signed quantity/value cell - green for a gain, red for a relief.
export function signClass(n: number) {
  return n > 0 ? "text-emerald-700" : n < 0 ? "text-destructive" : "text-gray-05";
}

/** Whether any row carries this key. A list with no rows offers every column. */
export function carries(rows: readonly StockMovement[], key: keyof StockMovement): boolean {
  return rows.length === 0 || rows.some((row) => key in row);
}

type Dates = ReturnType<typeof useDates>;

interface MovementColumnOptions {
  rows: readonly StockMovement[];
  currency?: string | null;
  multi?: boolean;
  dates: Dates;
  /** The item sub-table also shows the running value; the ledger does not. */
  balanceValue?: boolean;
  /** The ledger names the item, who recorded the move and its reference. */
  ledger?: boolean;
}

const dash = <span className="text-gray-05">-</span>;

/**
 * The columns of a movement table, each paired with the key it reads.
 *
 * Money columns share a kobo/naira pair and the balance columns a quantity/value
 * pair, so a switch that hides one half of a pair leaves no column behind.
 */
export function movementColumns({ rows, currency, multi, dates, balanceValue, ledger }: MovementColumnOptions): Column<StockMovement>[] {
  const columns: Column<StockMovement>[] = [];
  if (carries(rows, "movement_date")) {
    columns.push({ header: "Date", cell: (m) => (m.movement_date ? dates.day(m.movement_date) : dash) });
  }
  if (ledger) {
    columns.push({ header: "Move #", cell: (m) => <span className="font-mont font-semibold text-primary">#{m.id}</span> });
  }
  columns.push({ header: "Type", cell: (m) => <StatusPill status={m.movement_type} /> });
  if (ledger) columns.push({ header: "Item", cell: (m) => m.stock_item_code || "-" });
  if (multi && carries(rows, "location_code")) {
    columns.push({ header: "Store", cell: (m) => m.location_code || "-" });
  }
  columns.push({
    header: "Qty", align: "right",
    cell: (m) => { const q = num(m.quantity); return <span className={cn("tabular-nums", signClass(q))}>{q > 0 ? "+" : ""}{fmtQty(m.quantity)}</span>; },
  });
  if (carries(rows, "value_amount")) {
    columns.push({
      header: "Value", align: "right",
      cell: (m) => (m.value_amount == null ? dash : <Money kobo={m.value_amount} currency={currency} align="right" />),
    });
  }
  // The running balance is the store's, not the entity's, once stock is held per
  // location - so the column has to say so or it reads as an entity total.
  if (carries(rows, "balance_qty")) {
    columns.push({
      header: multi ? "Bal. at store" : "Bal. qty", align: "right",
      cell: (m) => (m.balance_qty == null ? dash : <span className="tabular-nums">{fmtQty(m.balance_qty)}</span>),
    });
  }
  if (balanceValue && carries(rows, "balance_value")) {
    columns.push({
      header: "Bal. value", align: "right",
      cell: (m) => (m.balance_value == null ? dash : <Money kobo={m.balance_value} currency={currency} align="right" />),
    });
  }
  if (ledger) {
    columns.push({ header: "By", cell: (m) => m.created_by_name || "-" });
    if (carries(rows, "reference")) columns.push({ header: "Reference", cell: (m) => m.reference || "-" });
  }
  return columns;
}

/** The toast after a transfer: the debt between branches is named only when the response says one was booked. */
export function transferToast(data: { inter_branch_transfer_id?: number | null } | undefined, message?: string | null): string {
  return data?.inter_branch_transfer_id != null
    ? "Stock transferred. The receiving branch owes the cost between branches."
    : message || "Stock transferred.";
}

/** An item's recent movements inside its detail drawer. */
export function MovementsSubTable({ movements, currency, multi }: { movements: StockMovement[]; currency?: string | null; multi?: boolean }) {
  const dates = useDates();
  if (!movements.length) return <EmptyPanel>No movements recorded for this item yet.</EmptyPanel>;
  const columns = movementColumns({ rows: movements, currency, multi, dates, balanceValue: true });
  return (
    <div className="overflow-x-auto rounded-md border border-white-02"><table className="w-full min-w-[560px]">
      <thead><tr>{columns.map((c) => <th key={c.header} className={cn("bg-[#F1F1F1] px-3 py-2 font-mont text-[11px] font-semibold text-gray-01", c.align === "right" ? "text-right" : "text-left")}>{c.header}</th>)}</tr></thead>
      <tbody>{movements.map((m) => (
        <tr key={m.id}>
          {columns.map((c) => (
            <td key={c.header} className={cn("border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums", c.align === "right" && "text-right")}>{c.cell(m)}</td>
          ))}
        </tr>
      ))}</tbody>
    </table></div>
  );
}
