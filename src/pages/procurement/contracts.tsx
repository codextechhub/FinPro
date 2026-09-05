// Procurement → Contracts. Vendor agreements with milestones, a renewal radar and
// the activate → renew / terminate lifecycle. Master data - no GL effect.
import { useEffect, useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import {
  Banknote, CalendarClock, CalendarX2, ChevronRight, FileCheck2, FileText, FilePenLine,
  History, Link2, ListChecks, Plus, ScrollText, Search,
} from "lucide-react";
import { toast } from "sonner";

import { ProcurementShell } from "./procurement-shell";
import { VendorPicker } from "./pickers";
import {
  DataTable, DetailDrawer, EmptyState, ErrorState, FormDrawer, FormField, LoadingState,
  Money, MoneyInput, StatCard, StatusPill, ActionButton, TabStrip, toArray, useActiveEntity,
  type Column, type TabStripItem,
} from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "../../permissions";
import { useCan } from "@/components/finance-ui/can";
import {
  useGetContractsQuery, useGetContractQuery, useGetContractsSummaryQuery,
  useGetContractLinkedPosQuery, useCreateContractMutation, useUpdateContractMutation,
  useActivateContractMutation, useRenewContractMutation, useTerminateContractMutation,
  useCompleteMilestoneMutation,
} from "@/redux/services/procurement/procurement-ext-api";
import type { ContractMilestone, VendorContract } from "@/redux/services/procurement/procurement-types";
import { formatMoney } from "@/utils/money";
import { ActivityFeed, EmptyPanel, Field } from "./sourcing/shared";
import { isForbidden, shortDate } from "./sourcing/helpers";
import { ContractRenewButton } from "./procurement-action-gates";
import { PageShell } from "@/components/layout/page-shell";

const STATUS_TABS = [
  ["All", ""], ["Active", "ACTIVE"], ["Expiring", "EXPIRING"], ["Expired", "EXPIRED"],
] as const;

const DETAIL_TABS = [
  ["overview", "Overview", FileText], ["terms", "Terms", ScrollText],
  ["milestones", "Milestones", ListChecks], ["linked", "Linked POs", Link2],
  ["activity", "Activity", History],
] as const;

/** Strip items for the two switchers, built once so the sliding bar re-measures only when the active tab changes. */
const STATUS_TAB_ITEMS: TabStripItem<string>[] = STATUS_TABS.map(([label, value]) => ({ value, label }));
const DETAIL_TAB_ITEMS: TabStripItem<string>[] = DETAIL_TABS.map(([value, label, Icon]) => ({
  value,
  label: <><Icon className="size-3.5" />{label}</>,
}));

const PAYMENT_TERMS = ["IMMEDIATE", "NET_7", "NET_14", "NET_30", "NET_60", "NET_90"];
const termLabel = (t: string) => (t === "IMMEDIATE" ? "Immediate" : t.replace("NET_", "Net "));

// The amber "Expired" overlay pill - an ACTIVE contract past its end_date; shown
// alongside, never replacing, the persisted status.
function ExpiredOverlay() {
  return <span className="rounded bg-amber-100 px-2 py-0.5 font-mont text-[11px] font-medium text-amber-700">Expired</span>;
}

export default function ContractsPage() {
  const { code: entity, currency } = useActiveEntity();
  // Asked before the tables below fetch on mount. A finance grant does not
  // carry procurement.contract.view with it, and without this the screen
  // opened on a pair of 403s and a red toast.
  const canPROC_VIEW_CONTRACTS = useCan().can(P.PROC_VIEW_CONTRACTS);
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.PROC_CREATE_CONTRACT), () => setCreating(true));
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => ({
    entity: entity!, page,
    ...(tab === "EXPIRING" ? { expiring: 1 } : tab ? { status: tab } : {}),
    ...(debounced ? { q: debounced } : {}),
  }), [entity, page, tab, debounced]);
  const { currentData: data, isLoading, isFetching, isError, error, refetch } = useGetContractsQuery(params, { skip: !entity || !canPROC_VIEW_CONTRACTS });
  const { data: summaryData, isLoading: summaryLoading } = useGetContractsSummaryQuery({ entity: entity! }, { skip: !entity || !canPROC_VIEW_CONTRACTS });
  const rows = toArray(data?.data);
  const summary = summaryData?.data;

  const columns: Column<VendorContract>[] = [
    { header: "Contract #", cell: (c) => <span className="font-mont text-sm font-semibold text-primary">{c.reference}</span> },
    { header: "Vendor", cell: (c) => <div className="min-w-32"><p className="font-semibold">{c.vendor_name || c.vendor_code}</p><p className="mt-0.5 text-xs text-gray-05">{c.vendor_code}</p></div> },
    { header: "Type", cell: (c) => <span className="min-w-40 block">{c.title}</span> },
    { header: "End date", cell: (c) => shortDate(c.end_date) },
    { header: "Value", align: "right", cell: (c) => <span className="tabular-nums">{formatMoney(c.contract_value, currency)}</span> },
    { header: "Status", cell: (c) => <div className="flex flex-wrap items-center gap-1.5"><StatusPill status={c.status} />{c.is_expired && <ExpiredOverlay />}</div> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];

  if (!entity) return <ProcurementShell><PageShell><EmptyState title="Select an entity" message="Choose an entity to view its contracts." /></PageShell></ProcurementShell>;
  if (!canPROC_VIEW_CONTRACTS) return <ProcurementShell><PageShell><EmptyState title="No contracts access" message="This screen needs procurement.contract.view." /></PageShell></ProcurementShell>;

  return <ProcurementShell>
    <PageShell className="space-y-5 text-black-01">
      <header data-guide="procurement-contracts.heading" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mont text-lg font-semibold text-gray-01">Contracts</h1>
          <p className="mt-0.5 font-mont text-xs text-gray-05">Vendor agreements with milestones and a renewal radar.</p>
        </div>
        <Can permission={P.PROC_CREATE_CONTRACT}><Button onClick={() => setCreating(true)}><Plus className="size-4" /> New contract</Button></Can>
      </header>

      <div data-guide="procurement-contracts.summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryLoading || !summary ? <div className={cn(INFORMATION_CARD_SURFACE, "col-span-full rounded-md")}><LoadingState rows={2} /></div> : <>
          <StatCard label="Active" value={String(summary.active)} icon={FileCheck2} tone="green" />
          <StatCard label="Expiring ≤ 30 days" value={String(summary.expiring_soon)} icon={CalendarClock} tone="amber" />
          <StatCard label="Expired" value={String(summary.expired)} icon={CalendarX2} tone="gray" />
          <div className="col-span-2 min-w-0 lg:col-span-1">
            <StatCard label="Total active value" value={formatMoney(summary.total_active_value, currency)} icon={Banknote} tone="primary" />
          </div>
        </>}
      </div>

      <section data-guide="procurement-contracts.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
          <TabStrip
            items={STATUS_TAB_ITEMS}
            value={tab}
            onChange={(next) => { setTab(next); setPage(1); }}
            variant="underline"
            ariaLabel="Contract status"
            className="gap-5 self-center border-b-0"
            buttonClassName="px-0 py-3"
          />
          <label className="relative my-2 min-w-0 flex-1 sm:max-w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search contract #, vendor or title" className="h-9 bg-white pl-9" /></label>
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch} onRowClick={(c) => setSelectedId(c.id)} page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage} emptyTitle="No contracts" emptyMessage={debounced ? "Try a different search term or tab." : "Register a vendor contract to track its term and milestones."} />
      </section>
    </PageShell>
    <ContractDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
    {creating && <ContractForm entity={entity} currency={currency} onClose={() => setCreating(false)} />}
  </ProcurementShell>;
}

function ContractDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [reason, setReason] = useState("");
  const { data, isLoading, isError, refetch } = useGetContractQuery({ id: id!, entity }, { skip: id == null });
  const c = data?.data;
  const [activate] = useActivateContractMutation();
  const [terminate] = useTerminateContractMutation();

  const isDraft = c?.status === "DRAFT";
  const canRenewTerminate = c?.status === "ACTIVE" || c?.status === "EXPIRED";

  return <>
    <DetailDrawer
      open={id != null} onOpenChange={(open) => !open && onClose()}
      title={c?.reference || "Contract"}
      description={c ? `${c.title} · ${c.vendor_name || c.vendor_code}` : "Loading contract"}
      widthClass="sm:max-w-2xl"
      footer={c && <>
        {(isDraft || canRenewTerminate) && <Can permission={P.PROC_UPDATE_CONTRACT}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button></Can>}
        {isDraft && <ActionButton label="Activate" permission={P.PROC_ACTIVATE_CONTRACT} title="Activate this contract?" description={`Brings ${c.reference} into force. Requires a start and end date and an eligible vendor.`} onConfirm={async () => { const r = await activate({ id: c.id, entity }).unwrap(); toast.success(r.message || "Contract activated."); }} />}
        {canRenewTerminate && <ContractRenewButton onClick={() => setRenewing(true)} />}
        {canRenewTerminate && <ActionButton label="Terminate" permission={P.PROC_TERMINATE_CONTRACT} destructive title="Terminate this contract?" description={`Ends ${c.reference} early. This cannot be undone.`} confirmText="Terminate" onConfirm={async () => { const r = await terminate({ id: c.id, entity, reason: reason.trim() || undefined }).unwrap(); toast.success(r.message || "Contract terminated."); setReason(""); }}><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="bg-white" /></ActionButton>}
      </>}
    >
      {isLoading ? <LoadingState rows={8} /> : isError || !c ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5"><StatusPill status={c.status} />{c.is_expired && <ExpiredOverlay />}{c.auto_renew && <span className="font-mont text-xs text-gray-05">· Auto-renew</span>}</div>
          <p className="font-mont text-lg font-semibold tabular-nums">{formatMoney(c.contract_value, currency)}</p>
        </div>
        <TabStrip
          items={DETAIL_TAB_ITEMS}
          value={tab}
          onChange={setTab}
          variant="underline"
          ariaLabel="Contract sections"
          className="w-full gap-5"
          buttonClassName="flex items-center gap-1.5 px-0"
        />

        {tab === "overview" && (
          <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">
            <Field label="Contract number" value={c.reference} />
            <Field label="Status" value={<div className="flex items-center gap-1.5"><StatusPill status={c.status} />{c.is_expired && <ExpiredOverlay />}</div>} />
            <Field label="Vendor" value={c.vendor_name || c.vendor_code} />
            <Field label="Type" value={c.title} />
            <Field label="Start" value={shortDate(c.start_date)} />
            <Field label="End" value={shortDate(c.end_date)} />
            <Field label="Renewal window from" value={shortDate(c.renewal_window_start)} />
            <Field label="Value" value={formatMoney(c.contract_value, currency)} />
            {c.renews_reference && <Field label="Renews" value={c.renews_reference} />}
            {c.renewed_by_reference && <Field label="Renewed by" value={c.renewed_by_reference} />}
          </dl>
        )}

        {tab === "terms" && (
          <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">
            <Field label="Payment terms" value={termLabel(c.payment_terms)} />
            <Field label="Renewal notice" value={`${c.renewal_notice_days} days`} />
            <Field label="Auto-renew" value={c.auto_renew ? "Yes" : "No"} />
            <div className="sm:col-span-2"><dt className="font-mont text-[11px] text-gray-05">Notes</dt><dd className="mt-1 font-mont text-sm text-black-01">{c.notes || "-"}</dd></div>
          </dl>
        )}

        {tab === "milestones" && <MilestonesTab contract={c} entity={entity} currency={currency} />}
        {tab === "linked" && <LinkedPosTab contract={c} entity={entity} currency={currency} />}
        {tab === "activity" && <ActivityFeed activity={c.activity} />}
      </div>}
    </DetailDrawer>
    {c && editing && <ContractForm entity={entity} currency={currency} initial={c} onClose={() => setEditing(false)} />}
    {c && renewing && <RenewForm entity={entity} currency={currency} contract={c} onClose={() => setRenewing(false)} />}
  </>;
}

