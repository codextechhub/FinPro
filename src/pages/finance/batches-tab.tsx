/**
 * Batches - bulk vendor disbursements (Vision "Bulk Disbursement"), rebuilt in the
 * house theme: KPIs (batches / queued value / completed 7d / drafts), a batches table,
 * a Build-batch drawer (a multi-line vendor editor with per-line WHT + a settlement
 * recap), and a detail drawer with per-item results, Submit and a Bank-file CSV export.
 *
 * Backed by the real model: a batch is many PayoutInstructions; each line settles a
 * vendor's payable on confirmation (Dr AP gross / Cr bank net / Cr WHT payable). Submit
 * dispatches the pending items to the provider; settlement books via webhook/PSP. Honest:
 * "Bank file" is a CSV (no proprietary format); beneficiary details are FLS-masked.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { Plus, Upload, Download, Send, X } from "lucide-react";
import { DataTable, Money, MoneyInput, DetailDrawer, FormField, VendorPicker, AccountPicker, PostingRecap, KpiCard, toArray, type Column, type RecapRow } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { isStripped } from "@/utils/fls";
import { P } from "../../permissions";
import { useGetPayoutBatchesQuery, useGetPayoutBatchesSummaryQuery, useCreatePayoutBatchMutation, useGetPayoutBatchQuery, useSubmitPayoutBatchMutation, useSubmitPayoutBatchForApprovalMutation } from "@/redux/services/payments/payments-api";
import { useGetVendorsQuery } from "@/redux/services/procurement/procurement-api";
import type { PayoutBatchSummary, PayoutInstruction, PayoutBatchItemPayload } from "@/redux/services/payments/payments-types";
import type { Vendor } from "@/redux/services/procurement/procurement-types";
import { sourceDocumentIdFromParams } from "@/lib/source-document-route";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const MASK = "••••";
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "-");

const BATCH_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-gray-02/70 text-gray-01" },
  PROCESSING: { label: "Processing", cls: "bg-amber-50 text-amber-700" },
  COMPLETED: { label: "Completed", cls: "bg-green-01/10 text-green-01" },
  PARTIALLY_COMPLETED: { label: "Partial", cls: "bg-amber-50 text-amber-700" },
  FAILED: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
};
function BatchStatusPill({ status }: { status: string }) {
  const s = BATCH_STATUS[status] ?? { label: status, cls: "bg-gray-02 text-gray-01" };
  return <span className={cn(PILL, s.cls)}>{s.label}</span>;
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

const PROVIDERS: Record<string, { label: string; dot: string }> = {
  PAYSTACK: { label: "Paystack", dot: "bg-blue-500" },
  FAKE: { label: "Fake (test)", dot: "bg-gray-400" },
};
function ProviderTag({ provider }: { provider: string }) {
  const p = PROVIDERS[provider] ?? { label: provider, dot: "bg-gray-400" };
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
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(() => (
    sourceDocumentIdFromParams(searchParams)
  ));
  const [building, setBuilding] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useGetPayoutBatchesQuery({ entity, page });
  const { data: summaryRes } = useGetPayoutBatchesSummaryQuery({ entity });
  const rows = useMemo(() => toArray<PayoutBatchSummary>(data?.data), [data]);
  const pg = data?.pagination;
  const s = summaryRes?.data;

  const columns: Column<PayoutBatchSummary>[] = [
    { header: "Batch", cell: (b) => <span className="font-semibold tabular-nums text-gray-01">{b.reference}</span> },
    { header: "Run date", cell: (b) => <span className="tabular-nums text-gray-05">{fmtDate(b.created_at)}</span> },
    { header: "Purpose", cell: (b) => b.title || <span className="text-gray-05">-</span> },
    { header: "Items", align: "right", cell: (b) => <span className="tabular-nums">{b.item_count}</span> },
    { header: "Total", align: "right", cell: (b) => <Money kobo={b.total_amount} currency={currency} align="right" /> },
    { header: "Provider", cell: (b) => <ProviderTag provider={b.provider} /> },
    { header: "Status", cell: (b) => <BatchStatusPill status={b.status} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Batches" value={String(s?.total ?? 0)} foot="Total" />
        <KpiCard label="Queued value" value={formatMoney(s?.queued.kobo ?? 0, currency)} foot="Draft + processing" />
        <KpiCard label="Completed (7d)" value={String(s?.completed7d ?? 0)} foot="Fully settled" />
        <KpiCard label="Drafts" value={String(s?.drafts ?? 0)} tone={(s?.drafts ?? 0) > 0 ? "warn" : "default"} foot="Awaiting submit" />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" disabled title="CSV import is coming soon" className="gap-1.5"><Upload className="size-4" /> Upload CSV</Button>
        <Can permission={P.PAY_CREATE_PAYOUT}>
          <Button onClick={() => setBuilding(true)} className="gap-1.5"><Plus className="size-4" /> Build batch</Button>
        </Can>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(b) => b.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(b) => setSelectedId(b.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No payout batches" emptyMessage="Build a batch to disburse to many vendors at once." />

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

const benName = (v?: Vendor) => v?.bank_account_name || v?.name || "";
const benAcct = (v?: Vendor) => v?.bank_account_number || "";

// ── Build batch ──────────────────────────────────────────────────────────────
type Line = { id: number; vendor: string; amount: number; wht: number };
let LINE_SEQ = 1;
const newLine = (): Line => ({ id: LINE_SEQ++, vendor: "", amount: 0, wht: 0 });

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

  const reset = () => { setTitle(""); setProvider("PAYSTACK"); setSourceAccount(""); setNarration(""); setLines([newLine()]); LINE_SEQ = 1; };
  const close = () => { reset(); onClose(); };
  const setLine = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // A line is valid when it has a vendor (with a resolvable bank account) + amount.
  // Look vendors up inline so the memo depends on `vendors` directly (not the
  // per-render vendorByCode closure), which the React Compiler can preserve.
  const validItems = useMemo<PayoutBatchItemPayload[]>(() => lines.flatMap((l) => {
    const v = vendors.find((vd) => vd.code === l.vendor);
    const acct = benAcct(v);
    if (!v || l.amount <= 0 || !acct || l.wht > l.amount) return [];
    return [{ vendor: l.vendor, amount: l.amount, beneficiary_name: benName(v), beneficiary_account_number: acct, wht_amount: l.wht || undefined }];
  }), [lines, vendors]);

  const gross = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const wht = lines.reduce((s, l) => s + (l.wht || 0), 0);
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
    ...(wht > 0 ? [{ code: "", name: "WHT payable", amount: wht }] : []),
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
          <Metric label="WHT withheld" value={formatMoney(wht, currency)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Purpose"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. May vendor run" className="h-9 bg-white" /></FormField>
          <div><p className="mb-1 font-mont text-xs text-gray-05">Provider</p><Select value={provider} onChange={setProvider} className="w-full">{Object.entries(PROVIDERS).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}</Select></div>
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
              const acct = benAcct(v);
              const lineNet = (l.amount || 0) - (l.wht || 0);
              const warn = !!l.vendor && !acct;
              return (
                <div key={l.id} className="rounded-md border border-white-02 bg-white p-2.5">
                  {/* Phone: vendor takes its own row; amounts + remove share the second. */}
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1.6fr_1fr_1fr_auto]">
                    <div className="col-span-3 sm:col-span-1">
                      <VendorPicker entity={entity} value={l.vendor} onChange={(code) => setLine(l.id, { vendor: code })} label="Vendor" />
                    </div>
                    <div><p className="mb-1 font-mont text-[11px] text-gray-05">Amount</p><MoneyInput valueKobo={l.amount} onChangeKobo={(k) => setLine(l.id, { amount: k })} currency={currency} className="[&_input]:h-9" /></div>
                    <div><p className="mb-1 font-mont text-[11px] text-gray-05">WHT</p><MoneyInput valueKobo={l.wht} onChangeKobo={(k) => setLine(l.id, { wht: k })} currency={currency} className="[&_input]:h-9" /></div>
                    <Button variant="ghost" size="icon" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : ls))} className="size-9 text-gray-05 hover:text-destructive"><X className="size-4" /></Button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between font-mont text-[11px]">
                    <span className={cn(warn ? "text-destructive" : "text-gray-05")}>
                      {warn ? "This vendor has no bank account on file" : v ? `${benName(v)}${acct ? ` · ${acct}` : ""}` : "Pick a vendor to disburse to"}
                    </span>
                    {l.amount > 0 ? <span className="tabular-nums text-gray-05">Net {formatMoney(lineNet, currency)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">On batch settlement</p>
          <PostingRecap title="Will post as each item confirms" dr={dr} cr={cr} currency={currency}
            helper="Each settled item clears its payable; WHT withheld credits the WHT liability." />
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
  if (batchId == null) return null;

  const items = batch?.instructions ?? [];
  const whtTotal = items.reduce((s, p) => s + (p.wht_amount || 0), 0);
  const settled = items.filter((p) => p.status === "PAID").length;
  const failed = items.filter((p) => p.status === "FAILED" || p.status === "REVERSED").length;
  const hasPending = items.some((p) => p.status === "PENDING");
  // Maker-checker: a batch already routed shows as awaiting approval (no re-submit).
  // `approval_required` (when the serializer exposes it) picks the right action; while it's
  // undefined we offer both - direct submit 400s if gated, approval errors if no template.
  const awaitingApproval = batch?.approval_status === "PENDING";
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

  const itemCols: Column<PayoutInstruction>[] = [
    {
      header: "Beneficiary", cell: (p) => {
        const name = isStripped(p, "beneficiary_name") ? MASK : p.beneficiary_name || "-";
        const acct = isStripped(p, "beneficiary_account_number") ? MASK : p.beneficiary_account_number || "";
        return <span><span className="font-medium text-gray-01">{name}</span>{acct ? <span className="block font-mont text-[11px] tabular-nums text-gray-05">{p.beneficiary_bank_code ? `${p.beneficiary_bank_code} · ` : ""}{acct}</span> : null}</span>;
      },
    },
    { header: "Amount", align: "right", cell: (p) => <Money kobo={p.amount} currency={currency} align="right" /> },
    { header: "WHT", align: "right", cell: (p) => <span className="tabular-nums text-gray-05">{p.wht_amount ? formatMoney(p.wht_amount, currency) : "-"}</span> },
    { header: "Net", align: "right", cell: (p) => <span className="tabular-nums">{formatMoney(p.amount - (p.wht_amount || 0), currency)}</span> },
    { header: "Result", cell: (p) => <ItemStatusPill status={p.status} /> },
  ];

  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={batch?.reference || "Batch"} description={batch?.title || (isFetching ? "Loading…" : "")} widthClass="sm:max-w-3xl"
      footer={<>
        <span className="font-mont text-xs text-gray-05">{settled} settled · {failed} failed · {items.length} items</span>
        <div className="flex-1" />
        {awaitingApproval ? <span className={cn(PILL, "bg-amber-50 text-amber-700")}>Awaiting approval</span> : null}
        <Button variant="outline" disabled={!items.length} onClick={() => batch && exportBankFile(batch.reference, items, currency)} className="gap-1.5"><Download className="size-4" /> Bank file</Button>
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
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Items" value={String(batch?.item_count ?? items.length)} />
          <Metric label="Batch total" value={formatMoney(batch?.total_amount ?? 0, currency)} />
          <Metric label="WHT withheld" value={formatMoney(whtTotal, currency)} />
        </div>

        <DataTable columns={itemCols} rows={items} rowKey={(p) => p.id} loading={isFetching && !items.length}
          emptyTitle="No items" emptyMessage="This batch has no payout lines." />
      </div>
      {noApproverDialog}
    </DetailDrawer>
  );
}

function exportBankFile(reference: string, items: PayoutInstruction[], currency?: string | null) {
  const head = ["Beneficiary", "Bank code", "Account", "Amount", "WHT", "Net", "Status"];
  const esc = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = items.map((p) => [
    isStripped(p, "beneficiary_name") ? "••••" : p.beneficiary_name, p.beneficiary_bank_code || "",
    isStripped(p, "beneficiary_account_number") ? "••••" : p.beneficiary_account_number,
    formatMoney(p.amount, currency), p.wht_amount ? formatMoney(p.wht_amount, currency) : "",
    formatMoney(p.amount - (p.wht_amount || 0), currency), p.status,
  ].map(esc).join(","));
  const csv = [head.map(esc).join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${reference}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
