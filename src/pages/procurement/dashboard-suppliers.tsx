/**
 * The Spend & suppliers tab of the Procurement dashboard.
 *
 * For whoever chooses and manages vendors: spend against the purchasing plan,
 * how concentrated it is, how well vendors deliver, how much buying skips the
 * order, a vendor scorecard, open RFQs, what competition saved, spend by branch,
 * how long buying takes, and the vendor base. It reads the overview's windows;
 * the page owns the switch and passes the payload in.
 *
 * Each card draws one block and is left out when the block is `null`.
 */

import { Money } from "@/components/finance-ui";
import { EmptyState } from "@/components/finance-ui/states";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import type { ProcurementSuppliersDashboard } from "@/redux/services/procurement/procurement-ext-types";
import { routesPath } from "@/routes/routes-path";
import {
  AllClear, DASH_COLORS, KpiTile, LinkAction, Panel, compactMoney, plural,
} from "../finance/dashboard-cards";

type S = ProcurementSuppliersDashboard;
const R = routesPath.PROTECTED.PROCUREMENT;

const dayMonth = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const pct = (v: number | null | undefined) => (v == null ? "-" : `${Math.round(v * 10) / 10}%`);

const GRADE_CLS: Record<string, string> = {
  A: "bg-green-01/10 text-green-01",
  B: "bg-primary/10 text-primary",
  C: "bg-amber-50 text-amber-700",
  D: "bg-destructive/10 text-destructive",
};
const GRADE_WORD: Record<string, string> = { A: "strong", B: "good", C: "watch", D: "at risk" };

/** "A · strong" for a graded vendor, a dash for one never assessed. */
export function gradeLabel(grade: string | null): string {
  return grade ? `${grade} · ${GRADE_WORD[grade] ?? ""}`.trim() : "-";
}

// ── scorecard ────────────────────────────────────────────────────────────────

