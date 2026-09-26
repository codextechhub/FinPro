/**
 * The Finance overview's cards.
 *
 * Each card draws one block of the dashboard payload and nothing else: the page
 * decides whether a block arrived (a block the reader may not see is `null`), and
 * a card only lays it out. Money is formatted in the entity's currency; the charts
 * use the shared finance chart pieces where one fits and plain bars where the
 * shape is the design's own (billed against collected, per month).
 */

import { useNavigate } from "react-router";
import { ArrowUpRight, Check, ChevronRight } from "lucide-react";
import { Donut, Money, CHART_COLORS } from "@/components/finance-ui";
import { EmptyState } from "@/components/finance-ui/states";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import type { FinanceDashboard } from "@/redux/services/finance/reports-types";

type D = FinanceDashboard;

export const DASH_COLORS = {
  primary: CHART_COLORS.primary,
  soft: "#C9D3E8",
  mid: "#8FA3CC",
  green: "#1E7F55",
  amber: "#B7791F",
  orange: "#D9844A",
  red: "#B63A2B",
};

/** "₦48.62M", "₦612k", "₦950": a figure that has to fit a chart label. */
export function compactMoney(kobo: number, currency?: string | null): string {
  const full = formatMoney(kobo, currency);
  const symbol = full.replace(/[\d.,\s-]/g, "") || "₦";
  const n = kobo / 100;
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}${symbol}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${symbol}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}${symbol}${Math.round(a / 1e3)}k`;
  return `${sign}${symbol}${Math.round(a)}`;
}

function fmtShortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? { mon: "", day: iso } : {
    mon: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: String(d.getDate()).padStart(2, "0"),
  };
}

// ── shells ───────────────────────────────────────────────────────────────────

/**
 * A dashboard card. Cards in one row stretch to the tallest, so a card whose list
 * is short would otherwise end in blank space: the body grows to fill the height,
 * and `footer` is a summary line pinned to the bottom edge, so a short card still
 * reads as complete.
 */
export function Panel({ title, subtitle, action, className, children, guide, footer }: {
  title: string; subtitle?: string; action?: React.ReactNode; className?: string; children: React.ReactNode;
  guide?: string; footer?: React.ReactNode;
}) {
  return (
    <section data-guide={guide} className={cn(INFORMATION_CARD_SURFACE, "flex h-full min-w-0 flex-col gap-4 rounded-md p-5", className)}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-mont text-sm font-semibold text-gray-01">{title}</h2>
          {subtitle && <p className="mt-0.5 font-mont text-xs text-gray-05">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
      {footer && (
        <div className="border-t border-white-02 pt-3 font-mont text-[11px] text-gray-05">{footer}</div>
      )}
    </section>
  );
}

/** The middle of a short list: a line saying the rest is fine, centred in the spare height. */
export function AllClear({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 flex-1 items-center justify-center gap-2 font-mont text-xs text-green-01">
      <Check className="size-4 shrink-0" /> {children}
    </div>
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayMonth = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function LinkAction({ label, to }: { label: string; to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}
      className="inline-flex shrink-0 items-center gap-0.5 font-mont text-xs font-semibold text-primary hover:underline">
      {label} <ArrowUpRight className="size-3.5" />
    </button>
  );
}

// ── headline tiles ───────────────────────────────────────────────────────────

/**
 * One headline figure. `delta` is a signed percentage against the previous month
 * end; `goodWhenUp` says which direction is good news, so falling receivables
 * read green and falling cash reads red.
 */
export function KpiTile({ label, value, delta, goodWhenUp = true, spark, color = DASH_COLORS.primary, note, badge }: {
  label: string; value: string; delta?: number | null; goodWhenUp?: boolean; spark?: number[];
  color?: string; note?: React.ReactNode; badge?: string;
}) {
  const hasDelta = delta != null;
  const good = hasDelta && ((delta! >= 0) === goodWhenUp);
  return (
    <div className={cn(INFORMATION_CARD_SURFACE, "flex min-w-0 flex-col gap-2 rounded-md p-4")}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate font-mont text-xs text-gray-05">{label}</p>
        {hasDelta ? (
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-mont text-[11px] font-semibold tabular-nums",
            good ? "bg-green-01/10 text-green-01" : "bg-destructive/10 text-destructive")}>
            {delta! >= 0 ? "+" : ""}{delta}%
          </span>
        ) : badge ? (
          <span className="shrink-0 rounded bg-gray-03/50 px-1.5 py-0.5 font-mont text-[11px] font-semibold tabular-nums text-gray-01">{badge}</span>
        ) : null}
      </div>
      <p className="font-mont text-xl font-semibold tabular-nums text-black-01">{value}</p>
      {spark && spark.length > 1 ? (
        <div className="h-8 w-full"><SparkFill data={spark} color={color} /></div>
      ) : <div className="h-2" />}
      {note && <div className="font-mont text-[11px] text-gray-05">{note}</div>}
    </div>
  );
}

/**
 * A sparkline that stretches to its tile's full width. The shared Sparkline keeps
 * its aspect ratio, which leaves a short line centred in a wide tile.
 */
function SparkFill({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const span = Math.max(...data) - min || 1;
  const points = data.map((v, i) => `${((i * 100) / (data.length - 1)).toFixed(2)},${(29 - ((v - min) / span) * 26).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <polygon points={`0,32 ${points} 100,32`} fill={color} opacity={0.1} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── billed vs collected ──────────────────────────────────────────────────────

export function BilledCollectedCard({ trend, collections, windowName, basis, currency, subtitle }: {
  trend: NonNullable<D["trend"]>; collections: D["collections"]; windowName: string;
  basis: "billed_for" | "dates"; currency?: string | null; subtitle: string;
}) {
  const issued = trend.issued ?? [];
  const collected = trend.collected ?? [];
  const max = Math.max(1, ...issued, ...collected);
  const bar = (v: number) => `${Math.max(v > 0 ? 3 : 0, Math.round((v / max) * 100))}%`;
  return (
    <Panel title="Billed vs collected" subtitle={subtitle} guide="finance-overview.billed-collected"
      action={
        <div className="flex shrink-0 flex-wrap gap-3 font-mont text-[11px] text-gray-05">
          {trend.issued && <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: DASH_COLORS.soft }} />Billed</span>}
          {trend.collected && <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: DASH_COLORS.primary }} />Collected</span>}
        </div>
      }>
      {collections && (
        <div className="flex flex-wrap gap-x-7 gap-y-2">
          {collections.billed && (
            <div><p className="font-mont text-[11px] text-gray-05">Billed · {windowName}</p>
              <p className="font-mont text-base font-semibold tabular-nums text-black-01">{formatMoney(collections.billed.kobo, currency)}</p></div>
          )}
          {collections.collected && (
            <div><p className="font-mont text-[11px] text-gray-05">Collected · {windowName}</p>
              <p className="font-mont text-base font-semibold tabular-nums text-black-01">{formatMoney(collections.collected.kobo, currency)}</p></div>
          )}
          {collections.rate_pct != null && (
            <div><p className="font-mont text-[11px] text-gray-05">Collection rate</p>
              <p className="font-mont text-base font-semibold tabular-nums text-green-01">{collections.rate_pct}%</p></div>
          )}
        </div>
      )}
      <div className="flex h-48 items-end gap-1.5 border-b border-white-02 sm:gap-2.5" role="img"
        aria-label="Billed and collected by month">
        {trend.labels.map((label, i) => (
          <div key={label} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
            {trend.issued && <div className="w-full max-w-4 rounded-t-sm" style={{ height: bar(issued[i]), background: DASH_COLORS.soft }}
              title={`${label} billed: ${formatMoney(issued[i], currency)}`} />}
            {trend.collected && <div className="w-full max-w-4 rounded-t-sm" style={{ height: bar(collected[i]), background: DASH_COLORS.primary }}
              title={`${label} collected: ${formatMoney(collected[i], currency)}`} />}
          </div>
        ))}
      </div>
      <div className="-mt-2 flex gap-1.5 sm:gap-2.5">
        {trend.labels.map((label) => (
          <span key={label} className="min-w-0 flex-1 truncate text-center font-mont text-[10px] text-gray-05">{label.split(" ")[0]}</span>
        ))}
      </div>
      {basis === "billed_for" && (
        <p className="font-mont text-[11px] text-gray-05">The monthly bars count by date. The figures above count this term&rsquo;s fees and what has been paid against them, whenever it arrived.</p>
      )}
    </Panel>
  );
}

