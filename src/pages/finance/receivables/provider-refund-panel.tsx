/**
 * The screens' half of refunds returned through the payment provider.
 *
 * - {@link OnlineRefundFields}: on the new refund form, the choice between a
 *   bank refund and one returned through Paystack, with the picker for the
 *   original payment. Offered only at a school that holds its online money and
 *   to someone who may tie a payment (`payments.refund.create`); a bursar at a
 *   school whose payments settle straight into the branch's bank never sees it.
 * - {@link ProviderRefundPanel}: in a refund's drawer, where the refund stands
 *   with the provider (processing, returned or failed with the reason), the
 *   payment it returns, and what can be done about a failed one: Try again
 *   (tie the same payment and send it through the normal route) or Pay from
 *   bank instead.
 * - {@link useProviderRefundMap} and {@link ProviderRefundChip}: the same
 *   state, one line long, on the refunds list.
 *
 * Reading follows `payments.refund` Field Access: the payment, status, provider
 * reference and failure reason are each absent for a role that may not read
 * them, and the payment is the one writable field.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreditCard, RefreshCw, Undo2 } from "lucide-react";

import { AccessField, BankAccountPicker, ConfirmActionModal, FormField, Money, Segmented, useFieldAccess } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { useCustodyReading } from "@/components/finance-ui/held-custody";
import { SearchSelect } from "@/components/custom/search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import {
  useGetCollectionsQuery,
  useGetProviderRefundsQuery,
  useLinkProviderRefundMutation,
  usePayProviderRefundFromBankMutation,
  useVerifyProviderRefundMutation,
} from "@/redux/services/payments/payments-api";
import type { ProviderRefund } from "@/redux/services/payments/payments-types";
import { P } from "../../../permissions";
import { useDates } from "../../../lib/display-prefs";
import { providerInfo } from "../payment-providers";
import {
  NO_ONLINE_REFUND,
  currentProviderRefund,
  needsPayment,
  offersPayFromBank,
  offersTryAgain,
  onlineRefundOffered,
  paymentAmountError,
  providerRefundWord,
  providerRefundsByRefund,
  returnablePayments,
  type OnlineRefundChoice,
} from "./provider-refund-model";

const RESOURCE = "payments.refund";
const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";

/** Whether this reader may raise a refund to be returned through the provider, at this school. */
export function useOnlineRefundOffered(entity: string): boolean {
  const { can } = useCan();
  const custody = useCustodyReading(entity);
  const access = useFieldAccess(RESOURCE);
  return onlineRefundOffered({
    custody,
    mayCreate: can(P.PAY_CREATE_REFUND),
    paymentWritable: !access.isReadOnly("collection", { creating: true }),
  });
}

/**
 * The customer's confirmed online payments to pick from, newest first, with a
 * box for a payment's reference as a way in for one the list does not reach.
 */
