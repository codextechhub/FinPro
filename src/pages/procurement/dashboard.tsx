/**
 * The Procurement overview: the landing screen of the Procurement console.
 *
 * One call to /procurement/reports/dashboard/ returns every block. The server
 * sends each block only to a reader who holds the key behind it and answers it
 * under their branches, so this page draws what arrives: a storekeeper who
 * raises requisitions sees their approval queue and the requisition stage of the
 * pipeline, not an empty spend chart. The approval queue is the reader's own and
 * always shown.
 *
 * The window switch (this month, a school's term, the year to date) changes
 * spend, categories, top vendors and what was paid; everything else is where
 * things stand today. The cards are the finance dashboard's (see
 * finance/dashboard-cards), so the two consoles read the same way.
 */

import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router";

import { ProcurementShell } from "./procurement-shell";
import { Donut, ErrorState, InfoHint, LoadingState, TabStrip, useActiveEntity, type TabStripItem } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { cn } from "@/lib/utils";
import { P } from "../../permissions";
import { useGetProcurementDashboardQuery } from "@/redux/services/procurement/procurement-ext-api";
import type { ProcurementDashboard as Dashboard } from "@/redux/services/procurement/procurement-ext-types";
import { routesPath } from "@/routes/routes-path";
import { formatMoney } from "@/utils/money";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import {
  AllClear, DASH_COLORS, KpiTile, LinkAction, Panel, compactMoney, plural,
} from "../finance/dashboard-cards";
import { greeting } from "../finance/dashboard-words";

const R = routesPath.PROTECTED.PROCUREMENT;
type D = Dashboard;

const DONUT_COLORS = [DASH_COLORS.primary, DASH_COLORS.mid, "#E0B25C", DASH_COLORS.soft, DASH_COLORS.orange, "#94A3B8"];

function rowCols(n: number) {
  return n >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : n === 2 ? "md:grid-cols-2" : "";
}

function fmtDate(iso?: string) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const dayMonth = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Whole days since an ISO timestamp, as the approval list reads it: "today", "1 day", "6 days". */
export function waitingFor(iso: string | null, now: Date = new Date()): { label: string; days: number } {
  if (!iso) return { label: "-", days: 0 };
  const days = Math.max(Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000), 0);
  return { label: days === 0 ? "today" : plural(days, "day"), days };
}

