/**
 * When a collection is worth asking the provider about again.
 *
 * Failed and Abandoned record what the provider said when somebody last asked,
 * and a payer can still finish paying on the same checkout afterwards; the
 * server books a confirmed success from either state. So both are re-checked
 * like a pending one, unless the provider never accepted the collection at all
 * (no provider reference), which leaves it nothing to confirm. A booked
 * collection (Paid or Refunded) has nothing left to learn.
 */

import type { Collection } from "@/redux/services/payments/payments-types";

export function canReverify(c: Pick<Collection, "status" | "provider_reference">): boolean {
  if (c.status === "SUCCEEDED" || c.status === "REFUNDED") return false;
  if (c.status === "FAILED" || c.status === "ABANDONED") return !!c.provider_reference;
  return true;
}
