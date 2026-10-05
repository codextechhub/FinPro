/**
 * The quantities a goods return may send back, as plain data.
 *
 * A line can return what was accepted less what has already gone back. What has
 * been billed is not known on the receipt; the server refuses a return that
 * reaches into billed goods and names the credit note as the way instead.
 */

import type { GRNLine } from "@/redux/services/procurement/procurement-types";

export function returnableQuantity(line: Pick<GRNLine, "accepted_qty" | "returned_qty">): number {
  return Math.max(0, Number(line.accepted_qty || 0) - Number(line.returned_qty || 0));
}

/** The request's lines: each receipt line given a positive quantity, once. */
export function returnLines(lines: Pick<GRNLine, "id">[], quantities: Record<number, string>): { grn_line: number; quantity: number }[] {
  return lines.flatMap((line) => {
    const quantity = Number(quantities[line.id] || 0);
    return Number.isFinite(quantity) && quantity > 0 ? [{ grn_line: line.id, quantity }] : [];
  });
}
