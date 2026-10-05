/**
 * Between Branches -> Shared Cost Rules: the school's standing choice for each
 * kind of cost one branch pays on behalf of others.
 *
 * For each cost (the audit fee, the group insurance, the internet) the school
 * decides once whether the paying branch absorbs it or recharges it, and how a
 * recharge splits: by counts given each time, or by fixed percentages kept on
 * the rule (Ikeja 60, Lekki 40). A recharge raised against the rule then uses
 * them.
 *
 * Rules bind every branch, so only a whole-school reader may change them. Mrs
 * Adeyemi, who works at Lekki alone, reads the rules and is told who can change
 * them; the server would refuse her save anyway.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";

import { AccountPicker, DataTable, FormDrawer, FormField, Segmented, toArray, type Column } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateSharedCostRuleMutation, useGetSharedCostRulesQuery, useUpdateSharedCostRuleMutation,
} from "@/redux/services/finance/interbranch-api";
import type { RechargeBasis, SharedCostRule, SharedCostTreatment } from "@/redux/services/finance/interbranch-types";
import { Note, TonePill } from "./parts";
import { readWeights } from "./recharge-model";
import type { InterBranchReader } from "./use-inter-branch";

const TREATMENTS = [["RECHARGE", "Recharge it"], ["ABSORB", "Paying branch absorbs it"]] as const;
const BASES = [["COUNTS", "By counts"], ["PERCENTAGES", "By fixed percentages"]] as const;

export function CostRulesTab({ entity, reader }: { entity: string; reader: InterBranchReader }) {
  const { data, isLoading, isFetching, isError, refetch } = useGetSharedCostRulesQuery({ entity, page_size: 100 });
  const rows = toArray(data?.data);
  const [editing, setEditing] = useState<SharedCostRule | "new" | null>(null);
  const canChange = reader.keys.recharge && reader.reach.wholeSchool;

  const columns: Column<SharedCostRule>[] = [
    { header: "Cost", cell: (r) => <span className="font-semibold text-gray-01">{r.name}</span> },
    { header: "Treatment", cell: (r) => (r.treatment === "ABSORB" ? "Paying branch absorbs it" : "Recharged") },
    { header: "Split", cell: (r) => r.treatment === "ABSORB" ? "-" : r.basis === "COUNTS"
      ? "Counts given each time"
      : r.shares.map((share) => `${share.branch_name} ${share.percent}%`).join(", ") || "Fixed percentages" },
    { header: "Expense account", cell: (r) => r.expense_account_code || "-" },
    { header: "Status", cell: (r) => <TonePill tone={r.is_active ? "good" : "closed"}>{r.is_active ? "In use" : "Not in use"}</TonePill> },
    ...(canChange ? [{
      header: "", align: "right" as const,
      cell: (r: SharedCostRule) => (
        <Button type="button" size="xs" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(r); }} className="gap-1"><Pencil className="size-3" /> Edit</Button>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {canChange ? <span /> : reader.keys.recharge ? (
          <Note>These rules apply to every branch, so only somebody who covers the whole school can change them.</Note>
        ) : <span />}
        {canChange ? <Button onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> New rule</Button> : null}
      </div>
      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        emptyTitle="No shared cost rules" emptyMessage="Decide once, per cost, whether the paying branch absorbs it or recharges it."
      />
      {editing ? <RuleDrawer entity={entity} reader={reader} rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function RuleDrawer({ entity, reader, rule, onClose }: {
  entity: string; reader: InterBranchReader; rule: SharedCostRule | null; onClose: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [treatment, setTreatment] = useState<SharedCostTreatment>(rule?.treatment ?? "RECHARGE");
  const [basis, setBasis] = useState<RechargeBasis>(rule?.basis ?? "COUNTS");
  const [account, setAccount] = useState(rule?.expense_account_code ?? "");
  const [active, setActive] = useState(rule?.is_active ?? true);
  const [inputs, setInputs] = useState<Record<number, string>>(
    Object.fromEntries((rule?.shares ?? []).map((share) => [share.branch_id, String(share.percent)])),
  );
  const [create, { isLoading: creating }] = useCreateSharedCostRuleMutation();
  const [update, { isLoading: updating }] = useUpdateSharedCostRuleMutation();
  const fixed = treatment === "RECHARGE" && basis === "PERCENTAGES";
  const { weights, problem } = fixed ? readWeights("PERCENTAGES", inputs) : { weights: {}, problem: null };
  const canSubmit = !!name.trim() && !problem;

  const submit = async () => {
    const body = {
      entity, name: name.trim(), treatment, basis, expense_account: account || null, is_active: active,
      shares: fixed ? Object.entries(weights).map(([id, bps]) => ({ branch: Number(id), percent: bps / 100 })) : [],
    };
    try {
      const res = rule ? await update({ id: rule.id, ...body }).unwrap() : await create(body).unwrap();
      toast.success(res.message || "Rule saved.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer
      open onOpenChange={(o) => !o && onClose()} title={rule ? `Edit ${rule.name}` : "New shared cost rule"}
      description="Applies to every branch." onSubmit={submit} submitText="Save rule"
      loading={creating || updating} canSubmit={canSubmit}
    >
      <FormField label="Cost" required><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Internet" className="h-9 bg-white" /></FormField>
      <Segmented label="When one branch pays it" value={treatment} onChange={setTreatment} options={TREATMENTS} />
      {treatment === "RECHARGE" ? <Segmented label="Split" value={basis} onChange={setBasis} options={BASES} /> : null}
      {fixed ? (
        <div className="space-y-1.5">
          <div className="divide-y divide-white-02 rounded-md border border-white-02">
            {reader.branches.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 font-mont text-sm text-black-01">{b.name}</span>
                <Input
                  value={inputs[b.id] ?? ""} inputMode="decimal" aria-label={`${b.name} percent`} placeholder="%"
                  onChange={(e) => setInputs((prev) => ({ ...prev, [b.id]: e.target.value }))}
                  className="h-8 w-24 bg-white text-right tabular-nums"
                />
              </div>
            ))}
          </div>
          {problem ? <p className="font-mont text-[11px] text-error">{problem}</p> : null}
        </div>
      ) : treatment === "RECHARGE" ? (
        <Note>Each recharge under this rule asks for the counts (pupils, staff, rooms) at the time.</Note>
      ) : null}
      <FormField label="Expense account">
        <AccountPicker entity={entity} value={account} onChange={setAccount} accountType="EXPENSE" postableOnly activeOnly placeholder="Offered on each recharge" />
      </FormField>
      {rule ? (
        <label className="flex items-center gap-2 font-mont text-sm text-black-01">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use
        </label>
      ) : null}
    </FormDrawer>
  );
}
