/**
 * Setup → Tax Codes. Design topology: teaching note, type filter, the rate/rules
 * table, and New tax code. Type is derived from the code prefix (VAT/WHT/PAYE…)
 * since the model has no type field; Country/Effective columns are omitted (no
 * data) rather than faked.
 *
 * Each code states its VAT treatment: standard rated (charges its rate), zero
 * rated or exempt (both charge nothing, and the rate field is locked at zero).
 *
 * A tax code binds every branch at once, so the server refuses a create or an
 * edit from a reader whose reach is one branch, even with the create key
 * (`SHARED_RECORD_READ_ONLY`). New tax code and editing a row are therefore
 * offered only to a key holder who covers the whole school; a branch's own
 * bursar still reads every code, as the tax picker on each line needs.
 */
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { AccessField, DataTable, StatusPill, FormDrawer, FormField, AccountPicker, toArray, useFieldAccess, type Column } from "@/components/finance-ui";
import { useWholeSchoolAccess } from "@/components/finance-ui/whole-school-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { P } from "../../../permissions";
import { useGetTaxCodesQuery, useUpsertTaxCodeMutation } from "@/redux/services/finance/setup-api";
import type { TaxCode } from "@/redux/services/finance/setup-types";
import { taxCodeFormValid, taxCodeFormValues, taxCodeUpsertPayload, zeroRateHint } from "./tax-code-form";
import { TAX_TREATMENTS, treatmentLabel } from "../../../utils/tax-treatment";
import type { TaxTreatment } from "@/redux/services/finance/setup-types";

const selectCls = "h-9 rounded-md border border-white-02 bg-white px-2 font-mont text-sm text-black-01 focus:border-primary focus:outline-none";
const taxType = (code: string) => (code.split(/[-_ ]/)[0] || code).toUpperCase();

