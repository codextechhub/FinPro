/**
 * Book a bank line as the provider's settlement of the online payments it carries.
 *
 * Opened from a suggestion (the server's guess at which waiting payments a line
 * carries, already ticked) or from an unmatched bank line (nothing ticked).
 * The reader confirms the payments, optionally moves the posting date, and
 * sees the journal before it posts: Dr bank (what arrived), Dr bank charges
 * (the fee), Cr gateway clearing (the payments). A pick the figures cannot
 * explain is answered here, in the dialog, rather than by a refusal; see
 * settlement-booking.ts. Only the payments of the line's own branch are
 * offered, because the settlement books in the bank account's branch.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmActionModal, PostingRecap, type RecapRow } from "@/components/finance-ui";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { useBookSettlementMutation } from "@/redux/services/payments/payments-api";
import type { SettlementRow, UnmatchedBankLine } from "@/redux/services/payments/payments-types";
import { useDates } from "../../lib/display-prefs";
import { GATEWAY_CLEARING_NAME, paymentsForLine, settlementFigures, settlementProblem } from "./settlement-booking";

export interface BookSettlementTarget {
  line: UnmatchedBankLine;
  /** Payments ticked when the dialog opens. */
  picked: number[];
}

export function BookSettlementModal({ target, payments, bankName, entity, currency, onClose }: {
  target: BookSettlementTarget;
  /** The payments still waiting in gateway clearing. */
  payments: SettlementRow[];
  /** The line's bank account, by name, where the reader may read bank accounts. */
  bankName: string | null;
  entity: string;
  currency?: string | null;
  onClose: () => void;
}) {
  const dates = useDates();
  const [picked, setPicked] = useState<Set<number>>(() => new Set(target.picked));
  const [postingDate, setPostingDate] = useState("");
  const [book, { isLoading }] = useBookSettlementMutation();
  const { line } = target;

  // Ticked payments first, then the rest by when they were confirmed.
  const listed = useMemo(() => paymentsForLine(target.line, payments).sort((a, b) =>
    Number(target.picked.includes(b.gateway_id)) - Number(target.picked.includes(a.gateway_id))
    || String(a.confirmed_at ?? "").localeCompare(String(b.confirmed_at ?? ""))), [payments, target.line, target.picked]);
  const otherBranches = listed.length < payments.length && line.branch_name;
  const chosen = listed.filter((p) => picked.has(p.gateway_id));
  const figures = settlementFigures(line, chosen);
  const problem = settlementProblem(line, chosen, dates.prefs.timeZone, postingDate || undefined);

  const toggle = (id: number) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const dr: RecapRow[] = [
    { code: "", name: bankName ? `Bank: ${bankName}` : "Bank", amount: Math.max(figures.net, 0) },
    ...(figures.fee > 0 ? [{ code: "", name: "Bank charges", amount: figures.fee }] : []),
  ];
  const cr: RecapRow[] = [{ code: "", name: GATEWAY_CLEARING_NAME, amount: figures.gross }];

  const confirm = async () => {
    try {
      const res = await book({
        entity, statement_line: line.bank_line_id, collections: chosen.map((p) => p.gateway_id),
        ...(postingDate ? { posting_date: postingDate } : {}),
      }).unwrap();
      toast.success(res.data?.journal_number ? `Settlement booked as ${res.data.journal_number}.` : res.message || "Settlement booked.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <ConfirmActionModal
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Book the provider's settlement"
      description={`${dates.day(line.txn_date)} · ${formatMoney(line.amount, currency)} into ${bankName ?? "the bank"}${line.reference ? ` · ${line.reference}` : ""}`}
      confirmText="Book settlement"
      loading={isLoading}
      confirmDisabled={!!problem}
      onConfirm={confirm}
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 font-mont text-xs font-medium text-black-01">Payments this line settles</p>
          {listed.length ? (
            <ul className="max-h-56 divide-y divide-white-02 overflow-y-auto rounded-md border border-white-02">
              {listed.map((p) => (
                <li key={p.gateway_id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 font-mont text-xs">
                    <input type="checkbox" className="accent-primary" checked={picked.has(p.gateway_id)} onChange={() => toggle(p.gateway_id)} aria-label={`Settles ${p.reference}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-gray-01">{p.reference}</span>
                      <span className="block text-[11px] text-gray-05">
                        Received {dates.day(p.confirmed_at)}{p.reported_fee != null ? ` · fee ${formatMoney(p.reported_fee, currency)}` : ""}
                      </span>
                    </span>
                    <span className="tabular-nums text-black-01">{formatMoney(Math.abs(p.amount), currency)}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mont text-xs text-gray-05">
              {otherBranches ? `No online payments of ${line.branch_name} are waiting to be paid into the bank.` : "No online payments are waiting to be paid into the bank."}
            </p>
          )}
          {otherBranches ? (
            <p className="mt-1.5 font-mont text-[11px] text-gray-05">{`Only ${line.branch_name}'s payments are listed: a settlement books in its bank account's branch.`}</p>
          ) : null}
        </div>

        <label className="block font-mont text-xs font-medium text-black-01">
          Posting date (optional)
          <DatePickerInput value={postingDate} onChange={(event) => setPostingDate(event.target.value)} className="mt-1.5 bg-white font-mont" />
          <span className="mt-1 block font-normal text-[11px] text-gray-05">Left blank, the journal is dated the bank line&rsquo;s day, or the first open day after it.</span>
        </label>

        <PostingRecap title="Settlement journal" dr={dr} cr={cr} currency={currency}
          helper="Posted in the bank account's branch. Unmatching the line in Bank Reconciliation reverses it." />

        {problem ? (
          <p role="alert" className={cn("rounded-md bg-amber-50 px-3 py-2 font-mont text-xs text-amber-800")}>{problem}</p>
        ) : null}
      </div>
    </ConfirmActionModal>
  );
}
