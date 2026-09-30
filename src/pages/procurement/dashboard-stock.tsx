/**
 * The Stock & receiving tab of the Procurement dashboard.
 *
 * For whoever keeps the stores: what stock is worth and where, what is running
 * low and how long it lasts, what is due in, what went out and to whom, what
 * moved last, and four control figures. Stock figures cover the reader's stores;
 * receipts and orders cover their branches. The page owns the window switch.
 *
 * "Draft a requisition for all" asks the server to draft one requisition with a
 * line per low item at its suggested quantity (the server reads what is low
 * itself), then opens it. Nothing is submitted: the draft goes through review
 * and approval like any other requisition. The draft is raised for one branch:
 * at a school with several, a reader who is not pinned to one names it beside
 * the button, which starts on the branch they are working in.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { FilePlus2 } from "lucide-react";
import { Donut, raisedBranchBody, raisingBranchReady, useActiveEntity, useRaisingBranch } from "@/components/finance-ui";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/finance-ui/states";
import { useCan } from "@/components/finance-ui/can";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../permissions";
import { useDraftRestockRequisitionMutation } from "@/redux/services/procurement/procurement-ext-api";
import type { ProcurementStockDashboard } from "@/redux/services/procurement/procurement-ext-types";
import { routesPath } from "@/routes/routes-path";
import {
  AllClear, DASH_COLORS, KpiTile, LinkAction, Panel, compactMoney, fmtShortDate, plural,
} from "../finance/dashboard-cards";

type S = ProcurementStockDashboard;
const R = routesPath.PROTECTED.PROCUREMENT;
const STORE_COLORS = [DASH_COLORS.primary, DASH_COLORS.mid, "#E0B25C", DASH_COLORS.soft, DASH_COLORS.orange, "#94A3B8"];

/** "2,400" for a count, "2.5" for a part quantity. */
export function qty(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

/** "Out", "5", or a dash for an item never issued. */
export function daysLeftLabel(days: number | null, onHand: number): string {
  if (onHand <= 0 || days === 0) return "Out";
  return days == null ? "-" : String(days);
}

function ago(iso: string) {
  const mins = Math.max(Math.round((Date.now() - new Date(iso).getTime()) / 60_000), 0);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

// ── running low ──────────────────────────────────────────────────────────────

function RunningLowCard({ rows }: { rows: NonNullable<S["running_low"]> }) {
  const navigate = useNavigate();
  const { can } = useCan();
  const { code: entity } = useActiveEntity();
  const [draft, { isLoading }] = useDraftRestockRequisitionMutation();
  const raising = useRaisingBranch();
  const [picked, setPicked] = useState("");
  const branch = picked || raising.initial;
  const raise = async () => {
    if (!entity) return;
    try {
      const r = await draft({ entity, ...raisedBranchBody(raising, branch) }).unwrap();
      toast.success(`${r.data.document_number || "Requisition"} drafted. Review it, then submit.`);
      navigate(`${R.REQUISITIONS}?document=${r.data.id}`);
    } catch { /* Central API handling shows the actionable error. */ }
  };
  const cols = "grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1fr)]";
  return (
    <Panel title="Running low" subtitle="At or below the reorder level"
      action={rows.length > 0 && can(P.PROC_CREATE_REQUISITION) ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {raising.ask ? (
            <div className="w-40 max-w-full">
              <NativeSelect size="sm" value={branch} onChange={(e) => setPicked(e.target.value)} aria-label="Branch to restock for"
                className="font-mont text-xs">
                <option value="" disabled>Choose branch</option>
                {raising.choices.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
              </NativeSelect>
            </div>
          ) : null}
          <button type="button" onClick={raise} disabled={isLoading || !raisingBranchReady(raising, branch)}
            className="inline-flex shrink-0 items-center gap-1 font-mont text-xs font-semibold text-primary hover:underline disabled:opacity-60">
            <FilePlus2 className="size-3.5" /> {isLoading ? "Drafting" : "Draft a requisition for all"}
          </button>
        </div>
      ) : <LinkAction label="Stock" to={`${R.INVENTORY}/items`} />}>
      {rows.length === 0 ? <AllClear>Everything is above its reorder level.</AllClear> : (
        <>
          <div className="hidden md:block">
            <div className={cn("grid gap-3 border-b border-white-02 pb-2 font-mont text-[11px] text-gray-05", cols)}>
              <span>Item</span><span>Store</span><span className="text-right">On hand vs reorder</span>
              <span className="text-right">Days left</span><span className="text-right">Suggested order</span>
            </div>
            {rows.map((r) => {
              const out = r.on_hand <= 0 || r.days_left === 0;
              return (
                <div key={r.id} className={cn("grid items-center gap-3 border-b border-white-02 py-2.5 font-mont text-[13px] last:border-0", cols)}>
                  <span className="truncate font-medium text-gray-01">{r.name}</span>
                  <span className="truncate text-gray-05">{r.store ?? "-"}{r.stores > 1 ? ` and ${plural(r.stores - 1, "other")}` : ""}</span>
                  <span className="text-right tabular-nums"><span className={cn(out && "font-semibold text-destructive")}>{qty(r.on_hand)}</span>
                    <span className="text-gray-05"> / {qty(r.reorder_level)}</span></span>
                  <span className={cn("text-right tabular-nums", out ? "font-semibold text-destructive" : r.days_left != null && r.days_left <= 7 && "text-amber-700")}>
                    {daysLeftLabel(r.days_left, r.on_hand)}
                  </span>
                  <span className="text-right tabular-nums">{qty(r.suggested)} {r.unit}</span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => {
              const out = r.on_hand <= 0 || r.days_left === 0;
              return (
                <div key={r.id} className="rounded-md border border-white-02 p-3 font-mont">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-medium text-gray-01">{r.name}</span>
                    <span className={cn("shrink-0 text-xs font-semibold", out ? "text-destructive" : "text-amber-700")}>
                      {out ? "Out" : r.days_left != null ? `${plural(r.days_left, "day")} left` : "Low"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-05">{r.store ?? "-"} · {qty(r.on_hand)} of {qty(r.reorder_level)} · order {qty(r.suggested)} {r.unit}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}

function StoresCard({ stores, currency }: { stores: NonNullable<S["by_store"]>; currency?: string | null }) {
  const total = stores.reduce((sum, s) => sum + s.value.kobo, 0);
  return (
    <Panel title="Stock value by store" subtitle="At average cost">
      {stores.length === 0 ? <AllClear>No stock is held.</AllClear> : (
        <Donut
          data={stores.map((s, i) => ({ label: s.store, value: s.value.kobo, color: STORE_COLORS[i % STORE_COLORS.length] }))}
          center={{ main: compactMoney(total, currency), sub: "Total" }}
          formatValue={(v: number) => compactMoney(v, currency)}
        />
      )}
    </Panel>
  );
}

// ── in, out, moved ───────────────────────────────────────────────────────────

function ExpectedCard({ rows }: { rows: NonNullable<S["expected"]> }) {
  const late = rows.filter((r) => r.state === "late").length;
  const stateText = (r: NonNullable<S["expected"]>[number]) =>
    r.state === "awaiting_approval" ? "Awaiting approval"
      : r.state === "late" ? `${plural(-r.days, "day")} late`
        : r.days === 0 ? "Today" : r.days === 1 ? "Tomorrow" : "On time";
  return (
    <Panel title="Expected deliveries" subtitle="Due in the next 14 days, and anything late"
      action={<LinkAction label="Orders" to={R.PURCHASE_ORDERS} />}
      footer={late ? `${plural(late, "order")} past the expected date` : undefined}>
      {rows.length === 0 ? <AllClear>Nothing is due in.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-3">
          {rows.map((r) => {
            const d = fmtShortDate(r.expected_date);
            return (
              <div key={r.id} className="flex min-w-0 items-center gap-3">
                <span className="flex w-11 shrink-0 flex-col items-center rounded-md border border-white-02 py-1">
                  <span className="font-mont text-[10px] text-gray-05">{d.mon}</span>
                  <span className="font-mont text-sm font-semibold tabular-nums text-black-01">{d.day}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mont text-[13px] font-medium text-gray-01">{r.title || r.number}</span>
                  <span className="block truncate font-mont text-[11px] text-gray-05">{r.vendor} · {r.number}{r.partial ? " · part received" : ""}</span>
                </span>
                <span className={cn("shrink-0 font-mont text-[11px] font-medium",
                  r.state === "late" ? "text-destructive" : r.state === "awaiting_approval" ? "text-amber-700" : "text-green-01")}>
                  {stateText(r)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function IssuedCard({ issued, windowName, currency }: { issued: NonNullable<S["issued"]>; windowName: string; currency?: string | null }) {
  const top = Math.max(...issued.items.map((i) => i.value.kobo), 1);
  return (
    <Panel title="Issued to departments" subtitle={`Stock issued ${windowName}, at cost`}
      footer={issued.items.length ? `${compactMoney(issued.total.kobo, currency)} issued in all` : undefined}>
      {issued.items.length === 0 ? <AllClear>No stock issued {windowName}.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-3">
          {issued.items.map((i) => (
            <div key={i.name ?? "untagged"} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_4.5rem] items-center gap-3 font-mont text-[13px]">
              <span className={cn("truncate", i.name ? "font-medium text-gray-01" : "text-gray-05")}>{i.name ?? "Not tagged"}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-gray-03/50">
                <span className="block h-full rounded-full" style={{ width: `${(i.value.kobo * 100) / top}%`,
                  background: i.name ? DASH_COLORS.primary : DASH_COLORS.soft }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{compactMoney(i.value.kobo, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const MOVE_CHIP: Record<string, { label: string; cls: string }> = {
  RECEIPT: { label: "IN", cls: "bg-green-01/10 text-green-01" },
  ISSUE: { label: "OUT", cls: "bg-primary/10 text-primary" },
  ADJUSTMENT: { label: "ADJ", cls: "bg-amber-50 text-amber-700" },
};

function MovementsCard({ rows }: { rows: NonNullable<S["movements"]> }) {
  return (
    <Panel title="Recent movements" action={<LinkAction label="Movements" to={`${R.INVENTORY}/movements`} />}>
      {rows.length === 0 ? <AllClear>No stock has moved yet.</AllClear> : (
        <div className="flex flex-1 flex-col justify-around gap-3">
          {rows.map((m) => {
            const chip = MOVE_CHIP[m.type] ?? MOVE_CHIP.ADJUSTMENT;
            const where = m.type === "ISSUE" && m.cost_center ? `Issued to ${m.cost_center}` : m.reference || m.store;
            return (
              <div key={m.id} className="flex min-w-0 items-center gap-3">
                <span className={cn("w-10 shrink-0 rounded px-1 py-0.5 text-center font-mont text-[10px] font-semibold", chip.cls)}>{chip.label}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mont text-[13px] font-medium text-gray-01">{m.item}</span>
                  <span className="block truncate font-mont text-[11px] text-gray-05">{[where, m.store, ago(m.occurred_at)].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={cn("shrink-0 font-mont text-xs font-semibold tabular-nums", m.quantity < 0 ? "text-black-01" : "text-green-01")}>
                  {m.quantity > 0 ? "+" : ""}{qty(m.quantity)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── controls strip ───────────────────────────────────────────────────────────

function Figure({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "warn" }) {
  return (
    <div className="min-w-0 rounded-md border border-white-02 bg-white p-4">
      <p className="truncate font-mont text-[11px] text-gray-05">{label}</p>
      <p className={cn("mt-1 font-mont text-lg font-semibold tabular-nums", tone === "warn" ? "text-amber-700" : "text-black-01")}>{value}</p>
      <p className="mt-0.5 font-mont text-[11px] text-gray-05">{note}</p>
    </div>
  );
}

// ── the tab ──────────────────────────────────────────────────────────────────

export function StockTab({ d, currency }: { d: S; currency?: string | null }) {
  const windowName = d.window.label.toLowerCase();
  const p = d.position;
  const nothing = !p && !d.running_low && !d.by_store && !d.issued && !d.movements && !d.receipts && !d.unbilled && !d.expected;
  if (nothing) {
    return <EmptyState title="Nothing to show here yet" message="None of the stock or receiving figures are in your access." />;
  }
  const row3 = [d.expected, d.issued, d.movements].filter(Boolean).length;
  const strip = [d.turns, d.receipts, d.adjustments, d.unbilled].filter(Boolean).length;
  return (
    <div className="space-y-5">
      {(p || d.receipts) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {p && <KpiTile label="Stock value" value={formatMoney(p.value.kobo, currency)}
            note={`${plural(p.items, "item")} across ${plural(p.stores, "store")}`} />}
          {p && <KpiTile label="Below reorder level" value={String(p.below_reorder)} color={DASH_COLORS.amber}
            note={p.out_within_week ? `${plural(p.out_within_week, "item")} will run out within a week` : "None will run out this week"} />}
          {p && <KpiTile label="Out of stock" value={String(p.out_of_stock)} color={DASH_COLORS.red}
            note={p.out_names.length ? p.out_names.join(", ") + (p.out_of_stock > p.out_names.length ? " and others" : "") : "Nothing is out"} />}
          {d.receipts && <KpiTile label="Deliveries this week" value={String(d.receipts.this_week)}
            note={d.receipts.this_week_short ? `${plural(d.receipts.this_week_short, "delivery", "deliveries")} arrived short or with items rejected` : "All arrived in full"} />}
          {p && <KpiTile label="Not moved in 90 days" value={String(p.idle)}
            note={p.idle ? `${compactMoney(p.idle_value.kobo, currency)} tied up` : "Everything has moved"} />}
        </div>
      )}

      {(d.running_low || d.by_store) && (
        <div className={cn("grid grid-cols-1 gap-5", d.running_low && d.by_store && "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
          {d.running_low && <RunningLowCard rows={d.running_low} />}
          {d.by_store && <StoresCard stores={d.by_store} currency={currency} />}
        </div>
      )}

      {row3 > 0 && (
        <div className={cn("grid grid-cols-1 gap-5", row3 >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : row3 === 2 && "md:grid-cols-2")}>
          {d.expected && <ExpectedCard rows={d.expected} />}
          {d.issued && <IssuedCard issued={d.issued} windowName={windowName} currency={currency} />}
          {d.movements && <MovementsCard rows={d.movements} />}
        </div>
      )}

      {strip > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {d.turns && <Figure label={`Stock turns, ${windowName}`} value={d.turns.times != null ? `${d.turns.times}x` : "-"}
            note={d.turns.fastest_store ? `${d.turns.fastest_store} turns fastest at ${d.turns.fastest_times}x` : "Nothing issued yet"} />}
          {d.receipts && <Figure label="Receipts short or rejected" value={d.receipts.short_pct != null ? `${d.receipts.short_pct}%` : "-"}
            note={`${plural(d.receipts.short_lines, "line")} of ${d.receipts.lines} ${windowName}`} tone={d.receipts.short_lines ? "warn" : undefined} />}
          {d.adjustments && <Figure label={`Stock adjustments, ${windowName}`} value={compactMoney(d.adjustments.value.kobo, currency)}
            note={d.adjustments.count ? `${plural(d.adjustments.count, "count correction")} posted` : "No corrections posted"} />}
          {d.unbilled && <Figure label="Received, waiting for a bill" value={compactMoney(d.unbilled.amount.kobo, currency)}
            note={`${plural(d.unbilled.count, "goods receipt")}${d.unbilled.older ? ` · ${d.unbilled.older} older than ${d.unbilled.days} days` : ""}`}
            tone={d.unbilled.older ? "warn" : undefined} />}
        </div>
      )}
    </div>
  );
}
