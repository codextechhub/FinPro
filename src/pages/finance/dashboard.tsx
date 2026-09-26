/**
 * Finance overview (§6.0) - the executive landing screen. Topology ported from
 * the Crestfield Vision design (KPI strip → revenue-vs-budget + aging → trend →
 * overdue/vendor-due → approvals + close → quick actions → recent journals),
 * rendered entirely in the house theme. Every figure is real: one aggregated
 * call to /finance/reports/dashboard/ computes it live from the GL.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowUpRight, Check, Plus, FileText, Receipt, ShoppingCart, BarChart3,
  ArrowUp, ArrowDown, Wallet, HandCoins, TrendingUp, AlertTriangle, CalendarClock,
} from "lucide-react";
import { FinanceShell } from "./finance-shell";
import { fiscalRunwayNotice } from "./fiscal-runway-model";
import {
  Money, StatusPill, BudgetBar, AgingStack, TrendArea, TabStrip, kpiValueClass,
  CHART_COLORS, InfoHint, useActiveEntity, type AgingDatum, type TabStripItem,
} from "@/components/finance-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/finance-ui/states";
import { useCan } from "@/components/finance-ui/can";
import { P } from "../../permissions";
import { routesPath } from "@/routes/routes-path";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatMoney } from "@/utils/money";
import { useGetFinanceDashboardQuery } from "@/redux/services/finance/reports-api";
import { useGetPeriodsQuery } from "@/redux/services/finance/setup-api";
import type { DashboardKpi, FinanceDashboard, FiscalRunway, ReportMoney } from "@/redux/services/finance/reports-types";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import { toArray } from "@/redux/services/finance/api-types";

/** "2026-06-16" → "16 Jun 2026" (the design's as-of format). */
function fmtDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const F = routesPath.PROTECTED.FINANCE;
const headCls = "text-gray-01 bg-[#F1F1F1] font-semibold font-mont text-xs whitespace-nowrap pt-3 pb-2";
const cellCls = "text-black-01 border-white-02 font-medium font-mont text-sm border-y-5";

// ── small building blocks ────────────────────────────────────────────────────

function Card({ title, subtitle, action, className, children }: {
  title?: string; subtitle?: string; action?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <p className="font-mont text-sm font-semibold text-gray-01">{title}</p>}
            {subtitle && <p className="mt-0.5 font-mont text-xs text-gray-05">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="font-mont text-[11px] text-gray-05">-</span>;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-mont text-[11px] font-semibold", up ? "text-green-01" : "text-destructive")}>
      <Icon className="size-3" />{up ? "+" : ""}{pct}%
    </span>
  );
}

const STAT_TONES = {
  green: "bg-green-01/10 text-green-01",
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-100 text-amber-700",
  violet: "bg-violet-100 text-violet-700",
} as const;

/**
 * One KPI card. A figure with no history (a branch reader's receivables, read
 * off their open invoices rather than the ledger) has no sparkline to compare,
 * so it says what it covers instead of "- vs prior month".
 */
function StatCard({ label, kpi, currency, icon: Icon, tone, caption }: {
  label: string; kpi: DashboardKpi; currency?: string | null;
  icon: React.ComponentType<{ className?: string }>; tone: keyof typeof STAT_TONES;
  caption?: string;
}) {
  const amount = formatMoney(kpi.value.kobo, currency);
  const hasHistory = kpi.spark.length > 0;
  return (
    <div className={cn(INFORMATION_CARD_SURFACE, "flex min-w-0 items-start justify-between gap-3 rounded-md p-4")}>
      <div className="min-w-0">
        <p className="font-mont text-xs text-gray-05">{label}</p>
        <p className={cn("mt-2 font-mont font-semibold text-black-01 tabular-nums", kpiValueClass(amount))}>{amount}</p>
        <div className="mt-2 flex items-center gap-1.5">
          {hasHistory ? (
            <>
              <Delta pct={kpi.delta_pct} />
              <span className="font-mont text-[11px] text-gray-05">vs prior month</span>
            </>
          ) : (
            <span className="font-mont text-[11px] text-gray-05">{caption}</span>
          )}
        </div>
      </div>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", STAT_TONES[tone])}>
        <Icon className="size-4" />
      </span>
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pry-01 font-mont text-[11px] font-semibold text-primary">
      {init || "-"}
    </span>
  );
}

function LinkAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-0.5 font-mont text-xs font-semibold text-primary hover:underline">
      {label} <ArrowUpRight className="size-3.5" />
    </button>
  );
}

