/**
 * Between Branches -> Recharges: a cost one branch paid, shared with the
 * branches it served.
 *
 * The paying branch keeps its own share of the expense and is owed every other
 * branch's share; each owing branch books its share as its own expense. No
 * money moves: the owing branch repays with a cash transfer later. A recharge
 * is split by counts given when it is raised (pupils per branch, say) or by
 * fixed percentages, typed in or taken from a shared cost rule.
 *
 * A branch-bound reader sees the shares of their own branches only, unless they
 * work in the paying branch. Voiding reverses every share, so it needs somebody
 * who works in every branch the recharge touched.
 */

import { useState } from "react";
import { toast } from "sonner";
import { skipToken } from "@reduxjs/toolkit/query";
import { Ban, Plus } from "lucide-react";

import {
  AccountPicker, ConfirmActionModal, DataTable, DetailDrawer, FormDrawer, FormField, Money, MoneyInput,
  PostingDateField, RaisingBranchChoiceField, Segmented, toArray, useRaisingBranchChoice, type Column,
} from "@/components/finance-ui";
import { ErrorState, LoadingState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useSourceDocumentParam } from "@/lib/source-document-route";
import { formatMoney } from "@/utils/money";
import {
  useCreateRechargeMutation, useGetRechargeQuery, useGetRechargesQuery, useGetSharedCostRulesQuery, useVoidRechargeMutation,
} from "@/redux/services/finance/interbranch-api";
import type { Recharge, RechargeBasis, SharedCostRule } from "@/redux/services/finance/interbranch-types";
import { useDates } from "../../../lib/display-prefs";
import { Fact, Note, TonePill } from "./parts";
import { readWeights, sharesSomething, splitByWeight, weightsBody } from "./recharge-model";
import type { InterBranchReader } from "./use-inter-branch";

const BASES = [["COUNTS", "By counts"], ["PERCENTAGES", "By fixed percentages"]] as const;

/** The branches whose books voiding `r` changes: the payer and every owing branch. */
export function rechargeBranches(r: Recharge): number[] {
  return [r.branch_id, ...r.lines.filter((line) => line.transfer_id).map((line) => line.branch_id)];
}

function weightText(r: Pick<Recharge, "basis">, weight: number): string {
  return r.basis === "PERCENTAGES" ? `${weight / 100}%` : String(weight);
}

export function RechargesTab({ entity, currency, reader }: { entity: string; currency?: string | null; reader: InterBranchReader }) {
  const dates = useDates();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const [raising, setRaising] = useState(false);
  useSourceDocumentParam(setOpen);
  const { data, isLoading, isFetching, isError, refetch } = useGetRechargesQuery({ entity, page, page_size: 25 });
  const rows = toArray(data?.data);

  const columns: Column<Recharge>[] = [
    { header: "Number", cell: (r) => <span className="font-semibold tabular-nums text-gray-01">{r.document_number}</span> },
    { header: "Date", cell: (r) => <span className="tabular-nums text-gray-05">{dates.day(r.recharge_date, r.branch_id)}</span> },
    { header: "Paid by", cell: (r) => r.branch_name },
    { header: "Cost", cell: (r) => r.narration },
    { header: "Whole cost", align: "right", cell: (r) => <Money kobo={r.amount} currency={currency} align="right" /> },
    { header: "Status", cell: (r) => <TonePill tone={r.status === "REVERSED" ? "closed" : "good"}>{r.status === "REVERSED" ? "Voided" : "Booked"}</TonePill> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {reader.keys.recharge ? (
          <Button onClick={() => setRaising(true)} className="gap-1.5"><Plus className="size-4" /> Recharge a shared cost</Button>
        ) : null}
      </div>
      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={(r) => setOpen(r.id)}
        page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage}
        emptyTitle="No recharges" emptyMessage="A cost one branch pays for others, shared out, shows here."
      />
      <RechargeDrawer id={open} entity={entity} currency={currency} reader={reader} onClose={() => setOpen(null)} />
      {raising ? <RaiseRechargeDrawer entity={entity} currency={currency} reader={reader} onClose={() => setRaising(false)} /> : null}
    </div>
  );
}

