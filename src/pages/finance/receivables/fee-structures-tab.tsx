/**
 * Receivables → Fee Structures. A search/status list, a rich detail drawer (line
 * items with fee code + optional/required + a Subtotal→Tax→Total breakdown, a
 * usage/activity panel, Generate, Duplicate, Edit) and a create/edit drawer.
 *
 * This is a generic platform, so a fee structure is NOT tied to a school term -
 * it is classified by who it bills (`applies_to`: Customer / Vendor / Staff /
 * General). Only Customer structures can generate AR invoices today.
 *
 * Honest adaptation: the prototype is school-specific (branch · session · class
 * scope, "Per Term/Session" frequency, students/classes assigned). We keep the
 * generic-valuable richness - per-line fee code, optional-vs-required, the tax
 * breakdown, usage/activity, Duplicate - and drop the school-only bits. Frequency
 * is intentionally omitted (generation raises a single invoice, not a schedule).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, FileStack, Pencil, Copy, CircleCheck, RefreshCw, AlertTriangle } from "lucide-react";
import {
  DataTable, Money, MoneyInput, DetailDrawer, FormField,
  AccountPicker, TaxCodePicker, toArray, type Column,
  PostingDateField,} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/utils/api-errors";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import {
  useGetFeeStructuresQuery, useGetFeeStructureQuery, useCreateFeeStructureMutation,
  useUpdateFeeStructureMutation, useDuplicateFeeStructureMutation,
  useGenerateFromFeeStructureMutation,
} from "@/redux/services/finance/ar-api";
import type { FeeStructure, FeeAppliesTo } from "@/redux/services/finance/ar-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

const APPLIES_OPTIONS: { value: FeeAppliesTo; label: string }[] = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "VENDOR", label: "Vendor" },
  { value: "STAFF", label: "Staff" },
  { value: "GENERAL", label: "General" },
];
const APPLIES_CLS: Record<FeeAppliesTo, string> = {
  CUSTOMER: "bg-blue-50 text-blue-700",
  VENDOR: "bg-amber-50 text-amber-700",
  STAFF: "bg-violet-50 text-violet-700",
  GENERAL: "bg-gray-03/60 text-gray-05",
};

function AppliesToPill({ value, label }: { value: FeeAppliesTo; label?: string }) {
  return <span className={cn(PILL, APPLIES_CLS[value] ?? APPLIES_CLS.GENERAL)}>{label || value}</span>;
}
function StatusPill({ active }: { active: boolean }) {
  return <span className={cn(PILL, active ? "bg-green-01/10 text-green-01" : "bg-gray-03/60 text-gray-05")}>{active ? "Active" : "Inactive"}</span>;
}
function OptionalPill({ optional }: { optional: boolean }) {
  return <span className={cn(PILL, optional ? "bg-amber-50 text-amber-700" : "bg-gray-03/60 text-gray-05")}>{optional ? "Optional" : "Required"}</span>;
}

export function FeeStructuresTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [status, setStatus] = useState("");
  const [appliesTo, setAppliesTo] = useState("");
  const [editing, setEditing] = useState<FeeStructure | "new" | null>(null);
  const [duplicating, setDuplicating] = useState<FeeStructure | null>(null);
  const [selected, setSelected] = useState<FeeStructure | null>(null);

  const params = useMemo(() => ({
    entity, ...(search ? { search } : {}), ...(status ? { is_active: status } : {}),
    ...(appliesTo ? { applies_to: appliesTo } : {}),
  }), [entity, search, status, appliesTo]);
  const { data, isLoading, isFetching, isError, refetch } = useGetFeeStructuresQuery(params);
  const rows = useMemo(() => toArray(data?.data), [data]);
  const selectCls = "h-9 rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01";

  const columns: Column<FeeStructure>[] = [
    { header: "Code", cell: (f) => <span className="font-semibold tabular-nums">{f.code}</span> },
    { header: "Name", cell: (f) => <span className="font-medium text-gray-01">{f.name}</span> },
    { header: "Applies to", cell: (f) => <AppliesToPill value={f.applies_to} label={f.applies_to_display} /> },
    { header: "Lines", align: "right", cell: (f) => <span className="tabular-nums text-gray-05">{f.items.length}</span> },
    { header: "Total", align: "right", cell: (f) => <Money kobo={f.total_with_tax} currency={currency} align="right" /> },
    { header: "Status", cell: (f) => <StatusPill active={f.is_active} /> },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search code or name" className="h-9 w-64 bg-white pl-8 font-mont" />
          </div>
          <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)} className={selectCls}>
            <option value="">All types</option>
            {APPLIES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <Can permission={P.FIN_CREATE_FEE_STRUCTURE}>
          <Button onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> New structure</Button>
        </Can>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={(f) => f.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setSelected}
        emptyTitle="No fee structures"
        emptyMessage="Create a billing template with New structure."
      />

      <FeeStructureDetailDrawer
        structure={selected} entity={entity} currency={currency}
        onClose={() => setSelected(null)}
        onEdit={(s) => { setSelected(null); setEditing(s); }}
        onDuplicate={(s) => { setSelected(null); setDuplicating(s); }}
      />
      <StructureFormDrawer
        open={editing !== null} structure={editing === "new" ? null : editing}
        onClose={() => setEditing(null)} entity={entity} currency={currency}
      />
      <DuplicateDrawer structure={duplicating} entity={entity} onClose={() => setDuplicating(null)} />
    </>
  );
}

function FeeStructureDetailDrawer({ structure, entity, currency, onClose, onEdit, onDuplicate }: {
  structure: FeeStructure | null; entity: string; currency?: string | null;
  onClose: () => void; onEdit: (s: FeeStructure) => void; onDuplicate: (s: FeeStructure) => void;
}) {
  const { can } = useCan();
  const [generating, setGenerating] = useState(false);
  // Fetch the full record (carries usage/activity) once the drawer is open.
  const { data: detail } = useGetFeeStructureQuery(
    { id: structure?.code ?? "", entity }, { skip: !structure });
  const full = detail?.data ?? structure;
  if (!structure || !full) return null;
  const isCustomer = full.applies_to === "CUSTOMER";

  return (
    <>
      <DetailDrawer
        open={!!structure} onOpenChange={(o) => (o ? undefined : onClose())}
        title={full.name} description={full.code}
        widthClass="sm:max-w-2xl"
        footer={
          <>
            <StatusPill active={full.is_active} />
            <div className="flex-1" />
            <Can permission={P.FIN_CREATE_FEE_STRUCTURE}>
              <Button variant="outline" onClick={() => onDuplicate(full)} className="gap-1.5"><Copy className="size-4" /> Duplicate</Button>
            </Can>
            {can(P.FIN_EDIT_FEE_STRUCTURE) ? <Button variant="outline" onClick={() => onEdit(full)} className="gap-1.5"><Pencil className="size-4" /> Edit</Button> : null}
            {can(P.FIN_GENERATE_FEE_STRUCTURE) ? (
              <Button
                onClick={() => setGenerating(true)} disabled={!isCustomer} className="gap-1.5"
                title={isCustomer ? undefined : "Only customer structures generate AR invoices."}
              ><FileStack className="size-4" /> Generate invoices</Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <AppliesToPill value={full.applies_to} label={full.applies_to_display} />
            {!isCustomer ? <span className="font-mont text-[11px] text-gray-05">Classification only - invoice generation is for customer structures.</span> : null}
          </div>
          {full.description ? <p className="font-mont text-sm text-gray-01">{full.description}</p> : null}

          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Lines</p>
            <div className="overflow-hidden rounded-md border border-white-02">
              <table className="w-full border-collapse">
                <thead><tr>
                  <th className={thCls}>Fee item</th><th className={thCls}>GL account</th>
                  <th className={cn(thCls, "text-right")}>Amount</th><th className={thCls}>Tax</th>
                  <th className={thCls}>Type</th>
                </tr></thead>
                <tbody>
                  {full.items.map((it) => (
                    <tr key={it.id}>
                      <td className={tdCls}>
                        {it.code ? <span className="font-semibold tabular-nums text-gray-05">{it.code} · </span> : null}
                        {it.description || "-"}
                      </td>
                      <td className={cn(tdCls, "tabular-nums text-gray-05")}>{it.revenue_account_code}</td>
                      <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={it.amount} currency={currency} align="right" /></td>
                      <td className={tdCls}>{it.tax_code_value ?? <span className="text-gray-05">Exempt</span>}</td>
                      <td className={tdCls}><OptionalPill optional={it.is_optional} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td className={cn(tdCls, "border-t-2 text-gray-05")} colSpan={2}>Subtotal</td>
                    <td className={cn(tdCls, "border-t-2 text-right tabular-nums")}><Money kobo={full.total} currency={currency} align="right" /></td>
                    <td className={cn(tdCls, "border-t-2")} colSpan={2} /></tr>
                  <tr><td className={cn(tdCls, "text-gray-05")} colSpan={2}>Tax</td>
                    <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={full.tax_total} currency={currency} align="right" /></td>
                    <td className={tdCls} colSpan={2} /></tr>
                  <tr className="font-semibold"><td className={tdCls} colSpan={2}>Total per customer</td>
                    <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={full.total_with_tax} currency={currency} align="right" /></td>
                    <td className={tdCls} colSpan={2} /></tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Activity</p>
            <div className="space-y-2 rounded-md border border-gray-03 bg-gray-03 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-01" />
                <p className="font-mont text-xs text-black-01">
                  Created{full.created_by_name ? <> by <span className="font-medium">{full.created_by_name}</span></> : null}
                  {full.created_at ? <span className="text-gray-05"> · {new Date(full.created_at).toLocaleDateString()}</span> : null}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="font-mont text-xs text-black-01">
                  {full.usage && full.usage.invoices_generated > 0 ? (
                    <>Used to generate <span className="font-medium tabular-nums">{full.usage.invoices_generated}</span> invoice{full.usage.invoices_generated === 1 ? "" : "s"}
                      {full.usage.last_generated_at ? <span className="text-gray-05"> · last {new Date(full.usage.last_generated_at).toLocaleDateString()}</span> : null}</>
                  ) : (
                    <span className="text-gray-05">Not used to generate invoices yet.</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DetailDrawer>

      {generating ? <GenerateDrawer structure={full} entity={entity} onClose={() => setGenerating(false)} /> : null}
    </>
  );
}

function GenerateDrawer({ structure, entity, onClose }: { structure: FeeStructure; entity: string; onClose: () => void }) {
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [failure, setFailure] = useState("");
  const [generate, { isLoading }] = useGenerateFromFeeStructureMutation();

  const submit = async () => {
    setFailure("");
    try {
      const res = await generate({ id: structure.code, entity, all_active: true, invoice_date: invoiceDate, due_date: dueDate || undefined }).unwrap();
      toast.success(res.message || `Generated ${res.data?.generated ?? 0} invoice(s).`);
      onClose();
    } catch (error) {
      setFailure(apiErrorMessage(error, "The invoices could not be generated. Check the billing setup and try again."));
    }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Generate invoices" description={`${structure.code} · ${structure.name}`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !invoiceDate} onClick={submit} className="gap-1.5"><FileStack className="size-4" />{isLoading ? "Generating…" : "Generate"}</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          Raises one posted invoice per active customer from this structure's lines ({formatMoney(structure.total_with_tax)} each, tax included). Customers already billed for it are skipped.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PostingDateField label="Invoice date" entity={entity} value={invoiceDate} onChange={setInvoiceDate} />
          <FormField label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-white" /></FormField>
        </div>
        {failure ? (
          <div role="alert" className="flex gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-mont text-xs font-semibold text-gray-01">Invoices could not be generated</p>
              <p className="mt-0.5 font-mont text-[11px] leading-4 text-gray-05">{failure}</p>
            </div>
          </div>
        ) : null}
      </div>
    </DetailDrawer>
  );
}

function DuplicateDrawer({ structure, entity, onClose }: { structure: FeeStructure | null; entity: string; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [duplicate, { isLoading }] = useDuplicateFeeStructureMutation();

  // Seed copy fields when a structure is chosen to duplicate (render-phase).
  const [seededFor, setSeededFor] = useState<number | null>(null);
  if (structure && seededFor !== structure.id) {
    setSeededFor(structure.id);
    setCode(`${structure.code}-COPY`); setName(`${structure.name} (copy)`);
  } else if (!structure && seededFor !== null) {
    setSeededFor(null);
  }
  if (!structure) return null;

  const submit = async () => {
    try {
      const res = await duplicate({ id: structure.code, entity, code: code.trim().toUpperCase(), name: name.trim() || undefined }).unwrap();
      toast.success(res.message || "Fee structure duplicated.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Duplicate fee structure" description={`Clone ${structure.code} into a new draft`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !code.trim()} onClick={submit} className="gap-1.5"><Copy className="size-4" />{isLoading ? "Duplicating…" : "Create copy"}</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          Copies every line (fee code, GL account, amount, tax and optional flag) into a new <span className="font-medium">inactive</span> structure you can review before activating.
        </p>
        <FormField label="New code" required><Input value={code} onChange={(e) => setCode(e.target.value)} className="bg-white font-mont" /></FormField>
        <FormField label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white" /></FormField>
      </div>
    </DetailDrawer>
  );
}

type EditItem = { code: string; description: string; revenue_account: string; amount: number; tax_code: string; is_optional: boolean };
const emptyItem = (): EditItem => ({ code: "", description: "", revenue_account: "", amount: 0, tax_code: "", is_optional: false });

function StructureFormDrawer({ open, structure, onClose, entity, currency }: {
  open: boolean; structure: FeeStructure | null; onClose: () => void; entity: string; currency?: string | null;
}) {
  const isEdit = !!structure;
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [appliesTo, setAppliesTo] = useState<FeeAppliesTo>("CUSTOMER");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [items, setItems] = useState<EditItem[]>([emptyItem()]);
  const [create, { isLoading: creating }] = useCreateFeeStructureMutation();
  const [update, { isLoading: updating }] = useUpdateFeeStructureMutation();
  const isLoading = creating || updating;

  // Seed the form when the drawer opens or the edited structure changes
  // (render-phase, not an effect).
  const seedKey = structure?.id ?? "new";
  const [seededFor, setSeededFor] = useState<number | string | null>(null);
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    if (structure) {
      setCode(structure.code);
      setName(structure.name);
      setAppliesTo(structure.applies_to);
      setDescription(structure.description);
      setActive(structure.is_active);
      setItems(structure.items.length
        ? structure.items.map((it) => ({ code: it.code, description: it.description, revenue_account: it.revenue_account_code, amount: it.amount, tax_code: it.tax_code_value ?? "", is_optional: it.is_optional }))
        : [emptyItem()]);
    } else {
      setCode(""); setName(""); setAppliesTo("CUSTOMER"); setDescription(""); setActive(true); setItems([emptyItem()]);
    }
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const setItem = (i: number, patch: Partial<EditItem>) => setItems((s) => s.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const addItem = () => setItems((s) => [...s, emptyItem()]);
  const removeItem = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));
  const total = items.reduce((s, it) => s + it.amount, 0);

  const validItems = items.filter((it) => it.description.trim() && it.revenue_account && it.amount > 0);
  const canSubmit = code.trim() !== "" && name.trim() !== "" && validItems.length > 0;

  const submit = async () => {
    const payloadItems = validItems.map((it) => ({ code: it.code.trim() || undefined, description: it.description.trim(), revenue_account: it.revenue_account, amount: it.amount, tax_code: it.tax_code || undefined, is_optional: it.is_optional }));
    try {
      if (isEdit && structure) {
        const res = await update({ id: structure.code, entity, name: name.trim(), applies_to: appliesTo, description: description.trim(), is_active: active, items: payloadItems }).unwrap();
        toast.success(res.message || "Fee structure updated.");
      } else {
        const res = await create({ entity, code: code.trim().toUpperCase(), name: name.trim(), applies_to: appliesTo, description: description.trim() || undefined, is_active: active, items: payloadItems }).unwrap();
        toast.success(res.message || "Fee structure created.");
      }
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={open} onOpenChange={(o) => (o ? undefined : onClose())}
      title={isEdit ? "Edit fee structure" : "New fee structure"}
      description="A billing template whose lines become invoice lines when you generate."
      widthClass="sm:max-w-5xl"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5">
          {isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {isLoading ? "Saving…" : isEdit ? "Save changes" : "Create structure"}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Code" required>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. FS-STD-2026" disabled={isEdit} className="bg-white font-mont disabled:opacity-60" />
          </FormField>
          <FormField label="Applies to" required>
            <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as FeeAppliesTo)} className="h-9 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01">
              {APPLIES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
          <label className="flex items-end gap-2 pb-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active</label>
        </div>
        <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard fees" className="bg-white" /></FormField>
        <FormField label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-white" /></FormField>
        {appliesTo !== "CUSTOMER" ? (
          <p className="font-mont text-[11px] text-gray-05">This is a classification template. Invoice generation currently runs for <span className="font-medium text-gray-01">Customer</span> structures only.</p>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Fee lines</p>
            <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5"><Plus className="size-3.5" /> Add line</Button>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-end gap-2 rounded-md border border-white-02 bg-white p-2.5">
                <div className="grid flex-1 grid-cols-12 gap-2">
                  <div className="col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Fee code</p><Input value={it.code} onChange={(e) => setItem(i, { code: e.target.value })} placeholder="SERVICE" className="bg-white font-mont text-sm" /></div>
                  <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Fee item</p><Input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Service fee" className="bg-white font-mont text-sm" /></div>
                  <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">GL account</p><AccountPicker entity={entity} value={it.revenue_account} onChange={(v) => setItem(i, { revenue_account: v })} accountType="INCOME" postableOnly placeholder="Revenue account" /></div>
                  <div className="col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Amount</p><MoneyInput valueKobo={it.amount} onChangeKobo={(v) => setItem(i, { amount: v })} currency={currency} /></div>
                  <div className="col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Tax</p><TaxCodePicker entity={entity} value={it.tax_code} onChange={(v) => setItem(i, { tax_code: v })} usage="sales" /></div>
                </div>
                <label className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap font-mont text-xs text-gray-01"><input type="checkbox" checked={it.is_optional} onChange={(e) => setItem(i, { is_optional: e.target.checked })} className="accent-primary" /> Optional</label>
                <button type="button" onClick={() => removeItem(i)} disabled={items.length <= 1} className="mb-0.5 shrink-0 rounded p-1.5 text-gray-05 hover:bg-destructive/5 hover:text-destructive disabled:opacity-30" aria-label="Remove line"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end font-mont text-sm">
            <span className="text-gray-05">Subtotal (net)&nbsp;</span><span className="font-semibold tabular-nums text-black-01">{formatMoney(total, currency)}</span>
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
}
