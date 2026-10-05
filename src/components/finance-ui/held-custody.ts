/**
 * Whether the platform holds a school's online money, as a menu or a screen
 * needs to know it.
 *
 * Payouts and payout batches pay suppliers out of money the platform holds for
 * the school (custody HELD). At a school whose online payments go straight to
 * each branch's bank (custody DIRECT) there is no held money to pay from, so
 * those screens are absent from its menu.
 *
 * Bright Star School runs HELD: Mrs Bello, who holds the payout keys, sees
 * Payouts and Batches. Greenfield runs DIRECT: its bursar holds the same keys
 * and sees neither, and a bookmarked payouts address shows a short notice
 * instead of the workbench.
 *
 * The mode is read from the custody settings. A holder of
 * `payments.settings.view` gets the whole panel's answer; a holder of
 * `payments.payout.view` alone gets the short answer, the mode and nothing
 * else, which is all a menu needs. So Mr Okafor, a bursar at Bright Star who
 * pays suppliers but does not manage payment settings, still sees Payouts.
 * A reader with neither key, or a read still in flight, gives UNKNOWN, and a
 * gated menu treats UNKNOWN like DIRECT: a screen is never offered where it
 * may not work.
 */

import { useCan } from "./can";
import { P } from "../../permissions";
import { useGetCustodySettingsQuery } from "@/redux/services/payments/payments-api";
import type { CustodyMode } from "@/redux/services/payments/payments-types";
import type { PermissionCode } from "../../permissions";

/** What the reader can tell about the school's custody mode. */
export type CustodyReading = CustodyMode | "UNKNOWN";

/** Whether a reader holding these codes may read the custody mode at all. */
export function mayReadCustody(can: (code: PermissionCode) => boolean): boolean {
  return can(P.PAY_VIEW_PAYMENT_SETTINGS) || can(P.PAY_VIEW_PAYOUTS);
}

/** The pure rule, for tests: the mode in force when it could be read. */
export function custodyReading(canView: boolean, mode: CustodyMode | undefined | null): CustodyReading {
  if (!canView || !mode) return "UNKNOWN";
  return mode;
}

/**
 * The custody mode of the books `entity` belongs to. With `enabled` false the
 * settings are not read at all and the answer is UNKNOWN.
 */
export function useCustodyReading(entity: string | null | undefined, enabled = true): CustodyReading {
  const { can } = useCan();
  const canView = mayReadCustody(can);
  const query = useGetCustodySettingsQuery({ entity: entity ?? "" }, { skip: !enabled || !canView || !entity });
  return custodyReading(canView && enabled && !!entity, query.data?.data?.settings.mode);
}
