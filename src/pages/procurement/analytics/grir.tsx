/**
 * GR/IR & Control (§6) - goods-received vs invoice-received reconciliation.
 * KPIs + open-GR/IR aging stack come from the GRN-level `grir-aging` report; the
 * table drills to the **PO-line** grain (`grir-lines`) the prototype lists, and each
 * row opens a per-PO-line reconciliation drawer (its linked POSTED GRNs + invoices).
 */
import { useState } from "react";
import { AlertCircle, ArrowLeftRight, CheckCircle2, EyeOff, Inbox } from "lucide-react";

import {
  AgingStack, DetailDrawer, EmptyState, ErrorState, ForbiddenState, StatCard,
  LoadingState, Money, toArray,
} from "@/components/finance-ui";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import {
  useGetGrirAgingQuery, useGetGrirPoLineDetailQuery, useGetGrirPoLinesQuery,
} from "@/redux/services/procurement/procurement-ext-api";
import type { GrirAging, GrirPoLineDetail } from "@/redux/services/procurement/procurement-ext-types";
import { formatMoney } from "@/utils/money";
import { formatQuantity } from "@/utils/quantity";
import { isForbidden, shortDate } from "../sourcing/helpers";
import { Field, EmptyPanel } from "../sourcing/shared";
import { Card, ChartEmpty, ScopeNote, StatusDotPill, SectionHeader, type PillTone } from "./shared";
import { PageShell } from "@/components/layout/page-shell";
import {
  BUCKET_LABEL, TD, TDR, TH, THR, ageColor, excludedScopeNote, kobo, type SectionProps,
} from "./helpers";

// Status chip tone for a PO line's GR/IR position.
function lineTone(status: string): PillTone {
  if (status === "Cleared") return "green";
  if (status === "Invoiced > Received") return "red";
  return "amber"; // "Received > Invoiced"
}

const qty = (v: string) => formatQuantity(Number(v));

// Why the two control cards read "Not shown" for a branch-bound reader. Said in full
// here because a card sub-line cannot carry it, and a figure that is simply blank
// invites the reader to assume zero.
const CONTROL_WITHHELD_NOTE =
  "You are viewing one branch. The clearing balance and the difference come from the "
  + "general ledger, which is not kept per branch, so they are withheld rather than "
  + "checked against a branch-only receipt total. The entity-wide GR/IR balance still "
  + "carries them.";

export default function GrirScreen({ entity, currency }: SectionProps) {
  const { data, isLoading, isError, error, refetch } = useGetGrirAgingQuery({ entity });
  const d = data?.data;

  return (
    <PageShell className="space-y-5 text-black-01">
      <SectionHeader title="GR/IR & Control" subtitle="Goods-received vs invoice-received reconciliation." />

      {isForbidden(error) ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><ForbiddenState /></div>
      ) : isLoading ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><LoadingState rows={8} /></div>
      ) : isError || !d ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><ErrorState onRetry={refetch} /></div>
      ) : (
        <GrirBody d={d} currency={currency} entity={entity} />
      )}
    </PageShell>
  );
}

