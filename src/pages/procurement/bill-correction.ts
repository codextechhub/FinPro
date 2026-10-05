/**
 * Which correction a posted supplier bill takes.
 *
 * A bill nothing has been paid or credited on is voided: its posting reverses
 * and the purchase order gets its billed quantities back. Once money has been
 * paid, or a credit note settled part of it, the bill stays and is corrected
 * with a credit note instead, because voiding it would leave a payment or a
 * credit pointing at nothing. The server makes the same decision under the
 * bill's lock; the screen asks first so the reader is offered the right one.
 */

import { formatMoney } from "../../utils/money";
import type { VendorInvoice } from "@/redux/services/procurement/procurement-types";

export interface BillCorrection {
  /** Posted, so it can be corrected at all. */
  posted: boolean;
  /** Something is left on it to credit. */
  creditable: boolean;
  /** Nothing paid or credited on it, so it may be voided. */
  voidable: boolean;
  /** Why it may not be voided, naming the credit note as the way instead. */
  voidRefusal: string | null;
}

export function billCorrection(
  bill: Pick<VendorInvoice, "status" | "total" | "amount_paid" | "amount_credited" | "document_number">,
  currency?: string | null,
): BillCorrection {
  const posted = bill.status === "POSTED";
  const credited = bill.amount_credited ?? 0;
  const paid = bill.amount_paid ?? 0;
  const creditable = posted && bill.total - credited > 0;
  let voidRefusal: string | null = null;
  if (posted && paid > 0) {
    voidRefusal = `${formatMoney(paid, currency)} has been paid against ${bill.document_number}, so it cannot be voided. Correct it with a credit note instead.`;
  } else if (posted && credited > 0) {
    voidRefusal = `A credit note has settled part of ${bill.document_number}, so it cannot be voided. Credit the rest of the bill instead.`;
  }
  return { posted, creditable, voidable: posted && !voidRefusal, voidRefusal };
}