export function TaxCodesTab({ entity }: { entity: string }) {
  const access = useFieldAccess("finance.taxcode");
  const { data, isLoading, isFetching, isError, refetch } = useGetTaxCodesQuery({ entity });
  const codes = toArray<TaxCode>(data?.data);
  const { canWholeSchool } = useWholeSchoolAccess();
  const canEdit = canWholeSchool(P.FIN_CREATE_TAX_CODE);
  const [type, setType] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaxCode | null>(null);
  useActionParam("new", canEdit, () => { if (canEdit) setCreating(true); });

  const types = useMemo(() => [...new Set(codes.map((c) => taxType(c.code)))].sort(), [codes]);
  const rows = useMemo(() => codes.filter((c) => !type || taxType(c.code) === type), [codes, type]);

  const columns: Column<TaxCode>[] = [
    { header: "Code", cell: (t) => <span className="font-semibold">{t.code}</span> },
    { header: "Name", cell: (t) => t.name },
    { header: "Type", cell: (t) => <span className="rounded bg-pry-01 px-1.5 py-0.5 font-mont text-[10px] font-semibold uppercase text-primary">{taxType(t.code)}</span> },
    ...(!access.isHidden("rate_bps") ? [{ header: "Rate", align: "right" as const, cell: (t: TaxCode) => <span className="tabular-nums">{(t.rate_bps / 100).toFixed(2)}%</span> }] : []),
    ...(!access.isHidden("treatment") && !access.isHidden("rate_bps") ? [{ header: "Treatment", cell: (t: TaxCode) => treatmentLabel(t.treatment, t.rate_bps) }] : []),
    ...(!access.isHidden("is_recoverable") ? [{ header: "Recoverable", cell: (t: TaxCode) => (t.is_recoverable ? "Yes" : "No") }] : []),
    ...(!access.isHidden("collected_account") ? [{ header: "Collected a/c", cell: (t: TaxCode) => t.collected_account ?? "-" }] : []),
    ...(!access.isHidden("paid_account") ? [{ header: "Paid a/c", cell: (t: TaxCode) => t.paid_account ?? "-" }] : []),
    ...(!access.isHidden("is_active") ? [{ header: "Status", cell: (t: TaxCode) => <StatusPill status={t.is_active ? "ACTIVE" : "INACTIVE"} /> }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls} aria-label="Tax type">
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {canEdit ? (
          <Button onClick={() => setCreating(true)} className="h-9 gap-1.5 font-mont text-xs font-semibold"><Plus className="size-3.5" /> New tax code</Button>
        ) : null}
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(t) => t.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={canEdit ? setEditing : undefined}
        cardBreakpoint="lg"
        emptyTitle="No tax codes" emptyMessage="VAT, WHT (withholding tax) and other tax codes will appear here." />

      {(creating || editing) && (
        <TaxCodeModal key={editing?.id ?? "new"} existing={editing} entity={entity}
          onClose={() => { setCreating(false); setEditing(null); }} />
      )}
    </div>
  );
}

function TaxCodeModal({ existing, onClose, entity }: { existing: TaxCode | null; onClose: () => void; entity: string }) {
  const access = useFieldAccess("finance.taxcode", existing);
  const [upsert, { isLoading }] = useUpsertTaxCodeMutation();
  const initial = taxCodeFormValues(existing);
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [treatment, setTreatment] = useState<TaxTreatment>(initial.treatment);
  const [pct, setPct] = useState(initial.percentage);
  const standard = treatment === "STANDARD";
  const [recoverable, setRecoverable] = useState(initial.recoverable);
  const [collected, setCollected] = useState(initial.collectedAccount);
  const [paid, setPaid] = useState(initial.paidAccount);
  const [active, setActive] = useState(initial.active);

  const canSubmit = taxCodeFormValid({ code, name, treatment, percentage: pct, recoverable, collectedAccount: collected, paidAccount: paid, active });

  const submit = async () => {
    try {
      const payload = taxCodeUpsertPayload(entity, {
        code, name, treatment, percentage: pct, recoverable,
        collectedAccount: collected, paidAccount: paid, active,
      });
      const r = await upsert({ entity: payload.entity, code: payload.code, name: payload.name,
        ...access.writableOnly({
          treatment: payload.treatment, rate_bps: payload.rate_bps,
          is_recoverable: payload.is_recoverable,
          collected_account: payload.collected_account,
          paid_account: payload.paid_account, is_active: payload.is_active,
        }, { creating: !existing }) }).unwrap();
      toast.success(r.message || "Tax code saved.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer open onOpenChange={(o) => !o && onClose()} title={existing ? `Edit ${existing.code}` : "New tax code"}
      description="Define a rate and the accounts it books to." onSubmit={submit}
      loading={isLoading} canSubmit={canSubmit} widthClass="sm:max-w-lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Code" required><Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!existing} placeholder="e.g. VAT-7.5" className="bg-white font-mont" /></FormField>
        <AccessField access={access} name="treatment" creating={!existing}><FormField label="Treatment" required>
          <select value={treatment} onChange={(e) => setTreatment(e.target.value as TaxTreatment)} className={`${selectCls} w-full`} aria-label="Treatment">
            {TAX_TREATMENTS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </FormField></AccessField>
      </div>
      <AccessField access={access} name="rate_bps" creating={!existing}><FormField label="Rate (%)" required={standard}>
        <Input value={standard ? pct : "0"} onChange={(e) => setPct(e.target.value)} type="number" step="0.01" placeholder="7.5" disabled={!standard} className="bg-white font-mont disabled:opacity-60" />
        {!standard ? <span className="mt-1 block font-mont text-[11px] text-gray-05">{zeroRateHint(treatment)}</span> : null}
      </FormField></AccessField>
      <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VAT 7.5%" className="bg-white" /></FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AccessField access={access} name="collected_account" creating={!existing}><FormField label="Collected a/c (output)"><AccountPicker entity={entity} value={collected} onChange={setCollected} placeholder="None" /></FormField></AccessField>
        <AccessField access={access} name="paid_account" creating={!existing}><FormField label="Paid a/c (input)"><AccountPicker entity={entity} value={paid} onChange={setPaid} placeholder="None" /></FormField></AccessField>
      </div>
      <div className="space-y-2">
        <AccessField access={access} name="is_recoverable" creating={!existing}><label className="flex items-center gap-2 font-mont text-sm text-gray-01">
          <input type="checkbox" checked={recoverable} onChange={(e) => setRecoverable(e.target.checked)} className="accent-primary" /> Recoverable (input tax offsets output)
        </label></AccessField>
        <AccessField access={access} name="is_active" creating={!existing}><label className="flex items-center gap-2 font-mont text-sm text-gray-01">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active
        </label></AccessField>
      </div>
    </FormDrawer>
  );
}
