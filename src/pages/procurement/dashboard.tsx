import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowUpRight, Banknote, CircleAlert, ClipboardCheck, FileText, PackageCheck,
  ReceiptText, ShoppingCart, Store, TrendingDown, TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router";

import { ProcurementShell } from "./procurement-shell";
import {
  BarChart, CHART_COLORS, Donut, EmptyState, ErrorState, InfoHint,
  LoadingState, StatCard, StatusPill, TrendArea, useActiveEntity,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "../../permissions";
import { useGetProcurementDashboardQuery } from "@/redux/services/procurement/procurement-ext-api";
import { routesPath } from "@/routes/routes-path";
import { currencySymbol, formatMoney, toNaira } from "@/utils/money";
import { PageShell } from "@/components/layout/page-shell";

const PROC = routesPath.PROTECTED.PROCUREMENT;
const DONUT_COLORS = [
  CHART_COLORS.primary, "#5b5ce2", "#7587f0", "#94a7f8", "#b7c5fb", "#d8e0fd",
];
const BAR_COLORS = [CHART_COLORS.primary, "#5b5ce2", CHART_COLORS.amber, "#cbd5e1", "#94a3b8"];

function fmtDate(iso?: string) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function age(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "-" : formatDistanceToNowStrict(date);
}

function actionStatus(action: string) {
  if (action.includes("CANCELLED") || action.includes("TERMINATED")) return "CANCELLED";
  if (action.includes("PAYMENT")) return "PAID";
  if (action.includes("GRN") || action.includes("STOCK_RECEIVED")) return "RECEIVED";
  if (action.includes("POSTED") || action.includes("APPROVED") || action.includes("AWARDED")) return "APPROVED";
  if (action.includes("ISSUED") || action.includes("SUBMITTED")) return "PENDING";
  return "COMPLETED";
}

function Card({ title, subtitle, action, className, children }: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-mont text-sm font-semibold text-gray-01">{title}</h2>
          {subtitle && <p className="mt-0.5 font-mont text-xs text-gray-05">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">{children}</div>;
}

function CardLink({ label, onClick, text = false }: {
  label: string;
  onClick: () => void;
  text?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-mont text-xs font-medium text-primary hover:text-primary/80",
        !text && "size-7 justify-center rounded-md border border-primary/15 bg-primary/5",
      )}>
      {text && <span>{label}</span>}
      <ArrowUpRight className="size-3.5" />
    </button>
  );
}

