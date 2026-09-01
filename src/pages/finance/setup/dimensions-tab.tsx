// Setup → Dimensions. Analytical axes (e.g. FUND, PROJECT) with a constrained value
// list, tagged per journal line and sliced by the Cost & Dimension Analysis report.
// Upsert-by-code, so the same form creates or edits an axis.
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { DataTable, StatusPill, FormDrawer, FormField, toArray, type Column } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { P } from "@/permissions";
import { useGetDimensionsQuery, useUpsertDimensionMutation } from "@/redux/services/finance/setup-api";
import type { Dimension } from "@/redux/services/finance/setup-types";

export function DimensionsTab({ entity }: { entity: string }) {
  const { data, isLoading, isFetching, isError, refetch } = useGetDimensionsQuery({ entity });
  const dims = toArray<Dimension>(data?.data);
  const [editing, setEditing] = useState<Dimension | null>(null);
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? dims.filter((d) => d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)
      || d.allowed_values.some((v) => v.toLowerCase().includes(q))) : dims;
  }, [dims, search]);

  const columns: Column<Dimension>[] = [
    { header: "Code", cell: (d) => <span className="font-semibold tabular-nums">{d.code}</span> },
    { header: "Name", cell: (d) => d.name },
    { header: "Allowed values", cell: (d) => d.allowed_values.length
      ? <span className="flex flex-wrap gap-1">{d.allowed_values.map((v) => <span key={v} className="rounded bg-gray-02/70 px-1.5 py-0.5 font-mont text-[11px] text-gray-01">{v}</span>)}</span>
      : <span className="text-gray-05">Any value</span> },
    { header: "Status", cell: (d) => <StatusPill status={d.is_active ? "ACTIVE" : "INACTIVE"} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, name or value" className="h-9 w-64 pl-8 font-mont text-sm" />
        </div>
        <Can permission={P.FIN_CREATE_DIMENSION}>
          <Button onClick={() => setCreating(true)} className="h-9 gap-1.5 font-mont text-xs font-semibold"><Plus className="size-3.5" /> New dimension</Button>
        </Can>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(d) => d.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={(d) => setEditing(d)}
        emptyTitle="No dimensions" emptyMessage="Analytical axes (fund, project…) will appear here." />

      <DimensionModal open={creating || !!editing} existing={editing} entity={entity}
        onClose={() => { setCreating(false); setEditing(null); }} />
    </div>
  );
}

function DimensionModal({ open, existing, entity, onClose }: { open: boolean; existing: Dimension | null; entity: string; onClose: () => void }) {
  const [upsert, { isLoading }] = useUpsertDimensionMutation();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [values, setValues] = useState("");
  const [active, setActive] = useState(true);

  // Seed the form from the row being edited (or reset for a new one).
  const [seeded, setSeeded] = useState<number | null>(null);
  const key = existing?.id ?? 0;
  if (open && seeded !== key) {
    setCode(existing?.code ?? "");
    setName(existing?.name ?? "");
    setValues((existing?.allowed_values ?? []).join(", "));
    setActive(existing?.is_active ?? true);
    setSeeded(key);
  }

  const canSubmit = code.trim() !== "" && name.trim() !== "";
  const submit = async () => {
    try {
      const allowed_values = values.split(",").map((v) => v.trim()).filter(Boolean);
      const r = await upsert({ entity, code: code.trim().toUpperCase(), name: name.trim(), allowed_values, is_active: active }).unwrap();
      toast.success(r.message || "Dimension saved.");
      setSeeded(null);
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer open={open} onOpenChange={(o) => { if (!o) { setSeeded(null); onClose(); } }}
      title={existing ? `Edit ${existing.code}` : "New dimension"}
      description="An analytical axis with a constrained value list (leave blank for any value)."
      onSubmit={submit} loading={isLoading} canSubmit={canSubmit} widthClass="sm:max-w-lg">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Code" required><Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!existing} placeholder="e.g. FUND" className={cn("bg-white font-mont", existing && "opacity-60")} /></FormField>
        <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Funding source" className="bg-white" /></FormField>
      </div>
      <FormField label="Allowed values"><Input value={values} onChange={(e) => setValues(e.target.value)} placeholder="GRANT-A, TUITION, INTERNAL" className="bg-white" /></FormField>
      <label className="flex items-center gap-2 font-mont text-xs text-gray-01">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active
      </label>
    </FormDrawer>
  );
}
