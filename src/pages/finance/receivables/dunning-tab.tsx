// Receivables → Dunning / Reminders. Rebuilt to the Vision prototype in the house
// theme: aging-bucket KPIs, a Reminder-queue tab (notices + the active cadence) and
// a Policies tab with a full cadence editor (create/edit policies + stages).
//
// "Run reminders now" / "Generate notices" raise the queue of notices (no GL
// effect); Send dispatches one notice over its stage's channels and flips it to
// SENT; Cancel withdraws it before it goes out. Send emails a customer, so it
// confirms first and never fires straight off a row click.
//
// A stage's channel is one or more of Email / In-app, stored comma-separated.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Play, SlidersHorizontal, Trash2, Pencil, Ban, Send } from "lucide-react";
import { ConfirmActionModal, DataTable, toArray, type Column } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { DetailDrawer, FormField } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "@/permissions";
import {
  useGetDunningNoticesQuery, useGetDunningSummaryQuery, useGetDunningPoliciesQuery,
  useGenerateDunningMutation, useCancelDunningNoticeMutation, useSendDunningNoticeMutation,
  useCreateDunningPolicyMutation, useUpdateDunningPolicyMutation,
} from "@/redux/services/finance/ar-api";
import type { DunningNotice, DunningPolicy, DunningStage } from "@/redux/services/finance/ar-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const CHANNELS: [string, string][] = [["EMAIL", "Email"], ["IN_APP", "In-app"]];
// A stage's channel is one or more values, comma-separated (e.g. "EMAIL,IN_APP").
const channelLabel = (c: string) => c.split(",").filter(Boolean).map((p) => CHANNELS.find(([v]) => v === p)?.[1] ?? p).join(" + ") || "-";
const whenLabel = (d: number) => (d <= 0 ? "On due date" : `+${d} days`);
// Overdue severity colour (aligned with the aging buckets).
const overdueCls = (d: number) => d >= 60 ? "text-destructive font-semibold" : d >= 31 ? "text-amber-700 font-medium" : d >= 1 ? "text-amber-600" : "text-gray-05";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  SENT: { label: "Sent", cls: "bg-green-01/10 text-green-01" },
  RESOLVED: { label: "Resolved", cls: "bg-green-01/10 text-green-01" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-03/60 text-gray-05" },
  PENDING: { label: "Scheduled", cls: "bg-amber-50 text-amber-700" },
};
function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "bg-gray-03/60 text-gray-05" };
  return <span className={cn(PILL, m.cls)}>{m.label}</span>;
}
function Initials({ name }: { name: string }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pry-01 font-mont text-[10px] font-semibold text-primary">{init || "-"}</span>;
}
function AgingKpi({ label, amount, count, currency }: { label: string; amount: number; count: number; currency?: string | null }) {
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="font-mont text-xs text-gray-05">{label}</p>
      <p className="mt-1 font-mont text-xl font-semibold tabular-nums text-black-01">{formatMoney(amount, currency)}</p>
      <p className="mt-0.5 font-mont text-[11px] text-gray-05 tabular-nums">{count} invoice{count === 1 ? "" : "s"}</p>
    </div>
  );
}

