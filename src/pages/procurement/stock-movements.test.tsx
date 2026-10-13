/**
 * Stock movements as a restricted reader sees them.
 *
 * Mr Okafor, the storekeeper at Ikeja Branch, transfers 50 exercise books to
 * Lekki Branch's store. His role cannot read the inter-branch amount, date,
 * narration or journals, and Lekki's store is outside his reach. The server
 * therefore leaves those keys out of the movements it returns. The tables must
 * show a dash for a missing cell, drop a column no row carries (header and cells
 * together), and never print "undefined" or a computed zero. The toast after the
 * transfer must not claim a debt between branches unless the response booked one.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataTable } from "@/components/finance-ui";
import type { StockMovement } from "@/redux/services/procurement/procurement-types";
import { MovementsSubTable, carries, movementColumns, transferToast } from "./stock-movements";
import { useDates } from "../../lib/display-prefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const full = (over: Partial<StockMovement> = {}): StockMovement => ({
  id: 1, stock_item_id: 9, stock_item_code: "BOOK", location_id: 3, location_code: "IKJ-MAIN",
  movement_type: "RECEIPT", movement_date: "2026-10-05", quantity: "100.0000",
  value_amount: 3_000_000, value_amount_naira: "30,000.00", balance_qty: "100.0000",
  balance_value: 3_000_000, balance_value_naira: "30,000.00", grn_id: 4, journal_id: 7,
  reference: "GRN-4", narration: "Opening books",
  cost_center_id: null, cost_center_name: null, created_by_name: "Mr Okafor", created_at: "2026-10-05T09:00:00Z",
  ...over,
});

/** The sending leg of a booked transfer for a reader who cannot read any inter-branch field. */
const restrictedLeg = (): StockMovement => {
  const leg = full({ id: 2, movement_type: "TRANSFER", quantity: "-50.0000" });
  for (const key of [
    "value_amount", "value_amount_naira", "balance_value", "balance_value_naira",
    "narration", "reference", "movement_date", "journal_id",
  ] as const) delete leg[key];
  return leg;
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const headers = () => [...container.querySelectorAll("th")].map((th) => th.textContent);
const rowCells = (index: number) => [...container.querySelectorAll("tbody tr")[index].querySelectorAll("td")].map((td) => td.textContent);

function Ledger({ rows, multi = false }: { rows: StockMovement[]; multi?: boolean }) {
  const dates = useDates();
  return <DataTable columns={movementColumns({ rows, currency: "NGN", multi, dates, ledger: true })} rows={rows} rowKey={(m) => m.id} mobile="scroll" />;
}

describe("carries", () => {
  it("is true when any row has the key, even with a null value, and for an empty list", () => {
    expect(carries([], "movement_date")).toBe(true);
    expect(carries([restrictedLeg(), full()], "value_amount")).toBe(true);
    expect(carries([restrictedLeg()], "value_amount")).toBe(false);
    expect(carries([full({ location_code: null })], "location_code")).toBe(true);
  });
});

describe("The item's movement table", () => {
  it("shows every column for a reader who may see everything", () => {
    act(() => root.render(<MovementsSubTable movements={[full()]} currency="NGN" multi />));
    expect(headers()).toEqual(["Date", "Type", "Store", "Qty", "Value", "Bal. at store", "Bal. value"]);
    expect(rowCells(0)).toHaveLength(headers().length);
    expect(container.textContent).toContain("IKJ-MAIN");
  });

  it("keeps a column other rows fill and puts a dash in the cell a restricted leg lacks", () => {
    act(() => root.render(<MovementsSubTable movements={[full(), restrictedLeg()]} currency="NGN" multi />));
    expect(headers()).toEqual(["Date", "Type", "Store", "Qty", "Value", "Bal. at store", "Bal. value"]);
    const leg = rowCells(1);
    expect(leg).toHaveLength(headers().length);
    expect(leg[0]).toBe("-");
    expect(leg[4]).toBe("-");
    expect(leg[6]).toBe("-");
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });

  it("drops the date, value and balance-value columns when no row carries them", () => {
    act(() => root.render(<MovementsSubTable movements={[restrictedLeg()]} currency="NGN" />));
    expect(headers()).toEqual(["Type", "Qty", "Bal. qty"]);
    expect(rowCells(0)).toHaveLength(3);
    expect(container.textContent).not.toMatch(/undefined|NaN|₦0/);
  });

  it("drops the store and both balance columns for the receiving leg a sender may not reach", () => {
    const received = full({ id: 3, movement_type: "TRANSFER", quantity: "50.0000" });
    for (const key of ["location_id", "location_code", "balance_qty", "balance_value", "balance_value_naira", "journal_id", "grn_id"] as const) delete received[key];
    act(() => root.render(<MovementsSubTable movements={[received]} currency="NGN" multi />));
    expect(headers()).toEqual(["Date", "Type", "Qty", "Value"]);
    expect(rowCells(0)).toHaveLength(4);
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });
});

describe("The movement ledger", () => {
  it("lines every cell up with its header for a full reader", () => {
    act(() => root.render(<Ledger rows={[full()]} multi />));
    expect(headers()).toEqual(["Date", "Move #", "Type", "Item", "Store", "Qty", "Value", "Bal. at store", "By", "Reference"]);
    expect(rowCells(0)).toHaveLength(headers().length);
  });

  it("removes the date, value, balance and reference columns together when a restricted leg is all there is", () => {
    act(() => root.render(<Ledger rows={[restrictedLeg()]} />));
    expect(headers()).toEqual(["Move #", "Type", "Item", "Qty", "Bal. qty", "By"]);
    expect(rowCells(0)).toHaveLength(headers().length);
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });

  it("keeps the reference column while any row has one and dashes the others", () => {
    act(() => root.render(<Ledger rows={[full(), restrictedLeg()]} />));
    expect(headers()).toContain("Reference");
    expect(rowCells(1).at(-1)).toBe("-");
    expect(rowCells(1)[0]).toBe("-");
  });
});

describe("The transfer toast", () => {
  it("names the debt between branches only when a transfer was booked", () => {
    expect(transferToast({ inter_branch_transfer_id: 12 }, "Moved.")).toBe("Stock transferred. The receiving branch owes the cost between branches.");
  });

  it("falls back to the server message when the id is null or absent", () => {
    expect(transferToast({ inter_branch_transfer_id: null }, "Moved 50 BOOK.")).toBe("Moved 50 BOOK.");
    expect(transferToast({}, "Moved 50 BOOK.")).toBe("Moved 50 BOOK.");
    expect(transferToast(undefined, undefined)).toBe("Stock transferred.");
    expect(transferToast({}, "")).toBe("Stock transferred.");
  });
});

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true, hasModuleAccess: () => true, fieldAccess: {} }),
}));
