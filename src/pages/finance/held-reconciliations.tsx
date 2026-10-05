/**
 * Held reconciliations: the platform's daily check of the money it holds for
 * schools against what the payment provider reports, and the platform's own
 * provider account settings that the check depends on.
 *
 * Platform staff only, never a school. Each part opens on its own key, as the
 * server gates it:
 *
 * - The daily checks (`payments.platform_settlement.view`): one row per
 *   provider, currency and day, saying whether the provider's balance and the
 *   books agree within the tolerance, and the incident a disagreement opened.
 *   "Disagreements" narrows to the rows that did not.
 * - "Paystack balance swept automatically" (`payments.platform_provider.view`
 *   to read, `.update` to change). When the provider settles the platform's
 *   balance to its bank on its own, the check counts each sweep once and takes
 *   it off the books' figure, so a sweep is not reported as a mismatch. Turning
 *   it on or off needs a reason, which the audit trail keeps. The tolerance is
 *   shown here read-only; it is changed in Settings, Advanced catalogue.
 * - The sweeps the check counted, listed under the setting. The server serves
 *   them to platform settlement readers, so the list shows to a reader holding
 *   both a provider key and the settlement view key.
 */

import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { ConfirmActionModal, DataTable, DetailDrawer, EmptyState, ReasonField, hasReason, type Column } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { noAccessMessage } from "@/components/finance-ui/no-access";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import {
  useGetPlatformHeldReconciliationsQuery,
  useGetPlatformProviderSettingsQuery,
  useGetPlatformProviderSweepsQuery,
  useUpdatePlatformProviderSettingsMutation,
} from "@/redux/services/payments/payments-api";
import type { HeldReconciliation, ProviderSweep } from "@/redux/services/payments/payments-types";
import { P } from "../../permissions";
import { useDates } from "../../lib/display-prefs";
import { providerInfo } from "./payment-providers";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const SELECT = "h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none";

const money = (kobo: number | null | undefined, currency?: string | null) => (kobo === null || kobo === undefined ? "-" : formatMoney(kobo, currency));

export function HeldReconciliationsTab() {
  const { can } = useCan();
  const canChecks = can(P.PAY_VIEW_PLATFORM_SETTLEMENTS);
  const canProvider = can(P.PAY_VIEW_PLATFORM_PROVIDER) || can(P.PAY_UPDATE_PLATFORM_PROVIDER);
  if (!canChecks && !canProvider) {
    return <EmptyState title="No access" message={noAccessMessage("view the held-money checks")} />;
  }
  return (
    <div className="space-y-6">
      {canProvider ? <ProviderSettingsCard showSweeps={canChecks} /> : null}
      {canChecks ? <ChecksList /> : null}
    </div>
  );
}

function ChecksList() {
  const dates = useDates();
  const [only, setOnly] = useState<"" | "false">("");
  const [picked, setPicked] = useState<HeldReconciliation | null>(null);
  const { data, isLoading, isFetching, isError, refetch } = useGetPlatformHeldReconciliationsQuery({ limit: 200, ...(only ? { agrees: only } : {}) });
  const rows = Array.isArray(data?.data) ? data.data : [];

  const columns: Column<HeldReconciliation>[] = [
    { header: "Day", cell: (r) => <span className="tabular-nums text-gray-05">{dates.day(r.checked_on)}</span> },
    { header: "Provider", cell: (r) => `${providerInfo(r.provider).label} · ${r.currency}` },
    { header: "Provider says", align: "right", cell: (r) => <span className="tabular-nums">{money(r.provider_balance, r.currency)}</span> },
    { header: "Books say", align: "right", cell: (r) => <span className="tabular-nums">{money(r.books_balance, r.currency)}</span> },
    { header: "Difference", align: "right", cell: (r) => <span className={cn("tabular-nums", !r.agrees && "text-destructive")}>{money(r.difference, r.currency)}</span> },
    { header: "Result", cell: (r) => <AgreePill row={r} /> },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mont text-sm font-semibold text-gray-01">Daily checks</h2>
          <p className="mt-0.5 font-mont text-xs text-gray-05">Every morning the money held for schools is checked against the provider&rsquo;s balance. A disagreement opens an incident under Health.</p>
        </div>
        <select value={only} onChange={(e) => setOnly(e.target.value as "" | "false")} className={cn(SELECT, "w-44")} aria-label="Which checks">
          <option value="">All checks</option>
          <option value="false">Disagreements</option>
        </select>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setPicked}
        emptyTitle={only ? "No disagreements" : "No checks yet"}
        emptyMessage={only ? "Every check agreed with the provider." : "The first check runs at 07:15 once the scheduler is running."} />
      <CheckDrawer row={picked} onClose={() => setPicked(null)} />
    </section>
  );
}

