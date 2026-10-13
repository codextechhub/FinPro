/**
 * Collect at the desk: a parent pays a bill by scanning a code at the bursar's
 * counter.
 *
 * Started from an invoice (the amount defaults to its balance and cannot pass
 * it) or from a customer's account (any amount). Posting the collection with
 * origin DESK returns the provider's checkout link, drawn here as a large QR
 * code beside the link itself and a Copy button. The parent pays on their own
 * phone; the dialog reads the collection back every few seconds with
 * `?verify=1`, which asks the provider and books the receipt when it is paid,
 * and says Paid or Not paid in a banner the bursar can read from across the
 * counter. See desk-collection-model.ts for when it stops asking.
 *
 * Reading the collection back needs `payments.collection.view`. A bursar who
 * may start a collection but not read one still gets the code and is told to
 * confirm the payment elsewhere, rather than meeting a refusal every three
 * seconds.
 *
 * A customer every branch shares has no branch of their own, so at a school
 * with several branches a collection for such a customer without an invoice
 * names the bank account its money lands in (see deskNeedsDepositAccount).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Check, CircleAlert, Copy, ExternalLink, Loader2, QrCode, RefreshCw } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DepositAccountPicker, FormField, Money, MoneyInput, useFieldAccess, useReaderBranchLens } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/redux/store";
import { paymentsApi, useInitiateCollectionMutation, usePollCollectionQuery } from "@/redux/services/payments/payments-api";
import type { Collection } from "@/redux/services/payments/payments-types";
import { P } from "../../../permissions";
import {
  DESK_POLL_LIMIT_MS,
  DESK_POLL_MS,
  deskAmountError,
  deskCollectionBody,
  deskEmailError,
  deskIsFinal,
  deskNeedsDepositAccount,
  deskOutcome,
  type DeskOutcome,
} from "./desk-collection-model";

/** What a desk collection is for: an invoice's balance, or a customer's account. */
export interface DeskCollectionTarget {
  customerCode: string;
  customerName: string;
  /** The customer's billing email, offered as the payer's address. */
  customerEmail?: string;
  /** The branch the customer is filed under; null for one every branch shares. */
  customerBranchId?: number | null;
  invoice?: { id: number; documentNumber: string; balanceKobo: number };
}

/** The tags a booked receipt makes stale. */
const PAID_TAGS = ["PaymentsCollections", "FinanceInvoices", "FinancePayments", "FinanceCustomers", "FinanceReports"] as const;

/**
 * Reads a started collection back until it is paid, closed or timed out.
 *
 * The read stays subscribed from the moment the collection starts, so the last
 * answer is kept and `refetch` always works; only the polling interval turns
 * on and off. It runs while the answer is still open, inside the ten minutes,
 * and until a read fails: a refusal is met once, not every three seconds, and
 * `checkAgain` tries it again. Nothing is asked of a caller who may not read
 * collections (`canRead` false), or while the dialog is closed. The interval
 * is held in state because whether to keep asking depends on the answer the
 * read itself returns.
 */
export function useDeskCollectionPoll(entity: string, started: Collection | null, canRead: boolean) {
  const dispatch = useAppDispatch();
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);
  const booked = useRef(false);

  const [pollMs, setPollMs] = useState(0);
  const query = usePollCollectionQuery(
    { id: started?.id ?? 0, entity },
    { skip: !started || !canRead, pollingInterval: pollMs, refetchOnMountOrArgChange: true },
  );
  const latest = query.data?.data ?? started;
  const final = deskIsFinal(latest?.status);
  const failed = !!started && canRead && query.isError;
  const polling = !!started && canRead && !final && !failed && !timedOut;
  if (polling !== (pollMs > 0)) setPollMs(polling ? DESK_POLL_MS : 0);

  useEffect(() => {
    if (!polling) return;
    const left = Math.max(0, startedAt + DESK_POLL_LIMIT_MS - Date.now());
    const timer = setTimeout(() => setTimedOut(true), left);
    return () => clearTimeout(timer);
  }, [polling, startedAt]);

  useEffect(() => {
    if (latest?.status === "SUCCEEDED" && !booked.current) {
      booked.current = true;
      dispatch(paymentsApi.util.invalidateTags([...PAID_TAGS]));
    }
  }, [latest?.status, dispatch]);

  const checkAgain = useCallback(() => {
    setStartedAt(Date.now());
    setTimedOut(false);
    if (started && canRead) void query.refetch();
  }, [started, canRead, query]);

  return {
    collection: latest,
    outcome: deskOutcome(latest?.status),
    timedOut,
    failed,
    checking: query.isFetching,
    checkAgain,
  };
}

