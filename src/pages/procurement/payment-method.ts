/**
 * How a supplier payment was made, in the words the screens use.
 *
 * The server stores the method as a code (`BANK_TRANSFER`); the list, the
 * payment drawer and the form's choices all read it as "Bank transfer". A code
 * this does not know is shown in sentence case rather than as sent.
 */

export const PAYMENT_METHODS = ["BANK_TRANSFER", "CHEQUE", "CASH", "CARD"] as const;

const LABELS: Record<string, string> = {
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  CASH: "Cash",
  CARD: "Card",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "-";
  if (LABELS[method]) return LABELS[method];
  const words = method.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
