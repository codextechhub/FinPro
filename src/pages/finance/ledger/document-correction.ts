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
 *   until its bank line is reconciled.
 *
 * Mrs Bello opens the journal of Ikeja's ₦250,000 stationery bill and is
 * offered "Void bill" and "Open bill", never a raw Reverse that would leave the
 * bill owing while the ledger says it does not.
 */

import { routesPath } from "@/routes/routes-path";
import { P, type PermissionCode } from "../../../permissions";
import { SOURCE_DOCUMENT_ID_PARAM } from "@/lib/source-document-route";

const F = routesPath.PROTECTED.FINANCE;
const R = routesPath.PROTECTED.PROCUREMENT;

export type CorrectableDocumentType =
  | "VENDOR_INVOICE"
  | "VENDOR_CREDIT_NOTE"
  | "VENDOR_PAYMENT"
  | "GOODS_RECEIVED_NOTE"
  | "BANK_TRANSACTION"
  | "BANK_TRANSFER";

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
};

export function isCorrectableDocument(type: string): type is CorrectableDocumentType {
  return Object.prototype.hasOwnProperty.call(DOCUMENT_CORRECTIONS, type);
}

/** The address that opens document `id` of `type` on its own screen. */
export function documentScreenLink(type: CorrectableDocumentType, id: number): string {
  const { screen, section } = DOCUMENT_CORRECTIONS[type];
  return `${screen}?${[section, `${SOURCE_DOCUMENT_ID_PARAM}=${id}`].filter(Boolean).join("&")}`;
}