function ScorecardCard({ rows, windowName, currency }: { rows: NonNullable<S["scorecard"]>; windowName: string; currency?: string | null }) {
  const cols = "grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1.1fr)]";
  const chip = (grade: string | null) => (
    <span className={cn("inline-block rounded px-1.5 py-0.5 font-mont text-[11px] font-medium", grade ? GRADE_CLS[grade] : "text-gray-05")}>
      {gradeLabel(grade)}
    </span>
  );
  return (
    <Panel title="Vendor scorecard" subtitle={`Largest vendors by bills ${windowName}`}
      action={<LinkAction label="Vendor performance" to={`${R.ANALYTICS}/performance`} />}>
      {rows.length === 0 ? <AllClear>No vendor activity {windowName}.</AllClear> : (
        <>
          <div className="hidden md:block">
            <div className={cn("grid gap-3 border-b border-white-02 pb-2 font-mont text-[11px] text-gray-05", cols)}>
              <span>Vendor</span><span className="text-right">Spend</span><span className="text-right">On time</span>
              <span className="text-right">Accepted</span><span className="text-right">Open POs</span><span>Assessment</span>
            </div>
            {rows.map((r) => (
              <div key={r.vendor_id} className={cn("grid items-center gap-3 border-b border-white-02 py-2.5 font-mont text-[13px] last:border-0", cols)}>
                <span className="min-w-0"><span className="block truncate font-medium text-gray-01">{r.name}</span>
                  <span className="block truncate text-[11px] text-gray-05">{r.category ?? "Uncategorised"}</span></span>
                <span className="text-right tabular-nums">{compactMoney(r.spend.kobo, currency)}</span>
                <span className={cn("text-right tabular-nums", r.on_time_pct != null && r.on_time_pct < 80 && "text-amber-700")}>{pct(r.on_time_pct)}</span>
                <span className={cn("text-right tabular-nums", r.accepted_pct != null && r.accepted_pct < 95 && "text-amber-700")}>{pct(r.accepted_pct)}</span>
                <span className="text-right tabular-nums">{r.open_orders}</span>
                <span>{chip(r.grade)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <div key={r.vendor_id} className="rounded-md border border-white-02 p-3 font-mont">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-medium text-gray-01">{r.name}</span>
                  <span className="text-[13px] font-semibold tabular-nums"><Money kobo={r.spend.kobo} currency={currency} /></span>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-05">{r.category ?? "Uncategorised"}</p>
                <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-gray-05">
                  <span>On time<br /><span className="text-xs font-medium tabular-nums text-black-01">{pct(r.on_time_pct)}</span></span>
                  <span>Accepted<br /><span className="text-xs font-medium tabular-nums text-black-01">{pct(r.accepted_pct)}</span></span>
                  <span>Open POs<br /><span className="text-xs font-medium tabular-nums text-black-01">{r.open_orders}</span></span>
                  <span>Grade<br />{chip(r.grade)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

// ── sourcing ─────────────────────────────────────────────────────────────────

function OpenRfqsCard({ rfqs, currency }: { rfqs: NonNullable<S["open_rfqs"]>; currency?: string | null }) {
  return (
    <Panel title="Open RFQs" action={<LinkAction label="RFQs" to={`${R.SOURCING}/rfqs`} />}
      footer={rfqs.count > rfqs.items.length ? `${plural(rfqs.count - rfqs.items.length, "more")} open` : undefined}>
      {rfqs.items.length === 0 ? <AllClear>No RFQs are out.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-3">
          {rfqs.items.map((r) => (
            <div key={r.id} className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-mont text-[13px] font-medium text-gray-01">{r.title}</span>
                <span className="block truncate font-mont text-[11px] text-gray-05">{r.number} · {plural(r.invited, "vendor")} invited</span>
                <span className="block font-mont text-[11px] tabular-nums text-gray-01">{r.quoted} of {r.invited} quoted</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mont text-[13px] font-semibold tabular-nums">{compactMoney(r.budget.kobo, currency)}</span>
                <span className={cn("block font-mont text-[11px]", r.ready ? "font-medium text-green-01" : "text-gray-05")}>
                  {r.ready ? "Ready to award" : r.closes ? `Closes ${dayMonth(r.closes)}` : "No closing date"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function SavingsCard({ savings, currency }: { savings: NonNullable<S["savings"]>; currency?: string | null }) {
  const top = savings.items[0]?.saved.kobo || 1;
  return (
    <Panel title="What competition saved" subtitle="Awarded price against the highest quote, RFQs this year">
      {savings.rfqs === 0 ? <AllClear>No RFQ has been awarded this year yet.</AllClear> : (
        <>
          <div>
            <p className="font-mont text-xl font-semibold tabular-nums text-green-01"><Money kobo={savings.saved.kobo} currency={currency} /></p>
            <p className="font-mont text-[11px] text-gray-05">
              {savings.pct != null ? `${savings.pct}% below the highest quote` : "Below the highest quote"} across {plural(savings.rfqs, "awarded RFQ")}
            </p>
          </div>
          <div className="flex flex-1 flex-col justify-around gap-2.5">
            {savings.items.map((i) => (
              <div key={i.name} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-3 font-mont text-[13px]">
                <span className="truncate text-gray-01">{i.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-gray-03/50">
                  <span className="block h-full rounded-full" style={{ width: `${(i.saved.kobo * 100) / top}%`, background: DASH_COLORS.green }} />
                </span>
                <span className="text-right font-semibold tabular-nums">{compactMoney(i.saved.kobo, currency)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

// ── where and how long ───────────────────────────────────────────────────────

function BranchesCard({ rows, windowName, currency }: { rows: NonNullable<S["by_branch"]>; windowName: string; currency?: string | null }) {
  const top = rows[0]?.amount.kobo || 1;
  const total = rows.reduce((sum, r) => sum + r.amount.kobo, 0);
  return (
    <Panel title="Spend by branch" subtitle={`Posted bills ${windowName}`} footer={rows.length ? `${compactMoney(total, currency)} in all` : undefined}>
      {rows.length === 0 ? <AllClear>No bills posted {windowName}.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-3">
          {rows.map((r) => (
            <div key={r.branch ?? "school"} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 font-mont text-[13px]">
                <span className={cn("min-w-0 truncate", r.branch ? "font-medium text-gray-01" : "text-gray-05")}>{r.branch ?? "School-wide"}</span>
                <span className="shrink-0 font-semibold tabular-nums">{compactMoney(r.amount.kobo, currency)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-03/50">
                <span className="block h-full rounded-full" style={{ width: `${(r.amount.kobo * 100) / top}%`,
                  background: r.branch ? DASH_COLORS.primary : DASH_COLORS.soft }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const STEP_LABEL: Record<string, string> = {
  approval: "Requisition approval", ordering: "Sourcing and ordering",
  delivery: "Delivery after the order", payment: "Bill to payment",
};

/** "6 d" for a measured step, a dash for one with nothing ending in the window. */
export function days(v: number | null): string {
  return v == null ? "-" : `${Number.isInteger(v) ? v : v.toFixed(1)} d`;
}

function CycleCard({ cycle, windowName }: { cycle: NonNullable<S["cycle_times"]>; windowName: string }) {
  const top = Math.max(...cycle.steps.map((s) => s.median_days ?? 0), 1);
  const footer = cycle.total_days != null
    ? `Requisition to paid: about ${Math.round(cycle.total_days)} days${cycle.slowest ? `. ${STEP_LABEL[cycle.slowest]} is the slowest step.` : "."}`
    : cycle.slowest ? `${STEP_LABEL[cycle.slowest]} is the slowest step measured.` : undefined;
  return (
    <Panel title="How long buying takes" subtitle={`Median days per step, steps finished ${windowName}`} footer={footer}>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {cycle.steps.map((s) => (
          <div key={s.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem] items-center gap-3 font-mont text-[13px]">
            <span className="truncate text-gray-01">{STEP_LABEL[s.key]}</span>
            <span className="h-2 overflow-hidden rounded-full bg-gray-03/50">
              {s.median_days != null && (
                <span className="block h-full rounded-full" style={{ width: `${Math.max((s.median_days * 100) / top, 2)}%`,
                  background: s.key === cycle.slowest ? DASH_COLORS.orange : DASH_COLORS.mid }} />
              )}
            </span>
            <span className="text-right font-semibold tabular-nums" title={`${plural(s.samples, "document")} measured`}>{days(s.median_days)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function VendorBaseCard({ base, windowName }: { base: NonNullable<S["vendor_base"]>; windowName: string }) {
  const rows: [string, number, boolean][] = [
    ["Approved and active", base.active, false],
    ["On hold", base.on_hold, base.on_hold > 0],
    ["Still awaiting KYC checks", base.awaiting_kyc, base.awaiting_kyc > 0],
    ["Ordered from once only this year", base.ordered_once, false],
    [`Added ${windowName}`, base.added, false],
  ];
  return (
    <Panel title="Vendor base" subtitle={plural(base.active, "active vendor")} action={<LinkAction label="Vendors" to={`${R.VENDORS}/vendors`} />}>
      <div className="flex flex-1 flex-col justify-around gap-2.5">
        {rows.map(([label, n, warn]) => (
          <div key={label} className="flex items-center justify-between gap-2 font-mont text-[13px]">
            <span className="text-gray-01">{label}</span>
            <span className={cn("font-semibold tabular-nums", warn ? "text-amber-700" : "text-black-01")}>{n}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── the tab ──────────────────────────────────────────────────────────────────

export function SuppliersTab({ d, currency }: { d: S; currency?: string | null }) {
  const windowName = d.window.label.toLowerCase();
  const nothing = !d.spend && d.vendors_paid == null && !d.deliveries && !d.non_po && !d.scorecard && !d.open_rfqs
    && !d.savings && !d.by_branch && !d.cycle_times && !d.vendor_base;
  if (nothing) {
    return <EmptyState title="Nothing to show here yet" message="None of the spend or supplier figures are in your access." />;
  }
  const s = d.spend;
  const over = d.non_po && d.non_po.pct != null && d.non_po.pct > d.non_po.limit_pct;
  const row3 = [d.savings, d.by_branch].filter(Boolean).length;
  const row4 = [d.cycle_times, d.vendor_base].filter(Boolean).length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {s && (
          <KpiTile label={`Spend ${windowName}`} value={formatMoney(s.value.kobo, currency)}
            delta={s.plan ? null : s.delta_pct} goodWhenUp={false}
            badge={s.plan?.pct != null ? `${Math.round(s.plan.pct)}% of plan` : undefined}
            note={s.plan
              ? `Year to date ${compactMoney(s.plan.spent_ytd.kobo, currency)} of ${compactMoney(s.plan.planned.kobo, currency)} planned, ${s.plan.year_elapsed_pct}% of the year gone`
              : s.prior_value ? `vs ${compactMoney(s.prior_value.kobo, currency)} at the same point before` : d.window.name} />
        )}
        {d.vendors_paid != null && (
          <KpiTile label="Vendors paid" value={String(d.vendors_paid)}
            note={s && s.vendors_with_spend
              ? `80% of spend with ${s.vendors_for_80pct} of ${plural(s.vendors_with_spend, "vendor")}` : windowName} />
        )}
        {d.deliveries && (
          <KpiTile label="Delivered on time" value={pct(d.deliveries.on_time_pct)} color={DASH_COLORS.green}
            badge={d.deliveries.on_time_change_pts != null
              ? `${d.deliveries.on_time_change_pts >= 0 ? "+" : ""}${d.deliveries.on_time_change_pts} pts` : undefined}
            note={d.deliveries.on_time_pct == null ? "No receipt had an expected date" : "Of receipts with an expected date"} />
        )}
        {d.deliveries && (
          <KpiTile label="Accepted on receipt" value={pct(d.deliveries.accepted_pct)}
            note={d.deliveries.rejected_lines ? `${plural(d.deliveries.rejected_lines, "line")} with items rejected ${windowName}` : "Nothing rejected"} />
        )}
        {d.non_po && (
          <KpiTile label="Spend without a PO" value={compactMoney(d.non_po.amount.kobo, currency)} color={DASH_COLORS.amber}
            badge={d.non_po.count ? plural(d.non_po.count, "bill") : undefined}
            note={<span className={cn(over && "font-medium text-amber-700")}>
              {pct(d.non_po.pct)} of spend · limit {d.non_po.limit_pct}%{over ? ", over the limit" : ""}
            </span>} />
        )}
      </div>

      {(d.scorecard || d.open_rfqs) && (
        <div className={cn("grid grid-cols-1 gap-5", d.scorecard && d.open_rfqs && "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
          {d.scorecard && <ScorecardCard rows={d.scorecard} windowName={windowName} currency={currency} />}
          {d.open_rfqs && <OpenRfqsCard rfqs={d.open_rfqs} currency={currency} />}
        </div>
      )}

      {row3 > 0 && (
        <div className={cn("grid grid-cols-1 gap-5", row3 === 2 && "md:grid-cols-2")}>
          {d.savings && <SavingsCard savings={d.savings} currency={currency} />}
          {d.by_branch && <BranchesCard rows={d.by_branch} windowName={windowName} currency={currency} />}
        </div>
      )}

      {row4 > 0 && (
        <div className={cn("grid grid-cols-1 gap-5", row4 === 2 && "md:grid-cols-2")}>
          {d.cycle_times && <CycleCard cycle={d.cycle_times} windowName={windowName} />}
          {d.vendor_base && <VendorBaseCard base={d.vendor_base} windowName={windowName} />}
        </div>
      )}
    </div>
  );
}