// ── needs attention ──────────────────────────────────────────────────────────

const TONE_DOT = { urgent: DASH_COLORS.red, warning: DASH_COLORS.amber, info: DASH_COLORS.primary } as const;

export function AttentionCard({ items, linkFor, currency }: {
  items: D["attention"]; linkFor: (key: string) => string | null; currency?: string | null;
}) {
  const navigate = useNavigate();
  const urgent = items.filter((i) => i.tone === "urgent").length;
  return (
    <Panel title="Needs your attention" guide="finance-overview.attention"
      action={items.length > 0 ? (
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-mont text-[11px] font-semibold",
          urgent ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-800")}>
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      ) : undefined}>
      {items.length === 0 ? (
        <AllClear>Nothing needs you right now.</AllClear>
      ) : (
        <>
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const to = linkFor(item.key);
            const body = (
              <>
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: TONE_DOT[item.tone] }} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                  <span className="font-mont text-[13px] font-medium text-gray-01">{item.title}</span>
                  <span className="truncate font-mont text-[11px] text-gray-05">{item.detail}</span>
                </span>
                {item.amount && item.amount.kobo > 0 && (
                  <span className="shrink-0 font-mont text-xs font-semibold tabular-nums text-gray-01">{compactMoney(item.amount.kobo, currency)}</span>
                )}
                {to && <ChevronRight className="mt-0.5 size-4 shrink-0 text-gray-05" />}
              </>
            );
            return to ? (
              <button key={item.key} type="button" onClick={() => navigate(to)}
                className="flex min-h-11 items-start gap-3 rounded-md border border-white-02 px-3 py-2.5 hover:bg-gray-50">
                {body}
              </button>
            ) : (
              <div key={item.key} className="flex min-h-11 items-start gap-3 rounded-md border border-white-02 px-3 py-2.5">{body}</div>
            );
          })}
        </div>
        {items.length < 4 && <AllClear>Everything else is on track.</AllClear>}
        </>
      )}
    </Panel>
  );
}

