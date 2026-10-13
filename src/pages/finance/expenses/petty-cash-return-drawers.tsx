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
 *
 * Every field of a return follows Field Access (`finance.pettycash_return`).
 * A field the reader may not read leaves the form and the preview with every
 * sentence that would restate it; a field they may not change is greyed and
 * left out of the request. A return the server needs a field for, and the
 * reader cannot set, is not offered: the form says so and Send stays off.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Landmark, Pencil, RotateCcw } from "lucide-react";

import {
  AccessField, BankAccountPicker, ConfirmActionModal, DetailDrawer, FormField, MoneyInput, PostingDateField,
  PostingRecap, ReasonField, errorsBesideFollowed, fieldWriteErrors, hasReason, toArray, useFieldAccess,
  writableOnlyFollowing, type FieldAccess, type FieldErrors,
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
  PETTY_CASH_RETURN, RETURN_FOLLOWS, closeFigures, closeProblem, differenceSentence, fundEditProblem,
  raiseBlocked, reduceFigures, reduceProblem, type ReturnFigures,
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
function ReturnSummary({ fund, figures, bankName, currency, floatAfter, access }: {
  fund: PettyCashFund;
  figures: ReturnFigures;
  bankName: string;
  currency?: string | null;
  floatAfter: number;
  access: FieldAccess;
}) {
  const money = (kobo: number) => formatMoney(kobo, currency);
  const showAmount = !access.isHidden("amount");
  const showDifference = !access.isHidden("difference");
  const differs = showDifference ? differenceSentence(figures, currency) : null;
  const pettyCash = { code: fund.gl_account, name: "Petty cash" };
  const dr = [
    ...(showAmount && figures.banked ? [{ code: "Bank", name: bankName || "the bank account", amount: figures.banked }] : []),
    ...(showDifference && figures.shortage ? [{ code: "Cash over and short", name: "", amount: figures.shortage }] : []),
    ...(showDifference && figures.overage ? [{ ...pettyCash, amount: figures.overage }] : []),
  ];
  const cr = [
    ...(showAmount && figures.banked ? [{ ...pettyCash, amount: figures.banked }] : []),
    ...(showDifference && figures.shortage ? [{ ...pettyCash, amount: figures.shortage }] : []),
    ...(showDifference && figures.overage ? [{ code: "Cash over and short", name: "", amount: figures.overage }] : []),
  ];
  const floatBefore = !access.isHidden("previous_float_amount");
  const floatKept = !access.isHidden("new_float_amount");
  const rows: [string, React.ReactNode][] = [
    ...(!access.isHidden("book_balance") ? [["Books say", money(fund.current_balance)] as [string, React.ReactNode]] : []),
    ...(!access.isHidden("counted_amount") ? [["Counted", money(figures.banked + figures.tinKeeps)] as [string, React.ReactNode]] : []),
    ...(showAmount ? [["To the bank", <span key="b" className="font-semibold">{money(figures.banked)}</span>] as [string, React.ReactNode]] : []),
    ...(!access.isHidden("cash_left") ? [["Tin keeps", money(figures.tinKeeps)] as [string, React.ReactNode]] : []),
  ];
  const floatRow: [string, string] | null = floatBefore && floatKept
    ? ["Float", `${money(fund.float_amount)} to ${money(floatAfter)}`]
    : floatBefore ? ["Float before", money(fund.float_amount)]
      : floatKept ? ["Float after", money(floatAfter)] : null;
  return (
    <div className="space-y-3" data-testid="return-summary">
      {rows.length || floatRow ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-md bg-white p-3 font-mont text-xs ring-1 ring-white-02 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2"><dt className="text-gray-05">{label}</dt><dd className="tabular-nums">{value}</dd></div>
          ))}
          {floatRow ? (
            <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-gray-05">{floatRow[0]}</dt><dd className="tabular-nums">{floatRow[1]}</dd></div>
          ) : null}
        </dl>
      ) : null}
      {differs ? (
        <p className={cn("rounded-md px-3 py-2 font-mont text-xs font-medium", figures.shortage ? "bg-destructive/5 text-destructive" : "bg-green-01/10 text-green-01")} data-testid="return-difference">
          {differs}
        </p>
      ) : null}
      {dr.length ? <PostingRecap title="What this posts" dr={dr} cr={cr} currency={currency} stackOnMobile /> : null}
    </div>
  );
}

/** The note shown where a return cannot be raised because a field it needs is out of this reader's hands. */
function BlockedNote() {
  return (
    <p className={PROBLEM} role="alert" data-testid="raise-blocked">
      Your access does not let you fill in every field this return needs, so it cannot be raised from here. Ask an administrator.
    </p>
  );
}