function ago(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${formatDistanceToNowStrict(date)} ago`;
}

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ── pipeline ─────────────────────────────────────────────────────────────────

type StageKey = keyof D["pipeline"];

/** Where every open document sits, one stage per list, each opening that list. */
function PipelineCard({ pipeline, windowName, currency }: { pipeline: D["pipeline"]; windowName: string; currency?: string | null }) {
  const navigate = useNavigate();
  const stages: { key: StageKey; label: string; to: string; flag: (n: number, days?: number) => string }[] = [
    { key: "requisitions", label: "Requisitions", to: R.REQUISITIONS, flag: (n) => `${n} not yet approved` },
    { key: "rfqs", label: "RFQs out", to: `${R.SOURCING}/rfqs`, flag: (n, days) => `${n} close within ${plural(days ?? 7, "day")}` },
    { key: "orders", label: "Purchase orders", to: R.PURCHASE_ORDERS, flag: (n) => `${n} partly received` },
    { key: "received_not_billed", label: "Received, not billed", to: `${R.ANALYTICS}/grir`, flag: (n) => `${n} over 30 days` },
    { key: "bills", label: "Bills to pay", to: R.VENDOR_INVOICES, flag: (n) => `${n} overdue` },
    { key: "paid", label: `Paid ${windowName}`, to: R.VENDOR_PAYMENTS, flag: (n) => plural(n, "vendor") },
  ];
  const shown = stages.filter((s) => pipeline[s.key]);
  if (shown.length === 0) return null;
  return (
    <Panel title="Purchase to payment" subtitle={`Where every open document sits now · paid ${windowName}`}>
      <div className={cn("grid grid-cols-2 gap-3", shown.length >= 3 && "sm:grid-cols-3", shown.length >= 6 && "xl:grid-cols-6")}>
        {shown.map((s) => {
          const stage = pipeline[s.key]!;
          const warn = s.key !== "paid" && stage.flag > 0;
          return (
            <button key={s.key} type="button" onClick={() => navigate(s.to)}
              className="flex min-w-0 flex-col gap-1 rounded-md border border-white-02 p-3 text-left transition-colors hover:bg-primary/5">
              <span className="truncate font-mont text-[11px] text-gray-05">{s.label}</span>
              <span className="font-mont text-xl font-semibold tabular-nums text-black-01">{stage.count}</span>
              <span className="truncate font-mont text-xs font-medium tabular-nums text-gray-01">{compactMoney(stage.amount.kobo, currency)}</span>
              <span className={cn("truncate font-mont text-[11px]", warn ? "text-amber-700" : "text-gray-05")}>
                {s.key === "paid" || stage.flag > 0 ? s.flag(stage.flag, stage.flag_days) : "None flagged"}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

// ── committed vs spent ───────────────────────────────────────────────────────

/**
 * Orders raised against bills posted, month by month through the fiscal year.
 *
 * Plain HTML bars: every month keeps its own column, labels thin to every other
 * month on a phone, and pointing at a month (or focusing it) reads its two
 * figures in the line above the chart. The line shows the current month until
 * then.
 */
function CommittedCard({ chart, currency }: { chart: NonNullable<D["committed_vs_spent"]>; currency?: string | null }) {
  const today = chart.current ?? chart.labels.length - 1;
  const [hover, setHover] = useState<number | null>(null);
  const at = hover ?? today;
  const max = Math.max(...chart.committed, ...chart.spent, 1);
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return (
    <Panel title="Committed vs spent" subtitle="Purchase orders raised and vendor bills posted, by month"
      footer={`This year: ${compactMoney(total(chart.committed), currency)} committed · ${compactMoney(total(chart.spent), currency)} spent`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mont text-[11px] text-gray-05">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: DASH_COLORS.soft }} />Committed</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: DASH_COLORS.primary }} />Spent</span>
        </span>
        <span className="tabular-nums text-gray-01" aria-live="polite">
          <span className="font-semibold">{chart.labels[at]}</span> · {compactMoney(chart.committed[at], currency)} committed · {compactMoney(chart.spent[at], currency)} spent
        </span>
      </div>
      <div className="flex min-h-44 flex-1 flex-col" onPointerLeave={() => setHover(null)}>
        <div className="relative flex flex-1 items-stretch gap-1 border-b border-white-02">
          <span className="absolute inset-x-0 top-0 border-t border-dashed border-white-02" aria-hidden="true" />
          <span className="absolute right-0 top-0 -translate-y-full pb-0.5 font-mont text-[10px] tabular-nums text-gray-05">{compactMoney(max, currency)}</span>
          {chart.labels.map((label, i) => (
            <div key={label} tabIndex={0} role="img"
              aria-label={`${label}: ${compactMoney(chart.committed[i], currency)} committed, ${compactMoney(chart.spent[i], currency)} spent`}
              onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              className={cn("flex min-w-0 flex-1 items-end justify-center gap-0.5 rounded-sm pt-4 outline-none",
                i === at && "bg-primary/5")}>
              <span className="w-[38%] max-w-3 rounded-t-sm" style={{ height: `${(chart.committed[i] / max) * 100}%`, background: DASH_COLORS.soft }} />
              <span className="w-[38%] max-w-3 rounded-t-sm" style={{ height: `${(chart.spent[i] / max) * 100}%`, background: DASH_COLORS.primary }} />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1">
          {chart.labels.map((label, i) => (
            <span key={label} className={cn("min-w-0 flex-1 text-center font-mont text-[10px] text-gray-05", i % 2 === 1 && "hidden sm:block",
              i === at && "font-semibold text-gray-01")}>{label}</span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ── approvals ────────────────────────────────────────────────────────────────

const DOC_CHIP: Record<string, { label: string; cls: string }> = {
  "procurement.purchase_order": { label: "PO", cls: "bg-primary/10 text-primary" },
  "procurement.requisition": { label: "REQ", cls: "bg-amber-50 text-amber-700" },
  "procurement.vendor_invoice": { label: "BILL", cls: "bg-gray-03/50 text-gray-01" },
  "procurement.vendor_payment": { label: "PAY", cls: "bg-green-01/10 text-green-01" },
};

function ApprovalsCard({ items, total, currency }: { items: D["approvals_awaiting_user"]; total: D["kpis"]["pending_approvals"]; currency?: string | null }) {
  const navigate = useNavigate();
  return (
    <Panel title="Waiting on your approval" action={<LinkAction label="Approvals" to={R.APPROVALS} />}
      footer={total.count > items.length ? `${plural(total.count - items.length, "more")} in the approvals queue` : undefined}>
      {items.length === 0 ? <AllClear>Nothing is waiting on you.</AllClear> : (
        <div className="flex flex-1 flex-col gap-2">
          {items.map((item) => {
            const chip = DOC_CHIP[item.document_type] ?? { label: "DOC", cls: "bg-gray-03/50 text-gray-01" };
            const wait = waitingFor(item.awaiting_since);
            return (
              <button key={item.workflow_id} type="button" onClick={() => navigate(`${R.APPROVALS}?approval=${item.workflow_id}`)}
                className="flex w-full min-w-0 items-center gap-3 rounded-md border border-white-02 p-2.5 text-left transition-colors hover:bg-primary/5">
                <span className={cn("w-11 shrink-0 rounded px-1 py-0.5 text-center font-mont text-[10px] font-semibold", chip.cls)}>{chip.label}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mont text-[13px] font-medium text-gray-01">
                    {item.reference}{item.title ? ` · ${item.title}` : ""}
                  </span>
                  <span className="block truncate font-mont text-[11px] text-gray-05">{item.requester} · {item.stage}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mont text-[13px] font-semibold tabular-nums text-black-01">{compactMoney(item.amount.kobo, currency)}</span>
                  <span className={cn("block font-mont text-[11px]", wait.days > 5 ? "text-amber-700" : "text-gray-05")}>{wait.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── spend ────────────────────────────────────────────────────────────────────

function CategoriesCard({ spend, windowName, currency }: { spend: NonNullable<D["spend_by_category"]>; windowName: string; currency?: string | null }) {
  return (
    <Panel title="Spend by category" subtitle={`Posted vendor bills ${windowName}`} action={<LinkAction label="Spend" to={`${R.ANALYTICS}/spend`} />}>
      {spend.items.length === 0 ? <AllClear>No bills posted {windowName}.</AllClear> : (
        <Donut
          data={spend.items.map((item, i) => ({ label: item.label, value: item.amount.kobo, color: DONUT_COLORS[i % DONUT_COLORS.length] }))}
          center={{ main: compactMoney(spend.total.kobo, currency), sub: "Total" }}
          formatValue={(v: number) => compactMoney(v, currency)}
        />
      )}
    </Panel>
  );
}

function TopVendorsCard({ vendors, windowName, currency }: { vendors: NonNullable<D["top_vendors"]>; windowName: string; currency?: string | null }) {
  const top = vendors[0]?.amount.kobo || 1;
  return (
    <Panel title="Top vendors" subtitle={`By posted bills ${windowName}`} action={<LinkAction label="Scorecard" to={`${R.ANALYTICS}/performance`} />}>
      {vendors.length === 0 ? <AllClear>No bills posted {windowName}.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-3">
          {vendors.map((v) => (
            <div key={v.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 font-mont text-[13px]">
                <span className="min-w-0 truncate font-medium text-gray-01">{v.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">{compactMoney(v.amount.kobo, currency)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-03/50">
                <span className="block h-full rounded-full" style={{ width: `${(v.amount.kobo * 100) / top}%`, background: DASH_COLORS.primary }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── controls, bills, contracts, activity ─────────────────────────────────────

function exceptionText(x: NonNullable<D["exceptions"]>[number]): { title: string; detail: string; to: string } {
  switch (x.key) {
    case "match_failed":
      return { title: `3-way match failed on ${plural(x.count, "bill")}`, detail: "Billed beyond what was ordered or received", to: R.VENDOR_INVOICES };
    case "price_variance":
      return { title: `Price above the order on ${plural(x.count, "bill")}`, detail: x.detail ?? "Outside the price tolerance", to: R.VENDOR_INVOICES };
    case "vendor_on_hold":
      return { title: `${x.count === 1 ? "A bill" : plural(x.count, "bill")} from a vendor on hold`, detail: x.detail ?? "Payments are blocked", to: R.VENDOR_INVOICES };
    default:
      return { title: `Goods received, no bill after ${x.days ?? 30} days`, detail: `${plural(x.count, "receipt")} sitting in GR/IR`, to: `${R.ANALYTICS}/grir` };
  }
}

function ExceptionsCard({ items, currency }: { items: NonNullable<D["exceptions"]>; currency?: string | null }) {
  const navigate = useNavigate();
  return (
    <Panel title="Control exceptions" subtitle={items.length ? `${items.length} open` : "Checks on matching, prices and vendors"}>
      {items.length === 0 ? <AllClear>Every control is clear.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-2">
          {items.map((x) => {
            const text = exceptionText(x);
            return (
              <button key={x.key} type="button" onClick={() => navigate(text.to)}
                className="flex min-w-0 items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-primary/5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: x.key === "match_failed" || x.key === "vendor_on_hold" ? DASH_COLORS.red : DASH_COLORS.amber }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mont text-[13px] font-medium text-gray-01">{text.title}</span>
                  <span className="block truncate font-mont text-[11px] text-gray-05">{text.detail}</span>
                </span>
                <span className="shrink-0 font-mont text-xs font-semibold tabular-nums">{compactMoney(x.amount.kobo, currency)}</span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

const DUE_META: Record<string, { label: string; color: string }> = {
  current: { label: "Not yet due", color: DASH_COLORS.primary },
  "1-30": { label: "1 to 30 days late", color: DASH_COLORS.amber },
  "31-60": { label: "31 to 60 days late", color: DASH_COLORS.orange },
  "over-60": { label: "Over 60 days late", color: DASH_COLORS.red },
};

function BillsDueCard({ due, to, currency }: { due: NonNullable<D["bills_due"]>; to: string; currency?: string | null }) {
  const total = due.items.reduce((sum, b) => sum + b.amount.kobo, 0);
  const late = total - (due.items.find((b) => b.key === "current")?.amount.kobo ?? 0);
  return (
    <Panel title="Bills falling due" subtitle={`${compactMoney(total, currency)} unpaid`} action={<LinkAction label="AP aging" to={to} />}
      footer={total ? (late ? `${compactMoney(late, currency)} is past its due date` : "Nothing is late") : undefined}>
      {total === 0 ? <AllClear>No unpaid bills.</AllClear> : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            {due.items.map((b) => b.amount.kobo > 0 && (
              <div key={b.key} style={{ width: `${(b.amount.kobo * 100) / total}%`, background: DUE_META[b.key].color }} />
            ))}
          </div>
          <div className="flex flex-1 flex-col justify-between gap-2">
            {due.items.map((b) => (
              <div key={b.key} className="flex items-center gap-2 font-mont text-xs">
                <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: DUE_META[b.key].color }} />
                <span className="text-gray-01">{DUE_META[b.key].label}</span>
                <span className="ml-auto font-medium tabular-nums text-black-01">{compactMoney(b.amount.kobo, currency)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function ContractsCard({ rows, currency }: { rows: NonNullable<D["contracts_ending"]>; currency?: string | null }) {
  return (
    <Panel title="Contracts ending soon" subtitle="Next 90 days" action={<LinkAction label="Contracts" to={R.CONTRACTS} />}>
      {rows.length === 0 ? <AllClear>No contract ends in the next 90 days.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-4">
          {rows.map((c) => {
            const pct = c.ordered && c.value.kobo ? Math.min((c.ordered.kobo * 100) / c.value.kobo, 100) : 0;
            return (
              <div key={c.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 font-mont text-[13px]">
                  <span className="min-w-0 truncate"><span className="font-medium text-gray-01">{c.title}</span>
                    <span className="text-gray-05"> · {c.vendor}</span></span>
                  <span className={cn("shrink-0 text-[11px]", c.days <= 30 ? "text-amber-700" : "text-gray-05")}>Ends {dayMonth(c.end_date)}</span>
                </div>
                {c.ordered && (
                  <div className="h-2 overflow-hidden rounded-full bg-gray-03/50">
                    <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: pct > 85 ? DASH_COLORS.orange : DASH_COLORS.mid }} />
                  </div>
                )}
                <span className="font-mont text-[11px] tabular-nums text-gray-05">
                  {c.ordered ? `${compactMoney(c.ordered.kobo, currency)} ordered of ${compactMoney(c.value.kobo, currency)}` : `Worth ${compactMoney(c.value.kobo, currency)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function ActivityCard({ items, canAudit }: { items: NonNullable<D["recent_activity"]>; canAudit: boolean }) {
  return (
    <Panel title="Recent activity" action={canAudit && items.length > 0 ? <LinkAction label="Audit" to={routesPath.PROTECTED.AUDIT.EVENTS} /> : undefined}>
      {items.length === 0 ? <AllClear>No procurement activity yet.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-3">
          {items.map((item) => (
            <div key={item.id} className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mont text-[11px] font-semibold text-primary">{initials(item.actor)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mont text-[13px] text-gray-01">{item.summary}</span>
                <span className="block truncate font-mont text-[11px] text-gray-05">{item.actor} · {ago(item.occurred_at)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── the page ─────────────────────────────────────────────────────────────────

export default function ProcurementDashboard() {
  const navigate = useNavigate();
  const { code: entity, currency: entityCurrency } = useActiveEntity();
  const { can } = useCan();
  const canAudit = can(P.VIEW_AUDIT);
  // The window is per-entity: a choice made on one set of books is ignored on another.
  const [picked, setPicked] = useState({ entity: "", window: "" });
  const windowKey = picked.entity === entity ? picked.window : "";
  const { data, isLoading, isFetching, isError, refetch } = useGetProcurementDashboardQuery(
    { entity: entity!, ...(windowKey ? { window: windowKey } : {}) },
    { skip: !entity },
  );
  const d = data?.data;
  const currency = entityCurrency ?? d?.currency;
  const windowName = d ? d.window.label.toLowerCase() : "";
  const windowTabs: TabStripItem<string>[] = (d?.windows ?? []).map((w) => ({ value: w.key, label: w.label }));
  const k = d?.kpis;
  const row2 = d ? [d.committed_vs_spent, true].filter(Boolean).length : 0;
  const row3 = d ? [d.spend_by_category, d.top_vendors, d.exceptions].filter(Boolean).length : 0;
  const row4 = d ? [d.bills_due, d.contracts_ending, d.recent_activity].filter(Boolean).length : 0;

  return (
    <ProcurementShell>
      <PageShell className="space-y-5 text-black-01" data-guide="procurement-overview.page">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {d?.reader_first_name && <p className="font-mont text-xs text-gray-05">{greeting()}, {d.reader_first_name}</p>}
            <div className="mt-0.5 flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">Procurement overview</h1>
              <InfoHint ariaLabel="About the procurement overview">
                Built from what you may read: each card appears only when you hold access to the documents behind it. The switch at the top changes spend, categories, top vendors and what was paid; everything else is where things stand today. Approvals are your own.
              </InfoHint>
            </div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">
              {d ? [d.window.name, `as of ${fmtDate(d.as_of)}`, d.narrowed ? "your branches only" : null].filter(Boolean).join(" · ") : "-"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {windowTabs.length > 1 && (
              <TabStrip items={windowTabs} value={d?.window.key ?? windowTabs[0].value}
                onChange={(w) => setPicked({ entity: entity!, window: w })} variant="pill-compact" ariaLabel="Figures for" />
            )}
            {can(P.PROC_CREATE_REQUISITION) && (
              <button onClick={() => navigate(`${R.REQUISITIONS}?action=new`)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-white px-3 font-mont text-xs font-semibold text-primary hover:bg-primary/5">
                <Plus className="size-3.5" /> New requisition
              </button>
            )}
            {can(P.PROC_CREATE_PURCHASE_ORDER) && (
              <button onClick={() => navigate(`${R.PURCHASE_ORDERS}?action=new`)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-mont text-xs font-semibold text-white hover:bg-primary/90">
                <Plus className="size-3.5" /> New purchase order
              </button>
            )}
          </div>
        </div>

        {!entity ? (
          <NoEntityState message="Choose a ledger entity to see its procurement." />
        ) : isLoading ? (
          <LoadingState rows={9} />
        ) : isError || !d || !k ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <div className={cn("space-y-5 transition-opacity", isFetching && "opacity-60")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {k.spend && (
                <KpiTile label={`Spend ${windowName}`} value={formatMoney(k.spend.value.kobo, currency)}
                  delta={k.spend.delta_pct} goodWhenUp={false}
                  note={k.spend.prior_value && k.spend.delta_pct != null
                    ? `vs ${compactMoney(k.spend.prior_value.kobo, currency)} at the same point before` : d.window.name} />
              )}
              {k.open_purchase_orders && (
                <KpiTile label="Open orders" value={String(k.open_purchase_orders.count)}
                  badge={k.open_purchase_orders.partial_count ? `${k.open_purchase_orders.partial_count} partial` : undefined}
                  note={`${compactMoney(k.open_purchase_orders.amount.kobo, currency)} on open orders`} />
              )}
              <KpiTile label="Waiting on you" value={String(k.pending_approvals.count)} color={DASH_COLORS.amber}
                badge={k.pending_approvals.slow_count ? `${k.pending_approvals.slow_count} over 5 days` : undefined}
                note={k.pending_approvals.count
                  ? `${compactMoney(k.pending_approvals.amount.kobo, currency)} across ${plural(k.pending_approvals.type_count, "document type")}`
                  : "Nothing is waiting on you"} />
              {k.overdue_invoices && (
                <KpiTile label="Overdue bills" value={formatMoney(k.overdue_invoices.amount.kobo, currency)} color={DASH_COLORS.red}
                  badge={k.overdue_invoices.count ? plural(k.overdue_invoices.count, "bill") : undefined}
                  note={k.overdue_invoices.oldest_days != null ? `Oldest ${plural(k.overdue_invoices.oldest_days, "day")} past due` : "Nothing is overdue"} />
              )}
              {k.active_vendors && (
                <KpiTile label="Active vendors" value={String(k.active_vendors.count)} color={DASH_COLORS.green}
                  badge={k.active_vendors.on_hold_count ? `${k.active_vendors.on_hold_count} on hold` : undefined}
                  note={k.active_vendors.first_time_count
                    ? `${k.active_vendors.first_time_count} ordered from for the first time ${windowName}` : "No new vendors"} />
              )}
            </div>

            <PipelineCard pipeline={d.pipeline} windowName={windowName} currency={currency} />

            <div className={cn("grid grid-cols-1 gap-5", row2 === 2 && "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
              {d.committed_vs_spent && <CommittedCard chart={d.committed_vs_spent} currency={currency} />}
              <ApprovalsCard items={d.approvals_awaiting_user} total={k.pending_approvals} currency={currency} />
            </div>

            {row3 > 0 && (
              <div className={cn("grid grid-cols-1 gap-5", rowCols(row3))}>
                {d.spend_by_category && <CategoriesCard spend={d.spend_by_category} windowName={windowName} currency={currency} />}
                {d.top_vendors && <TopVendorsCard vendors={d.top_vendors} windowName={windowName} currency={currency} />}
                {d.exceptions && <ExceptionsCard items={d.exceptions} currency={currency} />}
              </div>
            )}

            {row4 > 0 && (
              <div className={cn("grid grid-cols-1 gap-5", rowCols(row4))}>
                {d.bills_due && <BillsDueCard due={d.bills_due} currency={currency}
                  to={can(P.PROC_VIEW_ANALYTICS) ? `${R.ANALYTICS}/ap-aging` : R.VENDOR_INVOICES} />}
                {d.contracts_ending && <ContractsCard rows={d.contracts_ending} currency={currency} />}
                {d.recent_activity && <ActivityCard items={d.recent_activity} canAudit={canAudit} />}
              </div>
            )}
          </div>
        )}
      </PageShell>
    </ProcurementShell>
  );
}