// ── receivables aging ────────────────────────────────────────────────────────

const AGING_META: Record<string, { label: string; color: string }> = {
  current: { label: "Current", color: DASH_COLORS.primary },
  "1-30": { label: "1 to 30 days", color: DASH_COLORS.mid },
  "31-60": { label: "31 to 60 days", color: "#E0B25C" },
  "61-90": { label: "61 to 90 days", color: DASH_COLORS.orange },
  "90+": { label: "Over 90 days", color: DASH_COLORS.red },
};

/**
 * Receivables by age. The bucket rows spread over the card's height so the card
 * has no blank lower half beside a taller neighbour; the footer says how many
 * payers owe and how late the oldest is.
 */
export function AgingCard({ aging, summary, payers, currency, to }: {
  aging: NonNullable<D["ar_aging"]>; summary: D["receivables_summary"]; payers: string; currency?: string | null; to: string;
}) {
  const buckets = aging.buckets.map((b) => ({ ...b, meta: AGING_META[b.key] ?? { label: b.key, color: DASH_COLORS.mid } }));
  const total = buckets.reduce((sum, b) => sum + b.pct, 0) || 100;
  const footer = summary && summary.owing_payers > 0
    ? `${plural(summary.owing_payers, payers.replace(/s$/, ""), payers)} owe${summary.owing_payers === 1 ? "s" : ""}${summary.oldest_days_overdue != null
      ? ` · oldest ${plural(summary.oldest_days_overdue, "day")} overdue` : " · nobody is overdue"}`
    : undefined;
  return (
    <Panel title="Receivables aging" subtitle={`${formatMoney(aging.total.kobo, currency)} outstanding`}
      action={<LinkAction label="Invoices" to={to} />} footer={footer}>
      {aging.total.kobo === 0 ? <AllClear>Nothing outstanding.</AllClear> : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            {buckets.map((b) => (
              <div key={b.key} style={{ width: `${(b.pct / total) * 100}%`, background: b.meta.color }} title={`${b.meta.label}: ${b.pct}%`} />
            ))}
          </div>
          <div className="flex flex-1 flex-col justify-between gap-2">
            {buckets.map((b) => (
              <div key={b.key} className="flex items-center gap-2 font-mont text-xs">
                <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: b.meta.color }} />
                <span className="text-gray-01">{b.meta.label}</span>
                <span className="ml-auto tabular-nums text-gray-05">{b.pct}%</span>
                <span className="w-24 text-right font-medium tabular-nums text-black-01"><Money kobo={b.amount.kobo} currency={currency} /></span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

// ── bank accounts ────────────────────────────────────────────────────────────

/**
 * Each bank account's balance. The total across accounts and its month-end line
 * sit on top, so a school with one account still sees how its cash has moved;
 * the footer says what is left to reconcile.
 */
export function BankAccountsCard({ banks, currency, to }: { banks: NonNullable<D["bank_accounts"]>; currency?: string | null; to: string }) {
  const total = banks.reduce((sum, b) => sum + b.balance.kobo, 0);
  const points = Math.max(0, ...banks.map((b) => b.spark.length));
  const series = Array.from({ length: points }, (_, i) =>
    banks.reduce((sum, b) => sum + (b.spark[i - (points - b.spark.length)] ?? 0), 0));
  const lines = banks.reduce((sum, b) => sum + b.unmatched_lines, 0);
  const lastReconciled = banks.map((b) => b.last_reconciled).filter((d): d is string => !!d).sort().pop();
  const footer = banks.length === 0 ? undefined : [
    lines ? `${plural(lines, "line")} to match` : "Nothing to match",
    lastReconciled ? `last reconciled ${dayMonth(lastReconciled)}` : "not reconciled yet",
  ].join(" · ");
  return (
    <Panel title="Cash by account" action={<LinkAction label="Reconcile" to={to} />} footer={footer}>
      {banks.length === 0 ? <EmptyState title="No bank accounts yet" /> : (
        <>
        <div className="flex min-w-0 items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mont text-[11px] text-gray-05">Total across {plural(banks.length, "account")}</p>
            <p className="font-mont text-lg font-semibold tabular-nums text-black-01">{formatMoney(total, currency)}</p>
          </div>
          {series.length > 1 && <div className="w-28 shrink-0"><SparkFill data={series} color={DASH_COLORS.primary} /></div>}
        </div>
        <div className="flex flex-col">
          {banks.map((b) => {
            const short = (b.bank_name || b.name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
            return (
              <div key={b.id} className="flex min-w-0 items-center gap-3 border-b border-white-02 py-2.5 last:border-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-pry-01 font-mont text-[11px] font-bold text-primary">{short}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mont text-[13px] font-medium text-gray-01">{b.name}</p>
                  <p className={cn("font-mont text-[11px]", b.unmatched_lines ? "text-amber-700" : "text-green-01")}>
                    {b.unmatched_lines
                      ? `${b.unmatched_lines} line${b.unmatched_lines === 1 ? "" : "s"} to match`
                      : b.last_reconciled ? `Reconciled ${new Date(`${b.last_reconciled}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Nothing to match"}
                  </p>
                </div>
                <span className="shrink-0 font-mont text-[13px] font-semibold tabular-nums text-black-01">{compactMoney(b.balance.kobo, currency)}</span>
              </div>
            );
          })}
        </div>
        </>
      )}
    </Panel>
  );
}

// ── channels ─────────────────────────────────────────────────────────────────

const CHANNEL_COLORS = [DASH_COLORS.primary, DASH_COLORS.mid, "#E0B25C", DASH_COLORS.soft, DASH_COLORS.orange, "#94A3B8"];

export function ChannelsCard({ channels, title, windowName, currency }: {
  channels: NonNullable<D["channels"]>; title: string; windowName: string; currency?: string | null;
}) {
  return (
    <Panel title={title} subtitle={`Money received · ${windowName}`}
      footer={channels.receipts > 0
        ? `Average receipt ${compactMoney(Math.round(channels.total.kobo / channels.receipts), currency)} · most used: ${channels.items[0]?.label.toLowerCase()}`
        : undefined}>
      {channels.items.length === 0 ? <EmptyState title="Nothing received yet" /> : (
        <Donut size={132} thickness={16}
          center={{ main: compactMoney(channels.total.kobo, currency), sub: `${channels.receipts} receipt${channels.receipts === 1 ? "" : "s"}` }}
          data={channels.items.map((c, i) => ({ label: c.label, value: c.amount.kobo, color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }))}
          formatValue={(v) => compactMoney(v, currency)} />
      )}
    </Panel>
  );
}

// ── branches ─────────────────────────────────────────────────────────────────

function rateColor(pct: number | null) {
  if (pct == null) return DASH_COLORS.mid;
  return pct >= 70 ? DASH_COLORS.green : pct >= 50 ? "#E0B25C" : DASH_COLORS.red;
}

export function BranchesCard({ rows, title, currency }: { rows: NonNullable<D["branches"]>; title: string; currency?: string | null }) {
  const name = (r: (typeof rows)[number]) => r.name ?? "School-wide";
  const billed = rows.reduce((sum, r) => sum + r.billed.kobo, 0);
  const collected = rows.reduce((sum, r) => sum + r.collected.kobo, 0);
  const overdue = rows.reduce((sum, r) => sum + r.overdue.kobo, 0);
  const best = [...rows].filter((r) => r.rate_pct != null && r.billed.kobo > 0).sort((a, b) => (b.rate_pct ?? 0) - (a.rate_pct ?? 0))[0];
  const footer = [
    `All branches: ${compactMoney(billed, currency)} billed, ${compactMoney(collected, currency)} collected${billed ? ` (${Math.round((collected * 100) / billed)}%)` : ""}`,
    overdue ? `${compactMoney(overdue, currency)} overdue` : "nothing overdue",
    best && rows.length > 1 ? `best collection: ${name(best)}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <Panel title={title} subtitle="Billed, collected and overdue per branch" footer={footer}>
      <div className="hidden md:block">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.1fr)] gap-3 border-b border-white-02 pb-2 font-mont text-[11px] text-gray-05">
          <span>Branch</span><span className="text-right">Billed</span><span className="text-right">Collected</span><span>Collection rate</span><span className="text-right">Overdue</span>
        </div>
        {rows.map((r) => (
          <div key={r.branch_id ?? "shared"} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.1fr)] items-center gap-3 border-b border-white-02 py-2.5 font-mont text-[13px] last:border-0">
            <span className="break-words font-medium text-gray-01">{name(r)}</span>
            <span className="text-right tabular-nums">{compactMoney(r.billed.kobo, currency)}</span>
            <span className="text-right tabular-nums">{compactMoney(r.collected.kobo, currency)}</span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-03/50">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(r.rate_pct ?? 0, 100)}%`, background: rateColor(r.rate_pct) }} />
              </span>
              <span className="w-11 text-right text-xs tabular-nums">{r.rate_pct == null ? "-" : `${Math.round(r.rate_pct)}%`}</span>
            </span>
            <span className={cn("text-right tabular-nums", r.overdue.kobo > 0 ? "text-destructive" : "text-gray-05")}>{compactMoney(r.overdue.kobo, currency)}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <div key={r.branch_id ?? "shared"} className="rounded-md border border-white-02 p-3">
            <div className="flex items-baseline justify-between gap-2 font-mont">
              <span className="min-w-0 truncate text-[13px] font-medium text-gray-01">{name(r)}</span>
              <span className="text-xs font-semibold tabular-nums">{r.rate_pct == null ? "-" : `${Math.round(r.rate_pct)}%`}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-03/50">
              <span className="block h-full rounded-full" style={{ width: `${Math.min(r.rate_pct ?? 0, 100)}%`, background: rateColor(r.rate_pct) }} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 font-mont text-[11px] text-gray-05">
              <span>Billed<br /><span className="text-xs font-medium tabular-nums text-black-01">{compactMoney(r.billed.kobo, currency)}</span></span>
              <span>Collected<br /><span className="text-xs font-medium tabular-nums text-black-01">{compactMoney(r.collected.kobo, currency)}</span></span>
              <span>Overdue<br /><span className={cn("text-xs font-medium tabular-nums", r.overdue.kobo > 0 ? "text-destructive" : "text-black-01")}>{compactMoney(r.overdue.kobo, currency)}</span></span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── budget ───────────────────────────────────────────────────────────────────

/**
 * The school's plan line by line. A line's pace is read against how much of the
 * fiscal year has gone: 77% of income with 74% of the year gone is on pace; 93%
 * of a spending line with three months left is running ahead of plan.
 */
export function BudgetCard({ budget, title, currency, to }: {
  budget: NonNullable<D["budget"]>; title: string; currency?: string | null; to: string;
}) {
  const elapsed = budget.year_elapsed_pct;
  return (
    <Panel title={title} subtitle={`${budget.budget_name} · ${elapsed}% of the year gone`} action={<LinkAction label="Budgets" to={to} />}>
      <div className="flex flex-col gap-4">
        {budget.lines.map((l) => {
          const pct = l.pct ?? 0;
          const ahead = l.kind === "expense" ? pct > elapsed + 10 : pct + 10 < elapsed;
          const note = l.pct == null ? "No plan for this line"
            : l.kind === "income"
              ? (ahead ? `Behind pace: ${Math.round(pct)}% of plan with ${elapsed}% of the year gone` : `On pace: ${Math.round(pct)}% of plan`)
              : (ahead ? `${Math.round(pct)}% used with ${100 - elapsed}% of the year left` : `${Math.round(pct)}% used, within plan`);
          return (
            <div key={l.label} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mont text-[13px]">
                <span className="text-gray-01">{l.label}</span>
                <span className="tabular-nums"><span className="font-semibold text-black-01">{compactMoney(l.actual.kobo, currency)}</span>
                  <span className="text-gray-05"> of {compactMoney(l.plan.kobo, currency)}</span></span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-gray-03/50">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`,
                  background: ahead ? DASH_COLORS.orange : l.kind === "income" ? DASH_COLORS.primary : DASH_COLORS.mid }} />
                <span className="absolute inset-y-0 w-0.5 bg-gray-01/40" style={{ left: `${elapsed}%` }} aria-hidden="true" />
              </div>
              <span className={cn("font-mont text-[11px]", ahead ? "text-amber-700" : "text-green-01")}>{note}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── payers, upcoming, postings ───────────────────────────────────────────────

/**
 * The payers owing the most past their due dates. When the list is the whole
 * story (everyone overdue is on it), the spare height says the rest are up to
 * date; the footer looks a week ahead at who falls due next.
 */
export function PayersCard({ payers, summary, title, noun, currency, to }: {
  payers: NonNullable<D["top_payers"]>; summary: D["receivables_summary"]; title: string; noun: string;
  currency?: string | null; to: string;
}) {
  const everyone = !summary || summary.overdue_payers <= payers.length;
  const footer = summary ? (summary.due_soon_payers
    ? `Falling due in 7 days: ${plural(summary.due_soon_payers, noun.replace(/s$/, ""), noun)} · ${compactMoney(summary.due_soon_amount.kobo, currency)}`
    : "Nobody falls due in the next 7 days") : undefined;
  return (
    <Panel title={title} action={<LinkAction label="View all" to={to} />} footer={footer}>
      {payers.length === 0 ? <AllClear>Nobody is overdue.</AllClear> : (
        <>
        <div className="flex flex-col">
          {payers.map((p) => {
            const initials = p.name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
            return (
              <div key={p.customer_id} className="flex min-w-0 items-center gap-3 border-b border-white-02 py-2 last:border-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-03/50 font-mont text-[11px] font-semibold text-gray-01">{initials || "-"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mont text-[13px] font-medium text-gray-01">{p.name}</p>
                  <p className="truncate font-mont text-[11px] text-gray-05">
                    {p.invoices} invoice{p.invoices === 1 ? "" : "s"}{p.branch ? ` · ${p.branch}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mont text-[13px] font-semibold tabular-nums text-black-01"><Money kobo={p.amount.kobo} currency={currency} /></span>
                  <span className={cn("rounded px-1.5 font-mont text-[11px] font-semibold",
                    p.days_overdue > 60 ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-800")}>{p.days_overdue} days</span>
                </div>
              </div>
            );
          })}
        </div>
        {everyone && payers.length < 5 && <AllClear>Everyone else is up to date.</AllClear>}
        {!everyone && summary && (
          <p className="mt-auto font-mont text-[11px] text-gray-05">
            {plural(summary.overdue_payers - payers.length, `more ${noun.replace(/s$/, "")}`, `more ${noun}`)} overdue, {compactMoney(summary.overdue_amount.kobo, currency)} in all
          </p>
        )}
        </>
      )}
    </Panel>
  );
}

export function UpcomingCard({ items, currency }: { items: D["upcoming"]; currency?: string | null }) {
  const into = items.filter((u) => u.direction === "in").reduce((sum, u) => sum + u.amount.kobo, 0);
  const out = items.filter((u) => u.direction === "out").reduce((sum, u) => sum + u.amount.kobo, 0);
  return (
    <Panel title="Coming up in 30 days" subtitle="Money in and out"
      footer={items.length ? `Expected in ${compactMoney(into, currency)} · going out ${compactMoney(out, currency)}` : undefined}>
      {items.length === 0 ? <EmptyState title="Nothing scheduled" /> : (
        <div className="flex flex-col gap-3">
          {items.map((u, i) => {
            const d = fmtShortDate(u.date);
            return (
              <div key={`${u.kind}-${u.date}-${i}`} className="flex min-w-0 items-center gap-3">
                <span className="flex w-11 shrink-0 flex-col items-center rounded-md border border-white-02 py-1">
                  <span className="font-mont text-[10px] text-gray-05">{d.mon}</span>
                  <span className="font-mont text-sm font-semibold tabular-nums text-black-01">{d.day}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mont text-[13px] font-medium text-gray-01">{u.title}</p>
                  <p className="truncate font-mont text-[11px] text-gray-05">{u.detail}</p>
                </div>
                <span className={cn("shrink-0 font-mont text-xs font-semibold tabular-nums", u.direction === "in" ? "text-green-01" : "text-black-01")}>
                  {u.direction === "in" ? "+" : "-"}{compactMoney(u.amount.kobo, currency)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

const KIND_CHIP: Record<string, { label: string; cls: string }> = {
  receipt: { label: "RCPT", cls: "bg-green-01/10 text-green-01" },
  invoice: { label: "INV", cls: "bg-primary/10 text-primary" },
  payroll: { label: "PAY", cls: "bg-amber-100 text-amber-800" },
  manual: { label: "JNL", cls: "bg-gray-03/50 text-gray-01" },
};

export function PostingsCard({ journals, currency, to }: { journals: NonNullable<D["recent_journals"]>; currency?: string | null; to: string }) {
  return (
    <Panel title="Recent postings" action={<LinkAction label="Ledger" to={to} />}>
      {journals.length === 0 ? <EmptyState title="No postings yet" /> : (
        <div className="flex flex-col">
          {journals.map((j) => {
            const chip = KIND_CHIP[j.kind] ?? { label: "JNL", cls: "bg-gray-03/50 text-gray-01" };
            return (
              <div key={j.document_number} className="flex min-w-0 items-start gap-3 border-b border-white-02 py-2 last:border-0">
                <span className={cn("mt-0.5 w-11 shrink-0 rounded px-1 py-0.5 text-center font-mont text-[10px] font-semibold tracking-wide", chip.cls)}>{chip.label}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mont text-[13px] text-gray-01">{j.narration || j.document_number}</p>
                  <p className="truncate font-mont text-[11px] text-gray-05">{j.document_number} · {j.date}</p>
                </div>
                <span className="shrink-0 font-mont text-xs font-semibold tabular-nums text-black-01">{compactMoney(j.amount.kobo, currency)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── year and close ───────────────────────────────────────────────────────────

export function YearCloseStrip({ runway, close, fiscalYear }: {
  runway: D["fiscal_runway"]; close: D["close_progress"]; fiscalYear: string | null;
}) {
  const days = runway?.days_remaining;
  return (
    <section className={cn(INFORMATION_CARD_SURFACE, "grid min-w-0 grid-cols-1 gap-6 rounded-md p-5", close && "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]")}>
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="font-mont text-sm font-semibold text-gray-01">Fiscal year runway</h2>
        <p className="font-mont text-xs text-gray-05">
          {runway?.calendar_end
            ? `FY ${fiscalYear ?? ""} periods run to ${new Date(`${runway.calendar_end}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}${days != null ? `, ${days} day${days === 1 ? "" : "s"} away` : ""}.`
            : "No fiscal periods are set up yet."}
        </p>
      </div>
      {close && (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2 font-mont">
            <span className="text-[13px] font-semibold text-gray-01">{close.period} close</span>
            <span className="text-xs tabular-nums text-gray-05">{close.done} of {close.total} checks</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            {close.checks.map((c) => (
              <div key={c.name} className="flex min-w-0 flex-col gap-1.5">
                <span className={cn("h-1.5 rounded-full", c.passed ? "bg-green-01" : "bg-gray-03")} />
                <span className="font-mont text-[10px] leading-tight text-gray-05">{c.name.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

