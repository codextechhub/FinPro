/**
 * Batches - bulk vendor disbursements (Vision "Bulk Disbursement"), rebuilt in the
 * house theme: KPIs (batches / queued value / completed 7d / drafts), a batches table,
 * a Build-batch drawer (a multi-line vendor editor with per-line WHT + a settlement
 * recap), and a detail drawer with per-item results, Submit and a Bank-file CSV export.
 *
 * Backed by the real model: a batch is many PayoutInstructions; each line settles a
 * vendor's payable on confirmation (Dr AP gross / Cr bank net / Cr WHT payable). Submit
 * dispatches the pending items to the provider; settlement books via webhook/PSP. Honest:
 * "Bank file" is a CSV (no proprietary format).
 *
 * Beneficiary fields follow Field Access on `payments.payout`: a hidden one has no
 * column, no line and no CSV column. The builder names vendors only: the backend
 * copies each line's beneficiary from the vendor's verified record, so a line
 * never carries bank details the builder would have to read first.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { Plus, Upload, Eye, Send, X } from "lucide-react";
import { DataTable, Money, MoneyInput, DetailDrawer, FormField, VendorPicker, AccountPicker, PostingRecap, KpiCard, toArray, useFieldAccess, type Column, type FieldAccess, type RecapRow } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PROVIDER_CHOICES, providerInfo } from "./payment-providers";
import { formatMoney } from "@/utils/money";
import { P } from "../../permissions";
import { useGetPayoutBatchesQuery, useGetPayoutBatchesSummaryQuery, useCreatePayoutBatchMutation, useGetPayoutBatchQuery, useSubmitPayoutBatchMutation, useSubmitPayoutBatchForApprovalMutation } from "@/redux/services/payments/payments-api";
import { useGetVendorsQuery } from "@/redux/services/procurement/procurement-api";
import { useGetTaxCodesQuery } from "@/redux/services/finance/setup-api";
import { computedWht } from "../procurement/withholding-tax";
import type { PayoutBatchSummary, PayoutInstruction, PayoutBatchItemPayload } from "@/redux/services/payments/payments-types";
import type { Vendor } from "@/redux/services/procurement/procurement-types";
import { sourceDocumentIdFromParams } from "@/lib/source-document-route";
import { useDates } from "../../lib/display-prefs";
import { showBlobPreview } from "../../components/finance-ui/file-preview-dialog";
import { RETURNED_HINT, SENT_BACK_STATUS, SENT_BACK_WORD, statusFilterArgs } from "@/components/finance-ui/returned-correction";
import { PAYOUT_BATCH_FILTERS, PAYOUT_BATCH_WORDS, payoutBatchStatus, payoutBatchWord } from "./payout-batch-words";
import { ResumeButton, ReturnedNote, useFinanceReturned } from "@/components/finance-ui/returned-note";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
/** Field Access resource for a payout instruction, which is what a batch line becomes. */
const PAYOUT = "payments.payout";

const BATCH_TONE: Record<string, string> = {
  DRAFT: "bg-gray-02/70 text-gray-01",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700",
  [SENT_BACK_STATUS]: "bg-orange-500/10 text-yellow-01-text",
  PROCESSING: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-green-01/10 text-green-01",
  PARTIALLY_COMPLETED: "bg-amber-50 text-amber-700",
  FAILED: "bg-destructive/10 text-destructive",
};
/** A batch's word ({@link payoutBatchWord}): Awaiting approval while with its approvers, Sent back once returned. */
export function BatchStatusPill({ batch }: { batch: PayoutBatchSummary }) {
  const cls = BATCH_TONE[payoutBatchStatus(batch)] ?? "bg-gray-02 text-gray-01";
  return <span className={cn(PILL, cls)}>{payoutBatchWord(batch)}</span>;
}

const ITEM_GROUP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-amber-50 text-amber-700" },
  PAID: { label: "Settled", cls: "bg-green-01/10 text-green-01" },
  FAILED: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
};
const ITEM_MAP: Record<string, "PENDING" | "PAID" | "FAILED"> = {
  PENDING: "PENDING", PROCESSING: "PENDING", PAID: "PAID", FAILED: "FAILED", REVERSED: "FAILED",
};
function ItemStatusPill({ status }: { status: string }) {
  const g = ITEM_GROUP[ITEM_MAP[status] ?? "PENDING"];
  return <span className={cn(PILL, g.cls)}>{g.label}</span>;
}

