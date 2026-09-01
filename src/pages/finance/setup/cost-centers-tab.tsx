// Setup → Cost Centers. Design topology: cost-centre table (branch derived from
// the code prefix) with a New cost centre form. "Owner" is omitted (no field).
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { DataTable, StatusPill, FormDrawer, FormField, toArray, type Column } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { P } from "@/permissions";
import { useGetCostCentersQuery, useCreateCostCenterMutation } from "@/redux/services/finance/setup-api";
import type { CostCenter } from "@/redux/services/finance/setup-types";

const selectCls = "h-9 rounded-md border border-white-02 bg-white px-2 font-mont text-sm text-black-01 focus:border-primary focus:outline-none";
// CC-LAG-FAC → LAG (branch segment); CC-HQ-IT → HQ.
const branchOf = (code: string) => { const p = code.split(/[-_]/); return (p[1] || "").toUpperCase(); };

export function CostCentersTab({ entity }: { entity: string }) {
  const { data, isLoading, isFetching, isError, refetch } = useGetCostCentersQuery({ entity });
  const centres = toArray<CostCenter>(data?.data);
  const [branch, setBranch] = useState("");
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));

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
      <div className="flex items-center justify-between">
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
        emptyTitle="No cost centres" emptyMessage="Cost centres will appear here." />

      <NewCostCentreModal open={creating} onClose={() => setCreating(false)} entity={entity} parents={centres} />
    </div>
  );
}

function NewCostCentreModal({ open, onClose, entity, parents }: { open: boolean; onClose: () => void; entity: string; parents: CostCenter[] }) {
  const [create, { isLoading }] = useCreateCostCenterMutation();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const canSubmit = code.trim() !== "" && name.trim() !== "";

  const submit = async () => {
    try {
      const r = await create({ entity, code: code.trim().toUpperCase(), name: name.trim(), parent: parent || undefined }).unwrap();
      toast.success(r.message || "Cost centre saved.");
      setCode(""); setName(""); setParent("");
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer open={open} onOpenChange={(o) => !o && onClose()} title="New cost centre"
      description="Tag spend by department or branch." onSubmit={submit}
      loading={isLoading} canSubmit={canSubmit} widthClass="sm:max-w-lg">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Code" required><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. CC-LAG-FAC" className="bg-white font-mont" /></FormField>
        <FormField label="Parent">
          <select value={parent} onChange={(e) => setParent(e.target.value)} className={`${selectCls} w-full`}>
            <option value="">None</option>
            {parents.map((c) => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lekki - Facilities" className="bg-white" /></FormField>
    </FormDrawer>
  );
}