function MilestonesTab({ contract, entity, currency }: { contract: VendorContract; entity: string; currency?: string | null }) {
  const [complete] = useCompleteMilestoneMutation();
  const milestones = contract.milestones ?? [];
  const editable = contract.status !== "TERMINATED" && contract.status !== "RENEWED";
  if (!milestones.length) return <EmptyPanel>No milestones on this contract.</EmptyPanel>;
  return (
    <div className="overflow-x-auto rounded-md border border-white-02"><table className="w-full min-w-[560px]">
      <thead><tr>{["Milestone", "Due", "Amount", "Status", ""].map((h) => <th key={h} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{h}</th>)}</tr></thead>
      <tbody>{milestones.map((m: ContractMilestone) => (
        <tr key={m.id}>
          <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold">{m.name}</td>
          <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{shortDate(m.due_date)}</td>
          <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{m.amount ? <Money kobo={m.amount} currency={currency} /> : "-"}</td>
          <td className="border-t border-white-02 px-3 py-2"><StatusPill status={m.status} /></td>
          <td className="border-t border-white-02 px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
            {editable && m.status !== "COMPLETED" && (
              <ActionButton asLink label="Complete" permission={P.PROC_UPDATE_CONTRACT} title="Complete this milestone?" description={`Marks '${m.name}' as delivered.`} onConfirm={async () => { const r = await complete({ id: contract.id, entity, milestoneId: m.id }).unwrap(); toast.success(r.message || "Milestone completed."); }} />
            )}
          </td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function LinkedPosTab({ contract, entity, currency }: { contract: VendorContract; entity: string; currency?: string | null }) {
  const { data, isLoading, isError, error } = useGetContractLinkedPosQuery({ id: contract.id, entity });
  // An empty list serialises as {} - toArray normalises it back to [].
  const rows = toArray(data?.data);
  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <EmptyPanel>{isForbidden(error) ? "You do not have permission to view purchase orders." : "Could not load linked purchase orders."}</EmptyPanel>;
  return (
    <div className="space-y-2">
      <p className="font-mont text-[11px] text-gray-05">
        <span className="font-semibold text-black-01">Linked</span> = purchase orders raised as an explicit call-off against this contract.
        {" "}<span className="font-semibold text-black-01">In-term</span> = other POs with {contract.vendor_name || contract.vendor_code} inside the period with no explicit link (a vendor + period association, not a hard link).
      </p>
      {rows.length === 0 ? <EmptyPanel>No purchase orders linked to, or raised with this vendor during, the term.</EmptyPanel> : (
        <div className="overflow-x-auto rounded-md border border-white-02"><table className="w-full min-w-[560px]">
          <thead><tr>{["PO #", "Link", "Date", "Amount", "Status"].map((h) => <th key={h} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{h}</th>)}</tr></thead>
          <tbody>{rows.map((po) => (
            <tr key={po.id}>
              <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold">{po.document_number}</td>
              <td className="border-t border-white-02 px-3 py-2">
                <span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium", po.link_type === "linked" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-05")}>
                  {po.link_type === "linked" ? "Linked" : "In-term"}
                </span>
              </td>
              <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{shortDate(po.order_date)}</td>
              <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums"><Money kobo={po.total} currency={currency} /></td>
              <td className="border-t border-white-02 px-3 py-2"><StatusPill status={po.status} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

type MilestoneRow = { key: string; name: string; due_date: string; amountKobo: number };

function ContractForm({ entity, currency, initial, onClose }: { entity: string; currency?: string | null; initial?: VendorContract; onClose: () => void }) {
  const [vendor, setVendor] = useState(initial?.vendor_code || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [startDate, setStartDate] = useState(initial?.start_date || "");
  const [endDate, setEndDate] = useState(initial?.end_date || "");
  const [value, setValue] = useState(initial?.contract_value || 0);
  const [terms, setTerms] = useState(initial?.payment_terms || "NET_30");
  const [autoRenew, setAutoRenew] = useState(initial?.auto_renew ?? false);
  const [noticeDays, setNoticeDays] = useState(initial?.renewal_notice_days != null ? String(initial.renewal_notice_days) : "30");
  const [notes, setNotes] = useState(initial?.notes || "");
  // New milestones only; existing ones are shown read-only (append semantics on the server).
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [create, { isLoading: creating }] = useCreateContractMutation();
  const [update, { isLoading: updating }] = useUpdateContractMutation();
  const [activate, { isLoading: activating }] = useActivateContractMutation();
  const saving = creating || updating || activating;

  // Soft duplicate-type guardrail (create only): a vendor holding several concurrent
  // contracts is valid, so this only WARNS - it never blocks - when this vendor already
  // has an active contract of the same type (case-insensitive title match).
  const { data: vendorActive } = useGetContractsQuery(
    { entity, vendor, status: "ACTIVE" },
    { skip: !!initial || !vendor || !title.trim() },
  );
  const dupeContract = initial ? undefined
    : toArray(vendorActive?.data).find((c) => c.title.trim().toLowerCase() === title.trim().toLowerCase());

  const addMs = () => setMilestones((m) => [...m, { key: crypto.randomUUID(), name: "", due_date: "", amountKobo: 0 }]);
  const setMs = (key: string, patch: Partial<MilestoneRow>) => setMilestones((m) => m.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeMs = (key: string) => setMilestones((m) => m.filter((r) => r.key !== key));
  const msPayload = milestones.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), ...(m.due_date ? { due_date: m.due_date } : {}), amount: m.amountKobo || 0 }));

  const datesOk = !startDate || !endDate || endDate >= startDate;
  const valid = !!vendor && !!title.trim() && datesOk && (!noticeDays || (Number(noticeDays) >= 0 && Number(noticeDays) <= 365));
  const canActivate = valid && !!startDate && !!endDate;
  const dirty = !initial
    || vendor !== (initial.vendor_code || "") || title !== (initial.title || "")
    || startDate !== (initial.start_date || "") || endDate !== (initial.end_date || "")
    || value !== initial.contract_value || terms !== initial.payment_terms
    || autoRenew !== initial.auto_renew || noticeDays !== String(initial.renewal_notice_days)
    || notes !== (initial.notes || "") || msPayload.length > 0;

  const body = () => ({
    title: title.trim(), start_date: startDate || undefined, end_date: endDate || undefined,
    contract_value: value || 0, payment_terms: terms, auto_renew: autoRenew,
    renewal_notice_days: noticeDays ? Number(noticeDays) : 30,
    notes: notes.trim() || undefined, ...(msPayload.length ? { milestones: msPayload } : {}),
  });

  const save = async (thenActivate: boolean) => {
    if (!valid || (thenActivate && !canActivate)) return;
    try {
      let id = initial?.id;
      if (initial) {
        const r = await update({ id: initial.id, entity, ...body() }).unwrap();
        toast.success(r.message || "Contract updated.");
      } else {
        const r = await create({ entity, vendor, ...body() }).unwrap();
        id = r.data.id;
        toast.success(r.message || "Contract created.");
      }
      if (thenActivate && id != null) {
        const r = await activate({ id, entity }).unwrap();
        toast.success(r.message || "Contract activated.");
      }
      onClose();
    } catch { /* central */ }
  };

  const footer = initial ? (
    <>
      <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
      <Button disabled={!valid || !dirty} loading={saving} onClick={() => save(false)}>Save changes</Button>
    </>
  ) : (
    <>
      <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
      <Button variant="outline" disabled={!valid} loading={creating} onClick={() => save(false)}>Save draft</Button>
      <Can permission={P.PROC_ACTIVATE_CONTRACT}>
        <Button disabled={!canActivate} loading={saving} onClick={() => save(true)}>Create &amp; activate</Button>
      </Can>
    </>
  );

  return (
    <DetailDrawer
      open onOpenChange={(o) => { if (!saving && !o) onClose(); }}
      title={initial ? "Edit contract" : "New contract"}
      description={initial ? "Update this contract. New milestones are appended." : "Register a vendor agreement. Save as draft or create and activate."}
      widthClass="sm:max-w-2xl" footer={footer}
    >
      <div className="space-y-4">
      {dupeContract && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs text-amber-800">
          <ScrollText className="mt-0.5 size-3.5 shrink-0" />
          <span>{dupeContract.vendor_name || vendor} already has an active contract of this type ({dupeContract.reference}). You can still proceed - multiple contracts per vendor are allowed.</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Vendor" required><VendorPicker entity={entity} value={vendor} onChange={setVendor} purchaseEligible isRequired disabled={!!initial} /></FormField>
        <FormField label="Type / title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="bg-white" placeholder="e.g. Cloud hosting (SLA)" /></FormField>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Start date"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-white" /></FormField>
        <FormField label="End date"><Input type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-white" /></FormField>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Contract value"><MoneyInput valueKobo={value} onChangeKobo={setValue} currency={currency} /></FormField>
        <FormField label="Payment terms">
          <select value={terms} onChange={(e) => setTerms(e.target.value)} className="h-9 w-full rounded-md border bg-white px-2 font-mont text-sm">
            {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{termLabel(t)}</option>)}
          </select>
        </FormField>
        <FormField label="Renewal notice (days)"><Input type="number" min="0" max="365" value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} className="bg-white tabular-nums" /></FormField>
      </div>
      <label className="flex items-center gap-2 font-mont text-sm text-gray-01">
        <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} /> Auto-renew
      </label>
      <FormField label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={255} className="bg-white" /></FormField>

      {initial && initial.milestones?.length > 0 && (
        <div className="space-y-1">
          <p className="font-mont text-xs font-semibold text-gray-05">Existing milestones</p>
          {initial.milestones.map((m) => <div key={m.id} className="flex items-center justify-between rounded-md border border-white-02 px-3 py-1.5 font-mont text-xs"><span>{m.name}</span><StatusPill status={m.status} /></div>)}
        </div>
      )}

      <div className="space-y-2 pt-1">
        <p className="font-mont text-xs font-semibold text-gray-05">{initial ? "Add milestones" : "Milestones (optional)"}</p>
        {milestones.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-2 rounded-md border border-white-02 p-2">
            <Input value={row.name} onChange={(e) => setMs(row.key, { name: e.target.value })} placeholder="Milestone name" className="min-w-40 flex-1 bg-white" />
            <Input type="date" value={row.due_date} onChange={(e) => setMs(row.key, { due_date: e.target.value })} className="w-40 bg-white" aria-label="Due date" />
            <div className="w-36"><MoneyInput valueKobo={row.amountKobo} onChangeKobo={(k) => setMs(row.key, { amountKobo: k })} currency={currency} placeholder="Amount" /></div>
            <button type="button" onClick={() => removeMs(row.key)} className="text-gray-05 hover:text-destructive" aria-label="Remove milestone">✕</button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addMs} className="gap-1.5"><Plus className="size-4" /> Add milestone</Button>
      </div>
      </div>
    </DetailDrawer>
  );
}

function RenewForm({ entity, currency, contract, onClose }: { entity: string; currency?: string | null; contract: VendorContract; onClose: () => void }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [value, setValue] = useState(contract.contract_value || 0);
  const [copyMilestones, setCopyMilestones] = useState(false);
  const [renew, { isLoading }] = useRenewContractMutation();
  const valid = !!startDate && !!endDate && endDate >= startDate;
  const save = async () => {
    if (!valid) return;
    try {
      const r = await renew({ id: contract.id, entity, start_date: startDate, end_date: endDate, contract_value: value || 0, copy_milestones: copyMilestones }).unwrap();
      toast.success(r.message || "Contract renewed.");
      onClose();
    } catch { /* central */ }
  };
  return (
    <FormDrawer
      open onOpenChange={(o) => !isLoading && !o && onClose()}
      title="Renew contract" description={`Create a successor to ${contract.reference}. The current contract is marked renewed.`}
      widthClass="sm:max-w-lg" onSubmit={save} submitText="Renew" loading={isLoading} canSubmit={valid}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="New start date" required><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-white" /></FormField>
        <FormField label="New end date" required><Input type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-white" /></FormField>
      </div>
      <FormField label="Contract value"><MoneyInput valueKobo={value} onChangeKobo={setValue} currency={currency} /></FormField>
      <label className="flex items-center gap-2 font-mont text-sm text-gray-01">
        <input type="checkbox" checked={copyMilestones} onChange={(e) => setCopyMilestones(e.target.checked)} /> Copy pending milestones to the renewal
      </label>
    </FormDrawer>
  );
}
