/**
 * Field Access for the credit a customer holds (`finance.customer`, field `balance`).
 *
 * The credit a refund or a credit transfer can draw on is a customer's balance
 * seen from the other side, so the server answers "which customers hold credit,
 * and how much" only to a role that may read the balance. For any other role
 * the refund availability list comes back empty, and the totals built from it
 * are left out of the response. A screen that asked anyway would draw an empty
 * picker and a zero total, which read as "nobody holds credit" rather than "you
 * cannot see it", so these screens do not ask and say why instead.
 */

import type { FieldAccess } from "@/components/finance-ui";

/** The `module.resource` key the customer fields are registered under. */
export const CUSTOMER_RESOURCE = "finance.customer";

/** Whether the role may read a customer's balance, and so the credit a customer holds. */
export function customerCreditReadable(access: FieldAccess): boolean {
  return !access.isHidden("balance");
}

/** Said where a list of customers holding credit would otherwise appear. */
export const CUSTOMER_CREDIT_HIDDEN_NOTE =
  "Your role cannot see customer balances, so the customers holding credit are not listed.";