/** The sentence under the count that states what the books and the float hold, naming only what the reader may read. */
function booksLine(access: FieldAccess, fund: PettyCashFund, currency: string | null | undefined, withFloat: boolean): string | null {
  const parts = [
    ...(!access.isHidden("book_balance") ? [`The books say ${formatMoney(fund.current_balance, currency)}.`] : []),
    ...(withFloat && !access.isHidden("previous_float_amount") ? [`The float is ${formatMoney(fund.float_amount, currency)}.`] : []),
  ];
  return parts.length ? parts.join(" ") : null;
}

/**
 * Whether the reader has changed anything yet, and a wrapper that marks it.
 *
 * A drawer opens with nothing chosen, so its first problem is always "choose a
 * bank account". Saying that in red before Mrs Okoro has typed a figure reads
 * as an error she made; the disabled button already says the form is not
 * ready. The problem shows once she has changed a field.
 */
function useTouched(): [boolean, <T>(set: (value: T) => void) => (value: T) => void] {
  const [touched, setTouched] = useState(false);
  const touch = <T,>(set: (value: T) => void) => (value: T) => { setTouched(true); set(value); };
  return [touched, touch];
}

const APPROVAL_NOTE = "If the school uses an approval route for petty cash returns, this may wait for a second person before it reaches the books.";

/**
 * Reduce float: count the tin, cut the float, bank everything above it into
 * one of the fund's own branch's bank accounts.
 */
