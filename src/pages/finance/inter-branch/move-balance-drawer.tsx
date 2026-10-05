/**
 * Move a customer's whole open balance from one branch to another.
 *
 * Tunde moves from Ikeja to Lekki on 25 January. His open bills and debit
 * notes, his unspent credit and the part of his term not yet earned all go to
 * Lekki, which collects from then on. Income Ikeja already earned stays there,
 * and the two branches settle what is left between them through the
 * inter-branch account. After the move the drawer shows what went and what is
 * now owed, with a link to the move in the register, where it can be voided.
 *
 * It binds two branches' books and another branch's lists, so the server lets
 * only a whole-school reader do it, and only this reader is offered it.
 */

import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ArrowRight, Users } from "lucide-react";

import {
  CustomerPicker, DetailDrawer, FormField, Money, PostingDateField, useCustomerBranch,
} from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/utils/money";
import { useMoveReceivablesMutation } from "@/redux/services/finance/interbranch-api";
import type { ReceivableMoveResult } from "@/redux/services/finance/interbranch-types";
import { counted, moveDebtSentence, moveSummary } from "./move-summary";
import { transferLink } from "./links";
import { BranchSelect, Note } from "./parts";
import type { InterBranchReader } from "./use-inter-branch";

export function MoveBalanceDrawer({ entity, currency, reader, onClose, onOpenTransfer, customerCode = "" }: {
  entity: string;
  currency?: string | null;
  reader: InterBranchReader;
  onClose: () => void;
  /** Opens the move in the register on screen; without it the button links there. */
  onOpenTransfer?: (id: number) => void;
  /** A customer already chosen, when opened from their account. */
  customerCode?: string;
}) {
  const [customer, setCustomer] = useState(customerCode);
  const customerBranch = useCustomerBranch(entity, customer);
  const [fromPick, setFromPick] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [date, setDate] = useState("");
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState<{ moved: ReceivableMoveResult; from: string; to: string } | null>(null);
  const [move, { isLoading }] = useMoveReceivablesMutation();

  const fromBranch = fromPick || (typeof customerBranch === "number" ? String(customerBranch) : "");
  const canSubmit = !!customer && !!fromBranch && !!toBranch && fromBranch !== toBranch;
  const money = (kobo: number) => formatMoney(kobo, currency);

  const submit = async () => {
    try {
      const res = await move({
        entity, customer, from_branch: Number(fromBranch), to_branch: Number(toBranch),
        move_date: date || undefined, purpose: purpose.trim() || undefined,
      }).unwrap();
      toast.success(res.message || "Balance moved.");
      setResult({ moved: res.data, from: reader.nameOf(Number(fromBranch)), to: reader.nameOf(Number(toBranch)) });
    } catch { /* central */ }
  };

  const summary = result ? moveSummary(result.moved) : null;

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o || isLoading ? undefined : onClose())}
      title="Move a customer's balance"
      description="Everything open at one branch goes to another, and the branches settle the rest between them."
      widthClass="sm:max-w-lg"
      footer={result ? (
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {result.moved.transfer_id && onOpenTransfer ? (
            <Button onClick={() => { onOpenTransfer(result.moved.transfer_id!); onClose(); }} className="gap-1.5">
              Open the move <ArrowRight className="size-4" />
            </Button>
          ) : result.moved.transfer_id ? (
            <Button asChild className="gap-1.5">
              <Link to={transferLink(result.moved.transfer_id)}>Open the move <ArrowRight className="size-4" /></Link>
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
          <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5">
            <Users className="size-4" />{isLoading ? "Moving..." : "Move balance"}
          </Button>
        </>
      )}
    >
      {result && summary ? (
        result.moved.transfer_id === null ? (
          <Note>{`Nothing was open at ${result.from}, so nothing moved.`}</Note>
        ) : (
          <div className="space-y-4">
            <p className="font-mont text-sm text-black-01">{`Moved from ${result.from} to ${result.to}:`}</p>
            <dl className="divide-y divide-white-02 rounded-md border border-white-02">
              <MovedRow label={`Open bills (${counted(summary.invoiceCount, "invoice", "invoices")}, ${counted(summary.debitNoteCount, "debit note", "debit notes")})`} kobo={summary.owed} currency={currency} />
              <MovedRow label={`Unspent credit (${counted(summary.creditCount, "receipt or note", "receipts or notes")})`} kobo={summary.credit} currency={currency} />
              <MovedRow label="Fees not yet earned" kobo={summary.deferred} currency={currency} />
            </dl>
            <Note tone={summary.debt === 0 ? "plain" : "warn"}>{moveDebtSentence(summary.debt, result.from, result.to, money)}</Note>
            <p className="font-mont text-[11px] leading-5 text-gray-05">
              The moved bills cannot be voided on their own while the move stands. Void the move from the register instead, which works only while nothing moved has been paid, credited or released at {result.to}.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <FormField label="Customer" required>
            <CustomerPicker entity={entity} value={customer} onChange={(v) => { setCustomer(v); setFromPick(""); }} />
          </FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="From branch" required>
              <BranchSelect label="From branch" branches={reader.branches} value={fromBranch} onChange={setFromPick} />
            </FormField>
            <FormField label="To branch" required>
              <BranchSelect label="To branch" branches={reader.branches.filter((b) => String(b.id) !== fromBranch)} value={toBranch} onChange={setToBranch} />
            </FormField>
          </div>
          <PostingDateField label="Move date" entity={entity} value={date} onChange={setDate} hint="Income earned up to this day stays with the old branch." />
          <FormField label="Why">
            <Input value={purpose} maxLength={255} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Changed branch for second term" className="h-9 bg-white" />
          </FormField>
          <Note>
            Moves the open invoices and debit notes, any unspent credit, and the fees not yet earned. Income already earned stays with the old branch, which the new branch then owes for it.
          </Note>
        </div>
      )}
    </DetailDrawer>
  );
}

function MovedRow({ label, kobo, currency }: { label: string; kobo: number; currency?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="min-w-0 font-mont text-xs text-gray-05">{label}</dt>
      <dd><Money kobo={kobo} currency={currency} align="right" /></dd>
    </div>
  );
}
