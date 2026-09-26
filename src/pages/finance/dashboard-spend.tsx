/**
 * The Cash, spend & compliance tab of the Finance dashboard.
 *
 * For whoever minds the money going out and what is owed to the government: how
 * long the cash lasts, where it went this window, which bank lines are still
 * unmatched, how far each budget is used, what payroll, staff claims and petty
 * cash stand at, which returns fall due, and what the asset register is worth.
 * It reads the same windows as the overview, always by date; the page owns the
 * switch and passes the payload in.
 *
 * Every card draws one block and is left out when the block is `null`. The cash,
 * bank, payroll and tax blocks arrive only for readers who see the whole school,
 * so a branch bursar's tab starts at spending and budgets.
 */

import { Money } from "@/components/finance-ui";
import { EmptyState } from "@/components/finance-ui/states";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import type { CashFlowKey, SpendDashboard } from "@/redux/services/finance/reports-types";
import { routesPath } from "@/routes/routes-path";
import {
  AllClear, DASH_COLORS, KpiTile, LinkAction, Panel, compactMoney, fmtShortDate, plural,
} from "./dashboard-cards";
import type { DashboardWords } from "./dashboard-words";

type S = SpendDashboard;
const F = routesPath.PROTECTED.FINANCE;

function rowCols(n: number) {
  return n >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : n === 2 ? "md:grid-cols-2" : "";
}

const dayMonth = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// ── headline ─────────────────────────────────────────────────────────────────

/** "4.8 months", "Over 3 years", or a dash when the books are too new to say. */
export function runwayLabel(months: number | null): string {
  if (months == null) return "-";
  if (months > 36) return "Over 3 years";
  return `${months} month${months === 1 ? "" : "s"}`;
}

/** "the last 3 months" once the books have that much history, else "the last 26 days". */
function historyLabel(days: number) {
  return days >= 90 ? "the last 3 months" : `the last ${days} days`;
}

const PREVIOUS: Record<string, string> = { term: "last term", month: "last month", quarter: "last quarter", year: "last year" };

function dueIn(days: number) {
  return days < 0 ? `overdue by ${plural(-days, "day")}` : days === 0 ? "due today" : `due in ${plural(days, "day")}`;
}

// ── cash movement ────────────────────────────────────────────────────────────

export interface CashBar {
  key: string;
  label: string;
  amount: number;
  from: number;
  to: number;
  kind: "total" | "in" | "out";
}

/**
 * The cash movement chart as bars: the opening balance, each step floating from
 * the running total before it to the one after, and the closing balance. The
 * steps arrive in drawing order, money in before money out.
 */
export function cashBars(
  opening: number, steps: { key: CashFlowKey; amount: number }[], labelFor: (key: CashFlowKey) => string,
  openLabel: string, closeLabel: string,
): CashBar[] {
  const bars: CashBar[] = [{ key: "opening", label: openLabel, amount: opening, from: 0, to: opening, kind: "total" }];
  let running = opening;
  for (const s of steps) {
    bars.push({ key: s.key, label: labelFor(s.key), amount: s.amount, from: running, to: running + s.amount,
      kind: s.amount >= 0 ? "in" : "out" });
    running += s.amount;
  }
  bars.push({ key: "closing", label: closeLabel, amount: running, from: 0, to: running, kind: "total" });
  return bars;
}

const BAR_COLOR = { total: DASH_COLORS.primary, in: DASH_COLORS.green, out: DASH_COLORS.orange } as const;

/**
 * Cash from the window's first day to today across every bank and cash account.
 *
 * Desktop draws the steps as a waterfall of columns, each floating from the
 * running total before it; labels sit under their column and wrap to three
 * lines rather than squeezing. Below the medium breakpoint the same bars lie on their
 * side, one row per step, so a phone reads a list instead of eleven slivers.
 */
