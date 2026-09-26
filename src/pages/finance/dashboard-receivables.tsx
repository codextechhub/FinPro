/**
 * The Receivables & collections tab of the Finance dashboard.
 *
 * For the people who chase fees: how fast this window's fees are coming in
 * against last time and the school's target, which classes are behind, whether
 * reminders work, what was given away in concessions and adjustments, what
 * credit payers hold, and who owes the most. It reads the same windows as the
 * overview; the page owns the switch and passes the payload in.
 *
 * Every card draws one block and is left out when the block is `null`, as on the
 * overview; cards in a row share a height, so each ends in a summary line (see
 * Panel in dashboard-cards).
 */

import { useState } from "react";
import { Check } from "lucide-react";
import { Money } from "@/components/finance-ui";
import { EmptyState } from "@/components/finance-ui/states";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import type { ReceivablesDashboard } from "@/redux/services/finance/reports-types";
import { routesPath } from "@/routes/routes-path";
import { AllClear, DASH_COLORS, KpiTile, LinkAction, Panel, compactMoney, plural } from "./dashboard-cards";
import type { DashboardWords } from "./dashboard-words";

type R = ReceivablesDashboard;
const F = routesPath.PROTECTED.FINANCE;

function rowCols(n: number) {
  return n >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : n === 2 ? "md:grid-cols-2" : "";
}

// ── collection curve ─────────────────────────────────────────────────────────

/**
 * The week labels under the curve: about six, spaced evenly, always including the
 * first and last week. `wide` marks the ones that show only from the small
 * breakpoint up, so a phone gets every other label and nothing crowds.
 */
export function curveTicks(weeks: number): { week: number; wide: boolean }[] {
  if (weeks <= 1) return [{ week: 0, wide: false }];
  const step = weeks <= 7 ? 1 : Math.ceil(weeks / 6);
  const picks: number[] = [];
  for (let w = 0; w < weeks - 1; w += step) picks.push(w);
  // Drop a tick crowding the last week's label.
  if (picks.length > 1 && weeks - 1 - picks[picks.length - 1] < step / 2) picks.pop();
  picks.push(weeks - 1);
  return picks.map((week, i) => ({ week, wide: i !== 0 && i !== picks.length - 1 && i % 2 === 1 }));
}

/**
 * Cumulative share of the window's fees paid, week by week, with last window's
 * curve and the school's target for comparison.
 *
 * The lines are an SVG stretched to the plot; every label is HTML placed at the
 * same percentage positions, so nothing is squeezed into a row of its own and
 * nothing can spill past the card: week labels are thinned (see curveTicks),
 * the first and last are pinned inside the edges, and today's point carries its
 * own "W6 · 71%" marker, flipped to the left near the right edge.
 *
 * Pointing at the chart (mouse or touch) moves the marker to the nearest week and
 * shows that week's share, with the previous window's share for the same week
 * when there is one; a week not reached yet says so. The plot is focusable, and
 * the left and right arrow keys step the marker week by week. Leaving the chart
 * returns the marker to today.
 */
