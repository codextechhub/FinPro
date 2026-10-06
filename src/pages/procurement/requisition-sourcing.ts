/**
 * Whether an approved requisition can still be put on an RFQ or a purchase
 * order, read from the server's free requisition lines.
 *
 * A requisition line sits on one live RFQ or order at a time, and the server
 * refuses a second. Lagos Prep's PR-0004 for 40 chairs already on RFQ-0007 is
 * still an approved requisition, so the pickers would offer it, and the buyer
 * would fill a whole form only to be refused on save. The pickers mark it
 * instead: "every line already on an RFQ or order" when nothing of it is free,
 * "some lines already on an RFQ or order" when part of it is. An order takes a
 * requisition whole, so for an order a part held is as good as all held; an
 * RFQ takes the lines the buyer keeps.
 *
 * The marks are a hint. The server still decides on save, and its refusal,
 * naming the RFQ or order that holds the line, is what the buyer reads then.
 */

/** Where a requisition's lines stand. */
export type RequisitionSourcing = "free" | "partly-held" | "all-held";

/** What the requisition is being picked for. */
export type SourcingPurpose = "rfq" | "order";

/** How many of a requisition's lines another live RFQ or order already holds. */
export function requisitionSourcing(lineIds: readonly number[], freeLineIds: ReadonlySet<number>): RequisitionSourcing {
  if (!lineIds.length) return "free";
  const free = lineIds.filter((id) => freeLineIds.has(id)).length;
  if (free === lineIds.length) return "free";
  return free === 0 ? "all-held" : "partly-held";
}

/** The mark after a requisition's name in a picker, or "" when it is free. */
export function sourcingMark(state: RequisitionSourcing): string {
  if (state === "all-held") return " - every line already on an RFQ or order";
  if (state === "partly-held") return " - some lines already on an RFQ or order";
  return "";
}

/** The note under the picker once a held requisition is chosen, or null. */
export function sourcingNote(state: RequisitionSourcing, purpose: SourcingPurpose, documentNumber: string): string | null {
  if (state === "all-held") {
    return `Every line of ${documentNumber} is already on an RFQ or purchase order. Cancel that one first, or choose another requisition.`;
  }
  if (state === "partly-held") {
    return purpose === "order"
      ? `Some lines of ${documentNumber} are already on an RFQ or purchase order, and an order takes the whole requisition. Cancel that one first, or choose another requisition.`
      : `Some lines of ${documentNumber} are already on an RFQ or purchase order. Remove them from this RFQ before you save.`;
  }
  return null;
}

/**
 * The free line ids of a page of free lines, or null when the page does not
 * hold them all: a requisition missing from an incomplete page may still be
 * free, so nothing is marked from it.
 */
export function completeFreeLineIds(rows: readonly { id: number }[] | undefined, totalItems: number | undefined): ReadonlySet<number> | null {
  if (!rows) return null;
  if (totalItems != null && totalItems > rows.length) return null;
  return new Set(rows.map((row) => row.id));
}
