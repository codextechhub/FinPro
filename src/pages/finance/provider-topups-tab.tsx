/**
 * Paystack top-ups: the platform recording money it adds to its own provider
 * balance from its own bank, so the daily held-ledger check agrees.
 *
 * Platform staff only, over `payments.platform_topup`. Three keys, each opening
 * its own part: `.view` lists and opens top-ups, `.create` records a draft and
 * corrects it while it is still a draft, `.submit` puts it forward. Recording
 * books nothing. Two other platform people approve a top-up in Workflow,
 * Approvals, and the second approval books it (Dr provider balance, Cr the bank
 * account); the person who puts it forward cannot approve it. An approver can
 * send it back, and the person who sent it corrects it here and resumes it.
 *
 * The approval card opens a top-up at `?document=<id>`, which this screen
 * answers by opening its drawer.
 *
 * Every business field is a Field Access switch of `payments.platform_topup`.
 * A hidden field has no column, no line in the drawer and no control on the
 * form, and a read-only one is greyed and never sent. The bank account picker
 * lists the platform's own active bank accounts from the top-up routes, so it
 * does not depend on which ledger entity the operator has open. A role that may
 * not read the bank account field is not asked for the list.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Pencil, Plus, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Textarea } from "@/components/ui/textarea";
import {
  AccessField, ConfirmActionModal, DataTable, DetailDrawer, Money, MoneyInput,
  StatusPill, errorsBesideFollowed, fieldWriteErrors, isReadOnlyFollowing, useFieldAccess, writableOnlyFollowing,
  type Column, type FieldErrors,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { ResumeButton, ReturnedNote, useFinanceReturned } from "@/components/finance-ui/returned-note";
import { RETURNED_HINT } from "@/components/finance-ui/returned-correction";
import { useActionParam } from "@/hooks/use-action-param";
import { useSourceDocumentParam } from "@/lib/source-document-route";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import {
  useCreatePlatformProviderTopupMutation,
  useGetPlatformProviderTopupBankAccountsQuery,
  useGetPlatformProviderTopupQuery,
  useGetPlatformProviderTopupsQuery,
  useSubmitPlatformProviderTopupMutation,
  useUpdatePlatformProviderTopupMutation,
} from "@/redux/services/payments/payments-api";
import type { ProviderTopUp, ProviderTopUpDetail, ProviderTopUpStatus } from "@/redux/services/payments/payments-types";
import { P } from "../../permissions";
import { platformName } from "../../host";
import { useDates } from "../../lib/display-prefs";
import { journalLink } from "./inter-branch/links";
import { usePaymentBranchColumn } from "./payment-branches";
import { PROVIDER_CHOICES, providerInfo } from "./payment-providers";
import {
  TOPUP_BODY_FOLLOWS,
  TOPUP_FILTERS,
  changedTopUpFields,
  topUpApprovalLine,
  topUpCanBeCorrected,
  topUpCanBePutForward,
  topUpFieldsOf,
  topUpPurpose,
  topUpStatus,
  topUpWord,
} from "./provider-topups-model";

/** The Field Access resource every field of a top-up belongs to. */
export const TOPUP_RESOURCE = "payments.platform_topup";

const SELECT = "h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="font-mont text-[11px] text-gray-05">{label}</span>
      <span className="min-w-0 break-words text-right font-mont text-xs font-medium tabular-nums text-black-01">{children}</span>
    </div>
  );
}

