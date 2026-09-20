/**
 * Cost centre setup for one finance entity.
 *
 * The endpoint uses the code as its upsert key, so the same form creates and
 * edits a centre. Deactivation preserves historical journal references while
 * keeping the centre out of active use.
 */
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { DataTable, StatusPill, FormDrawer, FormField, toArray, type Column } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { P } from "../../../permissions";
import { useGetCostCentersQuery, useCreateCostCenterMutation } from "@/redux/services/finance/setup-api";
import type { CostCenter } from "@/redux/services/finance/setup-types";
import { costCenterFormValues, costCenterUpsertPayload } from "./cost-center-form";

const selectCls = "h-9 rounded-md border border-white-02 bg-white px-2 font-mont text-sm text-black-01 focus:border-primary focus:outline-none";
// CC-LAG-FAC → LAG (branch segment); CC-HQ-IT → HQ.
const branchOf = (code: string) => { const p = code.split(/[-_]/); return (p[1] || "").toUpperCase(); };

export function CostCentersTab({ entity }: { entity: string }) {
  const { data, isLoading, isFetching, isError, refetch } = useGetCostCentersQuery({ entity });
  const centres = toArray<CostCenter>(data?.data);
  const [branch, setBranch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const { can } = useCan();
  const canEdit = can(P.FIN_CREATE_COST_CENTER);
  useActionParam("new", canEdit, () => setCreating(true));

  const branches = useMemo(() => [...new Set(centres.map((c) => branchOf(c.code)).filter(Boolean))].sort(), [centres]);
  const rows = useMemo(() => centres.filter((c) => !branch || branchOf(c.code) === branch), [centres, branch]);

  const columns: Column<CostCenter>[] = [
    { header: "Code", cell: (c) => <span className="font-semibold">{c.code}</span> },
    { header: "Name", cell: (c) => c.name },
    { header: "Branch", cell: (c) => branchOf(c.code) ? <span className="rounded bg-pry-01 px-1.5 py-0.5 font-mont text-[10px] font-semibold uppercase text-primary">{branchOf(c.code)}</span> : "-" },
    { header: "Parent", cell: (c) => c.parent_code ?? "-" },
    { header: "Status", cell: (c) => <StatusPill status={c.is_active ? "ACTIVE" : "INACTIVE"} /> },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className={selectCls} aria-label="Branch">
          <option value="">All branches</option>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <Can permission={P.FIN_CREATE_COST_CENTER}>
          <Button onClick={() => setCreating(true)} className="h-9 gap-1.5 font-mont text-xs font-semibold"><Plus className="size-3.5" /> New cost centre</Button>
        </Can>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(c) => c.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={canEdit ? setEditing : undefined}
        cardBreakpoint="lg"
        emptyTitle="No cost centres" emptyMessage="Cost centres will appear here." />

      {(creating || editing) && (
        <CostCentreModal
          key={editing?.id ?? "new"}
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          entity={entity}
          parents={centres}
        />
      )}
    </div>
  );
}

function CostCentreModal({ existing, onClose, entity, parents }: { existing: CostCenter | null; onClose: () => void; entity: string; parents: CostCenter[] }) {
  const [create, { isLoading }] = useCreateCostCenterMutation();
  const initial = costCenterFormValues(existing);
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [parent, setParent] = useState(initial.parent);
  const [active, setActive] = useState(initial.active);
  const canSubmit = code.trim() !== "" && name.trim() !== "";

  const submit = async () => {
    try {
      const r = await create(costCenterUpsertPayload(entity, {
        code,
        name,
        parent,
        active,
      })).unwrap();
      toast.success(r.message || "Cost centre saved.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer open onOpenChange={(o) => !o && onClose()} title={existing ? `Edit ${existing.code}` : "New cost centre"}
      description="Tag spend by department or branch." onSubmit={submit}
      loading={isLoading} canSubmit={canSubmit} widthClass="sm:max-w-lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Code" required><Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!existing} placeholder="e.g. CC-LAG-FAC" className="bg-white font-mont" /></FormField>
        <FormField label="Parent">
          <select value={parent} onChange={(e) => setParent(e.target.value)} className={`${selectCls} w-full`}>
            <option value="">None</option>
            {parents.filter((centre) => centre.id !== existing?.id).map((c) => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lekki - Facilities" className="bg-white" /></FormField>
      <label className="flex items-center gap-2 font-mont text-sm text-gray-01">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active
      </label>
    </FormDrawer>
  );
}
