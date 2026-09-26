/**
 * The Finance overview: the landing screen of the Finance console.
 *
 * One call to /finance/reports/dashboard/ returns every block, computed live. The
 * server sends each block only to a reader who holds the key behind it and
 * answers it under their branches, so this page draws the blocks that arrive and
 * leaves the rest out: a bursar who may read invoices but not the ledger sees
 * collections, aging and overdue payers, and never an empty "Cash & bank" tile.
 * The header buttons and every "open" link are gated the same way, on the key the
 * destination's own screen checks.
 *
 * The window switch (this term, this month, year to date) changes the figures
 * that answer "for which span?": collected, billed against collected, how payers
 * paid, and the branch comparison. A school's term counts the term's fees and
 * what has been paid against them whenever it arrived; a calendar window counts
 * by date. Everything else is a snapshot as of today (or the period pinned).
 *
 * A school's books read in school words ("How parents paid", "This term"); any
 * other books read in neutral words. See dashboard-words.
 */

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, CalendarClock, ArrowUpRight, Plus, ReceiptText } from "lucide-react";
import { FinanceShell } from "./finance-shell";
import { fiscalRunwayNotice } from "./fiscal-runway-model";
import { InfoHint, TabStrip, useActiveEntity, type TabStripItem } from "@/components/finance-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/finance-ui/states";
import { useCan } from "@/components/finance-ui/can";
import { P } from "../../permissions";
import { routesPath } from "@/routes/routes-path";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { useGetFinanceDashboardQuery, useGetReceivablesDashboardQuery } from "@/redux/services/finance/reports-api";
import { useGetPeriodsQuery } from "@/redux/services/finance/setup-api";
import type { DashboardKpi, FinanceDashboard, FiscalRunway, ReceivablesDashboard } from "@/redux/services/finance/reports-types";
import { ReceivablesTab } from "./dashboard-receivables";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import { toArray } from "@/redux/services/finance/api-types";
import { collectedLabel, dashboardWords, greeting } from "./dashboard-words";
import {
  AgingCard, AttentionCard, BankAccountsCard, BilledCollectedCard, BranchesCard, BudgetCard,
  ChannelsCard, DASH_COLORS, KpiTile, PayersCard, PostingsCard, UpcomingCard, YearCloseStrip,
} from "./dashboard-cards";

/** "2026-06-16" → "16 Jun 2026". */
function fmtDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const F = routesPath.PROTECTED.FINANCE;

/** Columns for a row of `n` cards, so a row with two cards has no empty third. */
function rowCols(n: number) {
  return n >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : n === 2 ? "md:grid-cols-2" : "";
}