/** The platform's top-ups, newest first, with the form that records one and the drawer that opens one. */
export function ProviderTopUpsTab({ currency }: { currency?: string | null }) {
  const dates = useDates();
  const { can } = useCan();
  const access = useFieldAccess(TOPUP_RESOURCE);
  const branchColumn = usePaymentBranchColumn();
  const canCreate = can(P.PAY_CREATE_PLATFORM_TOPUP);
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  useSourceDocumentParam(setOpenId);
  useActionParam("new", canCreate, () => setRecording(true));
  const { data, isLoading, isFetching, isError, refetch } = useGetPlatformProviderTopupsQuery({
    limit: 200, ...(status ? { status: status as ProviderTopUpStatus } : {}),
  });
  const rows = useMemo(() => (Array.isArray(data?.data) ? data.data : []), [data]);

  const columns: Column<ProviderTopUp>[] = [
    ...(!access.isHidden("topped_up_on") ? [{ header: "Date", cell: (r: ProviderTopUp) => <span className="tabular-nums text-gray-05">{r.topped_up_on ? dates.day(r.topped_up_on) : "-"}</span> }] : []),
    ...(!access.isHidden("amount") ? [{ header: "Amount", align: "right" as const, cell: (r: ProviderTopUp) => <Money kobo={r.amount} currency={r.currency ?? currency} align="right" /> }] : []),
    ...(!access.isHidden("bank_account_name") ? [{ header: "Paid from", cell: (r: ProviderTopUp) => r.bank_account_name ?? "-" }] : []),
    ...(branchColumn.show ? [{ header: "Branch", cell: (r: ProviderTopUp) => r.branch_name || branchColumn.name(r.branch) }] : []),
    ...(!access.isHidden("provider") ? [{ header: "Provider", cell: (r: ProviderTopUp) => providerInfo(r.provider).label }] : []),
    ...(!access.isHidden("reference") ? [{ header: "Reference", cell: (r: ProviderTopUp) => <span className="text-gray-05">{r.reference || "-"}</span> }] : []),
    ...(!access.isHidden("status") ? [{ header: "Status", cell: (r: ProviderTopUp) => <StatusPill status={topUpStatus(r)} label={topUpWord(r)} /> }] : []),
  ];

  return (
    <div className="space-y-4" data-guide="finance-provider-top-ups.workbench">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={cn(SELECT, "w-48")} aria-label="Status">
          <option value="">All top-ups</option>
          {TOPUP_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {canCreate ? (
          <Button className="gap-1.5" onClick={() => setRecording(true)}><Plus className="size-4" /> New top-up</Button>
        ) : null}
      </div>
      <p className="font-mont text-[11px] leading-5 text-gray-05">
        {topUpPurpose(platformName)} Two other {platformName} people approve each one in Workflow, Approvals; whoever puts it forward cannot approve it.
      </p>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(r) => setOpenId(r.id)}
        emptyTitle={status ? "No top-ups with this status" : "No top-ups yet"}
        emptyMessage={`A top-up appears here once ${platformName} records money it paid into its Paystack balance.`} />
      {openId !== null ? (
        <TopUpDrawer id={openId} listRow={rows.find((r) => r.id === openId)} currency={currency} onClose={() => setOpenId(null)} />
      ) : null}
      {recording ? <TopUpForm currency={currency} onClose={() => setRecording(false)} onRecorded={(id) => { setRecording(false); setOpenId(id); }} /> : null}
    </div>
  );
}

/** The body without the optional text the person left empty, so the server applies its own default. */
function withoutBlanks<T extends object>(body: T): T {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== "")) as T;
}