function RechargeDrawer({ id, entity, currency, reader, onClose }: {
  id: number | null; entity: string; currency?: string | null; reader: InterBranchReader; onClose: () => void;
}) {
  const dates = useDates();
  const { data, isLoading, isError, refetch } = useGetRechargeQuery(id ? { id, entity } : skipToken);
  const r = id ? data?.data : undefined;
  const [voiding, setVoiding] = useState(false);
  const mayVoid = !!r && r.status === "POSTED" && reader.keys.reverse && reader.reach.covers(rechargeBranches(r));

  return (
    <>
      <DetailDrawer
        open={id != null} onOpenChange={(o) => (o ? undefined : onClose())}
        title={r?.document_number ?? "Recharge"} description={r ? `${r.narration} · paid by ${r.branch_name}` : undefined}
        widthClass="sm:max-w-lg"
        footer={mayVoid ? (
          <Button variant="outline" onClick={() => setVoiding(true)} className="gap-1.5 text-destructive hover:text-destructive"><Ban className="size-4" /> Void recharge</Button>
        ) : undefined}
      >
        {isLoading ? <LoadingState rows={5} /> : isError || !r ? <ErrorState onRetry={refetch} /> : (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-3 rounded-md border border-white-02 p-4 sm:grid-cols-2">
              <Fact label="Whole cost"><Money kobo={r.amount} currency={currency} /></Fact>
              <Fact label="Date">{dates.day(r.recharge_date, r.branch_id)}</Fact>
              <Fact label="Expense account">{r.expense_account_code}</Fact>
              <Fact label="Split">{r.basis === "PERCENTAGES" ? "Fixed percentages" : "Counts"}</Fact>
              {r.reference ? <Fact label="Reference">{r.reference}</Fact> : null}
            </dl>
            <section className="space-y-1.5">
              <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Shares</p>
              <div className="divide-y divide-white-02 rounded-md border border-white-02">
                {r.lines.map((line) => (
                  <div key={line.branch_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-mont text-sm text-black-01">{line.branch_name}</p>
                      <p className="font-mont text-[11px] text-gray-05">
                        {weightText(r, line.weight)} · {line.transfer_id ? `owes ${r.branch_name}` : "kept by the paying branch"}
                      </p>
                    </div>
                    <Money kobo={line.amount} currency={currency} />
                  </div>
                ))}
              </div>
            </section>
            {r.status === "POSTED" && reader.keys.reverse && !mayVoid ? (
              <Note tone="warn">Voiding this recharge changes every sharing branch's books, so it needs somebody who works in all of them.</Note>
            ) : null}
          </div>
        )}
      </DetailDrawer>
      {r && voiding ? <VoidRechargeDialog recharge={r} entity={entity} currency={currency} onClose={() => setVoiding(false)} /> : null}
    </>
  );
}

function VoidRechargeDialog({ recharge, entity, currency, onClose }: {
  recharge: Recharge; entity: string; currency?: string | null; onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [voidRecharge, { isLoading }] = useVoidRechargeMutation();
  const submit = async () => {
    try {
      const res = await voidRecharge({ id: recharge.id, entity, date: date || undefined }).unwrap();
      toast.success(res.message || "Recharge voided.");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal
      open onOpenChange={(o) => !o && onClose()} loading={isLoading} onConfirm={submit} destructive
      title={`Void ${recharge.document_number}?`}
      description={`Reverses every branch's share of the ${formatMoney(recharge.amount, currency)} ${recharge.narration}, and what each owes ${recharge.branch_name} for it.`}
      confirmText="Void recharge"
    >
      <FormField label="Date the reversal">
        <DatePickerInput value={date} onChange={(e) => setDate(e.target.value)} className="bg-white" />
      </FormField>
    </ConfirmActionModal>
  );
}

function RaiseRechargeDrawer({ entity, currency, reader, onClose }: {
  entity: string; currency?: string | null; reader: InterBranchReader; onClose: () => void;
}) {
  const payer = useRaisingBranchChoice();
  const rulesQ = useGetSharedCostRulesQuery({ entity, page_size: 100 });
  const rules = toArray(rulesQ.data?.data).filter((rule) => rule.is_active);
  const [ruleId, setRuleId] = useState("");
  const rule = rules.find((r) => String(r.id) === ruleId);
  const [basis, setBasis] = useState<RechargeBasis>("COUNTS");
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState("");
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [create, { isLoading }] = useCreateRechargeMutation();

  const pickRule = (next: string) => {
    setRuleId(next);
    const chosen = rules.find((r) => String(r.id) === next);
    if (!chosen) return;
    setBasis(chosen.basis);
    if (chosen.basis === "PERCENTAGES") {
      setInputs(Object.fromEntries(chosen.shares.map((share) => [share.branch_id, String(share.percent)])));
    }
    if (!narration.trim()) setNarration(chosen.name);
  };

  const { weights, problem } = readWeights(basis, inputs);
  const shares = problem ? {} : splitByWeight(amount, weights);
  const payerId = payer.branchId;
  const absorbed = rule?.treatment === "ABSORB";
  const noOneOwes = !problem && amount > 0 && !sharesSomething(shares, payerId);
  const needsAccount = !(rule?.expense_account_code);
  const canSubmit = payer.ready && amount > 0 && !!narration.trim() && !problem && !absorbed && !noOneOwes && (!needsAccount || !!account);

  const submit = async () => {
    try {
      const res = await create({
        entity, amount, narration: narration.trim(), recharge_date: date || undefined,
        expense_account: account || undefined, rule: rule ? rule.id : undefined, basis,
        weights: weightsBody(basis, weights), reference: reference.trim() || undefined,
        ...payer.body("branch"),
      }).unwrap();
      toast.success(res.message || "Recharge booked.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer
      open onOpenChange={(o) => !o && onClose()} title="Recharge a shared cost"
      description="The paying branch keeps its own share and is owed the others'."
      widthClass="sm:max-w-xl" onSubmit={submit} submitText="Book recharge" loading={isLoading} canSubmit={canSubmit}
    >
      <RaisingBranchChoiceField choice={payer} label="Paid by" />
      {rules.length ? (
        <FormField label="Shared cost rule">
          <NativeSelect value={ruleId} onChange={(e) => pickRule(e.target.value)} aria-label="Shared cost rule">
            <option value="">None, split it by hand</option>
            {rules.map((r: SharedCostRule) => <option key={r.id} value={String(r.id)}>{r.name}{r.treatment === "ABSORB" ? " (absorbed, not recharged)" : ""}</option>)}
          </NativeSelect>
        </FormField>
      ) : null}
      {absorbed ? <Note tone="warn">{`The school has chosen that the paying branch absorbs ${rule!.name}, so it is not recharged. Change the rule to recharge it first.`}</Note> : null}
      <FormField label="What the cost was" required><Input value={narration} maxLength={255} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. Internet, September" className="h-9 bg-white" /></FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Whole cost" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" /></FormField>
        <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
      </div>
      <FormField label="Expense account" required={needsAccount}>
        <AccountPicker entity={entity} value={account} onChange={setAccount} accountType="EXPENSE" postableOnly activeOnly placeholder={rule?.expense_account_code ? `The rule's ${rule.expense_account_code}` : "5xxx"} />
      </FormField>
      <Segmented label="Split" value={basis} onChange={(v) => { setBasis(v); setInputs({}); }} options={BASES} />
      <div className="divide-y divide-white-02 rounded-md border border-white-02">
        {reader.branches.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="min-w-0 basis-full font-mont text-sm text-black-01 sm:basis-0 sm:flex-1">{b.name}{b.id === payerId ? <span className="text-gray-05"> (pays)</span> : null}</span>
            <Input
              value={inputs[b.id] ?? ""} inputMode="decimal" aria-label={`${b.name} ${basis === "PERCENTAGES" ? "percent" : "count"}`}
              onChange={(e) => setInputs((prev) => ({ ...prev, [b.id]: e.target.value }))}
              placeholder={basis === "PERCENTAGES" ? "%" : "Count"} className="h-8 w-24 bg-white text-right tabular-nums"
            />
            <span className="ml-auto w-32 text-right"><Money kobo={shares[b.id] ?? 0} currency={currency} align="right" /></span>
          </div>
        ))}
      </div>
      {problem && Object.keys(inputs).some((k) => inputs[Number(k)]?.trim()) ? <p className="font-mont text-[11px] text-error">{problem}</p> : null}
      {noOneOwes ? <p className="font-mont text-[11px] text-error">No other branch takes a share of this cost.</p> : null}
      <FormField label="Reference"><Input value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} className="h-9 bg-white" /></FormField>
    </FormDrawer>
  );
}