export function DunningTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [tab, setTab] = useState<"queue" | "policies">("queue");
  const summaryQ = useGetDunningSummaryQuery({ entity });
  const policiesQ = useGetDunningPoliciesQuery({ entity });
  const noticesQ = useGetDunningNoticesQuery({ entity, page: 1 });
  const [generate, { isLoading: generating }] = useGenerateDunningMutation();
  const { can } = useCan();

  const s = summaryQ.data?.data;
  const policies = useMemo(() => toArray(policiesQ.data?.data), [policiesQ.data]);
  const noticeCount = toArray(noticesQ.data?.data).filter((n) => n.notice_status !== "CANCELLED").length;

  const runReminders = async () => {
    try {
      const res = await generate({ entity }).unwrap();
      toast.success(res.message || `Generated ${res.data?.created ?? 0} notice(s).`);
    } catch { /* central */ }
  };

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AgingKpi label="Due soon (0–7d)" amount={s?.due_soon.amount ?? 0} count={s?.due_soon.count ?? 0} currency={currency} />
        <AgingKpi label="Overdue 1–30d" amount={s?.overdue_1_30.amount ?? 0} count={s?.overdue_1_30.count ?? 0} currency={currency} />
        <AgingKpi label="Overdue 31–60d" amount={s?.overdue_31_60.amount ?? 0} count={s?.overdue_31_60.count ?? 0} currency={currency} />
        <AgingKpi label="Overdue 60d+" amount={s?.overdue_60_plus.amount ?? 0} count={s?.overdue_60_plus.count ?? 0} currency={currency} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-lg bg-[#ECECEC] p-1">
          {([["queue", `Reminder queue${noticeCount ? ` (${noticeCount})` : ""}`], ["policies", `Policies${policies.length ? ` (${policies.length})` : ""}`]] as [typeof tab, string][]).map(([v, lbl]) => (
            <button key={v} type="button" onClick={() => setTab(v)}
              className={cn("rounded-md px-3 py-1.5 font-mont text-sm transition-colors",
                tab === v ? "bg-white font-semibold text-black-01 shadow-sm ring-1 ring-black/5" : "font-medium text-gray-05 hover:text-gray-01")}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Can permission={P.FIN_MANAGE_DUNNING}>
            <Button variant="outline" onClick={() => setTab("policies")} className="gap-1.5"><SlidersHorizontal className="size-4" /> Configure cadence</Button>
          </Can>
          <Can permission={P.FIN_GENERATE_DUNNING}>
            <Button onClick={runReminders} disabled={generating} className="gap-1.5"><Play className="size-4" />{generating ? "Running…" : "Run reminders now"}</Button>
          </Can>
        </div>
      </div>

      {tab === "queue"
        ? <ReminderQueue entity={entity} policies={policies} canDispatch={can(P.FIN_SEND_DUNNING)} />
        : <PoliciesPanel entity={entity} policies={policies} />}
    </>
  );
}

function ReminderQueue({ entity, policies, canDispatch }: {
  entity: string; policies: DunningPolicy[]; canDispatch: boolean;
}) {
  const [page, setPage] = useState(1);
  const [sending, setSending] = useState<DunningNotice | null>(null);
  const { data, isLoading, isFetching, isError, refetch } = useGetDunningNoticesQuery({ entity, page });
  const [cancel] = useCancelDunningNoticeMutation();
  const [send, { isLoading: dispatching }] = useSendDunningNoticeMutation();
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const cadence = policies.find((p) => p.is_default && p.is_active) ?? policies.find((p) => p.is_active) ?? policies[0];

  const doCancel = async (n: DunningNotice) => {
    try { await cancel({ id: n.id, entity }).unwrap(); toast.success("Notice cancelled."); } catch { /* central */ }
  };

  // Sending reaches a customer, so it is confirmed rather than fired from the row.
  const doSend = async () => {
    if (!sending) return;
    try {
      await send({ id: sending.id, entity }).unwrap();
      toast.success(`Reminder sent to ${sending.customer_name}.`);
      setSending(null);
    } catch { /* central */ }
  };

  const columns: Column<DunningNotice>[] = [
    { header: "Customer", cell: (n) => <span className="inline-flex items-center gap-2"><Initials name={n.customer_name} /><span className="font-medium text-gray-01">{n.customer_name}</span></span> },
    { header: "Stage", cell: (n) => <span className="font-mont text-sm text-gray-01">L{n.level}{n.policy_name ? <span className="ml-1 text-gray-05">· {n.policy_name}</span> : null}</span> },
    { header: "Channel", cell: (n) => <span className={cn(PILL, "bg-gray-03/70 text-gray-01")}>{channelLabel(n.channel)}</span> },
    { header: "Overdue", align: "right", cell: (n) => <span className={cn("tabular-nums", overdueCls(n.days_overdue))}>{n.days_overdue}d</span> },
    { header: "Status", cell: (n) => <StatusPill status={n.notice_status} /> },
    { header: "", align: "right", cell: (n) => n.notice_status === "PENDING" && canDispatch ? (
      <span className="flex items-center justify-end gap-1.5">
        <button onClick={(e) => { e.stopPropagation(); setSending(n); }} className="inline-flex items-center gap-1 rounded px-2 py-1 font-mont text-xs font-medium text-primary hover:bg-primary/5"><Send className="size-3.5" /> Send</button>
        <button onClick={(e) => { e.stopPropagation(); doCancel(n); }} className="inline-flex items-center gap-1 rounded px-2 py-1 font-mont text-xs font-medium text-destructive hover:bg-destructive/5"><Ban className="size-3.5" /> Cancel</button>
      </span>
    ) : null },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <DataTable
          columns={columns} rows={rows} rowKey={(n) => n.id}
          loading={isLoading || isFetching} error={isError} onRetry={refetch}
          page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
          emptyTitle="No reminders queued"
          emptyMessage="Run reminders to raise notices for overdue invoices."
        />
      </div>
      <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
        <p className="font-mont text-sm font-semibold text-black-01">Reminder cadence</p>
        <p className="mb-3 font-mont text-[11px] text-gray-05">{cadence ? `${cadence.name} · automated follow-up` : "No active policy"}</p>
        {cadence ? (
          <ol className="space-y-3">
            {[...cadence.stages].sort((a, b) => a.min_days_overdue - b.min_days_overdue).map((st) => (
              <li key={st.id ?? st.level} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-pry-01 font-mont text-[10px] font-semibold text-primary tabular-nums">{st.level}</span>
                <div className="min-w-0">
                  <p className="font-mont text-[13px] font-medium text-black-01">{st.name}</p>
                  <p className="font-mont text-[11px] text-gray-05">{whenLabel(st.min_days_overdue)} · {channelLabel(st.channel)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="font-mont text-xs text-gray-05">Create a policy in the Policies tab to define the cadence.</p>}
      </div>

      <ConfirmActionModal
        open={!!sending}
        onOpenChange={(open) => !open && setSending(null)}
        title="Send this reminder?"
        description="The notice goes out over its stage's channels and is marked sent. It cannot be recalled."
        confirmText="Send reminder"
        onConfirm={doSend}
        loading={dispatching}
      >
        {sending ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md bg-gray-50 p-3">
            <dt className="font-mont text-[11px] text-gray-05">Customer</dt>
            <dd className="font-mont text-xs font-semibold text-black-01">{sending.customer_name}</dd>
            <dt className="font-mont text-[11px] text-gray-05">Invoice</dt>
            <dd className="font-mont text-xs font-semibold tabular-nums text-black-01">{sending.invoice_number}</dd>
            <dt className="font-mont text-[11px] text-gray-05">Channel</dt>
            <dd className="font-mont text-xs font-semibold text-black-01">{channelLabel(sending.channel)}</dd>
            <dt className="font-mont text-[11px] text-gray-05">Overdue</dt>
            <dd className="font-mont text-xs font-semibold tabular-nums text-black-01">{sending.days_overdue} days</dd>
          </dl>
        ) : null}
      </ConfirmActionModal>
    </div>
  );
}

const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

function PoliciesPanel({ entity, policies }: { entity: string; policies: DunningPolicy[] }) {
  const [editing, setEditing] = useState<DunningPolicy | "new" | null>(null);
  const [generate] = useGenerateDunningMutation();
  const [update] = useUpdateDunningPolicyMutation();
  const { can } = useCan();
  const manage = can(P.FIN_MANAGE_DUNNING);

  const toggleActive = async (p: DunningPolicy) => {
    try { await update({ id: p.id, entity, is_active: !p.is_active }).unwrap(); toast.success(p.is_active ? "Policy deactivated." : "Policy activated."); } catch { /* central */ }
  };
  const genFor = async (p: DunningPolicy) => {
    try { const r = await generate({ entity, policy: p.id }).unwrap(); toast.success(r.message || `Generated ${r.data?.created ?? 0} notice(s).`); } catch { /* central */ }
  };

  return (
    <div className="space-y-4">
      {manage ? <div className="flex justify-end"><Button variant="outline" onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> New policy</Button></div> : null}
      {policies.length === 0 ? (
        <div className="rounded-md bg-white p-8 text-center ring-1 ring-white-02">
          <p className="font-mont text-sm text-gray-05">No reminder policies yet. Create one to define the dunning cadence.</p>
        </div>
      ) : policies.map((p) => (
        <div key={p.id} className="rounded-md bg-white ring-1 ring-white-02">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white-02 px-4 py-3">
            <div>
              <p className="font-mont text-sm font-semibold text-black-01">{p.name}{p.is_default ? <span className={cn(PILL, "ml-2 bg-blue-50 text-blue-700")}>Default</span> : null}</p>
              <p className="font-mont text-[11px] text-gray-05">{p.stages.length} stage{p.stages.length === 1 ? "" : "s"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => manage && toggleActive(p)} disabled={!manage} aria-pressed={p.is_active}
                className={cn("inline-flex h-6 w-10 items-center rounded-full p-0.5 transition-colors disabled:opacity-50", p.is_active ? "bg-primary" : "bg-gray-02")}>
                <span className={cn("size-5 rounded-full bg-white shadow-sm transition-transform", p.is_active && "translate-x-4")} />
              </button>
              <span className="font-mont text-xs text-gray-05">{p.is_active ? "Active" : "Inactive"}</span>
              <Can permission={P.FIN_GENERATE_DUNNING}><Button variant="outline" size="sm" onClick={() => genFor(p)} className="gap-1.5"><Play className="size-3.5" /> Generate notices</Button></Can>
              {manage ? <Button variant="outline" size="sm" onClick={() => setEditing(p)} className="gap-1.5"><Pencil className="size-3.5" /> Edit</Button> : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr><th className={thCls}>When</th><th className={thCls}>Channel</th><th className={thCls}>Template</th></tr></thead>
              <tbody>
                {[...p.stages].sort((a, b) => a.min_days_overdue - b.min_days_overdue).map((st) => (
                  <tr key={st.id ?? st.level}>
                    <td className={cn(tdCls, "tabular-nums")}>{whenLabel(st.min_days_overdue)}</td>
                    <td className={tdCls}><span className={cn(PILL, "bg-gray-03/70 text-gray-01")}>{channelLabel(st.channel)}</span></td>
                    <td className={tdCls}>{st.name}</td>
                  </tr>
                ))}
                {p.stages.length === 0 ? <tr><td className={cn(tdCls, "text-gray-05")} colSpan={3}>No stages - edit to add the cadence.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {editing ? <PolicyEditorDrawer entity={entity} policy={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

const emptyStage = (level: number): DunningStage => ({ level, name: "", min_days_overdue: 0, channel: "EMAIL", message: "" });

function PolicyEditorDrawer({ entity, policy, onClose }: { entity: string; policy: DunningPolicy | null; onClose: () => void }) {
  const [name, setName] = useState(policy?.name ?? "");
  const [isActive, setIsActive] = useState(policy?.is_active ?? true);
  const [isDefault, setIsDefault] = useState(policy?.is_default ?? false);
  const [stages, setStages] = useState<DunningStage[]>(policy?.stages.length ? [...policy.stages].sort((a, b) => a.min_days_overdue - b.min_days_overdue) : [emptyStage(1)]);
  const [create, { isLoading: creating }] = useCreateDunningPolicyMutation();
  const [update, { isLoading: updating }] = useUpdateDunningPolicyMutation();
  const saving = creating || updating;

  const setStage = (i: number, patch: Partial<DunningStage>) => setStages((s) => s.map((st, idx) => idx === i ? { ...st, ...patch } : st));
  // Toggle a channel in the stage's CSV, keeping enum order and at least one channel.
  const toggleChannel = (i: number, ch: string) => {
    const has = stages[i].channel.split(",").includes(ch);
    const next = CHANNELS.map(([v]) => v).filter((v) => v === ch ? !has : stages[i].channel.split(",").includes(v));
    if (next.length) setStage(i, { channel: next.join(",") });
  };
  const addStage = () => setStages((s) => [...s, emptyStage(s.length + 1)]);
  const removeStage = (i: number) => setStages((s) => s.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, level: idx + 1 })));

  const canSubmit = name.trim() !== "" && stages.length > 0 && stages.every((st) => st.name.trim() !== "");

  const submit = async () => {
    const payload = {
      name: name.trim(), is_active: isActive, is_default: isDefault,
      stages: stages.map((st, i) => ({ level: i + 1, name: st.name.trim(), min_days_overdue: st.min_days_overdue, channel: st.channel, message: st.message })),
    };
    try {
      if (policy) await update({ id: policy.id, entity, ...payload }).unwrap();
      else await create({ entity, ...payload }).unwrap();
      toast.success(policy ? "Policy updated." : "Policy created.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title={policy ? "Edit reminder policy" : "New reminder policy"} description="A ladder of escalating reminder stages by days overdue."
      widthClass="sm:max-w-2xl"
      footer={<>
        <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button disabled={saving || !canSubmit} onClick={submit} className="gap-1.5"><Plus className="size-4" />{saving ? "Saving…" : policy ? "Save policy" : "Create policy"}</Button>
      </>}
    >
      <div className="space-y-4">
        <FormField label="Policy name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard 7/14/30-day" className="bg-white" /></FormField>
        <div className="flex items-center gap-5">
          <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-primary" /> Active</label>
          <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-primary" /> Default policy</label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Stages</p>
            <Button variant="outline" size="sm" onClick={addStage} className="gap-1.5"><Plus className="size-3.5" /> Add stage</Button>
          </div>
          <div className="space-y-2">
            {stages.map((st, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-md border border-white-02 bg-white p-2.5">
                <div className="col-span-4"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Template name</p><Input value={st.name} onChange={(e) => setStage(i, { name: e.target.value })} placeholder="Friendly reminder" className="h-8 bg-white font-mont text-sm" /></div>
                <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Days overdue</p><Input type="number" min={0} value={st.min_days_overdue} onChange={(e) => setStage(i, { min_days_overdue: Math.max(0, Number(e.target.value) || 0) })} className="h-8 bg-white font-mont text-sm tabular-nums" /></div>
                <div className="col-span-4"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Channels</p>
                  <div className="flex h-8 items-center gap-3">
                    {CHANNELS.map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1.5 font-mont text-sm text-gray-01">
                        <input type="checkbox" checked={st.channel.split(",").includes(v)} onChange={() => toggleChannel(i, v)} className="accent-primary" /> {l}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeStage(i)} disabled={stages.length <= 1} className="rounded p-1.5 text-gray-05 hover:bg-destructive/5 hover:text-destructive disabled:opacity-30" aria-label="Remove stage"><Trash2 className="size-4" /></button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mont text-[11px] text-gray-05">Stages fire when an invoice reaches the days-overdue threshold. Generating a run raises a notice at the highest matching stage per invoice.</p>
        </div>
      </div>
    </DetailDrawer>
  );
}
