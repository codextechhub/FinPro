/**
 * Whether an approved requisition can still be put on an RFQ or a purchase
 * order.
 *
 * A requisition line sits on one live RFQ or order at a time, and the server
 * refuses a second. Lagos Prep's PR-0004 for 40 chairs already on RFQ-0007 is
 * still an approved requisition, and a buyer offered it would fill a whole form
 * only to be refused on save. So the requisition list is asked for what is
 * still free: an RFQ takes the lines the buyer keeps, so it is offered a
 * requisition with at least one free line (`has_free_lines`); an order takes
 * the whole requisition, so it is offered one only when every line is free
 * (`all_lines_free`).
 *
 * A requisition offered to an RFQ may still have some lines held elsewhere.
 * Once it is chosen, the note says so, read from the server's free lines of
 * that requisition. The server still decides on save, and its refusal, naming
 * the RFQ or order that holds the line, is what the buyer reads then.
 */

/** Where a requisition's lines stand. */
export type RequisitionSourcing = "free" | "partly-held" | "all-held";

/** What the requisition is being picked for. */
export type SourcingPurpose = "rfq" | "order";

/** The requisition list's filter for a picker raising `purpose`, or none without one. */
export function requisitionSourcingFilter(purpose: SourcingPurpose | undefined): { has_free_lines?: "true"; all_lines_free?: "true" } {
  if (purpose === "rfq") return { has_free_lines: "true" };
  if (purpose === "order") return { all_lines_free: "true" };
  return {};
}

/** How many of a requisition's lines another live RFQ or order already holds. */
export function requisitionSourcing(lineIds: readonly number[], freeLineIds: ReadonlySet<number>): RequisitionSourcing {
  if (!lineIds.length) return "free";
  const free = lineIds.filter((id) => freeLineIds.has(id)).length;
  if (free === lineIds.length) return "free";
  return free === 0 ? "all-held" : "partly-held";
}

/** The note under the picker once a requisition with held lines is chosen, or null. */
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
 * hold them all, so nothing is concluded from it.
 */
export function completeFreeLineIds(rows: readonly { id: number }[] | undefined, totalItems: number | undefined): ReadonlySet<number> | null {
  if (!rows) return null;
  if (totalItems != null && totalItems > rows.length) return null;
  return new Set(rows.map((row) => row.id));
}