function OriginalPaymentPicker({ entity, currency, customerCode, branch, amount, value, onChange }: {
  entity: string;
  currency?: string | null;
  customerCode: string;
  branch: number | null | undefined;
  amount: number;
  value: OnlineRefundChoice;
  onChange: (next: OnlineRefundChoice) => void;
}) {
  const dates = useDates();
  const { can } = useCan();
  const mayList = can(P.PAY_VIEW_COLLECTIONS) && !!customerCode;
  const query = useGetCollectionsQuery({ entity, group: "PAID", customer: customerCode, page_size: 100 }, { skip: !mayList });
  const payments = useMemo(
    () => returnablePayments(Array.isArray(query.data?.data) ? query.data.data : [], { customerCode, branch }),
    [query.data, customerCode, branch],
  );
  const options = payments.map((p) => ({
    value: String(p.id),
    label: `${p.reference} · ${dates.day(p.confirmed_at ?? p.created_at)} · ${formatMoney(p.amount, currency)}`,
  }));
  const picked = value.payment ?? payments.find((p) => String(p.id) === value.collection) ?? null;
  const overPayment = paymentAmountError(amount, picked);

  return (
    <div className="space-y-2">
      {mayList ? (
        <FormField label="Original payment" required>
          <SearchSelect
            options={options}
            value={picked ? String(picked.id) : ""}
            onChange={(e) => {
              const next = payments.find((p) => String(p.id) === e.target.value) ?? null;
              onChange({ online: true, collection: next ? String(next.id) : "", payment: next });
            }}
            loading={query.isFetching}
            placeholder={customerCode ? (payments.length || query.isFetching ? "Choose the payment to return" : "No confirmed online payment found") : "Choose the customer first"}
            disabled={!customerCode}
          />
        </FormField>
      ) : null}
      <FormField label={mayList ? "Or type the payment's reference" : "Original payment's reference"} required={!mayList}>
        <Input
          value={picked ? "" : value.collection}
          onChange={(e) => onChange({ online: true, collection: e.target.value.trim(), payment: null })}
          placeholder="For example COL-2026-000123"
          className="h-9 bg-white"
          disabled={!!picked}
        />
      </FormField>
      {overPayment ? <p role="alert" className="font-mont text-[11px] text-destructive">{overPayment}</p> : null}
    </div>
  );
}

/**
 * On the new refund form: how the refund is paid. Renders nothing where the
 * online option is not offered, so the form is the bank form it always was.
 */
export function OnlineRefundFields({ entity, currency, customerCode, branch, amount, value, onChange }: {
  entity: string;
  currency?: string | null;
  customerCode: string;
  branch: number | null | undefined;
  amount: number;
  value: OnlineRefundChoice;
  onChange: (next: OnlineRefundChoice) => void;
}) {
  const offered = useOnlineRefundOffered(entity);
  const access = useFieldAccess(RESOURCE);
  if (!offered) return null;
  const provider = providerInfo("PAYSTACK").label;
  return (
    <div className="space-y-3">
      <Segmented
        label="Pay the refund"
        value={value.online ? "ONLINE" : "BANK"}
        onChange={(v) => onChange(v === "ONLINE" ? { ...NO_ONLINE_REFUND, online: true } : NO_ONLINE_REFUND)}
        options={[["BANK", "From the bank"], ["ONLINE", `Back through ${provider}`]]}
      />
      {value.online ? (
        <AccessField access={access} name="collection" creating>
          <OriginalPaymentPicker
            entity={entity} currency={currency} customerCode={customerCode} branch={branch}
            amount={amount} value={value} onChange={onChange}
          />
          <p className="mt-2 font-mont text-[11px] leading-5 text-gray-05">
            The money goes back to the card or account it came from, out of what {provider} holds for the branch.
            The refund is booked only when {provider} confirms it.
          </p>
        </AccessField>
      ) : null}
    </div>
  );
}

/**
 * Ties a just-raised draft refund to the payment it returns. Resolves true when
 * the server accepted it; a refusal is shown by the central handler and
 * resolves false, leaving the draft for its drawer to finish.
 */
export function useTieRefund(entity: string): (refundId: number, collection: string | number) => Promise<boolean> {
  const [link] = useLinkProviderRefundMutation();
  return async (refundId, collection) => {
    try {
      await link({ entity, refund: refundId, collection }).unwrap();
      return true;
    } catch { return false; /* central */ }
  };
}

/** The current tie of each refund the reader can see, for the list. Empty for someone who may not read them. */
export function useProviderRefundMap(entity: string): Map<number, ProviderRefund> {
  const { can } = useCan();
  const query = useGetProviderRefundsQuery({ entity, page_size: 100 }, { skip: !can(P.PAY_VIEW_REFUNDS) });
  return useMemo(() => providerRefundsByRefund(Array.isArray(query.data?.data) ? query.data.data : undefined), [query.data]);
}

