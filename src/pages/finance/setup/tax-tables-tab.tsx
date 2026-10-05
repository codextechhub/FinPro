/**
 * Setup, Tax Tables: the national payroll tax data the platform keeps.
 *
 * Three lists, none of which belongs to a school: the PAYE tables (one per tax
 * year, with its bands, reliefs and thresholds), the states PAYE is remitted
 * to, and the pension fund administrators. Every payroll in every school prices
 * its months from them, so only platform staff holding `finance.statutory.create`
 * (to add) or `.update` (to change) may edit them; anybody else here reads.
 * A school app does not mount this screen.
 *
 * A changed table reaches the next payroll run generated, never a month
 * already priced: those lines keep the revision they used. A new tax year
 * starts as a copy of the newest table (see tax-table-form.ts).
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, FormDrawer, FormField, FormModal, Segmented, StatusPill, type Column } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { formatMoney } from "@/utils/money";
import {
  useCreatePayeTaxTableMutation,
  useCreatePayrollTaxStateMutation,
  useCreatePensionFundAdministratorMutation,
  useGetPayeTaxTablesQuery,
  useGetPayrollTaxStatesQuery,
  useGetPensionFundAdministratorsQuery,
  useUpdatePayeTaxTableMutation,
  useUpdatePayrollTaxStateMutation,
  useUpdatePensionFundAdministratorMutation,
} from "@/redux/services/finance/statutory-api";
import type { PayeTaxTable, PayrollTaxState, PensionFundAdministrator } from "@/redux/services/finance/statutory-types";
import { P } from "../../../permissions";
import { useDates } from "../../../lib/display-prefs";
import {
  RELIEF_BASES,
  RELIEF_KINDS,
  bandStarts,
  bpsToPercent,
  formFromTable,
  nextYearDraft,
  tableBody,
  type TaxTableForm,
} from "./tax-table-form";

const SELECT = "h-9 w-full rounded-md border border-white-02 bg-white px-2 font-mont text-xs text-black-01 focus:border-primary focus:outline-none";
type View = "tables" | "states" | "pfas";
const VIEWS = [["tables", "PAYE tables"], ["states", "States"], ["pfas", "Pension administrators"]] as const;

export function TaxTablesTab() {
  const [view, setView] = useState<View>("tables");
  const { can } = useCan();
  const canCreate = can(P.FIN_CREATE_STATUTORY);
  const canUpdate = can(P.FIN_UPDATE_STATUTORY);
  return (
    <div className="space-y-4">
      <Segmented value={view} onChange={setView} options={VIEWS} label="Tax data" />
      {view === "tables" ? <PayeTables canCreate={canCreate} canUpdate={canUpdate} />
        : view === "states" ? <TaxStates canCreate={canCreate} canUpdate={canUpdate} />
        : <Pfas canCreate={canCreate} canUpdate={canUpdate} />}
      {!canCreate && !canUpdate ? <p className="font-mont text-[11px] text-gray-05">Read only. Platform staff keep these tables.</p> : null}
    </div>
  );
}

// ── PAYE tables ───────────────────────────────────────────────────────────────

type Editing = { table: PayeTaxTable } | { year: number; form: TaxTableForm };

function PayeTables({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const dates = useDates();
  const { data, isLoading, isFetching, isError, refetch } = useGetPayeTaxTablesQuery();
  const tables = useMemo(() => (Array.isArray(data?.data) ? data.data : []), [data]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const draft = useMemo(() => nextYearDraft(tables, Number(dates.today().slice(0, 4))), [tables, dates]);

  const columns: Column<PayeTaxTable>[] = [
    { header: "Tax year", cell: (t) => <span className="font-semibold tabular-nums">{t.tax_year}</span> },
    { header: "Name", cell: (t) => t.name },
    { header: "Bands", align: "right", cell: (t) => <span className="tabular-nums">{t.bands.length}</span> },
    { header: "Top rate", align: "right", cell: (t) => <span className="tabular-nums">{t.bands.length ? `${bpsToPercent(Math.max(...t.bands.map((b) => b.rate_bps)))}%` : "-"}</span> },
    { header: "Exempt up to", align: "right", cell: (t) => <span className="tabular-nums">{formatMoney(t.exempt_income_threshold)}</span> },
    { header: "Revision", align: "right", cell: (t) => <span className="tabular-nums">{t.revision}</span> },
    { header: "Status", cell: (t) => <StatusPill status={t.is_active ? "ACTIVE" : "INACTIVE"} /> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mont text-xs text-gray-05">Each payroll month is priced on its own tax year&rsquo;s table. Add next year&rsquo;s before its first payroll.</p>
        {canCreate ? (
          <Button onClick={() => setEditing(draft)} className="gap-1.5"><Plus className="size-4" /> Add {draft.year} table</Button>
        ) : null}
      </div>
      <DataTable columns={columns} rows={tables} rowKey={(t) => t.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={(table) => setEditing({ table })}
        emptyTitle="No tax tables" emptyMessage="Add the current tax year's PAYE table." />
      {editing ? (
        <TaxTableDrawer key={"table" in editing ? editing.table.id : `new-${editing.year}`} editing={editing}
          canEdit={"table" in editing ? canUpdate : canCreate} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function TaxTableDrawer({ editing, canEdit, onClose }: { editing: Editing; canEdit: boolean; onClose: () => void }) {
  const existing = "table" in editing ? editing.table : null;
  const year = existing ? existing.tax_year : (editing as { year: number }).year;
  const [form, setForm] = useState<TaxTableForm>(() => (existing ? formFromTable(existing) : (editing as { form: TaxTableForm }).form));
  const [create, createState] = useCreatePayeTaxTableMutation();
  const [update, updateState] = useUpdatePayeTaxTableMutation();
  const result = tableBody(form);
  const starts = bandStarts(form.bands);
  const set = (patch: Partial<TaxTableForm>) => setForm((f) => ({ ...f, ...patch }));
  const setBand = (i: number, patch: Partial<TaxTableForm["bands"][number]>) =>
    set({ bands: form.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const setRelief = (i: number, patch: Partial<TaxTableForm["reliefs"][number]>) =>
    set({ reliefs: form.reliefs.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const save = async () => {
    if (!result.body) return;
    try {
      const res = existing
        ? await update({ id: existing.id, ...result.body }).unwrap()
        : await create({ tax_year: year, country: "NG", ...result.body }).unwrap();
      toast.success(res.message || "PAYE table saved.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer open onOpenChange={(open) => (open ? undefined : onClose())}
      title={existing ? `${existing.name}` : `New PAYE table for ${year}`}
      description={existing ? `Revision ${existing.revision}. A change reaches the next payroll run, never a month already priced.` : "Starts as a copy of the newest table. Change what the law changed."}
      submitText={existing ? "Save changes" : "Add table"} canSubmit={canEdit && !!result.body}
      loading={createState.isLoading || updateState.isLoading} onSubmit={save} widthClass="sm:max-w-3xl">
      <fieldset disabled={!canEdit} className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Name"><Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={`NG PAYE ${year}`} className="bg-white" /></FormField>
          <FormField label="Source (the law or circular)"><Input value={form.source_reference} onChange={(e) => set({ source_reference: e.target.value })} className="bg-white" /></FormField>
          <FormField label="Exempt income up to (₦ a year)"><Input inputMode="decimal" value={form.exempt_threshold} onChange={(e) => set({ exempt_threshold: e.target.value })} className="bg-white tabular-nums" /></FormField>
          <FormField label="Minimum tax rate (%)"><Input inputMode="decimal" value={form.minimum_rate} onChange={(e) => set({ minimum_rate: e.target.value })} className="bg-white tabular-nums" /></FormField>
        </div>

        <div className="space-y-2">
          <p className="font-mont text-xs font-semibold text-gray-01">Bands (annual taxable income)</p>
          {form.bands.map((band, i) => {
            const top = i === form.bands.length - 1;
            return (
              <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
                <FormField label={i === 0 ? "From (₦)" : `Band ${i + 1} from (₦)`}><Input value={starts[i]} readOnly className="bg-gray-02 tabular-nums" /></FormField>
                <FormField label="Up to (₦)">
                  <Input inputMode="decimal" value={band.upper} onChange={(e) => setBand(i, { upper: e.target.value })} placeholder={top ? "and above" : ""} className="bg-white tabular-nums" />
                </FormField>
                <FormField label="Rate (%)"><Input inputMode="decimal" value={band.rate} onChange={(e) => setBand(i, { rate: e.target.value })} className="bg-white tabular-nums" /></FormField>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove band ${i + 1}`} disabled={form.bands.length === 1}
                  onClick={() => set({ bands: form.bands.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="gap-1.5"
            onClick={() => set({ bands: [...form.bands, { upper: "", rate: "" }] })}>
            <Plus className="size-3.5" /> Add band above
          </Button>
          <p className="font-mont text-[11px] text-gray-05">The top band has no upper limit. Give the band below it an upper limit before adding one above.</p>
        </div>

        <div className="space-y-2">
          <p className="font-mont text-xs font-semibold text-gray-01">Reliefs</p>
          {form.reliefs.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-white-02 p-3 sm:grid-cols-6">
              <FormField label="Code"><Input value={r.code} onChange={(e) => setRelief(i, { code: e.target.value })} className="bg-white" /></FormField>
              <div className="sm:col-span-2"><FormField label="Name"><Input value={r.name} onChange={(e) => setRelief(i, { name: e.target.value })} className="bg-white" /></FormField></div>
              <FormField label="How">
                <select value={r.kind} onChange={(e) => setRelief(i, { kind: e.target.value as typeof r.kind })} className={SELECT}>
                  {RELIEF_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </FormField>
              <div className="sm:col-span-2"><FormField label="Measured on">
                <select value={r.basis} onChange={(e) => setRelief(i, { basis: e.target.value as typeof r.basis })} className={SELECT}>
                  {RELIEF_BASES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </FormField></div>
              <FormField label="Rate (%)"><Input inputMode="decimal" value={r.rate} onChange={(e) => setRelief(i, { rate: e.target.value })} className="bg-white tabular-nums" /></FormField>
              <FormField label="Cap (₦ a year)"><Input inputMode="decimal" value={r.cap} onChange={(e) => setRelief(i, { cap: e.target.value })} placeholder="No cap" className="bg-white tabular-nums" /></FormField>
              <FormField label="Floor (₦ a year)"><Input inputMode="decimal" value={r.floor} onChange={(e) => setRelief(i, { floor: e.target.value })} className="bg-white tabular-nums" /></FormField>
              <div className="flex items-end sm:col-span-3 sm:justify-end">
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => set({ reliefs: form.reliefs.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /> Remove relief</Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1.5"
            onClick={() => set({ reliefs: [...form.reliefs, { code: "", name: "", kind: "FIXED", basis: "NONE", rate: "0", cap: "", floor: "0" }] })}>
            <Plus className="size-3.5" /> Add relief
          </Button>
        </div>

        <FormField label="Notes"><Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="min-h-16 bg-white font-mont text-sm" /></FormField>
        <label className="flex items-center gap-2 font-mont text-sm text-gray-01">
          <input type="checkbox" className="accent-primary" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> In use
        </label>
      </fieldset>
      {result.error && canEdit ? <p role="alert" className="mt-4 rounded-md bg-amber-50 px-3 py-2 font-mont text-xs text-amber-800">{result.error}</p> : null}
    </FormDrawer>
  );
}

// ── States ────────────────────────────────────────────────────────────────────

function TaxStates({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const { data, isLoading, isFetching, isError, refetch } = useGetPayrollTaxStatesQuery();
  const rows = Array.isArray(data?.data) ? data.data : [];
  const [editing, setEditing] = useState<PayrollTaxState | "new" | null>(null);
  const columns: Column<PayrollTaxState>[] = [
    { header: "Code", cell: (s) => <span className="font-semibold">{s.code}</span> },
    { header: "State", cell: (s) => s.name },
    { header: "Revenue service", cell: (s) => s.authority_name },
    { header: "Status", cell: (s) => <StatusPill status={s.is_active ? "ACTIVE" : "INACTIVE"} /> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mont text-xs text-gray-05">The states PAYE is remitted to. A state&rsquo;s code is fixed once added: it names each school&rsquo;s PAYE account for that state.</p>
        {canCreate ? <Button onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> Add state</Button> : null}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={canUpdate ? setEditing : undefined} emptyTitle="No states" emptyMessage="Add the states PAYE is remitted to." />
      {editing ? <StateModal key={editing === "new" ? "new" : editing.id} existing={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function StateModal({ existing, onClose }: { existing: PayrollTaxState | null; onClose: () => void }) {
  const [code, setCode] = useState(existing?.code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [authority, setAuthority] = useState(existing?.authority_name ?? "");
  const [active, setActive] = useState(existing?.is_active ?? true);
  const [create, createState] = useCreatePayrollTaxStateMutation();
  const [update, updateState] = useUpdatePayrollTaxStateMutation();
  const ready = !!name.trim() && !!authority.trim() && (!!existing || !!code.trim());
  const save = async () => {
    try {
      const res = existing
        ? await update({ id: existing.id, name: name.trim(), authority_name: authority.trim(), is_active: active }).unwrap()
        : await create({ code: code.trim().toUpperCase(), name: name.trim(), authority_name: authority.trim() }).unwrap();
      toast.success(res.message || "State saved.");
      onClose();
    } catch { /* central */ }
  };
  return (
    <FormModal open onOpenChange={(open) => (open ? undefined : onClose())} title={existing ? `Change ${existing.name}` : "Add a state"}
      submitText={existing ? "Save" : "Add"} canSubmit={ready} loading={createState.isLoading || updateState.isLoading} onSubmit={save}>
      <FormField label="Code" required><Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!existing} maxLength={8} placeholder="LA" className="bg-white uppercase" /></FormField>
      <FormField label="State" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lagos" className="bg-white" /></FormField>
      <FormField label="Revenue service" required><Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="Lagos State Internal Revenue Service" className="bg-white" /></FormField>
      {existing ? (
        <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" className="accent-primary" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use</label>
      ) : null}
    </FormModal>
  );
}

