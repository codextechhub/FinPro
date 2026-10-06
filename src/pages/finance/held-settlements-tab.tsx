/**
 * Held settlements: the platform paying each branch the online payments it held.
 *
 * Two readers, two screens under one menu entry:
 *
 * - A school (`payments.report.view`) reads its own settlements, read-only:
 *   what each covered, the fees, what was sent and into which bank account.
 *   The server narrows the list to the reader's branches, so Mrs Adeyemi,
 *   bursar for Lekki only, sees Lekki's and nothing else. At a school with
 *   several branches each row names its branch.
 * - A platform operator (`payments.platform_settlement.view`) reads every
 *   school's settlements that need acting on, filters them by status and
 *   school, and puts a prepared one forward
 *   (`payments.platform_settlement.submit`). Two other platform people approve
 *   it in Workflow, Approvals; the person who submits it cannot approve it.
 *   On the second approval the money is sent, and once it arrives the school's
 *   books record it by themselves. A route nobody can approve is reported, not
 *   bypassed: releasing held money without its two approvers is not offered.
 *
 * Stages and fees are read through held-settlement-model.ts.
 */

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmActionModal, DataTable, DetailDrawer, Money, type Column } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import {
  useGetHeldSettlementsQuery,
  useGetPlatformHeldSettlementsQuery,
  useSubmitPlatformHeldSettlementMutation,
} from "@/redux/services/payments/payments-api";
import type { HeldSettlement, HeldSettlementStatus, PlatformHeldSettlement } from "@/redux/services/payments/payments-types";
import { P } from "../../permissions";
import { platformName } from "../../host";
import { useDates } from "../../lib/display-prefs";
import { usePaymentBranchColumn } from "./payment-branches";
import { GATEWAY_CLEARING_NAME } from "./settlement-booking";
import {
  HELD_STATUS_CHOICES,
  STAGE_LABEL,
  canSubmitHeldSettlement,
  heldSettlementFees,
  heldSettlementStage,
  tenantsIn,
} from "./held-settlement-model";

const SELECT = "h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none";
const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";

function StagePill({ row }: { row: HeldSettlement }) {
  const stage = STAGE_LABEL[heldSettlementStage(row)];
  return <span className={cn(PILL, stage.cls)}>{stage.label}</span>;
}

function StatusFilter({ value, onChange, allLabel }: { value: string; onChange: (v: string) => void; allLabel: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(SELECT, "w-40")} aria-label="Status">
      <option value="">{allLabel}</option>
      {HELD_STATUS_CHOICES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

/** The school's own read-only list. */
export function HeldSettlementsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const [status, setStatus] = useState("");
  const [picked, setPicked] = useState<HeldSettlement | null>(null);
  const branchColumn = usePaymentBranchColumn();
  const { data, isLoading, isFetching, isError, refetch } = useGetHeldSettlementsQuery({
    entity, limit: 200, ...(status ? { status: status as HeldSettlementStatus } : {}),
  });
  const rows = useMemo(() => (Array.isArray(data?.data) ? data.data : []), [data]);

  const columns: Column<HeldSettlement>[] = [
    { header: "Run on", cell: (r) => <span className="tabular-nums text-gray-05">{dates.day(r.run_on)}</span> },
    ...(branchColumn.show ? [{ header: "Branch", cell: (r: HeldSettlement) => r.branch_name || branchColumn.name(r.branch) }] : []),
    { header: "Payments covered", align: "right", cell: (r) => <Money kobo={r.gross} currency={currency} align="right" /> },
    { header: "Fees", align: "right", cell: (r) => <span className="tabular-nums text-destructive">{formatMoney(heldSettlementFees(r), currency)}</span> },
    { header: "Sent", align: "right", cell: (r) => <Money kobo={r.amount} currency={currency} align="right" /> },
    { header: "Paid into", cell: (r) => r.bank_account.name },
    { header: "Status", cell: (r) => <StagePill row={r} /> },
  ];

  return (
    <div className="space-y-4" data-guide="finance-held-settlements.workbench">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusFilter value={status} onChange={setStatus} allLabel="All settlements" />
        <p className="font-mont text-[11px] text-gray-05">Read only. {platformName} pays these; each paid one is booked in your books by itself.</p>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setPicked}
        emptyTitle="No held settlements" emptyMessage={`Settlements appear here once ${platformName} pays a branch the online payments it held.`} />
      <HeldSettlementDrawer row={picked} currency={currency} onClose={() => setPicked(null)} />
    </div>
  );
}