/** One line on the refunds list: where the refund stands with the provider. */
export function ProviderRefundChip({ link }: { link: ProviderRefund | undefined }) {
  const access = useFieldAccess(RESOURCE, link);
  if (!link || link.status === undefined || access.isHidden("status")) return null;
  const word = providerRefundWord(link.status, providerInfo(link.provider).label);
  return <span className={cn(PILL, "mt-1", word.tone)} title={word.detail}>{providerInfo(link.provider).label}: {word.label}</span>;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <div className="mt-1 break-words font-mont text-sm font-semibold text-black-01">{children}</div>
    </div>
  );
}

/**
 * In a refund's drawer: the refund's standing with the provider and its actions.
 *
 * `onSend` runs the drawer's own route for putting a draft on its way (submit
 * for approval, or post), so Try again goes through exactly the checks any
 * refund goes through. Renders nothing for a refund with no online side or for
 * a reader without `payments.refund.view`.
 */
export function ProviderRefundPanel({ refundId, refundStatus, method, customerCode, entity, currency, amount, onSend, sending }: {
  refundId: number | null;
  refundStatus: string;
  /** How the refund is paid, from its list row (`ONLINE` through the provider); undefined while an older server omits it. */
  method: string | undefined;
  customerCode: string;
  entity: string;
  currency?: string | null;
  amount: number;
  onSend?: () => Promise<void>;
  sending?: boolean;
}) {
  const dates = useDates();
  const { can } = useCan();
  const mayView = can(P.PAY_VIEW_REFUNDS) && refundId != null;
  const mayChange = can(P.PAY_CREATE_REFUND);
  const links = useGetProviderRefundsQuery({ entity, refund: refundId ?? 0, page_size: 20 }, { skip: !mayView });
  const [verify, { isLoading: verifying }] = useVerifyProviderRefundMutation();
  const [relink, { isLoading: relinking }] = useLinkProviderRefundMutation();
  const [payFromBank, { isLoading: paying }] = usePayProviderRefundFromBankMutation();
  const [choice, setChoice] = useState<OnlineRefundChoice>({ ...NO_ONLINE_REFUND, online: true });
  const [bankOpen, setBankOpen] = useState(false);
  const [bank, setBank] = useState("");
  const link = currentProviderRefund(Array.isArray(links.data?.data) ? links.data.data : undefined);
  const access = useFieldAccess(RESOURCE, link);
  // A part the role may not read is absent from the row; the switch map agrees.
  const statusShown = !!link && link.status !== undefined && !access.isHidden("status");

  if (!mayView || links.isLoading) return null;
  const online = method === "ONLINE";
  if (!online && !(link && link.status === "FAILED")) return null;

  const provider = providerInfo(link?.provider ?? "PAYSTACK").label;
  const word = providerRefundWord(link?.status, provider);
  const awaitingPayment = needsPayment(link, method, refundStatus);
  const paymentWritable = !access.isReadOnly("collection", { creating: true });

  const tie = async (collection: string | number) => {
    if (refundId == null) return false;
    try {
      await relink({ entity, refund: refundId, collection }).unwrap();
      return true;
    } catch { return false; /* central */ }
  };
  const doTie = async () => {
    if (await tie(choice.collection)) toast.success(`Tied to the payment. Submit or post the refund to send it to ${provider}.`);
  };
  const doTryAgain = async () => {
    if (!link?.collection_id || !(await tie(link.collection_id))) return;
    await onSend?.();
  };
  const doVerify = async () => {
    if (!link) return;
    try { toast.success((await verify({ id: link.id, entity }).unwrap()).message || "Checked with the provider."); } catch { /* central */ }
  };
  const doPayFromBank = async () => {
    if (!link) return;
    try {
      const res = await payFromBank({ id: link.id, entity, bank_account: bank ? Number(bank) : undefined }).unwrap();
      toast.success(res.message || "The refund will be paid from the bank.");
      setBankOpen(false);
      setBank("");
    } catch { /* central */ }
  };

  return (
    <section data-testid="provider-refund-panel" className="space-y-3 rounded-md border border-white-02 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Returned through {provider}</p>
        {statusShown ? <span className={cn(PILL, word.tone)}>{word.label}</span> : null}
        {statusShown && link?.provider_status ? <span className="font-mont text-[11px] text-gray-05">{provider} says: {link.provider_status}</span> : null}
      </div>

      {statusShown && word.detail ? <p className="font-mont text-xs leading-5 text-gray-05">{word.detail}</p> : null}

      {link ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {link.collection_reference !== undefined ? <Detail label="Original payment">{link.collection_reference}</Detail> : null}
          <Detail label="Amount"><Money kobo={link.amount} currency={currency} /></Detail>
          {link.provider_reference ? <Detail label={`${provider} reference`}>{link.provider_reference}</Detail> : null}
          {link.sent_at ? <Detail label="Sent">{dates.dateTime(link.sent_at)}</Detail> : null}
          {link.processed_at ? <Detail label="Returned">{dates.dateTime(link.processed_at)}</Detail> : null}
        </div>
      ) : null}

      {link?.status === "FAILED" && link.failure_reason ? (
        <p role="alert" data-testid="provider-refund-reason" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mont text-xs leading-5 text-destructive">
          Why it failed: {link.failure_reason}
        </p>
      ) : null}

      {!online ? (
        <p className="font-mont text-xs leading-5 text-gray-05">{provider} could not return it, so this refund is paid from the bank instead.</p>
      ) : (
        <p className="font-mont text-xs leading-5 text-gray-05">
          Once {provider} confirms, the books take the money out of online payments held for the branch, not out of a bank account.
        </p>
      )}

      {awaitingPayment && mayChange && paymentWritable && online ? (
        <div className="space-y-2 border-t border-white-02 pt-3">
          {link?.status === "FAILED" ? <p className="font-mont text-xs text-gray-05">Choose a different payment to return, or try again with the same one.</p> : null}
          <AccessField access={access} name="collection" creating>
            <OriginalPaymentPicker
              entity={entity} currency={currency} customerCode={customerCode} branch={link?.branch}
              amount={amount} value={choice} onChange={setChoice}
            />
          </AccessField>
          <Button size="sm" disabled={relinking || !choice.collection.trim()} onClick={doTie} className="gap-1.5">
            <CreditCard className="size-4" />{relinking ? "Tying…" : "Tie to this payment"}
          </Button>
        </div>
      ) : null}

      {link ? (
        <div className="flex flex-wrap items-center gap-2">
          {link.status === "PROCESSING" ? (
            <Button size="sm" variant="outline" disabled={verifying} onClick={doVerify} className="gap-1.5">
              <RefreshCw className={cn("size-4", verifying && "animate-spin")} />{verifying ? "Checking…" : `Check with ${provider}`}
            </Button>
          ) : null}
          {mayChange && offersTryAgain(link, method) && onSend ? (
            <Button size="sm" disabled={relinking || sending} onClick={doTryAgain} className="gap-1.5">
              <RefreshCw className="size-4" />{relinking || sending ? "Sending…" : "Try again"}
            </Button>
          ) : null}
          {mayChange && offersPayFromBank(link, method) ? (
            <Button size="sm" variant="outline" onClick={() => setBankOpen(true)} className="gap-1.5">
              <Undo2 className="size-4" /> Pay from bank instead
            </Button>
          ) : null}
        </div>
      ) : null}

      <ConfirmActionModal
        open={bankOpen}
        onOpenChange={setBankOpen}
        title="Pay this refund from the bank instead?"
        description={`The refund stops being returned through ${provider} and becomes an ordinary bank refund. It stays a draft until you submit or post it.`}
        confirmText="Pay from bank"
        loading={paying}
        confirmDisabled={!bank}
        onConfirm={doPayFromBank}
      >
        <FormField label="Bank account it is paid from" required>
          <BankAccountPicker entity={entity} value={bank} onChange={setBank} documentBranchId={link?.branch} />
        </FormField>
      </ConfirmActionModal>
    </section>
  );
}
