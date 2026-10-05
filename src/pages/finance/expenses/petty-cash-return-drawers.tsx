/**
 * The petty cash forms that bank a fund's cash, close it, bring it back, and
 * edit it: Reduce float, Close fund, Reopen and Edit fund.
 *
 * Reduce float and Close fund start with the custodian's count and show what
 * the posting will do before it is sent: the cash banked into which of the
 * fund's own branch's accounts, any shortage or overage going to Cash over and
 * short (with the reason it needs), the cash the tin keeps and the float after.
 * The rules they check are in `petty-cash-returns.ts`; the server checks them
 * again and refuses (409) what breaks them, which the central handler words.
 *
 * Approval is the school's to choose. With no route a return posts at once;
 * with the ready-made route adopted a short count above its limit, and every
 * closure, waits for a second person; with a route that has no steps yet the
 * application asks the reader to confirm posting without approval and sends
 * the same request again. The form only reports what came back: the server's
 * message, and the approval block when nobody can approve it.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Landmark, Pencil, RotateCcw } from "lucide-react";

import {
  BankAccountPicker, ConfirmActionModal, DetailDrawer, FormField, MoneyInput, PostingDateField,
  PostingRecap, ReasonField, hasReason, toArray,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import {
  useClosePettyCashFundMutation, useGetBankAccountsQuery, useReducePettyCashFloatMutation,
  useReopenPettyCashFundMutation, useUpdatePettyCashFundMutation,
} from "@/redux/services/finance/ops-api";
import type { PettyCashFund, PettyCashReturn } from "@/redux/services/finance/ops-types";
import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";
import { P } from "../../../permissions";
import { useDates } from "../../../lib/display-prefs";
import {
  closeFigures, closeProblem, differenceSentence, fundEditProblem, reduceFigures, reduceProblem,
  type ReturnFigures,
} from "./petty-cash-returns";

const NOTE = "rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] leading-5 text-gray-05";
const PROBLEM = "rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 font-mont text-xs leading-5 text-destructive";

/** What a form hands back once the server answered: the approval block, if any. */
export type ReturnRaised = (approval?: ApprovalParkState | null) => void;

function useBankName(entity: string, id: string): string {
  const { data } = useGetBankAccountsQuery({ entity, page: 1 });
  return useMemo(() => toArray(data?.data).find((a) => String(a.id) === id)?.name ?? "", [data, id]);
}