/** The platform operators' list across every school. */
export function PlatformHeldSettlementsTab({ currency }: { currency?: string | null }) {
  const dates = useDates();
  const { can } = useCan();
  const canSubmit = can(P.PAY_SUBMIT_PLATFORM_SETTLEMENT);
  const [status, setStatus] = useState("");
  const [client, setClient] = useState("");
  const [picked, setPicked] = useState<PlatformHeldSettlement | null>(null);
  const [submitting, setSubmitting] = useState<PlatformHeldSettlement | null>(null);
  const [submit, { isLoading: sending }] = useSubmitPlatformHeldSettlementMutation();
  const { data, isLoading, isFetching, isError, refetch } = useGetPlatformHeldSettlementsQuery({
    limit: 200, ...(status ? { status: status as HeldSettlementStatus } : {}), ...(client ? { client } : {}),
  });
  const rows = useMemo(() => (Array.isArray(data?.data) ? data.data : []), [data]);

  // Schools stay offered once seen, so narrowing to one does not empty the filter.
  const [seen, setSeen] = useState<{ tenant: string; tenant_name: string }[]>([]);
  const tenants = useMemo(() => tenantsIn([...seen, ...rows]), [seen, rows]);
  if (rows.some((r) => !seen.some((s) => s.tenant === r.tenant))) {
    setSeen(tenants.map((t) => ({ tenant: t.slug, tenant_name: t.name })));
  }

  const doSubmit = async () => {
    if (!submitting) return;
    try {
      const res = await submit({ id: submitting.id }).unwrap();
      toast.success(res.message || "Settlement submitted for approval.");
      const approval = res.data?.approval;
      if (approval?.parked) {
        toast.warning(`Nobody can approve it yet. ${approval.requirement ?? "Give two people the settlement approver role."}`);
      }
      setSubmitting(null);
    } catch { /* central */ }
  };

  const columns: Column<PlatformHeldSettlement>[] = [
    { header: "School", cell: (r) => <span className="font-medium text-gray-01">{r.tenant_name}</span> },
    { header: "Branch", cell: (r) => r.branch_name },
    { header: "Run on", cell: (r) => <span className="tabular-nums text-gray-05">{dates.day(r.run_on)}</span> },
    { header: "Payments covered", align: "right", cell: (r) => <Money kobo={r.gross} currency={currency} align="right" /> },
    { header: "Fees", align: "right", cell: (r) => <span className="tabular-nums text-destructive">{formatMoney(heldSettlementFees(r), currency)}</span> },
    { header: "To send", align: "right", cell: (r) => <Money kobo={r.amount} currency={currency} align="right" /> },
    { header: "Status", cell: (r) => <StagePill row={r} /> },
    ...(canSubmit ? [{ header: "", align: "right" as const, cell: (r: PlatformHeldSettlement) => canSubmitHeldSettlement(r) ? (
      <Button size="sm" className="gap-1.5" onClick={(e) => { e.stopPropagation(); setSubmitting(r); }}><Send className="size-3.5" /> Submit</Button>
    ) : null }] : []),
  ];

  return (
    <div className="space-y-4" data-guide="finance-held-settlements.platform">
      <div className="flex flex-wrap items-center gap-2">
        <StatusFilter value={status} onChange={setStatus} allLabel="Due now" />
        <select value={client} onChange={(e) => setClient(e.target.value)} className={cn(SELECT, "w-56")} aria-label="School">
          <option value="">All schools</option>
          {tenants.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
      </div>
      <p className="font-mont text-[11px] text-gray-05">
        &ldquo;Due now&rdquo; lists every settlement not yet paid and any built today. A morning run builds one per due branch. Two different {platformName} people approve each one in Workflow, Approvals; whoever submits it cannot approve it.
      </p>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setPicked}
        emptyTitle="No settlements to act on" emptyMessage="The morning run builds a settlement for each branch whose payment day has come." />
      <HeldSettlementDrawer row={picked} currency={currency} onClose={() => setPicked(null)}
        tenantName={picked?.tenant_name}
        action={picked && canSubmit && canSubmitHeldSettlement(picked)
          ? <Button className="gap-1.5" onClick={() => { setSubmitting(picked); setPicked(null); }}><Send className="size-4" /> Submit for approval</Button>
          : null} />
      {submitting ? (
        <ConfirmActionModal open onOpenChange={(open) => (open ? undefined : setSubmitting(null))}
          title="Submit this settlement for approval?"
          description={`${submitting.tenant_name}, ${submitting.branch_name}: ${formatMoney(submitting.amount, currency)} to ${submitting.bank_account.name}.`}
          confirmText="Submit" loading={sending} onConfirm={doSubmit}>
          <p className="font-mont text-xs leading-5 text-gray-05">
            Two other {platformName} people must approve it before the money is sent. You cannot approve a settlement you submitted.
          </p>
        </ConfirmActionModal>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="font-mont text-[11px] text-gray-05">{label}</span>
      <span className="text-right font-mont text-xs font-medium tabular-nums text-black-01">{children}</span>
    </div>
  );
}

function HeldSettlementDrawer({ row, currency, onClose, tenantName, action }: {
  row: HeldSettlement | null;
  currency?: string | null;
  onClose: () => void;
  /** The school it pays, on the platform's list. */
  tenantName?: string;
  action?: ReactNode;
}) {
  const dates = useDates();
  if (!row) return null;
  return (
    <DetailDrawer open onOpenChange={(open) => (open ? undefined : onClose())}
      title={tenantName ? `${tenantName} · ${row.branch_name}` : `Settlement for ${row.branch_name}`}
      description={`Run on ${dates.day(row.run_on)} · ${formatMoney(row.amount, currency)}`}
      widthClass="sm:max-w-md"
      footer={<><StagePill row={row} /><div className="flex-1" />{action}</>}>
      <div className="space-y-4">
        <div className="rounded-md border border-white-02 bg-white p-4">
          <p className="mb-1.5 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Figures</p>
          <div className="divide-y divide-gray-02">
            <Field label="Payments covered">{formatMoney(row.gross, currency)}</Field>
            <Field label="Provider fees">{formatMoney(row.fees, currency)}</Field>
            <Field label="Transfer fee">{formatMoney(row.transfer_fee, currency)}</Field>
            <Field label={row.status === "PAID" ? "Sent" : "To send"}>{formatMoney(row.amount, currency)}</Field>
          </div>
        </div>
        <div className="rounded-md border border-white-02 bg-white p-4">
          <p className="mb-1.5 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Transfer</p>
          <div className="divide-y divide-gray-02">
            <Field label="Paid into">{row.bank_account.name}</Field>
            <Field label="Reference">{row.batch?.reference ?? "-"}</Field>
            <Field label="Paid">{row.paid_at ? dates.dateTime(row.paid_at, row.branch) : "-"}</Field>
            {row.journal_id ? <Field label="Journal">#{row.journal_id}</Field> : null}
          </div>
        </div>
        {row.final ? <p className="font-mont text-[11px] text-gray-05">The last settlement before payments go straight to the branch&rsquo;s bank.</p> : null}
        {row.failure_reason ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 font-mont text-xs text-destructive">{row.failure_reason}</p> : null}
        <p className="font-mont text-[11px] leading-5 text-gray-05">
          The branch bears the provider&rsquo;s fees on its payments and the transfer fee. Once paid, the school&rsquo;s books record it at the branch: Dr bank, Dr bank charges, Cr {GATEWAY_CLEARING_NAME}.
        </p>
      </div>
    </DetailDrawer>
  );
}