/**
 * Fiscal-calendar expiry warning: silent while the runway is healthy, amber while
 * it is running out, destructive once the calendar has lapsed (see
 * fiscal-runway-model for why the difference matters and what each one says).
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

export default function FinanceDashboard() {
  const navigate = useNavigate();
  const { code: entity, currency } = useActiveEntity();
  const { can } = useCan();
  const canPeriods = can(P.FIN_VIEW_PERIODS);
  const canRecordPayment = can(P.FIN_RECORD_PAYMENT);
  const canCreateInvoice = can(P.FIN_CREATE_INVOICE);
  // Period numbers and windows are per-entity, so a choice made on one entity is
  // tagged with it and ignored on any other: switching books never sends a stale
  // period (which would 404) or a window those books do not offer.
  const [picked, setPicked] = useState<{ entity: string; period: string; window: string }>({ entity: "", period: "", window: "" });

  const periodsQ = useGetPeriodsQuery({ entity: entity! }, { skip: !entity });
  const periods = toArray(periodsQ.data?.data);

  const mine = picked.entity === entity;
  const period = mine ? picked.period : "";
  const periodValid = period !== "" && periods.some((p) => String(p.period_no) === period);
  const windowKey = mine ? picked.window : "";
  // Receivables & collections is a second view of the same books, for anyone who
  // may read invoices or receipts; the chosen view lives in the URL (?view=).
  const [params, setParams] = useSearchParams();
  const canReceivables = can(P.FIN_VIEW_INVOICES) || can(P.FIN_VIEW_PAYMENTS);
  const tab: "overview" | "receivables" = params.get("view") === "receivables" && canReceivables ? "receivables" : "overview";
  const args = { entity: entity!, ...(periodValid ? { period } : {}), ...(windowKey ? { window: windowKey } : {}) };
  const overviewQ = useGetFinanceDashboardQuery(args, { skip: !entity || tab !== "overview" });
  const receivablesQ = useGetReceivablesDashboardQuery(args, { skip: !entity || tab !== "receivables" });
  const { isLoading, isFetching, isError, refetch } = tab === "overview" ? overviewQ : receivablesQ;
  const d = tab === "overview" ? overviewQ.data?.data as FinanceDashboard | undefined : undefined;
  const r = tab === "receivables" ? receivablesQ.data?.data as ReceivablesDashboard | undefined : undefined;
  const head = d ?? r;
  const words = dashboardWords(head?.books);
  const money = (kobo: number) => formatMoney(kobo, currency);

  const windowTabs: TabStripItem<string>[] = (head?.windows ?? []).map((w) => ({ value: w.key, label: w.label }));
  const viewTabs: TabStripItem<"overview" | "receivables">[] = [
    { value: "overview", label: "Overview" },
    { value: "receivables", label: "Receivables & collections" },
  ];
  const showView = (view: "overview" | "receivables") => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (view === "overview") next.delete("view"); else next.set("view", view);
    return next;
  }, { replace: true });
  const attentionLink = (key: string): string | null => ({
    approvals: routesPath.PROTECTED.WORKFLOW.APPROVALS,
    bank_lines: can(P.FIN_VIEW_BANK_ACCOUNTS) ? F.BANK_RECON : null,
    tax: can(P.FIN_VIEW_TAX) ? `${F.BUDGETS}/tax` : null,
    plans_behind: can(P.FIN_VIEW_PAYMENT_PLANS) ? `${F.RECEIVABLES}/payment-plans` : null,
    unallocated: can(P.FIN_VIEW_PAYMENTS) ? F.RECEIPTS_ALLOCATION : null,
    petty_cash: can(P.FIN_VIEW_PETTY_CASH) ? `${F.EXPENSES}/petty-cash` : null,
  } as Record<string, string | null>)[key] ?? null;

  const tile = (kpi: DashboardKpi | null) => kpi && { value: money(kpi.value.kobo), delta: kpi.spark.length ? kpi.delta_pct : null, spark: kpi.spark };
  const cash = d && tile(d.kpis.cash_position);
  const receivables = d && tile(d.kpis.receivables);
  const payables = d && tile(d.kpis.payables);
  const netIncome = d && tile(d.kpis.net_income_ytd);
  const collected = d?.collections?.collected ?? null;

  const nothingToShow = !!d && !cash && !receivables && !payables && !netIncome && !collected
    && !d.trend && !d.ar_aging && !d.bank_accounts && !d.channels && !d.branches && !d.budget
    && !d.top_payers && !d.recent_journals && !d.close_progress && d.attention.length === 0 && d.upcoming.length === 0;

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide="finance-overview.page">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {head?.reader_first_name && (
              <p className="font-mont text-xs text-gray-05">{greeting()}, {head.reader_first_name}</p>
            )}
            <div className="mt-0.5 flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">Finance overview</h1>
              <InfoHint ariaLabel="About Finance overview">
                A view of these books built from what you may read. Each card appears only when you hold access to the figures behind it. The switch at the top changes the collection figures; everything else is as of the date shown.
              </InfoHint>
            </div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">
              {head ? [head.window?.name, head.as_of ? `as of ${fmtDate(head.as_of)}` : null, head.narrowed ? "your branches only" : null]
                .filter(Boolean).join(" · ") : "-"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {windowTabs.length > 1 && (
              <TabStrip items={windowTabs} value={head?.window.key ?? windowTabs[0].value}
                onChange={(w) => setPicked({ entity: entity!, period, window: w })}
                variant="pill-compact" ariaLabel="Figures for" />
            )}
            {periods.length > 0 && (
              <select value={period} aria-label="As of period"
                onChange={(e) => setPicked({ entity: entity!, period: e.target.value, window: windowKey })}
                className="h-8 rounded-md border border-white-02 bg-white px-2 font-mont text-xs font-medium text-gray-01">
                <option value="">Today</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.period_no}>End of {p.name}</option>
                ))}
              </select>
            )}
            {canRecordPayment && (
              <button onClick={() => navigate(F.RECORD_PAYMENT)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-white px-3 font-mont text-xs font-semibold text-primary hover:bg-primary/5">
                <ReceiptText className="size-3.5" /> Record receipt
              </button>
            )}
            {canCreateInvoice && (
              <button onClick={() => navigate(`${F.RECEIVABLES}/invoices?action=new`)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-mont text-xs font-semibold text-white hover:bg-primary/90">
                <Plus className="size-3.5" /> New invoice
              </button>
            )}
          </div>
        </div>

        {canReceivables && (
          <TabStrip items={viewTabs} value={tab} onChange={showView} variant="underline" ariaLabel="Dashboard views" />
        )}

        {!entity ? (
          <NoEntityState message="Choose a ledger entity to see its finances." />
        ) : isLoading ? (
          <LoadingState rows={8} />
        ) : isError || !head ? (
          <ErrorState onRetry={refetch} />
        ) : r ? (
          <div className={cn("transition-opacity", isFetching && "opacity-60")}>
            <ReceivablesTab d={r} words={words} currency={currency} />
          </div>
        ) : !d ? null : nothingToShow ? (
          <EmptyState title="Nothing to show here yet"
            message="None of the figures on this page are in your access. Your Finance screens are in the menu on the left." />
        ) : (
          <div className={cn("space-y-5 transition-opacity", isFetching && "opacity-60")}>
            {d.fiscal_runway && (
              <FiscalRunwayBanner runway={d.fiscal_runway} canManage={canPeriods}
                onManage={() => navigate(`${F.SETUP}/periods`)} />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {cash && <KpiTile label="Cash & bank" {...cash} note="vs end of last month" />}
              {receivables && <KpiTile label="Receivables" {...receivables} goodWhenUp={false}
                note={receivables.spark.length ? "vs end of last month" : "Across your open invoices"} />}
              {collected && d.collections && (
                <KpiTile label={collectedLabel(d.window.label)} value={money(collected.kobo)} color={DASH_COLORS.green}
                  badge={d.collections.rate_pct != null ? `${d.collections.rate_pct}%` : undefined}
                  note={d.collections.billed
                    ? `Of ${money(d.collections.billed.kobo)} billed${d.window.basis === "billed_for" ? ` for ${d.window.name}` : ""}`
                    : d.window.name} />
              )}
              {payables && <KpiTile label="Payables" {...payables} goodWhenUp={false} color={DASH_COLORS.amber}
                note={d.payables_due
                  ? `${d.payables_due.due_count} bill${d.payables_due.due_count === 1 ? "" : "s"} due in 30 days${d.payables_due.overdue_count ? ` · ${d.payables_due.overdue_count} overdue` : ""}`
                  : "vs end of last month"} />}
              {netIncome && <KpiTile label="Net income, year to date" {...netIncome} note="vs end of last month" />}
            </div>

            <div className={cn("grid grid-cols-1 gap-5", d.trend && "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
              {d.trend && (
                <BilledCollectedCard trend={d.trend} collections={d.collections} windowName={d.window.label.toLowerCase()}
                  basis={d.window.basis} currency={currency} subtitle={words.trendSubtitle} />
              )}
              <AttentionCard items={d.attention} linkFor={attentionLink} currency={currency} />
            </div>

            {(d.ar_aging || d.bank_accounts || d.channels) && (
              <div className={cn("grid grid-cols-1 gap-5", rowCols([d.ar_aging, d.bank_accounts, d.channels].filter(Boolean).length))}>
                {d.ar_aging && <AgingCard aging={d.ar_aging} summary={d.receivables_summary} payers={words.payers} currency={currency} to={`${F.RECEIVABLES}/invoices`} />}
                {d.bank_accounts && <BankAccountsCard banks={d.bank_accounts} currency={currency} to={F.BANK_RECON} />}
                {d.channels && <ChannelsCard channels={d.channels} title={words.channelsTitle} windowName={d.window.label.toLowerCase()} currency={currency} />}
              </div>
            )}

            {(d.branches || d.budget) && (
              <div className={cn("grid grid-cols-1 gap-5", d.branches && d.budget && "xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
                {d.branches && <BranchesCard rows={d.branches} title={words.branchesTitle(d.window.label)} currency={currency} />}
                {d.budget && <BudgetCard budget={d.budget} title={words.budgetTitle} currency={currency} to={`${F.BUDGETS}/budgets`} />}
              </div>
            )}

            {(d.top_payers || d.upcoming.length > 0 || d.recent_journals) && (
              <div className={cn("grid grid-cols-1 gap-5", rowCols([d.top_payers, d.upcoming.length > 0, d.recent_journals].filter(Boolean).length))}>
                {d.top_payers && <PayersCard payers={d.top_payers} summary={d.receivables_summary} title={words.overdueTitle} noun={words.payers} currency={currency} to={`${F.RECEIVABLES}/invoices`} />}
                {d.upcoming.length > 0 && <UpcomingCard items={d.upcoming} currency={currency} />}
                {d.recent_journals && <PostingsCard journals={d.recent_journals} currency={currency} to={F.LEDGER} />}
              </div>
            )}

            {(d.close_progress || d.fiscal_runway?.calendar_end) && (
              <YearCloseStrip runway={d.fiscal_runway} close={d.close_progress} fiscalYear={d.fiscal_year} />
            )}
          </div>
        )}
      </PageShell>
    </FinanceShell>
  );
}