function ProviderTag({ provider }: { provider: string }) {
  const p = providerInfo(provider);
  return <span className="inline-flex items-center gap-1.5 font-mont text-xs text-black-01"><span className={cn("size-2 rounded-sm", p.dot)} /> {p.label}</span>;
}

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

export function BatchesTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(() => (
    sourceDocumentIdFromParams(searchParams)
  ));
  const [building, setBuilding] = useState(false);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const { data, isLoading, isFetching, isError, refetch } = useGetPayoutBatchesQuery({ entity, page, ...statusFilterArgs(status) });
  const { data: summaryRes } = useGetPayoutBatchesSummaryQuery({ entity });
  const rows = useMemo(() => toArray<PayoutBatchSummary>(data?.data), [data]);
  const pg = data?.pagination;
  const s = summaryRes?.data;

  const columns: Column<PayoutBatchSummary>[] = [
    { header: "Batch", cell: (b) => <span className="font-semibold tabular-nums text-gray-01">{b.reference}</span> },
    { header: "Run date", cell: (b) => <span className="tabular-nums text-gray-05">{dates.day(b.created_at)}</span> },
    { header: "Purpose", cell: (b) => b.title || <span className="text-gray-05">-</span> },
    { header: "Items", align: "right", cell: (b) => <span className="tabular-nums">{b.item_count}</span> },
    { header: "Total", align: "right", cell: (b) => <Money kobo={b.total_amount} currency={currency} align="right" /> },
    { header: "Provider", cell: (b) => <ProviderTag provider={b.provider} /> },
    { header: "Status", cell: (b) => <BatchStatusPill batch={b} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Batches" value={String(s?.total ?? 0)} foot="Total" />
        <KpiCard label="Queued value" value={formatMoney(s?.queued.kobo ?? 0, currency)} foot="Draft + processing" />
        <KpiCard label="Completed (7d)" value={String(s?.completed7d ?? 0)} foot="Fully settled" />
        <KpiCard label="Drafts" value={String(s?.drafts ?? 0)} tone={(s?.drafts ?? 0) > 0 ? "warn" : "default"} foot="Not yet sent for approval" />
        <KpiCard label={PAYOUT_BATCH_WORDS.PENDING_APPROVAL} value={String(s?.pending_approval ?? 0)} foot="With the approver" />
        <KpiCard label={SENT_BACK_WORD} value={String(s?.sent_back ?? 0)} tone={(s?.sent_back ?? 0) > 0 ? "warn" : "default"} foot="Back with whoever sent them" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} className="h-9">
          <option value="">All statuses</option>
          {PAYOUT_BATCH_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled title="CSV import is coming soon" className="gap-1.5"><Upload className="size-4" /> Upload CSV</Button>
        <Can permission={P.PAY_CREATE_PAYOUT}>
          <Button onClick={() => setBuilding(true)} className="gap-1.5"><Plus className="size-4" /> Build batch</Button>
        </Can>
        </div>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(b) => b.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(b) => setSelectedId(b.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle={status ? "No batches match" : "No payout batches"} emptyMessage={status ? "No batch reads this status." : "Build a batch to disburse to many vendors at once."} />

      <BatchDetailDrawer batchId={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
      <BuildBatchDrawer open={building} onClose={() => setBuilding(false)} entity={entity} currency={currency} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white-02 bg-white p-3">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <p className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{value}</p>
    </div>
  );
}

// ── Build batch ──────────────────────────────────────────────────────────────
/**
 * One batch line. `wht` is a figure the person typed; null leaves it to the
 * server, which works it out from the vendor's WHT code on the whole amount (a
 * payout names a vendor, not a bill, so no VAT is identified). The line shows
 * that figure and sends nothing, so what the batch shows is what it pays.
 */
type Line = { id: number; vendor: string; amount: number; wht: number | null };
let LINE_SEQ = 1;
const newLine = (): Line => ({ id: LINE_SEQ++, vendor: "", amount: 0, wht: null });

function BuildBatchDrawer({ open, onClose, entity, currency }: { open: boolean; onClose: () => void; entity: string; currency?: string | null }) {
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("PAYSTACK");
  const [sourceAccount, setSourceAccount] = useState("");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [create, { isLoading }] = useCreatePayoutBatchMutation();

  const { data: vendorsData } = useGetVendorsQuery({ entity });
  const vendors = useMemo(() => toArray<Vendor>(vendorsData?.data), [vendorsData]);
  const vendorByCode = (code: string) => vendors.find((v) => v.code === code);
  const { data: taxCodeRows } = useGetTaxCodesQuery({ entity }, { skip: !open });
  const lineWht = (l: Line) => l.wht ?? computedWht({
    gross: l.amount,
    rateBps: toArray(taxCodeRows?.data).find((t) => t.code === vendorByCode(l.vendor)?.default_wht_tax_code_value)?.rate_bps,
  });

  const reset = () => { setTitle(""); setProvider("PAYSTACK"); setSourceAccount(""); setNarration(""); setLines([newLine()]); LINE_SEQ = 1; };
  const close = () => { reset(); onClose(); };
  const setLine = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // A line is valid with a vendor and an amount; the backend resolves its bank account.
  const validItems = useMemo<PayoutBatchItemPayload[]>(() => lines.flatMap((l) => {
    if (!l.vendor || l.amount <= 0 || (l.wht ?? 0) >= l.amount) return [];
    return [{ vendor: l.vendor, amount: l.amount, ...(l.wht !== null ? { wht_amount: l.wht } : {}) }];
  }), [lines]);

  const gross = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const wht = lines.reduce((s, l) => s + lineWht(l), 0);
  const net = gross - wht;

  const submit = async (dispatch: boolean) => {
    if (!validItems.length) return;
    try {
      const r = await create({ entity, title: title.trim() || undefined, provider, source_account: sourceAccount || undefined, narration: narration.trim() || undefined, submit: dispatch, items: validItems }).unwrap();
      // When the batch is approval-gated the backend ignores submit and leaves it DRAFT -
      // don't claim it dispatched; surface the backend's "submit it for approval" message.
      const dispatched = dispatch && r.data?.status && r.data.status !== "DRAFT";
      toast.success(dispatched ? "Batch submitted to the provider." : (r.message || (dispatch ? "Batch created - submit it for approval." : "Draft batch saved.")));
      close();
    } catch { /* central */ }
  };

  const dr: RecapRow[] = [{ code: "", name: "Accounts payable (vendor)", amount: gross }];
  const cr: RecapRow[] = [
    { code: sourceAccount, name: "Bank / cash", amount: net },
    ...(wht > 0 ? [{ code: "", name: "WHT payable (withholding tax)", amount: wht }] : []),
  ];

  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="Build disbursement batch" description="Add vendor beneficiaries, then submit." widthClass="sm:max-w-3xl"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <div className="flex-1" />
        <Button variant="outline" disabled={isLoading || !validItems.length} onClick={() => submit(false)}>Save draft</Button>
        <Button disabled={isLoading || !validItems.length} onClick={() => submit(true)} className="gap-1.5"><Send className="size-4" />{isLoading ? "Submitting…" : "Submit batch"}</Button>
      </>}>
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Items" value={String(validItems.length)} />
          <Metric label="Batch total" value={formatMoney(gross, currency)} />
          <Metric label="Withholding tax kept back" value={formatMoney(wht, currency)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Purpose"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. May vendor run" className="h-9 bg-white" /></FormField>
          <div><p className="mb-1 font-mont text-xs text-gray-05">Provider</p><Select value={provider} onChange={setProvider} className="w-full">{PROVIDER_CHOICES.map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}</Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="From bank account"><AccountPicker entity={entity} value={sourceAccount} onChange={setSourceAccount} accountType="ASSET" postableOnly placeholder="Defaults to cash & bank" /></FormField>
          <FormField label="Narration"><Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Applies to every line" className="h-9 bg-white" /></FormField>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Batch lines</p>
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])} className="h-7 gap-1 text-xs"><Plus className="size-3.5" /> Add line</Button>
          </div>
          <div className="space-y-2">
            {lines.map((l) => {
              const v = vendorByCode(l.vendor);
              const lineNet = (l.amount || 0) - lineWht(l);
              return (
                <div key={l.id} className="rounded-md border border-white-02 bg-white p-2.5">
                  {/* Phone: vendor takes its own row; amounts + remove share the second. */}
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1.6fr_1fr_1fr_auto]">
                    <div className="col-span-3 sm:col-span-1">
                      <VendorPicker entity={entity} value={l.vendor} onChange={(code) => setLine(l.id, { vendor: code })} label="Vendor" own />
                    </div>
                    <div><p className="mb-1 font-mont text-[11px] text-gray-05">Amount</p><MoneyInput valueKobo={l.amount} onChangeKobo={(k) => setLine(l.id, { amount: k })} currency={currency} className="[&_input]:h-9" /></div>
                    <div><p className="mb-1 font-mont text-[11px] text-gray-05">Withholding tax</p><MoneyInput valueKobo={lineWht(l)} onChangeKobo={(k) => setLine(l.id, { wht: k })} currency={currency} className="[&_input]:h-9" /></div>
                    <Button variant="ghost" size="icon" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : ls))} className="size-9 text-gray-05 hover:text-destructive"><X className="size-4" /></Button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between font-mont text-[11px]">
                    <span className="text-gray-05">
                      {v ? `Paid to ${v.name}'s bank account on file` : "Pick a vendor to disburse to"}
                    </span>
                    {l.amount > 0 ? <span className="tabular-nums text-gray-05">{l.wht === null ? "Withholding tax from the vendor's tax code · " : <>Withholding tax entered · <button type="button" className="text-primary hover:underline" onClick={() => setLine(l.id, { wht: null })}>work it out</button> · </>}Net {formatMoney(lineNet, currency)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">On batch settlement</p>
          <PostingRecap title="Will post as each item confirms" dr={dr} cr={cr} currency={currency}
            helper="Each settled item clears what is owed to its vendor; the withholding tax kept back is owed to the tax office." />
        </div>
      </div>
    </DetailDrawer>
  );
}