// ── Pension fund administrators ───────────────────────────────────────────────

function Pfas({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const { data, isLoading, isFetching, isError, refetch } = useGetPensionFundAdministratorsQuery();
  const rows = Array.isArray(data?.data) ? data.data : [];
  const [editing, setEditing] = useState<PensionFundAdministrator | "new" | null>(null);
  const columns: Column<PensionFundAdministrator>[] = [
    { header: "Code", cell: (p) => <span className="font-semibold">{p.code}</span> },
    { header: "Name", cell: (p) => p.name },
    { header: "Status", cell: (p) => <StatusPill status={p.is_active ? "ACTIVE" : "INACTIVE"} /> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mont text-xs text-gray-05">The pension fund administrators staff may choose. A code is fixed once added.</p>
        {canCreate ? <Button onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> Add administrator</Button> : null}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={canUpdate ? setEditing : undefined} emptyTitle="No pension administrators" emptyMessage="Add the licensed pension fund administrators." />
      {editing ? <PfaModal key={editing === "new" ? "new" : editing.id} existing={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function PfaModal({ existing, onClose }: { existing: PensionFundAdministrator | null; onClose: () => void }) {
  const [code, setCode] = useState(existing?.code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [active, setActive] = useState(existing?.is_active ?? true);
  const [create, createState] = useCreatePensionFundAdministratorMutation();
  const [update, updateState] = useUpdatePensionFundAdministratorMutation();
  const codeValid = /^[A-Za-z0-9-]{1,12}$/.test(code.trim());
  const ready = !!name.trim() && (!!existing || codeValid);
  const save = async () => {
    try {
      const res = existing
        ? await update({ id: existing.id, name: name.trim(), is_active: active }).unwrap()
        : await create({ code: code.trim().toUpperCase(), name: name.trim() }).unwrap();
      toast.success(res.message || "Pension administrator saved.");
      onClose();
    } catch { /* central */ }
  };
  return (
    <FormModal open onOpenChange={(open) => (open ? undefined : onClose())} title={existing ? `Change ${existing.name}` : "Add a pension administrator"}
      submitText={existing ? "Save" : "Add"} canSubmit={ready} loading={createState.isLoading || updateState.isLoading} onSubmit={save}>
      <FormField label="Code" required><Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!existing} maxLength={12} placeholder="STANBIC" className="bg-white uppercase" /></FormField>
      <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white" /></FormField>
      {existing ? (
        <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" className="accent-primary" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use</label>
      ) : null}
    </FormModal>
  );
}