/** One top-up open: its figures, where its approval stands, and what the reader may do next. */
function TopUpDrawer({ id, listRow, currency, onClose }: {
  id: number; listRow?: ProviderTopUp; currency?: string | null; onClose: () => void;
}) {
  const dates = useDates();
  const { can } = useCan();
  const { data, isError } = useGetPlatformProviderTopupQuery({ id });
  const detail: ProviderTopUpDetail | undefined = data?.data;
  const row: ProviderTopUp | undefined = detail ?? listRow;
  const access = useFieldAccess(TOPUP_RESOURCE, detail);
  const { standing, request, workflowId, requestNamed } = useFinanceReturned(detail);
  const [submit, { isLoading: sending }] = useSubmitPlatformProviderTopupMutation();
  const [confirming, setConfirming] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const cur = row?.currency ?? currency;

  if (!row) {
    return (
      <DetailDrawer open onOpenChange={(open) => (open ? undefined : onClose())} title="Top-up" widthClass="sm:max-w-md">
        <p className="font-mont text-xs text-gray-05">{isError ? "This top-up could not be opened. It may not exist, or you may not be allowed to read it." : "Opening the top-up."}</p>
      </DetailDrawer>
    );
  }

  const approvalLine = access.isHidden("status") ? null : topUpApprovalLine(row);
  const canCorrect = can(P.PAY_CREATE_PLATFORM_TOPUP) && !!detail && topUpCanBeCorrected(row);
  const canPutForward = can(P.PAY_SUBMIT_PLATFORM_TOPUP) && !!detail && topUpCanBePutForward(row);
  const heading = row.amount !== undefined && !access.isHidden("amount") ? formatMoney(row.amount, cur) : "Top-up";

  const doSubmit = async () => {
    try {
      const res = await submit({ id }).unwrap();
      toast.success(res.message || "Top-up submitted for approval.");
      const approval = res.data?.approval;
      if (approval?.parked) {
        toast.warning(`Nobody can approve it yet. ${approval.requirement ?? "Give two people the settlement approver role."}`);
      }
      setConfirming(false);
    } catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer open onOpenChange={(open) => (open ? undefined : onClose())}
        title={heading} description={row.topped_up_on && !access.isHidden("topped_up_on") ? `Topped up on ${dates.day(row.topped_up_on)}` : "Top-up of the Paystack balance"}
        widthClass="sm:max-w-md"
        footer={<>
          {!access.isHidden("status") ? <StatusPill status={topUpStatus(row)} label={topUpWord(row)} /> : null}
          <div className="flex-1" />
          {standing === "sender" ? <ResumeButton workflowId={workflowId} tags={["PaymentsProviderTopups"]} onResumed={onClose} /> : null}
          {canCorrect ? <Button variant="outline" className="gap-1.5" onClick={() => setCorrecting(true)}><Pencil className="size-4" /> Edit</Button> : null}
          {canPutForward ? <Button className="gap-1.5" onClick={() => setConfirming(true)}><Send className="size-4" /> Submit for approval</Button> : null}
        </>}>
        <div className="space-y-4">
          <ReturnedNote standing={standing} request={request} requestNamed={requestNamed} senderHint={RETURNED_HINT.sender} />
          {approvalLine ? <p className="rounded-md border border-white-02 bg-white px-3 py-2 font-mont text-xs leading-5 text-gray-01">{approvalLine}</p> : null}
          <div className="rounded-md border border-white-02 bg-white p-4">
            <p className="mb-1.5 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Top-up</p>
            <div className="divide-y divide-gray-02">
              {!access.isHidden("amount") ? <Field label="Amount">{formatMoney(row.amount ?? 0, cur)}</Field> : null}
              {!access.isHidden("topped_up_on") ? <Field label="Date">{row.topped_up_on ? dates.day(row.topped_up_on) : "-"}</Field> : null}
              {!access.isHidden("bank_account_name") ? <Field label="Paid from">{row.bank_account_name ?? "-"}</Field> : null}
              {!access.isHidden("provider") ? <Field label="Provider">{providerInfo(row.provider).label}</Field> : null}
              {!access.isHidden("reference") ? <Field label="Reference">{row.reference || "-"}</Field> : null}
              {!access.isHidden("note") ? <Field label="Note">{row.note || "-"}</Field> : null}
            </div>
          </div>
          {access.anyVisible("journal_id", "journal_number", "posted_at") ? (
            <div className="rounded-md border border-white-02 bg-white p-4">
              <p className="mb-1.5 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Booking</p>
              <div className="divide-y divide-gray-02">
                {!access.isHidden("journal_id") ? (
                  <Field label="Journal">
                    {row.journal_id
                      ? <Link to={journalLink(row.journal_id)} onClick={onClose} className="font-medium text-primary hover:underline">{row.journal_number || `#${row.journal_id}`}</Link>
                      : "Not booked yet"}
                  </Field>
                ) : null}
                {!access.isHidden("posted_at") && row.posted_at ? <Field label="Booked">{dates.dateTime(row.posted_at)}</Field> : null}
              </div>
              {row.status === "POSTED" ? (
                <p className="mt-2 font-mont text-[11px] leading-5 text-gray-05">Booked as Dr provider balance, Cr the bank account the money left.</p>
              ) : null}
            </div>
          ) : null}
          {!access.isHidden("created_by_name") && row.created_by_name ? <p className="font-mont text-[11px] text-gray-05">Recorded by {row.created_by_name}{row.created_at ? ` on ${dates.day(row.created_at)}` : ""}.</p> : null}
        </div>
      </DetailDrawer>
      {confirming ? (
        <ConfirmActionModal open onOpenChange={(open) => (open ? undefined : setConfirming(false))}
          title="Submit this top-up for approval?"
          description={[
            access.isHidden("amount") ? null : formatMoney(row.amount ?? 0, cur),
            row.bank_account_name && !access.isHidden("bank_account_name") ? `from ${row.bank_account_name}` : null,
          ].filter(Boolean).join(" ") || "This top-up"}
          confirmText="Submit" loading={sending} onConfirm={doSubmit}>
          <p className="font-mont text-xs leading-5 text-gray-05">
            Two other {platformName} people must approve it before it is booked. You cannot approve a top-up you submitted.
          </p>
        </ConfirmActionModal>
      ) : null}
      {correcting && detail ? <TopUpForm currency={currency} existing={detail} onClose={() => setCorrecting(false)} /> : null}
    </>
  );
}

