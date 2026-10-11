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

import {
  AccessField, AccountPicker, DataTable, FormDrawer, Segmented, fieldWriteErrors,
  toArray, useFieldAccess, type Column, type FieldErrors,
} from "@/components/finance-ui";
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
  const access = useFieldAccess("finance.interbranch");
  const { data, isLoading, isFetching, isError, refetch } = useGetSharedCostRulesQuery({ entity, page_size: 100 });
  const rows = toArray(data?.data);
  const [editing, setEditing] = useState<SharedCostRule | "new" | null>(null);
  const canChange = reader.keys.recharge && reader.reach.wholeSchool;
  const canEdit = canChange && !["name", "treatment", "basis"].some((name) => access.isReadOnly(name, { creating: false }));
  const canCreate = canChange && !["name", "treatment", "basis"].some((name) => access.isReadOnly(name, { creating: true }));

  const columns: Column<SharedCostRule>[] = [
    ...(!access.isHidden("name") ? [{ header: "Cost", cell: (r: SharedCostRule) => <span className="font-semibold text-gray-01">{r.name}</span> }] : []),
    ...(!access.isHidden("treatment") ? [{ header: "Treatment", cell: (r: SharedCostRule) => (r.treatment === "ABSORB" ? "Paying branch absorbs it" : "Recharged") }] : []),
    ...(!access.isHidden("basis") && !access.isHidden("shares") ? [{ header: "Split", cell: (r: SharedCostRule) => r.treatment === "ABSORB" ? "-" : r.basis === "COUNTS"
      ? "Counts given each time"
      : r.shares.map((share) => `${share.branch_name} ${share.percent}%`).join(", ") || "Fixed percentages" }] : []),
    ...(!access.isHidden("expense_account_code") ? [{ header: "Expense account", cell: (r: SharedCostRule) => r.expense_account_code || "-" }] : []),
    ...(!access.isHidden("is_active") ? [{ header: "Status", cell: (r: SharedCostRule) => <TonePill tone={r.is_active ? "good" : "closed"}>{r.is_active ? "In use" : "Not in use"}</TonePill> }] : []),
    ...(canEdit ? [{
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
        {canCreate ? <Button onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> New rule</Button> : null}
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
  const access = useFieldAccess("finance.interbranch", rule);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
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
    const body = access.writableOnly({
      entity, name: name.trim(), treatment, basis, expense_account: account || null, is_active: active,
      shares: fixed ? Object.entries(weights).map(([id, bps]) => ({ branch: Number(id), percent: bps / 100 })) : [],
    }, { creating: !rule });
    try {
      const res = rule ? await update({ id: rule.id, ...body }).unwrap() : await create(body).unwrap();
      toast.success(res.message || "Rule saved.");
      onClose();
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  return (
    <FormDrawer
      open onOpenChange={(o) => !o && onClose()} title={rule ? `Edit ${rule.name}` : "New shared cost rule"}
      description="Applies to every branch." onSubmit={submit} submitText="Save rule"
      loading={creating || updating} canSubmit={canSubmit}
    >
      <AccessField access={access} name="name" label="Cost" required creating={!rule} errors={denied}><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Internet" className="h-9 bg-white" /></AccessField>
      <AccessField access={access} name="treatment" creating={!rule} errors={denied}><Segmented label="When one branch pays it" value={treatment} onChange={setTreatment} options={TREATMENTS} /></AccessField>
      {treatment === "RECHARGE" ? <AccessField access={access} name="basis" creating={!rule} errors={denied}><Segmented label="Split" value={basis} onChange={setBasis} options={BASES} /></AccessField> : null}
      {fixed && !access.isHidden("shares", { creating: !rule }) ? (
        <AccessField access={access} name="shares" creating={!rule} errors={denied}>
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
        </AccessField>
      ) : treatment === "RECHARGE" ? (
        <Note>Each recharge under this rule asks for the counts (pupils, staff, rooms) at the time.</Note>
      ) : null}
      <AccessField access={access} name="expense_account" label="Expense account" creating={!rule} errors={denied}>
        <AccountPicker entity={entity} value={account} onChange={setAccount} accountType="EXPENSE" postableOnly activeOnly placeholder="Offered on each recharge" />
      </AccessField>
      {rule ? (
        <AccessField access={access} name="is_active" errors={denied}>
        <label className="flex items-center gap-2 font-mont text-sm text-black-01">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use
        </label>
        </AccessField>
      ) : null}
    </FormDrawer>
  );
}