function CashMovementCard({ cash, words, currency }: { cash: NonNullable<S["cash_movement"]>; words: DashboardWords; currency?: string | null }) {
  const labels: Record<CashFlowKey, string> = {
    receipts: words.receiptsLabel, other_income: "Other income", equity: "Capital and balances in",
    other_in: "Other money in", payroll: "Salaries", vendors: "Suppliers", tax: "Tax remitted",
    claims: "Staff claims", petty_cash: "Petty cash top-ups", refunds: words.refundsLabel,
    spending: "Bills paid", other_out: "Other payments",
  };
  const bars = cashBars(cash.opening.kobo, cash.steps.map((s) => ({ key: s.key, amount: s.amount.kobo })),
    (k) => labels[k], `Opening ${dayMonth(cash.start)}`, `Today, ${dayMonth(cash.end)}`);
  const values = bars.flatMap((b) => [b.from, b.to]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values, lo + 1);
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const into = cash.steps.filter((s) => s.amount.kobo > 0).reduce((sum, s) => sum + s.amount.kobo, 0);
  const out = cash.steps.filter((s) => s.amount.kobo < 0).reduce((sum, s) => sum - s.amount.kobo, 0);
  const signed = (b: CashBar) => b.kind === "total" ? compactMoney(b.amount, currency)
    : `${b.amount >= 0 ? "+" : "-"}${compactMoney(Math.abs(b.amount), currency)}`;

  return (
    <Panel title={`Cash movement ${dayMonth(cash.start)} to ${dayMonth(cash.end)}`}
      subtitle="From the opening balance to today, across all bank and cash accounts"
      footer={`In ${compactMoney(into, currency)} · out ${compactMoney(out, currency)} · net ${into - out >= 0 ? "+" : "-"}${compactMoney(Math.abs(into - out), currency)}`}>
      {cash.steps.length === 0 ? <AllClear>No money moved in this window.</AllClear> : (
        <>
          <div className="hidden min-h-56 flex-1 gap-2 md:flex" role="img"
            aria-label={bars.map((b) => `${b.label} ${signed(b)}`).join(", ")}>
            {bars.map((b) => {
              const bottom = pos(Math.min(b.from, b.to));
              const height = Math.max(pos(Math.max(b.from, b.to)) - bottom, 0.8);
              return (
                <div key={b.key} className="flex min-w-0 flex-1 flex-col">
                  <div className="relative flex-1 pt-5">
                    <div className="relative h-full">
                      <span className="absolute inset-x-0 truncate text-center font-mont text-[11px] font-semibold tabular-nums"
                        style={{ bottom: `calc(${bottom + height}% + 4px)`, color: b.kind === "out" ? DASH_COLORS.orange : undefined }}>
                        {signed(b)}
                      </span>
                      <span className="absolute inset-x-1 rounded-sm" style={{ bottom: `${bottom}%`, height: `${height}%`, background: BAR_COLOR[b.kind] }} />
                    </div>
                  </div>
                  <span className="mt-2 line-clamp-3 h-11 text-center font-mont text-[11px] leading-tight text-gray-05"
                    title={b.key === "equity" ? "Capital put in, and balances brought forward from before these books" : undefined}>{b.label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-2.5 md:hidden">
            {bars.map((b) => {
              const left = pos(Math.min(b.from, b.to));
              const width = Math.max(pos(Math.max(b.from, b.to)) - left, 1);
              return (
                <div key={b.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.25rem] items-center gap-2 font-mont text-[11px]">
                  <span className="truncate text-gray-05">{b.label}</span>
                  <span className="relative h-2.5 rounded-full bg-gray-03/40">
                    <span className="absolute inset-y-0 rounded-full" style={{ left: `${left}%`, width: `${width}%`, background: BAR_COLOR[b.kind] }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums" style={{ color: b.kind === "out" ? DASH_COLORS.orange : undefined }}>{signed(b)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}

// ── bank reconciliation ──────────────────────────────────────────────────────

function ReconciliationCard({ accounts, unmatched, currency }: { accounts: NonNullable<S["reconciliation"]>; unmatched: S["unmatched"]; currency?: string | null }) {
  return (
    <Panel title="Bank reconciliation" subtitle="Statement lines matched to the ledger"
      action={<LinkAction label="Reconcile" to={F.BANK_RECON} />}
      footer={unmatched && unmatched.lines > 0
        ? `${plural(unmatched.lines, "line")} worth ${compactMoney(unmatched.amount.kobo, currency)} waiting on a match`
        : "Every imported line is matched"}>
      {accounts.length === 0 ? <AllClear>No bank accounts yet.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-4">
          {accounts.map((a) => {
            const pct = a.lines ? (a.matched * 100) / a.lines : 0;
            const status = a.lines === 0 ? "No statement imported"
              : a.unmatched > 0 ? `${plural(a.unmatched, "line")} open`
                : a.last_reconciled ? `Reconciled ${dayMonth(a.last_reconciled)}` : "All lines matched";
            return (
              <div key={a.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 font-mont text-[13px]">
                  <span className="min-w-0 truncate font-medium text-gray-01">{a.name}</span>
                  <span className={cn("shrink-0 text-[11px]", a.unmatched > 0 ? "text-amber-700" : "text-gray-05")}>{status}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-03/50">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: a.unmatched ? DASH_COLORS.amber : DASH_COLORS.green }} />
                </div>
                <span className="font-mont text-[11px] tabular-nums text-gray-05">
                  {a.lines ? `${a.matched.toLocaleString()} of ${a.lines.toLocaleString()} lines matched` : a.bank_name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── budgets and spending ─────────────────────────────────────────────────────

/**
 * Each of this year's plans in the reader's reach and how much of its spending is
 * used, against how much of the year has gone (the thin mark on each bar). A
 * branch bursar sees the school's plan listed without figures: their branches'
 * spending against the whole plan would read as a shortfall that is only the
 * other branches' share.
 */
function BudgetsCard({ budgets, currency }: { budgets: NonNullable<S["budgets"]>; currency?: string | null }) {
  const elapsed = budgets.year_elapsed_pct;
  return (
    <Panel title="Budgets in use" subtitle={`Spending against plan · ${elapsed}% of the year gone`}
      action={<LinkAction label="Budgets" to={`${F.BUDGETS}/budgets`} />}>
      {budgets.items.length === 0 ? <AllClear>No budgets for this year yet.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-4">
          {budgets.items.map((b) => {
            const pct = b.pct ?? 0;
            const ahead = b.pct != null && pct > elapsed + 10;
            return (
              <div key={b.id} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mont text-[13px]">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-gray-01">{b.name}</span>
                    <span className="text-gray-05"> · {b.branch ?? "School-wide"}</span>
                    {!b.approved && <span className="ml-1.5 rounded bg-gray-03/50 px-1.5 py-0.5 text-[10px] font-medium text-gray-01">Draft</span>}
                  </span>
                  {b.used && (
                    <span className="tabular-nums"><span className="font-semibold text-black-01">{compactMoney(b.used.kobo, currency)}</span>
                      <span className="text-gray-05">{b.pct != null && b.plan ? ` of ${compactMoney(b.plan.kobo, currency)}` : " spent"}</span></span>
                  )}
                </div>
                {b.plan == null ? (
                  <span className="font-mont text-[11px] text-gray-05">The school's plan, measured against every branch</span>
                ) : b.pct == null ? (
                  <span className="font-mont text-[11px] text-gray-05">No spending planned</span>
                ) : (
                  <>
                    <div className="relative h-2 overflow-hidden rounded-full bg-gray-03/50">
                      <span className="block h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: ahead ? DASH_COLORS.orange : DASH_COLORS.mid }} />
                      <span className="absolute inset-y-0 w-0.5 bg-gray-01/40" style={{ left: `${elapsed}%` }} aria-hidden="true" />
                    </div>
                    <span className={cn("font-mont text-[11px]", ahead ? "text-amber-700" : "text-green-01")}>
                      {ahead ? `${Math.round(pct)}% used with ${100 - elapsed}% of the year left` : `${Math.round(pct)}% used, within plan`}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function SpendingCard({ spending, windowName, currency }: { spending: NonNullable<S["spending"]>; windowName: string; currency?: string | null }) {
  const top = spending.items[0]?.amount.kobo || 1;
  return (
    <Panel title={spending.basis === "cost_centre" ? "Spending by cost centre" : "Spending by account"}
      subtitle={`Posted expenses ${windowName}`}
      footer={`${formatMoney(spending.total.kobo, currency)} in all${spending.basis === "account" ? " · tag spending with cost centres to see it by department" : ""}`}>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {spending.items.map((i) => (
          <div key={i.name} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_4.5rem] items-center gap-3 font-mont text-[13px]">
            <span className={cn("truncate", i.name === "Not tagged" ? "text-gray-05" : "font-medium text-gray-01")}>{i.name}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-gray-03/50">
              <span className="block h-full rounded-full" style={{ width: `${(i.amount.kobo * 100) / top}%`,
                background: i.name === "Not tagged" ? DASH_COLORS.soft : DASH_COLORS.primary }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{compactMoney(i.amount.kobo, currency)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── payroll, claims, petty cash ──────────────────────────────────────────────

const RUN_STATUS: Record<string, string> = {
  DRAFT: "draft, not yet posted", POSTED: "accrued, not yet paid", PAID: "paid", CANCELLED: "cancelled",
};

function PayrollCard({ run, currency }: { run: NonNullable<S["payroll"]>; currency?: string | null }) {
  const rows: [string, number][] = [
    ["Net pay to staff", run.net.kobo], ["PAYE", run.paye.kobo], ["Pension (staff share)", run.pension.kobo],
    ...(run.other.kobo > 0 ? [["Other deductions", run.other.kobo] as [string, number]] : []),
  ];
  return (
    <Panel title="Payroll" subtitle={`${run.label} · pays ${dayMonth(run.pay_date)}`}
      action={<LinkAction label="Payroll" to={F.PAYROLL} />}
      footer={`${plural(run.heads, "member", "members")} of staff · ${RUN_STATUS[run.status] ?? run.status.toLowerCase()}`}>
      <div>
        <p className="font-mont text-xl font-semibold tabular-nums text-black-01"><Money kobo={run.gross.kobo} currency={currency} /></p>
        <p className="font-mont text-[11px] text-gray-05">Gross pay</p>
      </div>
      <div className="flex flex-1 flex-col justify-around gap-2">
        {rows.map(([label, kobo]) => (
          <div key={label} className="flex items-center justify-between gap-2 font-mont text-[13px]">
            <span className="text-gray-01">{label}</span>
            <span className="font-medium tabular-nums text-black-01"><Money kobo={kobo} currency={currency} /></span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ClaimsCard({ claims, windowName, currency }: { claims: NonNullable<S["claims"]>; windowName: string; currency?: string | null }) {
  const stages = [
    ["To approve", claims.submitted], ["To pay", claims.approved], [`Paid ${windowName}`, claims.paid],
  ] as const;
  return (
    <Panel title="Expense claims" action={<LinkAction label="Claims" to={`${F.EXPENSES}/claims`} />}>
      <div className="grid grid-cols-3 gap-2">
        {stages.map(([label, s]) => (
          <div key={label} className="min-w-0 rounded-md border border-white-02 p-2.5 font-mont">
            <p className="truncate text-[11px] text-gray-05">{label}</p>
            <p className="text-base font-semibold tabular-nums text-black-01">{s.count}</p>
            <p className="truncate text-[11px] tabular-nums text-gray-05">{compactMoney(s.amount.kobo, currency)}</p>
          </div>
        ))}
      </div>
      {claims.oldest.length === 0 ? <AllClear>No claims waiting for approval.</AllClear> : (
        <div className="flex flex-1 flex-col gap-2.5">
          <p className="font-mont text-[11px] text-gray-05">Waiting longest</p>
          {claims.oldest.map((c) => (
            <div key={c.id} className="flex min-w-0 items-baseline justify-between gap-2 font-mont text-[13px]">
              <span className="min-w-0 truncate"><span className="font-medium text-gray-01">{c.claimant}</span>
                {c.title && <span className="text-gray-05"> · {c.title}</span>}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-gray-05">
                <span className={cn(c.days > 7 && "text-amber-700")}>{plural(c.days, "day")}</span> · {compactMoney(c.amount.kobo, currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function PettyCashCard({ petty, currency }: { petty: NonNullable<S["petty_cash"]>; currency?: string | null }) {
  const low = petty.funds.filter((f) => f.low).length;
  return (
    <Panel title="Petty cash floats" action={<LinkAction label="Petty cash" to={`${F.EXPENSES}/petty-cash`} />}
      footer={low ? `${plural(low, "float")} below ${petty.threshold_pct}%, due a top-up` : `Every float is above ${petty.threshold_pct}%`}>
      <div className="flex flex-1 flex-col justify-around gap-4">
        {petty.funds.map((f) => {
          const pct = f.float.kobo ? Math.min((f.balance.kobo * 100) / f.float.kobo, 100) : 0;
          return (
            <div key={f.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 font-mont text-[13px]">
                <span className="min-w-0 truncate font-medium text-gray-01">{f.name}</span>
                <span className="shrink-0 tabular-nums"><span className="font-semibold">{compactMoney(f.balance.kobo, currency)}</span>
                  <span className="text-gray-05"> of {compactMoney(f.float.kobo, currency)}</span></span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-03/50">
                <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: f.low ? DASH_COLORS.orange : DASH_COLORS.mid }} />
              </div>
              <span className={cn("truncate font-mont text-[11px]", f.low ? "text-amber-700" : "text-gray-05")}>
                {[f.branch, f.low ? `Below the ${petty.threshold_pct}% threshold`
                  : f.last_topped_up ? `Last top-up ${dayMonth(f.last_topped_up)}` : "Not topped up yet"].filter(Boolean).join(" · ")}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── tax and assets ───────────────────────────────────────────────────────────

const TAX_STATE: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-green-01/10 text-green-01" },
  filed: { label: "Filed", cls: "bg-primary/10 text-primary" },
  prepared: { label: "Prepared", cls: "bg-amber-50 text-amber-700" },
  nil: { label: "Nil return", cls: "bg-gray-03/50 text-gray-01" },
};

function TaxCalendarCard({ rows, currency }: { rows: NonNullable<S["tax_calendar"]>; currency?: string | null }) {
  const open = rows.filter((r) => r.state !== "paid");
  return (
    <Panel title="Tax calendar" subtitle="Returns due from a month ago to six weeks ahead"
      action={<LinkAction label="Tax remittance" to={`${F.BUDGETS}/tax`} />}
      footer={open.length ? `${plural(open.length, "return")} still to file or pay · a nil return must still be filed` : undefined}>
      {rows.length === 0 ? <AllClear>No returns due in this span.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-3">
          {rows.map((r) => {
            const d = fmtShortDate(r.due_date);
            const late = r.days < 0 && r.state !== "paid";
            const state = late ? { label: "Overdue", cls: "bg-destructive/10 text-destructive" } : TAX_STATE[r.state];
            return (
              <div key={r.id} className="flex min-w-0 items-center gap-3">
                <span className="flex w-11 shrink-0 flex-col items-center rounded-md border border-white-02 py-1">
                  <span className="font-mont text-[10px] text-gray-05">{d.mon}</span>
                  <span className="font-mont text-sm font-semibold tabular-nums text-black-01">{d.day}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mont text-[13px] font-medium text-gray-01">{r.name}</p>
                  <p className="truncate font-mont text-[11px] text-gray-05">{r.period}{r.state !== "paid" ? ` · ${dueIn(r.days)}` : ""}</p>
                </div>
                <span className="shrink-0 font-mont text-xs font-semibold tabular-nums">{r.amount.kobo ? compactMoney(r.amount.kobo, currency) : "-"}</span>
                <span className={cn("hidden shrink-0 rounded px-1.5 py-0.5 font-mont text-[11px] font-medium sm:inline", state.cls)}>{state.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function AssetsCard({ assets, windowName, currency }: { assets: NonNullable<S["assets"]>; windowName: string; currency?: string | null }) {
  return (
    <Panel title="Fixed assets" action={<LinkAction label="Register" to={`${F.BUDGETS}/assets`} />}
      footer={`The bar shows how much of each class's cost is already depreciated.${assets.fully_depreciated_in_use
        ? ` ${plural(assets.fully_depreciated_in_use, "asset")} fully depreciated and still in use.` : ""}`}>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="font-mont text-[11px] text-gray-05">Net book value</p>
          <p className="truncate font-mont text-lg font-semibold tabular-nums text-black-01">{compactMoney(assets.net_book_value.kobo, currency)}</p>
        </div>
        <div className="min-w-0">
          <p className="font-mont text-[11px] text-gray-05">Depreciation {windowName}</p>
          <p className="truncate font-mont text-lg font-semibold tabular-nums text-black-01">{compactMoney(assets.depreciation.kobo, currency)}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {assets.categories.map((c) => (
          <div key={c.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-3 font-mont text-[13px]">
            <span className="truncate text-gray-01">{c.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-gray-03/50">
              <span className="block h-full rounded-full" style={{ width: `${Math.min(c.depreciated_pct ?? 0, 100)}%`, background: DASH_COLORS.mid }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{compactMoney(c.net_book_value.kobo, currency)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── the tab ──────────────────────────────────────────────────────────────────

export function SpendTab({ d, words, currency }: { d: S; words: DashboardWords; currency?: string | null }) {
  const windowName = d.window.label.toLowerCase();
  const nothing = !d.runway && !d.cash_movement && !d.spend && !d.spending && !d.reconciliation && !d.unmatched && !d.budgets
    && !d.payroll && !d.claims && !d.petty_cash && !d.tax_owed && !d.tax_calendar && !d.assets;
  if (nothing) {
    return <EmptyState title="Nothing to show here yet" message="None of the cash, spending or tax figures are in your access." />;
  }
  const row3 = [d.budgets, d.spending].filter(Boolean).length;
  const row4 = [d.payroll, d.claims, d.petty_cash].filter(Boolean).length;
  const row5 = [d.tax_calendar, d.assets].filter(Boolean).length;
  const tax = d.tax_owed;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {d.runway && <KpiTile label="Cash runway" value={runwayLabel(d.runway.months)}
          note={d.runway.monthly_outflow
            ? `At ${compactMoney(d.runway.monthly_outflow.kobo, currency)} a month, ${historyLabel(d.runway.based_on_days)}' average`
            : "Needs two weeks of history"} />}
        {d.spend && <KpiTile label={`Operating spend ${windowName}`} value={formatMoney(d.spend.amount.kobo, currency)}
          delta={d.spend.delta_pct} goodWhenUp={false} color={DASH_COLORS.amber}
          note={[d.spend.payroll_share_pct ? `${Math.round(d.spend.payroll_share_pct)}% of it salaries` : null,
            d.spend.delta_pct != null ? `vs the same point ${PREVIOUS[d.window.key] ?? "last time"}` : null]
            .filter(Boolean).join(" · ") || d.window.name} />}
        {d.payroll && <KpiTile label={`Payroll · ${d.payroll.label}`} value={formatMoney(d.payroll.gross.kobo, currency)}
          note={`${plural(d.payroll.heads, "member", "members")} of staff · pays ${dayMonth(d.payroll.pay_date)}`} />}
        {tax && <KpiTile label="Tax owed" value={formatMoney(tax.amount.kobo, currency)}
          color={tax.next && tax.next.days < 0 ? DASH_COLORS.red : DASH_COLORS.amber}
          note={tax.next ? `${tax.next.name} ${dueIn(tax.next.days)}` : "Nothing owed on open returns"} />}
        {d.unmatched && <KpiTile label="Unmatched bank lines" value={d.unmatched.lines.toLocaleString()}
          note={d.unmatched.lines ? `${compactMoney(d.unmatched.amount.kobo, currency)} waiting on a match` : "Every imported line is matched"} />}
      </div>

      {(d.cash_movement || d.reconciliation) && (
        <div className={cn("grid grid-cols-1 gap-5", d.cash_movement && d.reconciliation && "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
          {d.cash_movement && <CashMovementCard cash={d.cash_movement} words={words} currency={currency} />}
          {d.reconciliation && <ReconciliationCard accounts={d.reconciliation} unmatched={d.unmatched} currency={currency} />}
        </div>
      )}

      {row3 > 0 && (
        <div className={cn("grid grid-cols-1 gap-5", row3 === 2 && "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
          {d.budgets && <BudgetsCard budgets={d.budgets} currency={currency} />}
          {d.spending && <SpendingCard spending={d.spending} windowName={windowName} currency={currency} />}
        </div>
      )}

      {row4 > 0 && (
        <div className={cn("grid grid-cols-1 gap-5", rowCols(row4))}>
          {d.payroll && <PayrollCard run={d.payroll} currency={currency} />}
          {d.claims && <ClaimsCard claims={d.claims} windowName={windowName} currency={currency} />}
          {d.petty_cash && <PettyCashCard petty={d.petty_cash} currency={currency} />}
        </div>
      )}

      {row5 > 0 && (
        <div className={cn("grid grid-cols-1 gap-5", rowCols(row5))}>
          {d.tax_calendar && <TaxCalendarCard rows={d.tax_calendar} currency={currency} />}
          {d.assets && <AssetsCard assets={d.assets} windowName={windowName} currency={currency} />}
        </div>
      )}
    </div>
  );
}