export function ReduceFloatDrawer({ fund, entity, currency, onClose, onRaised }: {
  fund: PettyCashFund; entity: string; currency?: string | null; onClose: () => void; onRaised: ReturnRaised;
}) {
  const access = useFieldAccess(PETTY_CASH_RETURN);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [touched, touch] = useTouched();
  const [counted, setCounted] = useState(fund.current_balance);
  const [newFloat, setNewFloat] = useState(0);
  const [bank, setBank] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [reduce, { isLoading }] = useReducePettyCashFloatMutation();
  const bankName = useBankName(entity, bank);
  const figures = reduceFigures({ counted, book: fund.current_balance, newFloat });
  const hideDifference = access.isHidden("difference");
  const problem = reduceProblem({
    figures, newFloat, currentFloat: fund.float_amount, hasBank: !!bank, reason, currency,
    hideFloat: access.isHidden("previous_float_amount"), hideDifference,
  });
  const blocked = raiseBlocked(access, { kind: "REDUCE", figures });
  const errors = errorsBesideFollowed(denied, RETURN_FOLLOWS);

  const submit = async () => {
    try {
      const res = await reduce({
        id: fund.id, entity,
        ...writableOnlyFollowing(access, {
          counted_amount: counted, new_float_amount: newFloat, return_date: date,
          bank_account: bank, difference_reason: figures.difference ? reason.trim() : undefined,
          reference: reference.trim() || undefined,
        }, RETURN_FOLLOWS, { creating: true }),
      }).unwrap();
      toast.success(res.message || "Float reduced.");
      onClose();
      onRaised(res.data?.approval);
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Reduce float" description={`${fund.name} · bank the cash above a lower float`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || blocked || !!problem || !date} onClick={submit} className="gap-1.5">
          <Landmark className="size-4" />{isLoading ? "Saving…" : access.isHidden("amount") ? "Bank the cash" : `Bank ${formatMoney(figures.banked, currency)}`}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <p className={NOTE}>Count the cash in the tin first. Everything above the new float goes back to the bank, and any difference from the books goes to Cash over and short.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AccessField access={access} name="counted_amount" label="Cash counted" required creating errors={errors}><MoneyInput valueKobo={counted} onChangeKobo={touch(setCounted)} currency={currency} className="[&_input]:h-9" /></AccessField>
          <AccessField access={access} name="new_float_amount" label="New float" required creating errors={errors}><MoneyInput valueKobo={newFloat} onChangeKobo={touch(setNewFloat)} currency={currency} className="[&_input]:h-9" /></AccessField>
        </div>
        {booksLine(access, fund, currency, true) ? <p className="-mt-2 font-mont text-[11px] text-gray-05">{booksLine(access, fund, currency, true)}</p> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AccessField access={access} name="bank_account_name" label="Into bank account" required creating errors={errors}><BankAccountPicker entity={entity} value={bank} onChange={touch(setBank)} documentBranchId={fund.branch_id} /></AccessField>
          <AccessField access={access} name="return_date" creating errors={errors}><PostingDateField label="Date" entity={entity} value={date} onChange={setDate} /></AccessField>
        </div>
        {figures.difference || hideDifference ? (
          <AccessField access={access} name="difference_reason" creating errors={errors}>
            <ReasonField label={hideDifference ? "Reason for any difference" : "Why the count differs"} value={reason} onChange={touch(setReason)} placeholder="e.g. coins missing" hint={hideDifference ? "Needed when the count differs from the books." : "Kept on the return and the audit record."} />
          </AccessField>
        ) : null}
        <AccessField access={access} name="reference" label="Reference" creating errors={errors}><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Deposit slip number" className="h-9 bg-white" /></AccessField>
        <ReturnSummary fund={fund} figures={figures} bankName={bankName} currency={currency} floatAfter={newFloat} access={access} />
        {blocked ? <BlockedNote /> : null}
        {problem && touched && !blocked ? <p className={PROBLEM} role="alert">{problem}</p> : null}
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
  const access = useFieldAccess(PETTY_CASH_RETURN);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [touched, touch] = useTouched();
  const [counted, setCounted] = useState(fund.current_balance);
  const [bank, setBank] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [close, { isLoading }] = useClosePettyCashFundMutation();
  const bankName = useBankName(entity, bank);
  const figures = closeFigures({ counted, book: fund.current_balance });
  const hideDifference = access.isHidden("difference");
  const problem = closeProblem({ blockers, figures, hasBank: !!bank, reason, hideDifference });
  const blocked = raiseBlocked(access, { kind: "CLOSE", figures });
  const errors = errorsBesideFollowed(denied, RETURN_FOLLOWS);

  const submit = async () => {
    try {
      const res = await close({
        id: fund.id, entity,
        ...writableOnlyFollowing(access, {
          counted_amount: counted, return_date: date,
          bank_account: bank || undefined, difference_reason: figures.difference ? reason.trim() : undefined,
          reference: reference.trim() || undefined,
        }, RETURN_FOLLOWS, { creating: true }),
      }).unwrap();
      toast.success(res.message || "Fund closed.");
      onClose();
      onRaised(res.data?.approval);
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Close fund" description={`${fund.name} · bank all its cash and stop it`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || blocked || !!problem || !date} onClick={submit} className="gap-1.5 bg-error-01 text-white hover:bg-error-01/90">
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
          <AccessField access={access} name="counted_amount" label="Cash counted" required creating errors={errors}><MoneyInput valueKobo={counted} onChangeKobo={touch(setCounted)} currency={currency} className="[&_input]:h-9" /></AccessField>
          <AccessField access={access} name="return_date" creating errors={errors}><PostingDateField label="Date" entity={entity} value={date} onChange={setDate} /></AccessField>
        </div>
        {booksLine(access, fund, currency, false) ? <p className="-mt-2 font-mont text-[11px] text-gray-05">{booksLine(access, fund, currency, false)}</p> : null}
        {figures.banked > 0 ? (
          <AccessField access={access} name="bank_account_name" label="Into bank account" required creating errors={errors}><BankAccountPicker entity={entity} value={bank} onChange={touch(setBank)} documentBranchId={fund.branch_id} /></AccessField>
        ) : null}
        {figures.difference || hideDifference ? (
          <AccessField access={access} name="difference_reason" creating errors={errors}>
            <ReasonField label={hideDifference ? "Reason for any difference" : "Why the count differs"} value={reason} onChange={touch(setReason)} placeholder="e.g. coins missing" hint={hideDifference ? "Needed when the count differs from the books." : "Kept on the return and the audit record."} />
          </AccessField>
        ) : null}
        <AccessField access={access} name="reference" label="Reference" creating errors={errors}><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Deposit slip number" className="h-9 bg-white" /></AccessField>
        <ReturnSummary fund={fund} figures={figures} bankName={bankName} currency={currency} floatAfter={0} access={access} />
        {date ? <p className="font-mont text-xs text-gray-01">The fund closes on {dates.day(date)}.</p> : null}
        {blocked ? <BlockedNote /> : null}
        {problem && touched && !blockers.length && !blocked ? <p className={PROBLEM} role="alert">{problem}</p> : null}
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

/**
 * A return's Void, with the server's reasons for refusing one up front.
 *
 * The words follow Field Access: a return whose status or kind the reader may
 * not read is described in neutral terms.
 */
export function VoidReturnDialog({ ret, blocker, onClose, onVoid, loading }: {
  ret: PettyCashReturn; blocker: string | null; onClose: () => void; onVoid: () => void; loading: boolean;
}) {
  const access = useFieldAccess(PETTY_CASH_RETURN, ret);
  const statusKnown = !access.isHidden("status");
  const kindKnown = !access.isHidden("kind");
  const draft = statusKnown && ret.status === "DRAFT";
  return (
    <ConfirmActionModal
      open onOpenChange={(o) => !o && onClose()}
      title={draft ? `Cancel ${ret.document_number}?` : `Void ${ret.document_number}?`}
      description={!statusKnown
        ? "A return that reached the books is reversed; one that never did is cancelled."
        : draft
          ? "It never reached the books, so cancelling it writes nothing."
          : kindKnown && ret.kind === "CLOSE"
            ? "Reverses the closure: the cash comes back on the fund's books, its float is restored and the fund reopens."
            : kindKnown
              ? "Reverses the return: the cash comes back on the fund's books and its float is restored."
              : "Reverses the return: the cash comes back on the fund's books, its float is restored and a fund it closed reopens."}
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