/**
 * Fiscal-calendar expiry warning: silent while the runway is healthy, amber while
 * it is running out, destructive once the calendar has lapsed (see
 * fiscal-runway-model for why the difference matters and what each one says).
 * The layout gives the text a 16rem basis so a phone wraps the action onto its own
 * full-width line instead of crushing the message into a narrow column.
 */
function FiscalRunwayBanner({ runway, canManage, onManage }: {
  runway: FiscalRunway; canManage: boolean; onManage: () => void;
}) {
  const notice = fiscalRunwayNotice(runway, fmtDate);
  if (!notice) return null;
  const critical = notice.tone === "critical";
  const Icon = critical ? AlertTriangle : CalendarClock;

  return (
    <div role={critical ? "alert" : "status"}
      className={cn("flex min-w-0 flex-wrap items-start gap-3 rounded-md px-4 py-3 ring-1",
        critical ? "bg-destructive/5 ring-destructive/25" : "bg-amber-50 ring-amber-200")}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md",
        critical ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-700")}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-64">
        <p className={cn("font-mont text-sm font-semibold", critical ? "text-destructive" : "text-amber-900")}>{notice.title}</p>
        <p className={cn("mt-0.5 font-mont text-xs", critical ? "text-destructive/85" : "text-amber-900/80")}>{notice.body}</p>
      </div>
      {canManage && (
        <button onClick={onManage}
          className={cn("inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-mont text-xs font-semibold text-white sm:w-auto",
            critical ? "bg-destructive hover:bg-destructive/90" : "bg-amber-700 hover:bg-amber-800")}>
          Manage fiscal periods <ArrowUpRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// Lower case: the strip capitalises its labels.
const GRANULARITY_TABS: TabStripItem<"monthly" | "quarterly">[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

const AGING_META: Record<string, { label: string; color: string }> = {
  current: { label: "Current", color: CHART_COLORS.green },
  "1-30": { label: "1–30d", color: CHART_COLORS.primary },
  "31-60": { label: "31–60d", color: CHART_COLORS.amber },
  "61-90": { label: "61–90d", color: "#ea580c" },
  "90+": { label: "90d+", color: CHART_COLORS.red },
};

// ── page ─────────────────────────────────────────────────────────────────────

/**
 * The Finance overview.
 *
 * Opens for anyone in the Finance console: the server sends each block only to a
 * reader who holds its key (see FinanceDashboard in reports-types), and this page
 * draws the blocks that arrive and leaves the rest out, so a bursar who may read
 * invoices but not the ledger sees receivables, aging and overdue invoices, and
 * never an empty "Cash position" card. The header actions and quick actions are
 * gated the same way, on the key each destination's own button checks.
 */
export default function FinanceDashboard() {
  const navigate = useNavigate();
  const { code: entity, currency } = useActiveEntity();
  const { can, canAny } = useCan();
  // The runway banner's only fix lives on the Fiscal Periods screen, so offer the
  // link only to someone who can actually open it; the warning itself still shows.
  const canPeriods = can(P.FIN_VIEW_PERIODS);
  const canJournal = canAny(P.FIN_POST_DIRECT_ENTRY, P.FIN_SUBMIT_JOURNAL);
  const canRecordPayment = can(P.FIN_RECORD_PAYMENT);
  const [granularity, setGranularity] = useState<"monthly" | "quarterly">("monthly");
  // Period numbers are per-entity, so a selection only applies to the entity it was
  // made on - we tag it with that entity and derive "" (current) for any other, so
  // switching entities never sends a stale period (which would 404). No effect needed.
  const [picked, setPicked] = useState<{ entity: string; period: string }>({ entity: "", period: "" });

  const periodsQ = useGetPeriodsQuery({ entity: entity! }, { skip: !entity });
  const periods = toArray(periodsQ.data?.data);

  const period = picked.entity === entity ? picked.period : ""; // "" = current period (as-of today)
  const periodValid = period !== "" && periods.some((p) => String(p.period_no) === period);
  const { data, isLoading, isError, refetch } = useGetFinanceDashboardQuery(
    { entity: entity!, ...(periodValid ? { period } : {}) }, { skip: !entity },
  );
  const d = data?.data as FinanceDashboard | undefined;
  const m = (x: ReportMoney) => formatMoney(x.kobo, currency);

  const trend = useMemo(() => {
    const t = d?.trend;
    if (!t) return null;
    if (granularity === "monthly") return t;
    // Fold 12 months → 4 quarters (sum of each 3), labelled by the last month.
    const fold = (arr: number[] | null) => arr && Array.from({ length: Math.ceil(arr.length / 3) }, (_, q) =>
      arr.slice(q * 3, q * 3 + 3).reduce((sum, v) => sum + v, 0));
    const labels = t.labels.filter((_, i) => i % 3 === 2);
    return { labels, issued: fold(t.issued), collected: fold(t.collected) };
  }, [d, granularity]);

  const quickActions = [
    { label: "Manual journal entry", icon: FileText, to: F.LEDGER, show: canJournal },
    { label: "Generate invoices", icon: Receipt, to: `${F.RECEIVABLES}/fee-structures`, show: can(P.FIN_GENERATE_FEE_STRUCTURE) },
    { label: "Record payment", icon: Plus, to: F.RECORD_PAYMENT, show: canRecordPayment },
    { label: "Create PO", icon: ShoppingCart, to: routesPath.PROTECTED.PROCUREMENT.PURCHASE_ORDERS, show: can(P.PROC_CREATE_PURCHASE_ORDER) },
    { label: "Run report", icon: BarChart3, to: `${F.REPORTS}/trial-balance`, show: can(P.FIN_VIEW_REPORTS) },
  ].filter((q) => q.show);

  const kpiCards = d ? [
    { key: "cash", label: "Cash position", kpi: d.kpis.cash_position, icon: Wallet, tone: "green" as const },
    { key: "ar", label: "Outstanding receivables", kpi: d.kpis.receivables, icon: HandCoins, tone: "primary" as const },
    { key: "ap", label: "Outstanding payables", kpi: d.kpis.payables, icon: Receipt, tone: "amber" as const },
    { key: "ni", label: "Net income YTD", kpi: d.kpis.net_income_ytd, icon: TrendingUp, tone: "violet" as const },
  ].filter((c): c is typeof c & { kpi: DashboardKpi } => c.kpi !== null) : [];

  const nothingToShow = !!d && kpiCards.length === 0 && !d.revenue_vs_budget && !d.ar_aging
    && !trend && !d.top_overdue && !d.vendor_due && !d.approvals && !d.close_progress
    && !d.recent_journals && quickActions.length === 0;

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">Finance overview</h1>
              <InfoHint ariaLabel="About Finance overview">
                A view of this entity’s finances, built from what you may read. Each card appears only when you hold access to the figures behind it, and drills into its area from the sidebar. Figures reflect the selected period.
              </InfoHint>
            </div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">
              {d?.fiscal_year ?? "-"}
              {d?.period ? ` · Period: ${d.period}` : ""}
              {d?.as_of ? ` · As of ${fmtDate(d.as_of)}` : ""}
              {d?.narrowed ? " · Your branches only" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {periods.length > 0 && (
              <select value={period} onChange={(e) => setPicked({ entity: entity!, period: e.target.value })}
                className="h-8 rounded-md border border-white-02 bg-white px-2 font-mont text-xs font-medium text-gray-01">
                <option value="">Current period</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.period_no}>{p.name}</option>
                ))}
              </select>
            )}
            {canJournal && (
              <button onClick={() => navigate(F.LEDGER)} className="inline-flex items-center gap-1.5 rounded-md border border-white-02 bg-white px-3 py-1.5 font-mont text-xs font-semibold text-gray-01 hover:bg-gray-50">
                <FileText className="size-3.5" /> New journal
              </button>
            )}
            {canRecordPayment && (
              <button onClick={() => navigate(F.RECORD_PAYMENT)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-mont text-xs font-semibold text-white hover:bg-primary/90">
                <Plus className="size-3.5" /> Record payment
              </button>
            )}
          </div>
        </div>

        {!entity ? (
          <NoEntityState message="Choose a ledger entity to see its finances." />
        ) : isLoading ? (
          <LoadingState rows={8} />
        ) : isError || !d ? (
          <ErrorState onRetry={refetch} />
        ) : nothingToShow ? (
          <EmptyState title="Nothing to show here yet"
            message="None of the figures on this page are in your access. Your Finance screens are in the menu on the left." />
        ) : (
          <>
            {/* Fiscal-calendar runway - silent unless the entity is about to (or already
                did) run out of periods, in which case nothing in finance can post. */}
            {d.fiscal_runway && (
              <FiscalRunwayBanner runway={d.fiscal_runway} canManage={canPeriods}
                onManage={() => navigate(`${F.SETUP}/periods`)} />
            )}

            {kpiCards.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                {kpiCards.map((c) => (
                  <StatCard key={c.key} label={c.label} kpi={c.kpi} currency={currency} icon={c.icon} tone={c.tone}
                    caption="Across your open invoices" />
                ))}
              </div>
            )}

            {(d.revenue_vs_budget || d.ar_aging) && (
              <div className={cn("grid grid-cols-1 gap-5", d.revenue_vs_budget && d.ar_aging && "lg:grid-cols-2")}>
                {d.revenue_vs_budget && (
                  <Card title="Revenue vs Budget" subtitle={d.revenue_vs_budget.has_budget ? `${d.revenue_vs_budget.budget_name} · YTD performance` : "YTD · no approved budget set"}>
                    <div className="space-y-4">
                      <BudgetBar label="Revenue YTD" pct={d.revenue_vs_budget.revenue.pct_of_plan}
                        valueText={m(d.revenue_vs_budget.revenue.actual)} planText={m(d.revenue_vs_budget.revenue.plan)} color={CHART_COLORS.green} />
                      <BudgetBar label="Expense YTD" pct={d.revenue_vs_budget.expense.pct_of_plan}
                        valueText={m(d.revenue_vs_budget.expense.actual)} planText={m(d.revenue_vs_budget.expense.plan)}
                        color={(d.revenue_vs_budget.expense.pct_of_plan ?? 0) > 100 ? CHART_COLORS.red : CHART_COLORS.primary} />
                      <div className="flex items-center justify-between border-t border-white-02 pt-3 font-mont">
                        <span className="text-sm font-medium text-gray-01">Net income YTD vs budget</span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-black-01 tabular-nums">{m(d.revenue_vs_budget.net.actual)}</span>
                          <Delta pct={d.revenue_vs_budget.net.delta_pct} />
                        </span>
                      </div>
                    </div>
                  </Card>
                )}

                {d.ar_aging && (
                  <Card title="AR Aging" subtitle="Outstanding receivable by age bucket"
                    action={<LinkAction label="Details" onClick={() => navigate(`${F.RECEIVABLES}/invoices`)} />}>
                    <AgingStack buckets={d.ar_aging.buckets.map<AgingDatum>((b) => ({
                      key: b.key, label: AGING_META[b.key]?.label ?? b.key, pct: b.pct,
                      amount: <Money kobo={b.amount.kobo} currency={currency} />, color: AGING_META[b.key]?.color ?? CHART_COLORS.slate,
                    }))} />
                    <div className="mt-3 flex items-center justify-between border-t border-white-02 pt-3 font-mont text-sm">
                      <span className="text-gray-05">Total outstanding</span>
                      <span className="font-semibold text-black-01"><Money kobo={d.ar_aging.total.kobo} currency={currency} /></span>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {trend && (
              <Card title={trend.issued && trend.collected ? "Receivables vs Collections" : trend.issued ? "Receivables issued" : "Collections"}
                subtitle="Trailing 12 months"
                action={
                  <TabStrip
                    items={GRANULARITY_TABS}
                    value={granularity}
                    onChange={setGranularity}
                    variant="pill-compact"
                    ariaLabel="Trend granularity"
                  />
                }>
                <TrendArea labels={trend.labels} format={(v) => formatMoney(v, currency)}
                  series={[
                    ...(trend.issued ? [{ name: "Receivable issued", data: trend.issued, color: CHART_COLORS.primary }] : []),
                    ...(trend.collected ? [{ name: "Collected", data: trend.collected, color: CHART_COLORS.green }] : []),
                  ]} />
              </Card>
            )}

            {(d.top_overdue || d.vendor_due) && (
              <div className={cn("grid grid-cols-1 gap-5", d.top_overdue && d.vendor_due && "lg:grid-cols-2")}>
                {d.top_overdue && (
                  <Card title="Top overdue invoices" subtitle="By outstanding balance"
                    action={<LinkAction label="All overdue" onClick={() => navigate(`${F.RECEIVABLES}/invoices`)} />}>
                    {d.top_overdue.length === 0 ? <EmptyState title="Nothing overdue" /> : (
                      <div className="space-y-3">
                        {d.top_overdue.map((o) => (
                          <div key={o.reference} className="flex items-center gap-3">
                            <Initials name={o.customer} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-mont text-sm font-semibold text-gray-01">{o.customer}</p>
                              <p className="truncate font-mont text-xs text-gray-05">{o.reference} · {o.customer_code}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mont text-sm font-semibold text-black-01 tabular-nums"><Money kobo={o.amount.kobo} currency={currency} /></p>
                              <p className="font-mont text-xs text-destructive">{o.days_overdue} days</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}

                {d.vendor_due && (
                  <Card title="Vendor invoices due this week" subtitle="Cash requirements: next 7 days"
                    action={<LinkAction label="All due" onClick={() => navigate(routesPath.PROTECTED.PROCUREMENT.PURCHASE_ORDERS)} />}>
                    {d.vendor_due.length === 0 ? <EmptyState title="Nothing due this week" /> : (
                      <div className="space-y-3">
                        {d.vendor_due.map((v) => (
                          <div key={v.reference} className="flex items-center gap-3">
                            <Initials name={v.vendor} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-mont text-sm font-semibold text-gray-01">{v.vendor}</p>
                              <p className="truncate font-mont text-xs text-gray-05">{v.reference} · Due {v.due_date}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mont text-sm font-semibold text-black-01 tabular-nums"><Money kobo={v.amount.kobo} currency={currency} /></p>
                              <p className="font-mont text-xs text-gray-05">{v.days_until}d</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            )}

            {(d.approvals || d.close_progress) && (
              <div className={cn("grid grid-cols-1 gap-5", d.approvals && d.close_progress && "lg:grid-cols-2")}>
                {d.approvals && (
                  <Card title="Pending approvals" subtitle="Awaiting action across procurement">
                    <div className="space-y-2">
                      {d.approvals.items.map((a) => (
                        <div key={a.label} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 font-mont text-sm">
                          <span className="text-gray-01">{a.label}</span>
                          <span className={cn("font-semibold tabular-nums", a.count > 0 ? "text-primary" : "text-gray-05")}>{a.count} pending</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {d.close_progress && (
                  <Card title="Period close progress" subtitle={`${d.close_progress.period} · ${d.close_progress.done} of ${d.close_progress.total} checks`}>
                    <div className="space-y-2">
                      {d.close_progress.checks.map((c) => (
                        <div key={c.name} className="flex items-center gap-2 font-mont text-sm">
                          <span className={cn("flex size-4 items-center justify-center rounded-full", c.passed ? "bg-green-01 text-white" : "border border-white-02")}>
                            {c.passed && <Check className="size-3" />}
                          </span>
                          <span className={cn(c.passed ? "text-gray-01" : "text-gray-05")}>{c.name.replace(/_/g, " ")}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {quickActions.length > 0 && (
              <Card title="Quick actions" subtitle="Common finance tasks">
                <div className="flex flex-wrap gap-2">
                  {quickActions.map((q) => (
                    <button key={q.label} onClick={() => navigate(q.to)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white-02 bg-white px-3 py-2 font-mont text-xs font-medium text-gray-01 hover:bg-gray-50">
                      <q.icon className="size-3.5 text-gray-05" /> {q.label}
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {d.recent_journals && (
              <Card title="Recent journal activity" subtitle="Last 5 entries · all sources"
                action={<LinkAction label="Open ledger" onClick={() => navigate(F.LEDGER)} />}>
                {d.recent_journals.length === 0 ? <EmptyState title="No journals yet" message="Posted journals will appear here." /> : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="border-0">
                        <TableRow>
                          <TableHead className={headCls}>Journal No</TableHead>
                          <TableHead className={headCls}>Date</TableHead>
                          <TableHead className={headCls}>Source</TableHead>
                          <TableHead className={headCls}>Description</TableHead>
                          <TableHead className={cn(headCls, "text-right")}>Amount</TableHead>
                          <TableHead className={headCls}>Status</TableHead>
                          <TableHead className={headCls}>Created by</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {d.recent_journals.map((j) => (
                          <TableRow key={j.document_number} className="cursor-pointer hover:bg-primary/5" onClick={() => navigate(F.LEDGER)}>
                            <TableCell className={cn(cellCls, "font-semibold")}>{j.document_number}</TableCell>
                            <TableCell className={cellCls}>{j.date}</TableCell>
                            <TableCell className={cellCls}>{j.source}</TableCell>
                            <TableCell className={cn(cellCls, "max-w-xs truncate text-gray-01")}>{j.narration || "-"}</TableCell>
                            <TableCell className={cn(cellCls, "text-right")}><Money kobo={j.amount.kobo} currency={currency} align="right" /></TableCell>
                            <TableCell className={cellCls}><StatusPill status={j.status} /></TableCell>
                            <TableCell className={cellCls}>{j.created_by}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </PageShell>
    </FinanceShell>
  );
}