export default function ProcurementDashboard() {
  const navigate = useNavigate();
  const { code: entity, currency } = useActiveEntity();
  const { can } = useCan();
  const canReports = can(P.PROC_VIEW_PROC_REPORTS);
  const canAudit = can(P.VIEW_AUDIT);
  const { data, isLoading, isError, refetch } = useGetProcurementDashboardQuery(
    { entity: entity! },
    { skip: !entity || !canReports },
  );
  const d = data?.data;
  const money = (kobo: number) => formatMoney(kobo, currency ?? d?.currency);
  const compactMoney = (kobo: number) => {
    const value = Math.abs(toNaira(kobo));
    const sign = kobo < 0 ? "-" : "";
    const symbol = currencySymbol(currency ?? d?.currency);
    const units = [
      { threshold: 1_000_000_000, suffix: "b" },
      { threshold: 1_000_000, suffix: "m" },
      { threshold: 1_000, suffix: "k" },
    ];
    const unit = units.find(({ threshold }) => value >= threshold);
    if (!unit) return `${sign}${symbol}${Math.round(value)}`;
    const scaled = value / unit.threshold;
    const rendered = new Intl.NumberFormat("en-NG", {
      maximumFractionDigits: scaled < 10 ? 1 : 0,
    }).format(scaled);
    return `${sign}${symbol}${rendered}${unit.suffix}`;
  };

  const spendDelta = d?.kpis.total_spend_mtd.delta_pct;
  const SpendIcon = (spendDelta ?? 0) >= 0 ? TrendingUp : TrendingDown;
  const hasPoData = (d?.purchase_order_status.items ?? []).some((item) => item.count > 0);
  const hasTrendData = (d?.monthly_spend_trend.values ?? []).some((value) => value > 0);

  return (
    <ProcurementShell>
      <PageShell className="space-y-5 text-black-01">
        <header>
          <div className="flex items-center gap-1.5">
            <h1 className="font-mont text-lg font-semibold text-gray-01">Dashboard</h1>
            <InfoHint ariaLabel="About the procurement dashboard">Live procurement activity for the selected ledger entity. Spend is based on posted vendor invoices and approvals are personalized to you.</InfoHint>
          </div>
          <p className="mt-0.5 font-mont text-xs text-gray-05">
            {entity ? `Procurement overview for ${entity} · MTD${d?.as_of ? ` · As of ${fmtDate(d.as_of)}` : ""}` : "Procurement overview"}
          </p>
        </header>

        {!entity ? (
          <EmptyState title="Select an entity" message="Choose a ledger entity to see its procurement dashboard." />
        ) : !canReports ? (
          <EmptyState title="No procurement report access" message="You don’t hold procurement.report.view for this console." />
        ) : isLoading ? (
          <LoadingState rows={9} />
        ) : isError || !d ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Total Spend (MTD)"
                value={money(d.kpis.total_spend_mtd.value.kobo)}
                icon={Banknote}
                ariaLabel="Open spend report"
                onClick={() => navigate(`${routesPath.PROTECTED.PROCUREMENT.ANALYTICS}/spend`)}
                sub={spendDelta == null ? "No comparable prior spend" : (
                  <span className={cn("inline-flex items-center gap-1 font-semibold", spendDelta >= 0 ? "text-green-01" : "text-destructive")}>
                    <SpendIcon className="size-3" />{spendDelta > 0 ? "+" : ""}{spendDelta}% <span className="font-normal text-gray-05">vs prior MTD</span>
                  </span>
                )}
              />
              <StatCard label="Open Purchase Orders" value={d.kpis.open_purchase_orders.count} icon={ShoppingCart}
                ariaLabel="Open purchase orders" onClick={() => navigate(routesPath.PROTECTED.PROCUREMENT.PURCHASE_ORDERS)}
                sub={`${d.kpis.open_purchase_orders.partial_count} partial`} />
              <StatCard label="Pending Approvals" value={d.kpis.pending_approvals.count} icon={ClipboardCheck} tone="amber"
                ariaLabel="Open approvals queue" onClick={() => navigate(PROC.APPROVALS)}
                sub="awaiting you" />
              <StatCard label="Overdue Invoices" value={d.kpis.overdue_invoices.count} icon={CircleAlert} tone="red"
                ariaLabel="Open vendor invoices" onClick={() => navigate(routesPath.PROTECTED.PROCUREMENT.VENDOR_INVOICES)}
                sub={<span><span className="font-semibold text-destructive">{compactMoney(d.kpis.overdue_invoices.amount.kobo)}</span> past due</span>} />
              <StatCard label="Active Vendors" value={d.kpis.active_vendors.count} icon={Store} tone="green"
                ariaLabel="Open vendors" onClick={() => navigate(`${routesPath.PROTECTED.PROCUREMENT.VENDORS}/vendors`)}
                sub={`${d.kpis.active_vendors.on_hold_count} on hold`} />
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-3">
              <Card title="Spend by Category" subtitle="MTD"
                action={<CardLink label="Open spend report" onClick={() => navigate(`${routesPath.PROTECTED.PROCUREMENT.ANALYTICS}/spend`)} />}>
                {d.spend_by_category.items.length === 0 ? <EmptyBlock>No posted spend this month.</EmptyBlock> : (
                  <Donut
                    data={d.spend_by_category.items.map((item, index) => ({
                      label: item.label,
                      value: item.amount.kobo,
                      color: DONUT_COLORS[index % DONUT_COLORS.length],
                    }))}
                    center={{ main: compactMoney(d.spend_by_category.total.kobo), sub: "Total" }}
                    formatValue={compactMoney}
                  />
                )}
              </Card>

              <Card title="Purchase Order Status" subtitle="Documents by approval and receipt stage"
                action={<CardLink label="Open purchase orders" onClick={() => navigate(routesPath.PROTECTED.PROCUREMENT.PURCHASE_ORDERS)} />}>
                {!hasPoData ? <EmptyBlock>No purchase orders yet.</EmptyBlock> : (
                  <BarChart
                    height={190}
                    showValues
                    data={d.purchase_order_status.items.map((item, index) => ({
                      label: item.label, value: item.count, color: BAR_COLORS[index % BAR_COLORS.length],
                    }))}
                  />
                )}
              </Card>

              <Card title="Monthly Spend Trend" subtitle="Last 8 months · posted vendor invoices"
                action={<CardLink label="Open spend report" onClick={() => navigate(`${routesPath.PROTECTED.PROCUREMENT.ANALYTICS}/spend`)} />}>
                {!hasTrendData ? <EmptyBlock>No posted spend in the last eight months.</EmptyBlock> : (
                  <TrendArea
                    height={190}
                    labels={d.monthly_spend_trend.labels}
                    series={[{ name: "Spend", data: d.monthly_spend_trend.values, color: CHART_COLORS.primary }]}
                    format={compactMoney}
                    showLegend={false}
                  />
                )}
              </Card>
            </div>

            <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
              <Card title="Recent Activity" subtitle="Latest successful procurement actions"
                action={d.recent_activity.length > 0 && canAudit
                  ? <CardLink label="View all" text onClick={() => navigate(routesPath.PROTECTED.AUDIT.EVENTS)} />
                  : undefined}>
                {d.recent_activity.length === 0 ? <EmptyBlock>No procurement activity has been recorded yet.</EmptyBlock> : (
                  <div className="divide-y divide-white-02">
                    {d.recent_activity.map((item) => (
                      <div key={item.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="size-2 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="font-mont text-sm font-medium text-gray-01">{item.summary}</p>
                          <p className="mt-0.5 font-mont text-xs text-gray-05">
                            {item.actor}{item.reference ? ` · ${item.reference}` : ""} · {age(item.occurred_at)} ago
                          </p>
                        </div>
                        <StatusPill status={actionStatus(item.action)} className="shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Approvals Awaiting You" subtitle="Your active procurement workflow stages">
                {d.approvals_awaiting_user.length === 0 ? <EmptyBlock>You’re all caught up.</EmptyBlock> : (
                  <div className="space-y-2.5">
                    {d.approvals_awaiting_user.map((item) => {
                      const Icon = item.document_type.includes("purchase_order") ? ShoppingCart
                        : item.document_type.includes("vendor_invoice") ? ReceiptText : FileText;
                      return (
                        <button key={item.workflow_id} type="button" onClick={() => navigate(`${PROC.APPROVALS}?approval=${item.workflow_id}`)}
                          className="flex w-full min-w-0 items-center gap-3 rounded-md border border-white-02 p-3 text-left transition-colors hover:bg-primary/5">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="size-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mont text-sm font-semibold text-gray-01">{item.reference}</span>
                            <span className="block truncate font-mont text-xs text-gray-05">{item.title || item.stage} · {item.requester}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-mont text-sm font-semibold tabular-nums text-black-01">{money(item.amount.kobo)}</span>
                            <span className="block font-mont text-[11px] text-amber-600">{age(item.awaiting_since)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <button type="button" onClick={() => navigate(PROC.APPROVALS)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 font-mont text-xs font-semibold text-primary hover:bg-primary/10">
                  <PackageCheck className="size-3.5" /> Open Approvals Queue
                </button>
              </Card>
            </div>
          </>
        )}
      </PageShell>
    </ProcurementShell>
  );
}