// ── Batch detail ─────────────────────────────────────────────────────────────
function BatchDetailDrawer({ batchId, entity, currency, onClose }: { batchId: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const { data, isFetching } = useGetPayoutBatchQuery(batchId == null ? skipToken : { id: batchId, entity });
  const [submit, { isLoading: submitting }] = useSubmitPayoutBatchMutation();
  const [submitForApproval, { isLoading: routing }] = useSubmitPayoutBatchForApprovalMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "payout batch" });
  const batch = data?.data ?? null;
  const access = useFieldAccess(PAYOUT);
  // A batch has no edit route: one sent back is resumed as it is, or withdrawn to change it.
  const { standing, request, workflowId, requestNamed } = useFinanceReturned(batch);
  if (batchId == null) return null;

  const items = batch?.instructions ?? [];
  const whtTotal = items.reduce((s, p) => s + (p.wht_amount || 0), 0);
  const settled = items.filter((p) => p.status === "PAID").length;
  const failed = items.filter((p) => p.status === "FAILED" || p.status === "REVERSED").length;
  const hasPending = items.some((p) => p.status === "PENDING");
  // Maker-checker: a batch already routed shows as awaiting approval (no re-submit).
  // `approval_required` (when the serializer exposes it) picks the right action; while it's
  // undefined we offer both - direct submit 400s if gated, approval errors if no template.
  const awaitingApproval = batch?.approval_status === "PENDING" || batch?.approval_state === "PENDING";
  const gated = batch?.approval_required;
  const canSubmit = batch ? ((batch.status === "DRAFT" || hasPending) && !awaitingApproval) : false;

  const doSubmit = async () => {
    if (!batch) return;
    try { const r = await submit({ id: batch.id, entity }).unwrap(); toast.success(r.message || "Batch submitted."); }
    catch { /* central */ }
  };
  const doSubmitForApproval = async () => {
    if (!batch) return;
    try {
      const r = await submitForApproval({ id: batch.id, entity }).unwrap();
      toast.success(r.message || "Batch submitted for approval.");
      // Nobody may hold the approving permission, in which case the batch is
      // submitted but stuck. Warn now rather than let it sit unnoticed.
      promptIfParked(r.data?.approval);
    }
    catch { /* central */ }
  };

  const accountLine = (p: PayoutInstruction) => [p.beneficiary_bank_code, p.beneficiary_account_number].filter(Boolean).join(" · ");
  const itemCols: Column<PayoutInstruction>[] = [
    ...(access.anyVisible("beneficiary_name", "beneficiary_account_number", "beneficiary_bank_code") ? [{
      header: "Beneficiary", cell: (p: PayoutInstruction) => (
        <span>{access.isHidden("beneficiary_name") ? null : <span className="font-medium text-gray-01">{p.beneficiary_name || "-"}</span>}{accountLine(p) ? <span className="block font-mont text-[11px] tabular-nums text-gray-05">{accountLine(p)}</span> : null}</span>
      ),
    }] : []),
    { header: "Amount", align: "right", cell: (p) => <Money kobo={p.amount} currency={currency} align="right" /> },
    { header: "Withholding tax", align: "right", cell: (p) => <span className="tabular-nums text-gray-05">{p.wht_amount ? formatMoney(p.wht_amount, currency) : "-"}</span> },
    { header: "Net", align: "right", cell: (p) => <span className="tabular-nums">{formatMoney(p.amount - (p.wht_amount || 0), currency)}</span> },
    { header: "Result", cell: (p) => <ItemStatusPill status={p.status} /> },
  ];

  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={batch?.reference || "Batch"} description={batch?.title || (isFetching ? "Loading…" : "")} widthClass="sm:max-w-3xl"
      footer={<>
        <span className="font-mont text-xs text-gray-05">{settled} settled · {failed} failed · {items.length} items</span>
        <div className="flex-1" />
        {batch ? <BatchStatusPill batch={batch} /> : null}
        {standing === "sender" ? <ResumeButton workflowId={workflowId} tags={["PaymentsPayoutBatches"]} /> : null}
        <Button variant="outline" disabled={!items.length} onClick={() => batch && exportBankFile(batch.reference, items, access, currency)} className="gap-1.5"><Eye className="size-4" /> View bank file</Button>
        {canSubmit && gated !== false ? (
          <Can permission={P.PAY_SUBMIT_PAYOUT_BATCH}>
            <Button disabled={routing} onClick={doSubmitForApproval} className="gap-1.5"><Send className="size-4" />{routing ? "Submitting…" : "Submit for approval"}</Button>
          </Can>
        ) : null}
        {canSubmit && gated !== true ? (
          <Can permission={P.PAY_CREATE_PAYOUT}>
            <Button variant={gated === undefined ? "outline" : "default"} disabled={submitting} onClick={doSubmit} className="gap-1.5"><Send className="size-4" />{submitting ? "Submitting…" : "Submit batch"}</Button>
          </Can>
        ) : null}
      </>}>
      <div className="space-y-5">
        <ReturnedNote standing={standing} request={request} requestNamed={requestNamed} senderHint={RETURNED_HINT.resumeOnly} />
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Items" value={String(batch?.item_count ?? items.length)} />
          <Metric label="Batch total" value={formatMoney(batch?.total_amount ?? 0, currency)} />
          <Metric label="Withholding tax kept back" value={formatMoney(whtTotal, currency)} />
        </div>

        <DataTable columns={itemCols} rows={items} rowKey={(p) => p.id} loading={isFetching && !items.length}
          emptyTitle="No items" emptyMessage="This batch has no payout lines." />
      </div>
      {noApproverDialog}
    </DetailDrawer>
  );
}

/** The batch as a CSV. A beneficiary column the user cannot read is left out, not blanked. */
function exportBankFile(reference: string, items: PayoutInstruction[], access: FieldAccess, currency?: string | null) {
  const columns: [keyof PayoutInstruction & string, string][] = [
    ["beneficiary_name", "Beneficiary"], ["beneficiary_bank_code", "Bank code"], ["beneficiary_account_number", "Account"],
  ];
  const beneficiary = columns.filter(([name]) => !access.isHidden(name));
  const head = [...beneficiary.map(([, header]) => header), "Amount", "Withholding tax", "Net", "Status"];
  const esc = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = items.map((p) => [
    ...beneficiary.map(([name]) => String(p[name] ?? "")),
    formatMoney(p.amount, currency), p.wht_amount ? formatMoney(p.wht_amount, currency) : "",
    formatMoney(p.amount - (p.wht_amount || 0), currency), p.status,
  ].map(esc).join(","));
  const csv = [head.map(esc).join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  showBlobPreview(`${reference}.csv`, blob);
}
