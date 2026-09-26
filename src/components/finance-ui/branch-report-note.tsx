import { Building2 } from "lucide-react";

/**
 * The line a financial statement shows when it covers only the reader's branches.
 *
 * The server builds a branch-bound reader's statements from the journals raised
 * in their branches plus the school-wide entries (see vs_finance.branch_ledger).
 * They balance and reconcile like the school's own, but they are not the
 * school's figures, and cash in particular is the cash those journals moved, not
 * a separate bank balance, since branches bank in shared accounts. Saying so on
 * the page keeps a branch statement from being read as the school's.
 */
export function BranchReportNote() {
  return (
    <div role="note"
      className="flex min-w-0 items-start gap-2.5 rounded-md bg-primary/5 px-3 py-2.5 ring-1 ring-primary/15">
      <Building2 className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="min-w-0 font-mont text-xs text-gray-01 text-pretty">
        <span className="font-semibold">Your branches only.</span> These figures cover the entries
        raised in your branches and the school-wide ones. Cash here is the cash those entries moved,
        not a separate bank balance.
      </p>
    </div>
  );
}