function CurveCard({ curve, windowName, isTerm }: { curve: NonNullable<R["curve"]>; windowName: string; isTerm: boolean }) {
  const xPct = (week: number) => (curve.weeks <= 1 ? 0 : (week * 100) / (curve.weeks - 1));
  const yPct = (pct: number) => 100 - Math.min(Math.max(pct, 0), 100);
  const line = (pts: number[]) => pts.map((p, i) => `${xPct(i).toFixed(2)},${yPct(p).toFixed(2)}`).join(" ");
  const now = curve.current[curve.current.length - 1] ?? 0;
  const nowIndex = Math.max(curve.current.length - 1, 0);
  const [hover, setHover] = useState<number | null>(null);
  const week = hover ?? nowIndex;
  const reached = week < curve.current.length;
  const value = reached ? curve.current[week] : null;
  const before = curve.previous?.[week] ?? null;
  // Where the marker sits: on the current line, or on last window's line for a
  // week not reached yet, or at the bottom when neither has a figure.
  const markerY = yPct(value ?? before ?? 0);
  const markerX = xPct(week);
  const weekAt = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const frac = r.width ? (clientX - r.left) / r.width : 0;
    return Math.min(curve.weeks - 1, Math.max(0, Math.round(frac * (curve.weeks - 1))));
  };
  const pace = curve.projection_pct == null ? null
    : curve.projection_pct >= curve.target_pct
      ? `At this pace the ${isTerm ? "term" : "period"} closes near ${curve.projection_pct}%, above your ${curve.target_pct}% target.`
      : `At this pace the ${isTerm ? "term" : "period"} closes near ${curve.projection_pct}%, short of your ${curve.target_pct}% target.`;
  const vs = curve.vs_previous_pts == null ? null
    : `${Math.abs(curve.vs_previous_pts)} points ${curve.vs_previous_pts >= 0 ? "ahead of" : "behind"} ${curve.previous_name ?? "last time"} at the same week.`;
  const ticks = curveTicks(curve.weeks);
  return (
    <Panel title={isTerm ? "Term collection curve" : "Collection curve"}
      subtitle={`Share of ${windowName} fees collected, week by week`}
      footer={[`Week ${curve.week_now} of ${curve.weeks}: ${now}% collected.`, vs, pace].filter(Boolean).join(" ")}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mont text-[11px] text-gray-05">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-primary" />Now</span>
        {curve.previous && <span className="flex min-w-0 items-center gap-1.5"><span className="h-0.5 w-3.5 shrink-0" style={{ background: DASH_COLORS.soft }} /><span className="truncate">{curve.previous_name}</span></span>}
        <span className="flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: DASH_COLORS.amber }} />Target {curve.target_pct}%</span>
      </div>
      <div className="grid flex-1 grid-cols-[2rem_minmax(0,1fr)] grid-rows-[minmax(11rem,1fr)_auto] gap-x-2 gap-y-1.5">
        <div className="relative font-mont text-[10px] tabular-nums text-gray-05">
          {[100, 75, 50, 25, 0].map((p) => (
            <span key={p} className="absolute right-0 -translate-y-1/2" style={{ top: `${yPct(p)}%` }}>{p}%</span>
          ))}
        </div>
        <div className="relative min-w-0 cursor-crosshair touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          tabIndex={0} aria-label="Collection by week. Use the left and right arrow keys to read each week."
          onPointerMove={(e) => setHover(weekAt(e.clientX, e.currentTarget))}
          onPointerDown={(e) => setHover(weekAt(e.clientX, e.currentTarget))}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setHover(Math.min(curve.weeks - 1, Math.max(0, week + (e.key === "ArrowRight" ? 1 : -1))));
            } else if (e.key === "Escape") setHover(null);
          }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img"
            aria-label={`${now}% of fees collected by week ${curve.week_now} of ${curve.weeks}, target ${curve.target_pct}%`}>
            {[0, 25, 50, 75, 100].map((p) => (
              <line key={p} x1={0} x2={100} y1={yPct(p)} y2={yPct(p)} stroke="#EEF0F3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <line x1={0} x2={100} y1={yPct(curve.target_pct)} y2={yPct(curve.target_pct)} stroke={DASH_COLORS.amber}
              strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            {curve.previous && (
              <polyline points={line(curve.previous)} fill="none" stroke={DASH_COLORS.soft} strokeWidth={3}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            )}
            <polyline points={line(curve.current)} fill="none" stroke={DASH_COLORS.primary} strokeWidth={3}
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            {hover != null && (
              <line x1={markerX} x2={markerX} y1={0} y2={100} stroke="#94A3B8" strokeWidth={1}
                strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <span className={cn("pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm",
            reached ? "bg-primary" : "bg-gray-05")}
            style={{ left: `${markerX}%`, top: `${markerY}%` }} aria-hidden="true" />
          <span role="status" aria-live="polite"
            className={cn("pointer-events-none absolute z-10 flex flex-col whitespace-nowrap rounded px-1.5 py-0.5 font-mont text-[10px] font-semibold tabular-nums text-white",
              reached ? "bg-primary" : "bg-gray-01",
              markerX > 60 ? "-translate-x-full -ml-2" : "ml-2",
              100 - markerY > 70 ? "translate-y-1" : "-translate-y-full -mt-1")}
            style={{ left: `${markerX}%`, top: `${markerY}%` }}>
            <span>W{week + 1} · {value != null ? `${value}%` : "not reached yet"}</span>
            {before != null && curve.previous_name && (
              <span className="font-medium opacity-85">{curve.previous_name}: {before}%</span>
            )}
          </span>
        </div>
        <div />
        <div className="relative h-4 font-mont text-[10px] text-gray-05">
          {ticks.map((t, i) => (
            <span key={t.week}
              className={cn("absolute top-0 whitespace-nowrap", t.wide && "hidden sm:inline",
                i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2")}
              style={{ left: `${xPct(t.week)}%` }}>
              W{t.week + 1}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ── payment plans ────────────────────────────────────────────────────────────

function PlansCard({ plans, currency }: { plans: NonNullable<R["plans"]>; currency?: string | null }) {
  const total = plans.on_track + plans.behind || 1;
  return (
    <Panel title="Payment plans" subtitle={`${plural(plans.active, "active plan")}`}
      action={<LinkAction label="Plans" to={`${F.RECEIVABLES}/payment-plans`} />}
      footer={plans.next.length ? undefined : "No instalments fall due in the coming weeks"}>
      {plans.active === 0 ? <AllClear>No plans running.</AllClear> : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full">
            <span style={{ width: `${(plans.on_track / total) * 100}%`, background: DASH_COLORS.green }} />
            <span style={{ width: `${(plans.behind / total) * 100}%`, background: DASH_COLORS.red }} />
          </div>
          {[
            { label: "On track", n: plans.on_track, amount: plans.on_track_amount.kobo, color: DASH_COLORS.green },
            { label: "Behind", n: plans.behind, amount: plans.behind_amount.kobo, color: DASH_COLORS.red },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-2 font-mont text-[13px]">
              <span className="size-2 rounded-full" style={{ background: r.color }} />
              <span className="flex-1 text-gray-01">{r.label}</span>
              <span className="font-semibold tabular-nums">{r.n}</span>
              <span className="w-20 text-right text-xs tabular-nums text-gray-05">{compactMoney(r.amount, currency)}</span>
            </div>
          ))}
          {plans.next.length > 0 && (
            <div className="mt-auto flex flex-col gap-2 border-t border-white-02 pt-3">
              <span className="font-mont text-xs font-semibold text-gray-01">Next instalments</span>
              {plans.next.map((n) => (
                <div key={n.date} className="flex justify-between font-mont text-xs">
                  <span className="text-gray-05">{new Date(`${n.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  <span className="tabular-nums">{plural(n.plans, "plan")} · {compactMoney(n.amount.kobo, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

// ── by group, reminders ──────────────────────────────────────────────────────

function GroupsCard({ groups, windowName, currency }: { groups: NonNullable<R["groups"]>; windowName: string; currency?: string | null }) {
  const best = [...groups.items].sort((a, b) => (b.rate_pct ?? 0) - (a.rate_pct ?? 0));
  return (
    <Panel title={`Collection by ${groups.label.toLowerCase()}`} subtitle={`Billed vs collected · ${windowName}`}
      footer={best.length > 1 ? `Best: ${best[0].name} at ${Math.round(best[0].rate_pct ?? 0)}% · furthest behind: ${best[best.length - 1].name} at ${Math.round(best[best.length - 1].rate_pct ?? 0)}%` : undefined}>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {groups.items.map((g) => (
          <div key={g.name} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_2.75rem] items-center gap-3 font-mont text-[13px]">
            <span className="truncate font-medium text-gray-01">{g.name}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-gray-03/50">
              <span className="block h-full rounded-full" style={{ width: `${Math.min(g.rate_pct ?? 0, 100)}%`,
                background: (g.rate_pct ?? 0) >= 70 ? DASH_COLORS.primary : DASH_COLORS.mid }} />
            </span>
            <span className="text-right text-xs tabular-nums text-gray-05">{compactMoney(g.billed.kobo, currency)}</span>
            <span className="text-right font-semibold tabular-nums">{g.rate_pct == null ? "-" : `${Math.round(g.rate_pct)}%`}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DunningCard({ stages, windowName }: { stages: NonNullable<R["dunning"]>; windowName: string }) {
  const sent = stages.reduce((sum, s) => sum + s.sent, 0);
  return (
    <Panel title="Reminders" subtitle={`Sent ${windowName}, and what came back`}
      action={<LinkAction label="Dunning" to={`${F.RECEIVABLES}/dunning`} />}
      footer={sent ? `${plural(sent, "reminder")} sent · paid means the invoice received money within ${stages[0]?.paid_within_days ?? 7} days of the reminder` : undefined}>
      {stages.length === 0 ? <AllClear>No reminders needed so far.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-4">
          {stages.map((s) => (
            <div key={s.level} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2 font-mont text-[13px]">
                <span className="min-w-0 truncate"><span className="font-medium text-gray-01">{s.stage}</span>
                  {s.min_days_overdue != null && <span className="text-gray-05"> · from day {s.min_days_overdue}</span>}</span>
                <span className="shrink-0 tabular-nums"><span className="font-semibold">{s.sent}</span><span className="text-gray-05"> sent</span></span>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-03/50">
                  <span className="block h-full rounded-full bg-green-01" style={{ width: `${Math.min(s.paid_pct ?? 0, 100)}%` }} />
                </span>
                <span className="w-28 text-right font-mont text-xs text-green-01">{s.paid_pct == null ? "-" : `${Math.round(s.paid_pct)}% paid`}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── relief and credit ────────────────────────────────────────────────────────

const RELIEF_COLORS = [DASH_COLORS.primary, DASH_COLORS.mid, "#E0B25C", DASH_COLORS.soft];

function ConcessionsCard({ concessions, payers, currency }: { concessions: NonNullable<R["concessions"]>; payers: string; currency?: string | null }) {
  return (
    <Panel title="Concessions granted" action={<LinkAction label="Concessions" to={`${F.RECEIVABLES}/concessions`} />}
      footer={concessions.items.length ? `${plural(concessions.payers, payers.replace(/s$/, ""), payers)} · ${concessions.share_of_billed_pct ?? 0}% of fees billed` : undefined}>
      {concessions.items.length === 0 ? <AllClear>None granted in this window.</AllClear> : (
        <>
          <p className="font-mont text-xl font-semibold tabular-nums text-black-01">{formatMoney(concessions.total.kobo, currency)}</p>
          <div className="flex flex-1 flex-col justify-around gap-2">
            {concessions.items.map((c, i) => (
              <div key={c.kind} className="flex items-center gap-2 font-mont text-[13px]">
                <span className="size-2 rounded-full" style={{ background: RELIEF_COLORS[i % RELIEF_COLORS.length] }} />
                <span className="flex-1 text-gray-01">{c.label}</span>
                <span className="text-xs text-gray-05">{plural(c.payers, payers.replace(/s$/, ""), payers)}</span>
                <span className="w-20 text-right font-medium tabular-nums">{compactMoney(c.amount.kobo, currency)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function AdjustmentsCard({ items, currency }: { items: R["adjustments"]; currency?: string | null }) {
  const pending = items.reduce((sum, i) => sum + i.pending, 0);
  return (
    <Panel title="Adjustments" subtitle="Credit notes, refunds and write-offs"
      action={<LinkAction label="Refunds & write-offs" to={`${F.RECEIVABLES}/refunds`} />}
      footer={pending ? `${plural(pending, "adjustment")} awaiting approval` : "Nothing awaiting approval"}>
      {items.length === 0 ? <AllClear>No adjustments in this window.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around">
          {items.map((i) => (
            <div key={i.key} className="flex items-center gap-3 border-b border-white-02 py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="font-mont text-[13px] font-medium text-gray-01">{i.label}</p>
                <p className="font-mont text-[11px] text-gray-05">
                  {plural(i.count, "posted", "posted")}{i.pending ? ` · ${i.pending} awaiting approval` : ""}
                </p>
              </div>
              <span className="font-mont text-[13px] font-semibold tabular-nums">{compactMoney(i.amount.kobo, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function CreditCard({ credit, payers, currency }: { credit: NonNullable<R["credit"]>; payers: string; currency?: string | null }) {
  return (
    <Panel title="Credit held" subtitle="Money paid in that no invoice has used yet"
      footer={credit.total.kobo ? "Applied automatically when the next invoice is raised, or refunded on request" : undefined}>
      {credit.total.kobo === 0 ? <AllClear>No {payers} are in credit.</AllClear> : (
        <>
          <p className="font-mont text-xl font-semibold tabular-nums text-black-01">{formatMoney(credit.total.kobo, currency)}</p>
          <p className="font-mont text-xs text-gray-05">{plural(credit.payers, payers.replace(/s$/, ""), payers)} in credit</p>
          <div className="flex flex-1 flex-col justify-around gap-2 font-mont text-[13px]">
            <div className="flex justify-between"><span className="text-gray-05">Receipts not applied ({credit.unapplied_receipts})</span><span className="tabular-nums">{compactMoney(credit.unapplied_receipts_amount.kobo, currency)}</span></div>
            <div className="flex justify-between"><span className="text-gray-05">Credit notes not applied</span><span className="tabular-nums">{compactMoney(credit.credit_notes_amount.kobo, currency)}</span></div>
            <div className="flex justify-between"><span className="text-gray-05">Older than {credit.older_than_days} days</span>
              <span className={cn("tabular-nums", credit.older_amount.kobo > 0 && "text-amber-700")}>{compactMoney(credit.older_amount.kobo, currency)}</span></div>
          </div>
        </>
      )}
    </Panel>
  );
}

// ── largest balances ─────────────────────────────────────────────────────────

function LargestCard({ rows, groupLabel, title, currency }: { rows: NonNullable<R["largest"]>; groupLabel: string | null; title: string; currency?: string | null }) {
  const cols = "grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_minmax(0,1.4fr)]";
  return (
    <Panel title={title} action={<LinkAction label="Invoices" to={`${F.RECEIVABLES}/invoices`} />}>
      {rows.length === 0 ? <AllClear>Nobody owes anything.</AllClear> : (
        <>
          <div className="hidden md:block">
            <div className={cn("grid gap-3 border-b border-white-02 pb-2 font-mont text-[11px] text-gray-05", cols)}>
              <span>Payer</span><span>{groupLabel ?? "Branch"}</span><span className="text-right">Current</span><span className="text-right">1 to 30</span>
              <span className="text-right">31 to 90</span><span className="text-right">Over 90</span><span>Last action</span>
            </div>
            {rows.map((r) => (
              <div key={r.customer_id} className={cn("grid items-center gap-3 border-b border-white-02 py-2.5 font-mont text-[13px] last:border-0", cols)}>
                <span className="min-w-0"><span className="block truncate font-medium text-gray-01">{r.name}</span>
                  <span className="block truncate text-[11px] text-gray-05">{r.code} · <Money kobo={r.owed.kobo} currency={currency} /></span></span>
                <span className="truncate text-gray-05">{(groupLabel ? r.group : r.branch) ?? "-"}</span>
                <span className="text-right tabular-nums">{compactMoney(r.current.kobo, currency)}</span>
                <span className="text-right tabular-nums">{compactMoney(r.days_1_30.kobo, currency)}</span>
                <span className="text-right tabular-nums">{compactMoney(r.days_31_90.kobo, currency)}</span>
                <span className={cn("text-right tabular-nums", r.over_90.kobo > 0 && "text-destructive")}>{compactMoney(r.over_90.kobo, currency)}</span>
                <span className="truncate text-xs text-gray-05">{r.last_action}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <div key={r.customer_id} className="rounded-md border border-white-02 p-3 font-mont">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-medium text-gray-01">{r.name}</span>
                  <span className="text-[13px] font-semibold tabular-nums"><Money kobo={r.owed.kobo} currency={currency} /></span>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-05">{[groupLabel ? r.group : r.branch, r.last_action].filter(Boolean).join(" · ")}</p>
                <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-gray-05">
                  {[["Current", r.current], ["1-30", r.days_1_30], ["31-90", r.days_31_90], ["90+", r.over_90]].map(([label, m]) => (
                    <span key={label as string}>{label as string}<br /><span className="text-xs font-medium tabular-nums text-black-01">{compactMoney((m as { kobo: number }).kobo, currency)}</span></span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

// ── the tab ──────────────────────────────────────────────────────────────────

export function ReceivablesTab({ d, words, currency }: { d: R; words: DashboardWords; currency?: string | null }) {
  const windowName = d.window.label.toLowerCase();
  const c = d.collections;
  const s = d.receivables_summary;
  const nothing = !c && !d.curve && !d.plans && !d.groups && !d.dunning && !d.concessions
    && d.adjustments.length === 0 && !d.credit && !d.largest;
  if (nothing) {
    return <EmptyState title="Nothing to show here yet" message="None of the receivables figures are in your access." />;
  }
  const row2 = [d.groups, d.dunning].filter(Boolean).length;
  const row3 = [d.concessions, d.adjustments.length > 0 || null, d.credit].filter(Boolean).length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {c?.billed && <KpiTile label={`Billed ${windowName}`} value={formatMoney(c.billed.kobo, currency)}
          note={c.invoice_count != null ? plural(c.invoice_count, "invoice") : undefined} />}
        {c?.collected && <KpiTile label="Collected" value={formatMoney(c.collected.kobo, currency)} color={DASH_COLORS.green}
          badge={c.rate_pct != null ? `${c.rate_pct}%` : undefined}
          note={d.curve?.vs_previous_pts != null
            ? `${Math.abs(d.curve.vs_previous_pts)} pts ${d.curve.vs_previous_pts >= 0 ? "ahead of" : "behind"} ${d.curve.previous_name}`
            : d.window.basis === "billed_for" ? `Of ${d.window.name} fees` : d.window.name} />}
        {d.days_to_pay != null && <KpiTile label="Days to pay" value={plural(d.days_to_pay, "day")} note="Median, invoice to full payment" />}
        {s && <KpiTile label="Overdue" value={formatMoney(s.overdue_amount.kobo, currency)} color={DASH_COLORS.red}
          note={`${plural(s.overdue_payers, words.payers.replace(/s$/, ""), words.payers)} past their due date`} />}
        {d.credit && <KpiTile label="Credit held" value={formatMoney(d.credit.total.kobo, currency)}
          note={d.credit.payers ? `${plural(d.credit.payers, words.payers.replace(/s$/, ""), words.payers)} in credit` : "Nobody is in credit"} />}
      </div>

      {(d.curve || d.plans) && (
        <div className={cn("grid grid-cols-1 gap-5", d.curve && d.plans && "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
          {d.curve && <CurveCard curve={d.curve} windowName={windowName} isTerm={d.window.basis === "billed_for"} />}
          {d.plans && <PlansCard plans={d.plans} currency={currency} />}
        </div>
      )}

      {row2 > 0 && (
        <div className={cn("grid grid-cols-1 gap-5", rowCols(row2))}>
          {d.groups && <GroupsCard groups={d.groups} windowName={windowName} currency={currency} />}
          {d.dunning && <DunningCard stages={d.dunning} windowName={windowName} />}
        </div>
      )}

      {row3 > 0 && (
        <div className={cn("grid grid-cols-1 gap-5", rowCols(row3))}>
          {d.concessions && <ConcessionsCard concessions={d.concessions} payers={words.payers} currency={currency} />}
          {d.adjustments.length > 0 && <AdjustmentsCard items={d.adjustments} currency={currency} />}
          {d.credit && <CreditCard credit={d.credit} payers={words.payers} currency={currency} />}
        </div>
      )}

      {d.largest && <LargestCard rows={d.largest} groupLabel={d.groups?.label ?? null} title="Largest balances" currency={currency} />}
      {d.largest && d.largest.length > 0 && s && s.overdue_payers === 0 && (
        <p className="flex items-center gap-2 font-mont text-xs text-green-01"><Check className="size-4" /> Nobody is past their due date.</p>
      )}
    </div>
  );
}