function GrirBody({ d, currency, entity }: { d: GrirAging; currency?: string | null; entity: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const rows = toArray(d.rows);
  // open_value > 0 = received-not-invoiced; < 0 = invoiced-not-received.
  const recvNotInv = rows.reduce((s, r) => s + Math.max(0, kobo(r.open_value)), 0);
  const invNotRecv = rows.reduce((s, r) => s + Math.max(0, -kobo(r.open_value)), 0);
  const totalOpen = kobo(d.total_open);
  // Both control figures come from the general ledger, which has no branch, so a
  // branch-bound reader gets null instead of an entity-wide balance set against a
  // branch-only receipt walk. Read them directly, NOT through `kobo()`: that turns a
  // withheld figure into 0, and 0 here would badge the card green "Reconciled" - a
  // clean bill of health on a number nobody computed.
  const controlWithheld = d.control_balance == null;
  const control = d.control_balance == null ? null : kobo(d.control_balance);
  const diff = d.difference == null ? null : kobo(d.difference);
  const excluded = excludedScopeNote(d.unassigned_excluded_count, "goods receipt");

  // Aging stack over the received-not-invoiced composition (positive buckets only -
  // a negative bucket has no meaningful width, its real amount still shows in the row).
  const stack = d.buckets
    .map((b) => ({ key: b, label: BUCKET_LABEL[b] ?? b, amount: kobo(d.bucket_totals[b]), color: ageColor(b) }))
    .filter((x) => x.amount !== 0)
    .map((x) => ({
      ...x,
      pct: totalOpen > 0 ? Math.max(0, Math.round((x.amount / totalOpen) * 100)) : 0,
    }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="GR/IR clearing balance"
          value={control == null ? "Not shown" : formatMoney(control, currency)}
          icon={control == null ? EyeOff : ArrowLeftRight}
          tone={control == null ? "gray" : "amber"}
          sub={control == null ? "the ledger balance is not kept per branch" : "net uncleared"}
        />
        <StatCard label="Received, not invoiced" value={formatMoney(recvNotInv, currency)} icon={Inbox} tone="indigo" sub="goods in, awaiting invoice" />
        <StatCard label="Invoiced, not received" value={formatMoney(invNotRecv, currency)} icon={AlertCircle} tone="red" sub="invoiced ahead of delivery" />
        <StatCard
          label="Difference"
          value={diff == null ? "Not shown" : formatMoney(diff, currency)}
          icon={diff == null ? EyeOff : CheckCircle2}
          tone={diff == null ? "gray" : "green"}
          sub={diff == null ? "not checked for a single branch" : diff === 0 ? "Reconciled" : "Variance to investigate"}
        />
      </div>

      {(controlWithheld || excluded) && (
        <div className="space-y-2">
          <ScopeNote>{controlWithheld ? CONTROL_WITHHELD_NOTE : null}</ScopeNote>
          <ScopeNote>{excluded}</ScopeNote>
        </div>
      )}

      <Card title="Open GR/IR by age" subtitle="Received-not-invoiced positions by goods-receipt age">
        {totalOpen > 0 && stack.length > 0 ? (
          <AgingStack buckets={stack.map((x) => ({ key: x.key, label: x.label, pct: x.pct, amount: formatMoney(x.amount, currency), color: x.color }))} />
        ) : (
          <ChartEmpty>No open received-not-invoiced positions to age.</ChartEmpty>
        )}
      </Card>

      <GrirLinesTable entity={entity} currency={currency} onSelect={setSel} />

      <GrirPoLineDrawer poLine={sel} entity={entity} currency={currency} onClose={() => setSel(null)} />
    </div>
  );
}

// PO-line grain table (`grir-lines`) - the prototype's Ordered/Received/Invoiced view.
function GrirLinesTable({ entity, currency, onSelect }: {
  entity: string;
  currency?: string | null;
  onSelect: (poLine: number) => void;
}) {
  const { data, isLoading, isError, error, refetch } = useGetGrirPoLinesQuery({ entity });
  const rows = toArray(data?.data?.rows);

  return (
    <section className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
      {isForbidden(error) ? (
        <ForbiddenState />
      ) : isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState title="GR/IR is clear" message="Every received good is invoiced - nothing is open on any PO line." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>PO Line</th>
                <th className={TH}>Item</th>
                <th className={THR}>Ordered</th>
                <th className={THR}>Received</th>
                <th className={THR}>Invoiced</th>
                <th className={THR}>GR/IR Bal</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.po_line_id} onClick={() => onSelect(r.po_line_id)} className="cursor-pointer transition-colors hover:bg-primary/5">
                  <td className={cn(TD, "tabular-nums")}>
                    <span className="font-semibold text-primary">{r.po_line_ref}</span>
                    <span className="mt-0.5 block font-mont text-[11px] text-gray-05">{r.vendor_name}</span>
                  </td>
                  <td className={TD}>{r.item}</td>
                  <td className={TDR}>{qty(r.ordered_qty)}</td>
                  <td className={TDR}>{qty(r.received_qty)}</td>
                  <td className={TDR}>{qty(r.invoiced_qty)}</td>
                  <td className={TDR}><Money kobo={kobo(r.grir_balance)} currency={currency} align="right" /></td>
                  <td className={TD}><StatusDotPill tone={lineTone(r.status)}>{r.status}</StatusDotPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GrirPoLineDrawer({ poLine, entity, currency, onClose }: {
  poLine: number | null;
  entity: string;
  currency?: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useGetGrirPoLineDetailQuery(
    { entity, po_line: poLine ?? 0 }, { skip: poLine == null },
  );
  const d = data?.data;
  return (
    <DetailDrawer
      open={poLine != null} onOpenChange={(o) => !o && onClose()}
      title={d ? d.po_line_ref : "PO line"}
      description={d ? `${d.item} · ${d.vendor_name}` : ""}
      widthClass="sm:max-w-2xl"
    >
      {poLine != null && (
        isLoading ? <LoadingState rows={6} />
          : isError || !d ? <ErrorState onRetry={refetch} />
            : <GrirPoLineBody d={d} currency={currency} />
      )}
    </DetailDrawer>
  );
}

function GrirPoLineBody({ d, currency }: { d: GrirPoLineDetail; currency?: string | null }) {
  const grns = toArray(d.grns);
  const invoices = toArray(d.invoices);
  const bal = kobo(d.grir_balance);
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mont text-xs font-semibold text-gray-05">Reconciliation</p>
          <StatusDotPill tone={lineTone(d.status)}>{d.status}</StatusDotPill>
        </div>
        <dl className="grid grid-cols-2 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-3">
          <Field label="Ordered" value={qty(d.ordered_qty)} />
          <Field label="Received" value={qty(d.received_qty)} />
          <Field label="Invoiced" value={qty(d.invoiced_qty)} />
          <Field label="Received value" value={formatMoney(kobo(d.received_value), currency)} />
          <Field label="Invoiced value" value={formatMoney(kobo(d.invoiced_value), currency)} />
          <Field
            label="GR/IR balance"
            value={<span className={cn(bal > 0 ? "text-amber-700" : bal < 0 ? "text-destructive" : "text-gray-05")}>{formatMoney(bal, currency)}</span>}
          />
        </dl>
      </div>

      <div>
        <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Linked documents</p>
        <dl className="grid grid-cols-2 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">
          <Field label="Source PO" value={d.po_number} />
          <Field label="Vendor" value={`${d.vendor_code} · ${d.vendor_name}`} />
          <Field label="Unit price" value={formatMoney(kobo(d.unit_price), currency)} />
          <Field label="PO line" value={d.po_line_ref} />
        </dl>
      </div>

      <div>
        <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Goods receipts</p>
        {grns.length === 0 ? (
          <EmptyPanel>No posted goods receipt references this PO line yet.</EmptyPanel>
        ) : (
          <div className="overflow-x-auto rounded-md border border-white-02">
            <table className="w-full min-w-[460px] border-collapse">
              <thead>
                <tr>
                  {["Goods receipt", "Received", "Accepted qty", "Value"].map((h, i) => (
                    <th key={h} className={cn("bg-[#F1F1F1] px-3 py-2 font-mont text-[11px] font-semibold text-gray-01 whitespace-nowrap", i >= 2 ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grns.map((g) => (
                  <tr key={g.id}>
                    <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold tabular-nums text-primary">{g.reference}</td>
                    <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{shortDate(g.received_date)}</td>
                    <td className="border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums">{qty(g.accepted_qty)}</td>
                    <td className="border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums">{formatMoney(kobo(g.value), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Vendor invoices</p>
        {invoices.length === 0 ? (
          <EmptyPanel>No posted vendor invoice has cleared this PO line yet.</EmptyPanel>
        ) : (
          <div className="overflow-x-auto rounded-md border border-white-02">
            <table className="w-full min-w-[460px] border-collapse">
              <thead>
                <tr>
                  {["Invoice", "Invoice date", "Qty", "Net"].map((h, i) => (
                    <th key={h} className={cn("bg-[#F1F1F1] px-3 py-2 font-mont text-[11px] font-semibold text-gray-01 whitespace-nowrap", i >= 2 ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((vi) => (
                  <tr key={vi.id}>
                    <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold tabular-nums text-primary">{vi.document_number}</td>
                    <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{shortDate(vi.invoice_date)}</td>
                    <td className="border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums">{qty(vi.quantity)}</td>
                    <td className="border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums">{formatMoney(kobo(vi.net), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