function AgreePill({ row }: { row: HeldReconciliation }) {
  if (row.error) return <span className={cn(PILL, "bg-amber-50 text-amber-700")}>Could not check</span>;
  return row.agrees
    ? <span className={cn(PILL, "bg-green-01/10 text-green-01")}>Agrees</span>
    : <span className={cn(PILL, "bg-destructive/10 text-destructive")}>Disagrees</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="font-mont text-[11px] text-gray-05">{label}</span>
      <span className="text-right font-mont text-xs font-medium tabular-nums text-black-01">{children}</span>
    </div>
  );
}

function CheckDrawer({ row, onClose }: { row: HeldReconciliation | null; onClose: () => void }) {
  const dates = useDates();
  if (!row) return null;
  const c = row.currency;
  return (
    <DetailDrawer open onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Check of ${dates.day(row.checked_on)}`} description={`${providerInfo(row.provider).label} · ${c}`}
      widthClass="sm:max-w-md" footer={<><AgreePill row={row} /><div className="flex-1" />{row.incident_code ? <span className="font-mont text-[11px] text-gray-05">Incident {row.incident_code}</span> : null}</>}>
      <div className="space-y-4">
        <div className="rounded-md border border-white-02 bg-white p-4">
          <p className="mb-1.5 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">What the books say</p>
          <div className="divide-y divide-gray-02">
            <Field label="Provider balance account">{money(row.provider_account, c)}</Field>
            <Field label="Platform's own payments not yet settled">{money(row.own_in_transit, c)}</Field>
            {row.balance_swept ? (
              <>
                <Field label="Sweeps to the platform's bank">{`- ${money(row.swept_total, c)}`}</Field>
                <Field label="Own payments settled after sweeping">{`+ ${money(row.own_swept_settled, c)}`}</Field>
              </>
            ) : null}
            <Field label="Books say the provider holds">{money(row.books_balance, c)}</Field>
            <Field label="Held for schools' branches">{money(row.held_total, c)}</Field>
          </div>
        </div>
        <div className="rounded-md border border-white-02 bg-white p-4">
          <p className="mb-1.5 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Comparison</p>
          <div className="divide-y divide-gray-02">
            <Field label="Provider says">{money(row.provider_balance, c)}</Field>
            <Field label="Difference">{money(row.difference, c)}</Field>
            <Field label="Tolerance">{money(row.tolerance, c)}</Field>
            <Field label="Balance swept automatically">{row.balance_swept ? "Yes" : "No"}</Field>
          </div>
        </div>
        {row.error ? <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 font-mont text-xs text-amber-800">{row.error}</p> : null}
      </div>
    </DetailDrawer>
  );
}

function ProviderSettingsCard({ showSweeps }: { showSweeps: boolean }) {
  const dates = useDates();
  const { can } = useCan();
  const canUpdate = can(P.PAY_UPDATE_PLATFORM_PROVIDER);
  const { data, isLoading, isError, refetch } = useGetPlatformProviderSettingsQuery();
  const [update, { isLoading: saving }] = useUpdatePlatformProviderSettingsMutation();
  const [next, setNext] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const settings = data?.data;

  const save = async () => {
    if (next === null) return;
    try {
      const res = await update({ balance_swept: next, reason: reason.trim() }).unwrap();
      toast.success(res.message || "Payment provider settings saved.");
      setNext(null);
      setReason("");
    } catch { /* central */ }
  };

  return (
    <section className="space-y-3 rounded-md border border-white-02 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h2 className="font-mont text-sm font-semibold text-gray-01">Paystack balance swept automatically</h2>
          <p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">
            Turn on when Paystack settles the platform&rsquo;s balance to its bank by itself. The daily check then counts each sweep once and does not report it as a mismatch. A setting of the platform&rsquo;s own merchant account, never a school&rsquo;s.
          </p>
        </div>
        {settings ? (
          <label className="flex items-center gap-2 font-mont text-xs text-gray-01">
            <Switch checked={settings.balance_swept} disabled={!canUpdate || saving} onCheckedChange={(value) => setNext(value)} aria-label="Paystack balance swept automatically" />
            {settings.balance_swept ? "On" : "Off"}
          </label>
        ) : null}
      </div>

      {isLoading ? <p className="font-mont text-xs text-gray-05">Reading the setting.</p> : isError || !settings ? (
        <p className="font-mont text-xs text-gray-05">Could not read the setting. <button type="button" className="text-primary underline" onClick={() => refetch()}>Try again</button></p>
      ) : (
        <dl className="grid grid-cols-1 gap-3 font-mont text-xs sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Set by">{settings.source === "platform" ? "Platform setting" : "Default (off)"}</Fact>
          <Fact label="Last changed">{settings.updated_at ? dates.dateTime(settings.updated_at) : "Never"}</Fact>
          <Fact label="Check tolerance">{formatMoney(settings.tolerance_kobo)}<span className="block text-[11px] font-normal text-gray-05">Changed in Settings, Advanced catalogue</span></Fact>
          <Fact label="Sweeps counted">{settings.sweeps.count} · {formatMoney(settings.sweeps.total)}<span className="block text-[11px] font-normal text-gray-05">{settings.sweeps.latest_settled_at ? `Latest ${dates.day(settings.sweeps.latest_settled_at)}` : "None yet"}</span></Fact>
        </dl>
      )}
      {!canUpdate ? <p className="font-mont text-[11px] text-gray-05">You have read-only access.</p> : null}

      {showSweeps ? <SweepsTable /> : null}

      {next !== null && settings ? (
        <ConfirmActionModal open onOpenChange={(open) => { if (!open) { setNext(null); setReason(""); } }}
          title={next ? "Turn on balance sweeping?" : "Turn off balance sweeping?"}
          description={next
            ? "From the next check, Paystack's settlements of the platform balance are taken off the books' figure."
            : "From the next check, a sweep of the balance is reported as a mismatch."}
          confirmText={next ? "Turn on" : "Turn off"} loading={saving} confirmDisabled={!hasReason(reason)} onConfirm={save}>
          <ReasonField value={reason} onChange={setReason} hint="Kept on the audit trail with who changed it." placeholder="For example: Paystack confirmed automatic daily settlement is on for our account." />
        </ConfirmActionModal>
      ) : null}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-white-02 bg-white p-3">
      <dt className="text-[11px] text-gray-05">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums text-black-01">{children}</dd>
    </div>
  );
}

function SweepsTable() {
  const dates = useDates();
  const { data, isLoading, isFetching, isError, refetch } = useGetPlatformProviderSweepsQuery({ limit: 100 });
  const rows = Array.isArray(data?.data) ? data.data : [];
  const columns: Column<ProviderSweep>[] = [
    { header: "Settled", cell: (r) => <span className="tabular-nums text-gray-05">{r.settled_at ? dates.dateTime(r.settled_at) : "-"}</span> },
    { header: "Provider", cell: (r) => providerInfo(r.provider).label },
    { header: "Settlement", cell: (r) => <span className="tabular-nums">{r.settlement_id}</span> },
    { header: "Amount", align: "right", cell: (r) => <span className="tabular-nums">{formatMoney(r.amount, r.currency)}</span> },
    { header: "Counted on", cell: (r) => <span className="tabular-nums text-gray-05">{dates.day(r.recorded_on)}</span> },
  ];
  return (
    <div className="space-y-2 pt-2">
      <p className="font-mont text-xs font-semibold text-gray-01">Sweeps counted</p>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        emptyTitle="No sweeps counted" emptyMessage="Sweeps appear once the setting is on and Paystack settles the balance." />
    </div>
  );
}
