/**
 * The correction the journal screen offers for a supplier or bank document.
 *
 * Customer documents are voided through their own action (see
 * receivables/document-void-config.ts). These are the others the server names
 * as a journal's owner. Each is opened on its own screen, where every
 * correction it has lives, and the ones with a single safe answer can also be
 * undone from here:
 *
 * - a supplier bill is voided while nothing is paid or credited on it, and
 *   otherwise corrected with a credit note raised from the bill;
 * - a vendor credit note is voided;
 * - a vendor payment is reversed;
 * - a goods receipt is undone by returning its goods, which needs quantities
 *   and a reason, so it is only opened;
 * - a bank transaction or a transfer between a branch's accounts is voided
 *   until its bank line is reconciled;
 * - a petty cash return is voided, which puts the cash back on the fund's books.
 *
 * A goods return is never voided: goods sent back in error are received again
 * on a new receipt against the same order. Its journal says so and points to
 * the receipt it came off (see `sourceDocumentGuidance`).
 *
 * Mrs Bello opens the journal of Ikeja's ₦250,000 stationery bill and is
 * offered "Void bill" and "Open bill", never a raw Reverse that would leave the
 * bill owing while the ledger says it does not.
 */

import { routesPath } from "@/routes/routes-path";
import { P, type PermissionCode } from "../../../permissions";
import { SOURCE_DOCUMENT_ID_PARAM } from "@/lib/source-document-route";
import type { JournalDetail } from "@/redux/services/finance/gl-types";

const F = routesPath.PROTECTED.FINANCE;
const R = routesPath.PROTECTED.PROCUREMENT;

export type CorrectableDocumentType =
  | "VENDOR_INVOICE"
  | "VENDOR_CREDIT_NOTE"
  | "VENDOR_PAYMENT"
  | "GOODS_RECEIVED_NOTE"
  | "BANK_TRANSACTION"
  | "BANK_TRANSFER"
  | "PETTY_CASH_RETURN";

export interface DocumentCorrection {
  /** What the document is called on screen. */
  label: string;
  /** Where it opens, before the id is added. */
  screen: string;
  /** Extra address the screen needs to show this kind, if any. */
  section?: string;
  /** The single safe undo from the journal, when there is one. */
  undo?: {
    verb: string;
    permission: PermissionCode;
    path: (id: number) => string;
    effect: string;
  };
  /** What the reader does on the document's screen instead, in one line. */
  elsewhere?: string;
}

export const DOCUMENT_CORRECTIONS: Record<CorrectableDocumentType, DocumentCorrection> = {
  VENDOR_INVOICE: {
    label: "bill",
    screen: R.VENDOR_INVOICES,
    undo: {
      verb: "Void bill",
      permission: P.PROC_VOID_VENDOR_INVOICE,
      path: (id) => `procurement/vendor-invoices/${id}/void/`,
      effect: "Reverses the bill and gives its purchase order back the billed quantities. A bill with anything paid or credited on it is refused: raise a credit note from the bill instead.",
    },
    elsewhere: "Raise a credit note from the bill when it has been paid.",
  },
  VENDOR_CREDIT_NOTE: {
    label: "credit note",
    screen: R.VENDOR_INVOICES,
    section: "view=credit-notes",
    undo: {
      verb: "Void credit note",
      permission: P.PROC_REVERSE_VENDOR_CREDIT_NOTE,
      path: (id) => `procurement/vendor-credit-notes/${id}/void/`,
      effect: "Reverses the credit note and every bill it was applied to; those bills owe again what it settled.",
    },
  },
  VENDOR_PAYMENT: {
    label: "payment",
    screen: R.VENDOR_PAYMENTS,
    undo: {
      verb: "Reverse payment",
      permission: P.PROC_REVERSE_VENDOR_PAYMENT,
      path: (id) => `procurement/vendor-payments/${id}/reverse/`,
      effect: "Reverses the payment and restores the balances of the bills it settled.",
    },
  },
  GOODS_RECEIVED_NOTE: {
    label: "goods receipt",
    screen: R.GOODS_RECEIPTS,
    elsewhere: "Return the goods from the receipt, naming what goes back and why.",
  },
  BANK_TRANSACTION: {
    label: "bank transaction",
    screen: F.BANKING,
    section: "bank_document=transaction",
    undo: {
      verb: "Void bank transaction",
      permission: P.FIN_REVERSE_BANK_TRANSACTION,
      path: (id) => `finance/bank-transactions/${id}/void/`,
      effect: "Reverses the money in or out. Refused once its bank line has been reconciled.",
    },
  },
  BANK_TRANSFER: {
    label: "transfer",
    screen: F.BANKING,
    section: "bank_document=transfer",
    undo: {
      verb: "Void transfer",
      permission: P.FIN_REVERSE_BANK_TRANSFER,
      path: (id) => `finance/bank-transfers/${id}/void/`,
      effect: "Reverses both sides of the transfer. Refused while either side is reconciled.",
    },
  },
  PETTY_CASH_RETURN: {
    label: "return",
    screen: `${F.EXPENSES}/petty-cash`,
    undo: {
      verb: "Void return",
      permission: P.FIN_REVERSE_PETTY_CASH,
      path: (id) => `finance/petty-cash-returns/${id}/void/`,
      effect: "Puts the banked cash back on the fund's books and restores the float; a closed fund reopens. Refused while its bank line is reconciled, after a later return of the same fund, or once the float has changed since.",
    },
  },
};

export function isCorrectableDocument(type: string): type is CorrectableDocumentType {
  return Object.prototype.hasOwnProperty.call(DOCUMENT_CORRECTIONS, type);
}

/** The address that opens document `id` of `type` on its own screen. */
export function documentScreenLink(type: CorrectableDocumentType, id: number): string {
  const { screen, section } = DOCUMENT_CORRECTIONS[type];
  return `${screen}?${[section, `${SOURCE_DOCUMENT_ID_PARAM}=${id}`].filter(Boolean).join("&")}`;
}

/** What the journal screen says about a document it names but cannot undo. */
export interface SourceDocumentGuidance {
  /** How the document is corrected instead, in the server's words. */
  message: string;
  /** The screen where that correction is made. */
  link: string;
  /** The button that opens it. */
  label: string;
}

/**
 * The guidance a goods return's journal carries, or null for any other journal.
 *
 * The server names the receipt the goods came off and the correction
 * (`RECEIVE_AGAIN`); the link is built here from the receipt's id, never taken
 * from the server's text. Ikeja's RV-0003 sent back 2 of the 10 chairs on
 * GRN-0012 that were never loaded: its journal reads "receive them again" and
 * opens GRN-0012, whose screen lists RV-0003 among its returns.
 */
export function sourceDocumentGuidance(action: JournalDetail["reversal_action"] | undefined): SourceDocumentGuidance | null {
  if (action?.kind !== "SOURCE_DOCUMENT_ACTION" || action.correction !== "RECEIVE_AGAIN") return null;
  const receipt = action.receipt;
  if (!receipt || receipt.document_type !== "GOODS_RECEIVED_NOTE" || !receipt.document_id) return null;
  return {
    message: action.correction_message
      || `A goods return is not voided. Receive the goods again against the order of goods receipt ${receipt.document_number}.`,
    link: documentScreenLink("GOODS_RECEIVED_NOTE", receipt.document_id),
    label: `Open goods receipt ${receipt.document_number}`,
  };
}
