/**
 * Addresses inside the Between Branches screens, for links from elsewhere: a
 * bank split's result, a customer's moved balance, a held receipt's forward.
 * Each opens its screen with the record already open (`?document=<id>`) or the
 * register already filtered.
 */

import { routesPath } from "@/routes/routes-path";
import { INTER_BRANCH_PATH } from "../console-sections";

/** One transfer, open in the register. */
export function transferLink(id: number): string {
  return `${INTER_BRANCH_PATH}/transfers?document=${id}`;
}

/** The register filtered to the transfers between two branches. */
export function pairLink(a: number, b: number): string {
  return `${INTER_BRANCH_PATH}/transfers?branch=${a}&counterparty=${b}`;
}

/** The register filtered to the income one credit note or concession gave back, by its journal. */
export function adjustmentLink(journalId: number): string {
  return `${INTER_BRANCH_PATH}/transfers?adjustment=${journalId}`;
}

/** One held receipt, open. */
export function heldReceiptLink(id: number): string {
  return `${INTER_BRANCH_PATH}/held-receipts?document=${id}`;
}

/** One recharge, open. */
export function rechargeLink(id: number): string {
  return `${INTER_BRANCH_PATH}/recharges?document=${id}`;
}

/** One journal, open in the General Ledger. */
export function journalLink(id: number): string {
  return `${routesPath.PROTECTED.FINANCE.LEDGER}?document=${id}`;
}