/** The count against the books, and where the cash goes, before it is sent. */
function ReturnSummary({ fund, figures, bankName, currency, floatAfter }: {
  fund: PettyCashFund;
  figures: ReturnFigures;
  bankName: string;
  currency?: string | null;
  floatAfter: number;
}) {
  const money = (kobo: number) => formatMoney(kobo, currency);
  const differs = differenceSentence(figures, currency);
  const pettyCash = { code: fund.gl_account, name: "Petty cash" };
  const dr = [
    ...(figures.banked ? [{ code: "Bank", name: bankName || "the bank account", amount: figures.banked }] : []),
    ...(figures.shortage ? [{ code: "Cash over and short", name: "", amount: figures.shortage }] : []),
    ...(figures.overage ? [{ ...pettyCash, amount: figures.overage }] : []),
  ];
  const cr = [
    ...(figures.banked ? [{ ...pettyCash, amount: figures.banked }] : []),
    ...(figures.shortage ? [{ ...pettyCash, amount: figures.shortage }] : []),
    ...(figures.overage ? [{ code: "Cash over and short", name: "", amount: figures.overage }] : []),
  ];
  return (
    <div className="space-y-3" data-testid="return-summary">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-md bg-white p-3 font-mont text-xs ring-1 ring-white-02 sm:grid-cols-2">
        <div className="flex justify-between gap-2"><dt className="text-gray-05">Books say</dt><dd className="tabular-nums">{money(fund.current_balance)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-gray-05">Counted</dt><dd className="tabular-nums">{money(figures.banked + figures.tinKeeps)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-gray-05">To the bank</dt><dd className="font-semibold tabular-nums">{money(figures.banked)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-gray-05">Tin keeps</dt><dd className="tabular-nums">{money(figures.tinKeeps)}</dd></div>
        <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-gray-05">Float</dt><dd className="tabular-nums">{money(fund.float_amount)} to {money(floatAfter)}</dd></div>
      </dl>
      {differs ? (
        <p className={cn("rounded-md px-3 py-2 font-mont text-xs font-medium", figures.shortage ? "bg-destructive/5 text-destructive" : "bg-green-01/10 text-green-01")} data-testid="return-difference">
          {differs}
        </p>
      ) : null}
      {dr.length ? <PostingRecap title="What this posts" dr={dr} cr={cr} currency={currency} stackOnMobile /> : null}
    </div>
  );
}

const APPROVAL_NOTE = "If the school uses an approval route for petty cash returns, this may wait for a second person before it reaches the books.";

/**
 * Reduce float: count the tin, cut the float, bank everything above it into
 * one of the fund's own branch's bank accounts.
 */
export function ReduceFloatDrawer({ fund, entity, currency, onClose, onRaised }: {
  fund: PettyCashFund; entity: string; currency?: string | null; onClose: () => void; onRaised: ReturnRaised;
}) {
  const [counted, setCounted] = useState(fund.current_balance);
  const [newFloat, setNewFloat] = useState(0);
  const [bank, setBank] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [reduce, { isLoading }] = useReducePettyCashFloatMutation();
  const bankName = useBankName(entity, bank);
  const figures = reduceFigures({ counted, book: fund.current_balance, newFloat });
  const problem = reduceProblem({ figures, newFloat, currentFloat: fund.float_amount, hasBank: !!bank, reason, currency });

  const submit = async () => {
    try {
      const res = await reduce({
        id: fund.id, entity, counted_amount: counted, new_float_amount: newFloat, return_date: date,
        bank_account: bank, difference_reason: figures.difference ? reason.trim() : undefined,
        reference: reference.trim() || undefined,
      }).unwrap();
      toast.success(res.message || "Float reduced.");
      onClose();
      onRaised(res.data?.approval);
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Reduce float" description={`${fund.name} · bank the cash above a lower float`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !!problem || !date} onClick={submit} className="gap-1.5">
          <Landmark className="size-4" />{isLoading ? "Saving…" : `Bank ${formatMoney(figures.banked, currency)}`}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <p className={NOTE}>Count the cash in the tin first. Everything above the new float goes back to the bank, and any difference from the books goes to Cash over and short.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Cash counted" required><MoneyInput valueKobo={counted} onChangeKobo={setCounted} currency={currency} className="[&_input]:h-9" /></FormField>
          <FormField label="New float" required><MoneyInput valueKobo={newFloat} onChangeKobo={setNewFloat} currency={currency} className="[&_input]:h-9" /></FormField>
        </div>
        <p className="-mt-2 font-mont text-[11px] text-gray-05">The books say {formatMoney(fund.current_balance, currency)}. The float is {formatMoney(fund.float_amount, currency)}.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Into bank account" required><BankAccountPicker entity={entity} value={bank} onChange={setBank} documentBranchId={fund.branch_id} /></FormField>
          <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
        </div>
        {figures.difference ? (
          <ReasonField label="Why the count differs" value={reason} onChange={setReason} placeholder="e.g. coins missing" hint="Kept on the return and the audit record." />
        ) : null}
        <FormField label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Deposit slip number" className="h-9 bg-white" /></FormField>
        <ReturnSummary fund={fund} figures={figures} bankName={bankName} currency={currency} floatAfter={newFloat} />
        {problem ? <p className={PROBLEM} role="alert">{problem}</p> : null}
        <p className="font-mont text-[11px] text-gray-05">{APPROVAL_NOTE}</p>
      </div>
    </DetailDrawer>
  );
}

/**
 * Close fund: count the tin and bank all of it. The fund then takes no
 * vouchers, top-ups or float changes until it is reopened.
 */
export function CloseFundDrawer({ fund, entity, currency, blockers, onClose, onRaised }: {
  fund: PettyCashFund; entity: string; currency?: string | null; blockers: string[]; onClose: () => void; onRaised: ReturnRaised;
}) {
  const dates = useDates();
  const [counted, setCounted] = useState(fund.current_balance);
  const [bank, setBank] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [close, { isLoading }] = useClosePettyCashFundMutation();
  const bankName = useBankName(entity, bank);
  const figures = closeFigures({ counted, book: fund.current_balance });
  const problem = closeProblem({ blockers, figures, hasBank: !!bank, reason });

  const submit = async () => {
    try {
      const res = await close({
        id: fund.id, entity, counted_amount: counted, return_date: date,
        bank_account: bank || undefined, difference_reason: figures.difference ? reason.trim() : undefined,
        reference: reference.trim() || undefined,
      }).unwrap();
      toast.success(res.message || "Fund closed.");
      onClose();
      onRaised(res.data?.approval);
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Close fund" description={`${fund.name} · bank all its cash and stop it`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !!problem || !date} onClick={submit} className="gap-1.5 bg-error-01 text-white hover:bg-error-01/90">
          <Ban className="size-4" />{isLoading ? "Closing…" : "Close fund"}
        </Button>
      </>}
    >
      <div className="space-y-4">
        {blockers.length ? (
          <div className={PROBLEM} role="alert" data-testid="close-blockers">
            <p className="font-semibold">This fund cannot close yet.</p>
            <ul className="mt-1 list-disc pl-4">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        ) : null}
        <p className={NOTE}>Count the cash in the tin. All of it goes back to the bank. After this the fund takes no vouchers, top-ups or float changes until it is reopened.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Cash counted" required><MoneyInput valueKobo={counted} onChangeKobo={setCounted} currency={currency} className="[&_input]:h-9" /></FormField>
          <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
        </div>
        <p className="-mt-2 font-mont text-[11px] text-gray-05">The books say {formatMoney(fund.current_balance, currency)}.</p>
        {figures.banked > 0 ? (
          <FormField label="Into bank account" required><BankAccountPicker entity={entity} value={bank} onChange={setBank} documentBranchId={fund.branch_id} /></FormField>
        ) : null}
        {figures.difference ? (
          <ReasonField label="Why the count differs" value={reason} onChange={setReason} placeholder="e.g. coins missing" hint="Kept on the return and the audit record." />
        ) : null}
        <FormField label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Deposit slip number" className="h-9 bg-white" /></FormField>
        <ReturnSummary fund={fund} figures={figures} bankName={bankName} currency={currency} floatAfter={0} />
        {date ? <p className="font-mont text-xs text-gray-01">The fund closes on {dates.day(date)}.</p> : null}
        {problem && !blockers.length ? <p className={PROBLEM} role="alert">{problem}</p> : null}
        <p className="font-mont text-[11px] text-gray-05">{APPROVAL_NOTE}</p>
      </div>
    </DetailDrawer>
  );
}

/**
 * Reopen a closed fund, with a reason on the record. It comes back empty: the
 * closure banked its cash, so Replenish tops it up to the float set here.
 */
export function ReopenFundDialog({ fund, entity, currency, initialFloat, onClose }: {
  fund: PettyCashFund; entity: string; currency?: string | null; initialFloat: number; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [floatAmount, setFloatAmount] = useState(initialFloat);
  const [reopen, { isLoading }] = useReopenPettyCashFundMutation();
  const submit = async () => {
    try {
      const res = await reopen({ id: fund.id, entity, reason: reason.trim(), float_amount: floatAmount || undefined }).unwrap();
      toast.success(res.message || "Fund reopened.");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal
      open onOpenChange={(o) => !o && onClose()}
      title={`Reopen ${fund.name}?`}
      description="It comes back empty, ready for a top-up with Replenish. The reopening is kept on the audit record with your reason."
      confirmText="Reopen fund"
      loading={isLoading}
      confirmDisabled={!hasReason(reason)}
      onConfirm={submit}
    >
      <div className="space-y-3">
        <ReasonField label="Why reopen it" value={reason} onChange={setReason} placeholder="e.g. new term" />
        <FormField label="Float from now"><MoneyInput valueKobo={floatAmount} onChangeKobo={setFloatAmount} currency={currency} className="[&_input]:h-9" /></FormField>
      </div>
    </ConfirmActionModal>
  );
}

/**
 * Edit a fund's name, custodian, float or whether it is in use.
 *
 * An edit moves no cash, so it may not do what only a return may: lower the
 * float below the cash the fund holds (Reduce float banks the excess), switch
 * off a fund still holding cash (Close fund banks it), or change a closed
 * fund's float or status (Reopen). The form says so and offers that action
 * instead of sending a change the server would refuse; the action is offered
 * only to a reader who holds its key, and the refusal stands alone otherwise.
 */
export function EditFundDrawer({ fund, entity, currency, onClose, onSwitch }: {
  fund: PettyCashFund; entity: string; currency?: string | null; onClose: () => void;
  onSwitch: (action: "reduce" | "close" | "reopen") => void;
}) {
  const [name, setName] = useState(fund.name);
  const [custodian, setCustodian] = useState(fund.custodian_label || fund.custodian_name);
  const [floatAmount, setFloatAmount] = useState(fund.float_amount);
  const [isActive, setIsActive] = useState(fund.is_active);
  const [update, { isLoading }] = useUpdatePettyCashFundMutation();
  const { can } = useCan();
  const problem = fundEditProblem({ fund, onHand: fund.current_balance, floatAmount, isActive }, currency);
  const custodianChanged = custodian.trim() !== (fund.custodian_label || fund.custodian_name);

  const submit = async () => {
    const body: { name?: string; custodian?: null; custodian_name?: string; float_amount?: number; is_active?: boolean } = {};
    if (name.trim() !== fund.name) body.name = name.trim();
    if (custodianChanged) {
      body.custodian_name = custodian.trim();
      if (fund.custodian_id) body.custodian = null;
    }
    if (floatAmount !== fund.float_amount) body.float_amount = floatAmount;
    if (isActive !== fund.is_active) body.is_active = isActive;
    if (!Object.keys(body).length) { onClose(); return; }
    try {
      const res = await update({ id: fund.id, entity, ...body }).unwrap();
      toast.success(res.message || "Fund updated.");
      onClose();
    } catch { /* central */ }
  };

  const ACTION_LABEL = { reduce: "Reduce float", close: "Close fund", reopen: "Reopen" } as const;
  const ACTION_KEY = { reduce: P.FIN_RETURN_PETTY_CASH, close: P.FIN_CLOSE_PETTY_CASH, reopen: P.FIN_REOPEN_PETTY_CASH } as const;
  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Edit fund" description={fund.name}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !!problem || !name.trim()} onClick={submit} className="gap-1.5"><Pencil className="size-4" />{isLoading ? "Saving…" : "Save changes"}</Button>
      </>}
    >
      <div className="space-y-4">
        <FormField label="Fund name" required><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 bg-white" /></FormField>
        <FormField label="Custodian"><Input value={custodian} onChange={(e) => setCustodian(e.target.value)} placeholder="Who holds the tin" className="h-9 bg-white" /></FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Float"><MoneyInput valueKobo={floatAmount} onChangeKobo={setFloatAmount} currency={currency} className="[&_input]:h-9" /></FormField>
          <div className="flex items-end justify-between gap-3 pb-1.5">
            <span className="font-mont text-xs text-gray-05">In use</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Fund in use" />
          </div>
        </div>
        <p className={NOTE}>The fund holds {formatMoney(fund.current_balance, currency)}. Changes to the float and the custodian are kept on the audit record.</p>
        {problem ? (
          <div className={PROBLEM} role="alert" data-testid="edit-refusal">
            <p>{problem.message}</p>
            {can(ACTION_KEY[problem.action]) ? <Button type="button" size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => onSwitch(problem.action)}>
              {problem.action === "reopen" ? <RotateCcw className="size-3.5" /> : null}{ACTION_LABEL[problem.action]}
            </Button> : null}
          </div>
        ) : null}
      </div>
    </DetailDrawer>
  );
}

/** A return's Void, with the server's reasons for refusing one up front. */
export function VoidReturnDialog({ ret, blocker, onClose, onVoid, loading }: {
  ret: PettyCashReturn; blocker: string | null; onClose: () => void; onVoid: () => void; loading: boolean;
}) {
  const draft = ret.status === "DRAFT";
  return (
    <ConfirmActionModal
      open onOpenChange={(o) => !o && onClose()}
      title={draft ? `Cancel ${ret.document_number}?` : `Void ${ret.document_number}?`}
      description={draft
        ? "It never reached the books, so cancelling it writes nothing."
        : ret.kind === "CLOSE"
          ? "Reverses the closure: the cash comes back on the fund's books, its float is restored and the fund reopens."
          : "Reverses the return: the cash comes back on the fund's books and its float is restored."}
      confirmText={draft ? "Cancel return" : "Void return"}
      destructive
      loading={loading}
      confirmDisabled={!!blocker}
      onConfirm={onVoid}
    >
      {blocker ? <p className={PROBLEM} role="alert">{blocker}</p> : draft ? null : (
        <div className="font-mont text-xs leading-5 text-gray-05">
          <p>A void is refused when:</p>
          <ul className="mt-1 list-disc pl-4">
            <li>its bank line is matched on a reconciliation (unmatch it first),</li>
            <li>a later return of the same fund still stands (void that first),</li>
            <li>the fund's float has changed since, or a closed fund was reopened.</li>
          </ul>
        </div>
      )}
    </ConfirmActionModal>
  );
}