/** Records a top-up as a draft, or with `existing` corrects a draft, sending only what changed. */
function TopUpForm({ currency, existing, onClose, onRecorded }: {
  currency?: string | null; existing?: ProviderTopUpDetail; onClose: () => void; onRecorded?: (id: number) => void;
}) {
  const dates = useDates();
  const access = useFieldAccess(TOPUP_RESOURCE, existing);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const beside = errorsBesideFollowed(denied, TOPUP_BODY_FOLLOWS);
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [bank, setBank] = useState(existing?.bank_account != null ? String(existing.bank_account) : "");
  const [date, setDate] = useState(existing?.topped_up_on ?? dates.today());
  const [provider, setProvider] = useState(existing?.provider ?? "");
  const [reference, setReference] = useState(existing?.reference ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [create, { isLoading: creating }] = useCreatePlatformProviderTopupMutation();
  const [update, { isLoading: updating }] = useUpdatePlatformProviderTopupMutation();
  const isLoading = creating || updating;
  const options = { creating: !existing };
  const offerProvider = PROVIDER_CHOICES.length > 1;
  const branchColumn = usePaymentBranchColumn();
  const readBank = !access.isHidden("bank_account_name");
  const { data: bankRows, isLoading: loadingBanks } = useGetPlatformProviderTopupBankAccountsQuery(undefined, { skip: !readBank });
  const banks = Array.isArray(bankRows?.data) ? bankRows.data : [];

  const draft = { amount, bank_account: Number(bank), topped_up_on: date, provider, reference: reference.trim(), note: note.trim() };
  const writableDraft = writableOnlyFollowing(access, draft, TOPUP_BODY_FOLLOWS, options);
  const changes = existing
    ? writableOnlyFollowing(access, changedTopUpFields(topUpFieldsOf(existing), draft), TOPUP_BODY_FOLLOWS, options)
    : writableDraft;
  const need = (name: string, ok: boolean) => ok || isReadOnlyFollowing(access, name, TOPUP_BODY_FOLLOWS, options);
  const ready = need("amount", amount > 0) && need("bank_account", !!bank) && need("topped_up_on", !!date) && Object.keys(changes).length > 0;

  const save = async () => {
    if (!ready) return;
    setDenied(null);
    try {
      if (existing) {
        const res = await update({ id: existing.id, ...changes }).unwrap();
        toast.success(res.message || "Top-up updated.");
        onClose();
      } else {
        const res = await create(withoutBlanks(writableDraft)).unwrap();
        toast.success(res.message || "Top-up recorded. Submit it for approval to book it.");
        onRecorded?.(res.data.id);
      }
    } catch (error) { setDenied(fieldWriteErrors(error)); /* otherwise central */ }
  };

  return (
    <DetailDrawer open onOpenChange={(open) => !isLoading && !open && onClose()}
      title={existing ? "Edit top-up" : "New top-up"}
      description={existing ? "Change what was wrong. Nothing is booked until it is approved." : topUpPurpose(platformName)}
      widthClass="sm:max-w-[520px]"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={!ready} loading={isLoading} onClick={save}>{existing ? "Save changes" : "Save top-up"}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AccessField access={access} name="amount" label="Amount" required creating={!existing} errors={beside}>
            <MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} />
          </AccessField>
          <AccessField access={access} name="topped_up_on" creating={!existing} errors={beside}>
            <label className="block space-y-1">
              <span className="font-mont text-xs text-gray-05">Date the money left the bank *</span>
              <DatePickerInput value={date} onChange={(e) => setDate(e.target.value)} max={dates.today()} required className="bg-white" />
              <span className="block font-mont text-[11px] leading-5 text-gray-05">Not in the future. The top-up books on this day.</span>
            </label>
          </AccessField>
        </div>
        <AccessField access={access} name="bank_account_name" label="Paid from" required creating={!existing} errors={beside}>
          <select value={bank} onChange={(e) => setBank(e.target.value)} disabled={loadingBanks} className={cn(SELECT, "w-full")} aria-label="Paid from">
            <option value="">{loadingBanks ? "Loading the bank accounts" : banks.length ? "Select the bank account" : "No bank account available"}</option>
            {banks.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {[b.name, b.bank_name, branchColumn.show ? b.branch_name : null].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </AccessField>
        {offerProvider ? (
          <AccessField access={access} name="provider" label="Provider" creating={!existing} errors={beside}>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className={cn(SELECT, "w-full")}>
              <option value="">The default provider</option>
              {PROVIDER_CHOICES.map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
            </select>
          </AccessField>
        ) : null}
        <AccessField access={access} name="reference" label="Reference" creating={!existing} errors={beside}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={64} placeholder="The transfer reference from the bank or Paystack" className="bg-white" />
        </AccessField>
        <AccessField access={access} name="note" label="Note" creating={!existing} errors={beside}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="Why the balance was topped up" className="min-h-16 bg-white" />
        </AccessField>
      </div>
    </DetailDrawer>
  );
}
