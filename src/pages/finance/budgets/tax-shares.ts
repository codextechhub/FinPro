/**
 * A tax return's branch shares, as the Tax Remittance screen shows them.
 *
 * A return is prepared, filed and un-filed for the whole school, but paid branch
 * by branch: each branch's share comes out of that branch's own bank account.
 * October's VAT return is N120,000, Ikeja's share N80,000 and Lekki's N40,000;
 * Mrs Bello pays N80,000 from Ikeja's bank and N40,000 from Lekki's, and the
 * return is Paid when both are. Mrs Adeyemi, Lekki's bursar, is sent only
 * Lekki's share and totals summed over it, and pays only that.
 *
 * At a one-branch school there is one share and nothing to choose, so the
 * dimension recedes: no share table, one Pay button for the whole balance.
 */

import type { TaxFiling, TaxFilingShare } from "@/redux/services/finance/ops-types";

export interface TaxShareView {
  /** Whether the shares are shown at all. */
  show: boolean;
  shares: TaxFilingShare[];
  /** Shares with something left to pay. */
  open: TaxFilingShare[];
  /**
   * The share the single Pay button pays, when exactly one is open. Several
   * open shares are each paid from their own row.
   */
  single: TaxFilingShare | null;
}

export function taxShareView(filing: Pick<TaxFiling, "branch_breakdown">, multiBranch: boolean): TaxShareView {
  const shares = filing.branch_breakdown ?? [];
  const open = shares.filter((share) => share.balance_due > 0);
  return {
    show: multiBranch && shares.length > 0,
    shares,
    open,
    single: open.length === 1 ? open[0] : null,
  };
}

/** Whether a share can be paid: something left, and a real branch whose bank pays it. */
export function shareIsPayable(share: TaxFilingShare): boolean {
  return share.balance_due > 0 && share.branch_id != null && !share.branch_pending;
}