const BANNER: Record<DeskOutcome, { tone: string; title: string }> = {
  waiting: { tone: "border-blue-200 bg-blue-50 text-blue-800", title: "Waiting for payment" },
  paid: { tone: "border-green-01/30 bg-green-01/10 text-green-01", title: "Paid" },
  not_paid: { tone: "border-amber-200 bg-amber-50 text-amber-800", title: "Not paid" },
  refunded: { tone: "border-blue-200 bg-blue-50 text-blue-800", title: "Paid, then refunded" },
};

function OutcomeBanner({ outcome, timedOut, failed, canRead }: { outcome: DeskOutcome; timedOut: boolean; failed: boolean; canRead: boolean }) {
  const stopped = outcome === "waiting" && (timedOut || failed);
  const view = stopped ? { tone: BANNER.not_paid.tone, title: "Not paid yet" } : BANNER[outcome];
  const detail = !canRead && outcome === "waiting"
    ? "You cannot check payments from this role. Confirm the payment on the Collections screen."
    : outcome === "paid" ? "The payment has been received and the receipt is booked."
    : outcome === "not_paid" ? "The provider has not received the payment. The payer can still finish paying: check again."
    : stopped ? (failed ? "We could not check just now." : "We stopped checking after ten minutes. If the payer has paid since, check again.")
    : outcome === "refunded" ? "This payment was returned to the payer."
    : "The parent scans the code and pays on their phone. This updates by itself.";
  return (
    <div role="status" aria-live="polite" data-outcome={stopped ? "stopped" : outcome} className={cn("flex items-start gap-3 rounded-md border px-4 py-3", view.tone)}>
      {outcome === "paid" ? <Check className="mt-0.5 size-5 shrink-0" /> : outcome === "waiting" && !stopped && canRead
        ? <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin" /> : <CircleAlert className="mt-0.5 size-5 shrink-0" />}
      <div>
        <p className="font-mont text-lg font-semibold leading-6">{view.title}</p>
        <p className="font-mont text-xs leading-5">{detail}</p>
      </div>
    </div>
  );
}

export function DeskCollectionDialog({ open, onOpenChange, entity, currency, target }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: string;
  currency?: string | null;
  target: DeskCollectionTarget;
}) {
  const { can } = useCan();
  const access = useFieldAccess("payments.collection");
  const lens = useReaderBranchLens();
  const balance = target.invoice?.balanceKobo ?? null;
  const [amount, setAmount] = useState(balance ?? 0);
  const [email, setEmail] = useState(target.customerEmail ?? "");
  const [deposit, setDeposit] = useState("");
  const [started, setStarted] = useState<Collection | null>(null);
  const [copied, setCopied] = useState(false);
  const [initiate, { isLoading }] = useInitiateCollectionMutation();
  const canRead = can(P.PAY_VIEW_COLLECTIONS);
  const poll = useDeskCollectionPoll(entity, started, canRead && open);

  const needsDeposit = deskNeedsDepositAccount({
    invoiceId: target.invoice?.id ?? null, customerBranchId: target.customerBranchId, multiBranch: lens.applies,
  });
  const emailError = deskEmailError(email);
  const amountError = amount ? deskAmountError(amount, balance) : null;
  const ready = !emailError && !deskAmountError(amount, balance) && (!needsDeposit || !!deposit);

  const close = () => onOpenChange(false);

  const start = async () => {
    const body = deskCollectionBody({
      entity, amountKobo: amount, email, customerCode: target.customerCode,
      invoiceId: target.invoice?.id ?? null, depositAccount: needsDeposit ? deposit : "",
      narration: target.invoice ? `Payment for ${target.invoice.documentNumber}` : undefined,
    });
    try {
      const res = await initiate(access.writableOnly(body, { creating: true })).unwrap();
      setStarted(res.data);
    } catch { /* central */ }
  };

  const url = started?.checkout_url ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { toast.error("Couldn't copy the link."); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isLoading && close()}>
      <DialogContent className="console-geist max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mont text-base font-semibold text-black-01">Collect at the desk</DialogTitle>
          <DialogDescription className="font-mont text-sm text-gray-05">
            {target.invoice
              ? `Show a payment code for ${target.invoice.documentNumber}. The parent scans it and pays on their phone.`
              : `Show a payment code for ${target.customerName}'s account. The parent scans it and pays on their phone.`}
          </DialogDescription>
        </DialogHeader>

        {!started ? (
          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2.5 font-mont text-sm">
              <span className="min-w-0 truncate text-gray-05">{target.customerName}</span>
              {target.invoice ? (
                <span className="shrink-0 text-xs text-gray-05">Balance <Money kobo={target.invoice.balanceKobo} currency={currency} /></span>
              ) : null}
            </div>
            <FormField label="Amount" required>
              <MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" />
            </FormField>
            {amountError ? <p role="alert" className="-mt-2 font-mont text-[11px] text-destructive">{amountError}</p> : null}
            <FormField label="Payer's email (optional)">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" className="h-9 bg-white" />
            </FormField>
            {emailError ? <p role="alert" className="-mt-2 font-mont text-[11px] text-destructive">{emailError}</p> : null}
            <p className="-mt-1 font-mont text-[11px] text-gray-05">The provider sends the receipt here. Blank uses the family's billing email.</p>
            {needsDeposit ? (
              <FormField label="Bank account it lands in" required>
                <DepositAccountPicker entity={entity} value={deposit} onChange={setDeposit} placeholder="Choose a branch's bank account" />
              </FormField>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
              <Button disabled={isLoading || !ready} onClick={start} className="gap-1.5">
                <QrCode className="size-4" />{isLoading ? "Starting…" : "Show payment code"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <OutcomeBanner outcome={poll.outcome} timedOut={poll.timedOut} failed={poll.failed} canRead={canRead} />
            {poll.outcome === "paid" || poll.outcome === "refunded" ? null : url ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-white-02 bg-white p-4">
                <QRCodeSVG value={url} size={256} level="M" marginSize={2} title="Payment code" className="h-auto w-full max-w-[280px]" />
                <p className="font-mont text-2xl font-semibold tabular-nums text-black-01"><Money kobo={started.amount} currency={currency} /></p>
                <p className="font-mont text-xs text-gray-05">Ref {started.reference}</p>
              </div>
            ) : (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs text-amber-900">The provider returned no payment link, so there is no code to show.</p>
            )}
            {url && poll.outcome !== "paid" && poll.outcome !== "refunded" ? (
              <label className="block space-y-1">
                <span className="font-mont text-xs text-gray-05">Payment link</span>
                <div className="flex items-center gap-2">
                  <Input readOnly value={url} className="min-w-0 bg-gray-50 font-mont text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button type="button" variant="outline" size="sm" onClick={copy} className="h-9 shrink-0 gap-1 px-2">
                    {copied ? <Check className="size-3.5 text-green-01" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy"}
                  </Button>
                  <Button type="button" size="sm" onClick={() => window.open(url, "_blank", "noopener")} className="h-9 shrink-0 gap-1 px-2">
                    <ExternalLink className="size-3.5" /> Open
                  </Button>
                </div>
              </label>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canRead && poll.outcome !== "paid" && poll.outcome !== "refunded" ? (
                <Button variant="outline" disabled={poll.checking} onClick={poll.checkAgain} className="gap-1.5">
                  <RefreshCw className={cn("size-4", poll.checking && "animate-spin")} /> Check again
                </Button>
              ) : null}
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
