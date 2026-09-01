import { P, type PermissionCode } from "@/permissions";
import type { VoidableArResource } from "@/redux/services/finance/ar-api";

export type VoidableDocumentType = "INVOICE" | "PAYMENT" | "CREDIT_NOTE" | "REFUND" | "CONCESSION";

/**
 * Credit notes and debit notes share one endpoint and one permission, but they are
 * two different documents to the person looking at one. The variant names the
 * document actually open so the void button can say what it will void.
 */
export type VoidableDocumentVariant = "CREDIT" | "DEBIT";

type VoidConfig = {
  resource: VoidableArResource;
  label: string;
  variantLabels?: Record<VoidableDocumentVariant, string>;
  permission: PermissionCode;
  effect: string;
};

export const DOCUMENT_VOID_CONFIG: Record<VoidableDocumentType, VoidConfig> = {
  INVOICE: {
    resource: "invoices",
    label: "invoice",
    permission: P.FIN_REVERSE_INVOICE,
    effect: "removes the receivable and reverses its GL posting",
  },
  PAYMENT: {
    resource: "payments",
    label: "receipt",
    permission: P.FIN_REVERSE_PAYMENT,
    effect: "returns its allocations to unpaid balances and reverses every related GL posting",
  },
  CREDIT_NOTE: {
    resource: "credit-notes",
    label: "note",
    variantLabels: { CREDIT: "credit note", DEBIT: "debit note" },
    permission: P.FIN_REVERSE_CREDIT_NOTE,
    effect: "returns its allocations to the affected balances and reverses every related GL posting",
  },
  REFUND: {
    resource: "refunds",
    label: "refund",
    permission: P.FIN_REVERSE_REFUND,
    effect: "restores the exact customer-credit lots it consumed and reverses its GL posting",
  },
  CONCESSION: {
    resource: "concessions",
    label: "concession",
    permission: P.FIN_REVERSE_CONCESSION,
    effect: "restores the invoice balance and reverses its GL posting",
  },
};

/** Name the document that is actually open, falling back to the family name. */
export function voidDocumentLabel(
  documentType: VoidableDocumentType,
  variant?: VoidableDocumentVariant | null,
): string {
  const config = DOCUMENT_VOID_CONFIG[documentType];
  return (variant && config.variantLabels?.[variant]) || config.label;
}
