// Setup → Tax Codes. Design topology: teaching note, type filter, the rate/rules
// table, and New tax code. Type is derived from the code prefix (VAT/WHT/PAYE…)
// since the model has no type field; Country/Effective columns are omitted (no
// data) rather than faked.
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { DataTable, StatusPill, FormDrawer, FormField, AccountPicker, toArray, type Column } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { P } from "@/permissions";
import { useGetTaxCodesQuery, useUpsertTaxCodeMutation } from "@/redux/services/finance/setup-api";
import type { TaxCode } from "@/redux/services/finance/setup-types";
import { taxCodeFormValues, taxCodeUpsertPayload } from "./tax-code-form";

const selectCls = "h-9 rounded-md border border-white-02 bg-white px-2 font-mont text-sm text-black-01 focus:border-primary focus:outline-none";
const taxType = (code: string) => (code.split(/[-_ ]/)[0] || code).toUpperCase();

export function TaxCodesTab({ entity }: { entity: string }) {
  const { data, isLoading, isFetching, isError, refetch } = useGetTaxCodesQuery({ entity });
  const codes = toArray<TaxCode>(data?.data);
  const { can } = useCan();
  const canEdit = can(P.FIN_CREATE_TAX_CODE);
  const [type, setType] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaxCode | null>(null);
  useActionParam("new", () => { if (canEdit) setCreating(true); });

  const types = useMemo(() => [...new Set(codes.map((c) => taxType(c.code)))].sort(), [codes]);
  const rows = useMemo(() => codes.filter((c) => !type || taxType(c.code) === type), [codes, type]);

  const columns: Column<TaxCode>[] = [
    { header: "Code", cell: (t) => <span className="font-semibold">{t.code}</span> },
    { header: "Name", cell: (t) => t.name },
    { header: "Type", cell: (t) => <span className="rounded bg-pry-01 px-1.5 py-0.5 font-mont text-[10px] font-semibold uppercase text-primary">{taxType(t.code)}</span> },
    { header: "Rate", align: "right", cell: (t) => <span className="tabular-nums">{(t.rate_bps / 100).toFixed(2)}%</span> },
    { header: "Recoverable", cell: (t) => (t.is_recoverable ? "Yes" : "No") },
    { header: "Collected a/c", cell: (t) => t.collected_account ?? "-" },
    { header: "Paid a/c", cell: (t) => t.paid_account ?? "-" },
    { header: "Status", cell: (t) => <StatusPill status={t.is_active ? "ACTIVE" : "INACTIVE"} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls} aria-label="Tax type">
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Can permission={P.FIN_CREATE_TAX_CODE}>
          <Button onClick={() => setCreating(true)} className="h-9 gap-1.5 font-mont text-xs font-semibold"><Plus className="size-3.5" /> New tax code</Button>
        </Can>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(t) => t.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={canEdit ? setEditing : undefined}
        cardBreakpoint="lg"
        emptyTitle="No tax codes" emptyMessage="VAT / WHT and other tax codes will appear here." />

      {(creating || editing) && (
        <TaxCodeModal key={editing?.id ?? "new"} existing={editing} entity={entity}
          onClose={() => { setCreating(false); setEditing(null); }} />
      )}
    </div>
  );
}

function TaxCodeModal({ existing, onClose, entity }: { existing: TaxCode | null; onClose: () => void; entity: string }) {
  const [upsert, { isLoading }] = useUpsertTaxCodeMutation();
  const initial = taxCodeFormValues(existing);
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [pct, setPct] = useState(initial.percentage);
  const [recoverable, setRecoverable] = useState(initial.recoverable);
  const [collected, setCollected] = useState(initial.collectedAccount);
  const [paid, setPaid] = useState(initial.paidAccount);
  const [active, setActive] = useState(initial.active);

  const canSubmit = code.trim() !== "" && name.trim() !== "" && pct !== "" && Number(pct) >= 0;

  const submit = async () => {
    try {
      const r = await upsert(taxCodeUpsertPayload(entity, {
        code, name, percentage: pct, recoverable,
        collectedAccount: collected, paidAccount: paid, active,
      })).unwrap();
      toast.success(r.message || "Tax code saved.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer open onOpenChange={(o) => !o && onClose()} title={existing ? `Edit ${existing.code}` : "New tax code"}
      description="Define a rate and the GL accounts it books to." onSubmit={submit}
      loading={isLoading} canSubmit={canSubmit} widthClass="sm:max-w-lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Code" required><Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!existing} placeholder="e.g. VAT-7.5" className="bg-white font-mont" /></FormField>
        <FormField label="Rate (%)" required><Input value={pct} onChange={(e) => setPct(e.target.value)} type="number" step="0.01" placeholder="7.5" className="bg-white font-mont" /></FormField>
      </div>
      <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VAT 7.5%" className="bg-white" /></FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Collected a/c (output)"><AccountPicker entity={entity} value={collected} onChange={setCollected} placeholder="None" /></FormField>
        <FormField label="Paid a/c (input)"><AccountPicker entity={entity} value={paid} onChange={setPaid} placeholder="None" /></FormField>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 font-mont text-sm text-gray-01">
          <input type="checkbox" checked={recoverable} onChange={(e) => setRecoverable(e.target.checked)} className="accent-primary" /> Recoverable (input tax offsets output)
        </label>
        <label className="flex items-center gap-2 font-mont text-sm text-gray-01">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active
        </label>
      </div>
    </FormDrawer>
  );
}
