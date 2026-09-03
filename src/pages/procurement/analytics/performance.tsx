// Vendor Performance (§6) - computed delivery/payment behaviour blended with
// recorded assessment scorecards. On-Time is the computed rate; Quality / Inv.
// Accuracy / Responsiveness / Grade come from the latest recorded assessment
// (honest "Not assessed" when none). Row → read-only drawer; gated New Assessment.
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ClipboardCheck, Clock, Plus } from "lucide-react";
import { useActionParam } from "@/hooks/use-action-param";

import {
  Can, useCan, DetailDrawer, EmptyState, ErrorState, ForbiddenState, StatCard,
  LoadingState, toArray,
} from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { P } from "../../../permissions";
import {
  useGetVendorAssessmentsQuery, useGetVendorPerformanceQuery,
} from "@/redux/services/procurement/procurement-ext-api";
import type { VendorPerformanceRow } from "@/redux/services/procurement/procurement-ext-types";
import { formatMoney } from "@/utils/money";
import { isForbidden, shortDate } from "../sourcing/helpers";
import { Field, EmptyPanel } from "../sourcing/shared";
import { AssessmentFormDrawer } from "./assessment-form";
import { DateFilter, GradeBadge, GradePill, Meter, Pill, ScopeNote, SectionHeader } from "./shared";
import { TD, TH, excludedScopeNote, meanOrNull, meterScoreColor, type SectionProps } from "./helpers";
import { PageShell } from "@/components/layout/page-shell";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";

function otPct(rate: number | null) {
  return rate == null ? null : Math.round(rate * 100);
}

export default function PerformanceScreen({ entity, currency }: SectionProps) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<VendorPerformanceRow | null>(null);
  const { can } = useCan();
  useActionParam("new", can(P.PROC_CREATE_VENDOR_ASSESSMENT), () => setCreating(true));
  const params = useMemo(
    () => ({ entity, ...(start ? { start_date: start } : {}), ...(end ? { end_date: end } : {}) }),
    [entity, start, end],
  );
  const { data, isLoading, isError, error, refetch } = useGetVendorPerformanceQuery(params);
  const d = data?.data;
  const rows = useMemo(() => toArray(d?.rows), [d]);
  // Vendor code → computed on-time rate, for prefilling the assessment form.
  const onTimeByVendor = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.code, r.on_time_rate])),
    [rows],
  );

  return (
    <PageShell className="space-y-5 text-black-01">
      <SectionHeader title="Vendor Performance" subtitle="Delivery timeliness and payment behaviour from posted records.">
        <DateFilter label="From" value={start} onChange={setStart} />
        <DateFilter label="To" value={end} onChange={setEnd} />
        <Can permission={P.PROC_CREATE_VENDOR_ASSESSMENT}>
          <Button onClick={() => setCreating(true)} className="self-end"><Plus className="size-4" /> New assessment</Button>
        </Can>
      </SectionHeader>

      {isForbidden(error) ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><ForbiddenState /></div>
      ) : isLoading ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><LoadingState rows={8} /></div>
      ) : isError || !d ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><ErrorState onRetry={refetch} /></div>
      ) : (
        <PerformanceBody rows={rows} excluded={d.unassigned_excluded_count} onSelect={setSelected} />
      )}

      <VendorPerformanceDrawer row={selected} entity={entity} currency={currency} onClose={() => setSelected(null)} />
      {creating && (
        <AssessmentFormDrawer entity={entity} onTimeByVendor={onTimeByVendor} onClose={() => setCreating(false)} />
      )}
    </PageShell>
  );
}

function PerformanceBody({ rows, excluded, onSelect }: {
  rows: VendorPerformanceRow[];
  // Documents excluded by the reader's branch scope; undefined when they are unbound.
  excluded?: number;
  onSelect: (row: VendorPerformanceRow) => void;
}) {
  const ratedCount = rows.filter((r) => r.on_time_rate != null).length;
  const avgOnTime = meanOrNull(rows.map((r) => r.on_time_rate));
  const lateTotal = rows.reduce((s, r) => s + r.late_receipts, 0);
  const avgPay = meanOrNull(rows.map((r) => r.avg_payment_days));
  const assessed = rows.filter((r) => r.latest_assessment != null).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Avg on-time delivery"
          value={avgOnTime == null ? "-" : `${Math.round(avgOnTime * 100)}%`}
          icon={Clock}
          tone="green"
          sub={`across ${ratedCount} rated vendor${ratedCount === 1 ? "" : "s"}`}
        />
        <StatCard label="Late deliveries" value={String(lateTotal)} icon={AlertTriangle} tone="amber" sub="goods-receipts past PO date" />
        <StatCard label="Avg days to pay" value={avgPay == null ? "-" : `${avgPay.toFixed(1)} days`} icon={CalendarClock} tone="primary" sub="invoice date → settlement" />
        <StatCard label="Assessed vendors" value={`${assessed}/${rows.length}`} icon={ClipboardCheck} tone="primary" sub="with a recorded scorecard" />
      </div>

      {/* The excluded population is the bill population the report ranks vendors by, so
          a branch reader knows their vendor picture is drawn from a subset of billing. */}
      <ScopeNote>{excludedScopeNote(excluded, "vendor bill")}</ScopeNote>

      <section className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
        {rows.length === 0 ? (
          <EmptyState title="No vendor activity" message="No vendor has ordering, delivery or payment activity in this window." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr>
                    <th className={TH}>Vendor</th>
                    <th className={TH}>On-Time</th>
                    <th className={TH}>Quality</th>
                    <th className={TH}>Inv. Accuracy</th>
                    <th className={TH}>Response</th>
                    <th className={TH}>Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const a = r.latest_assessment;
                    return (
                      <tr key={r.vendor_id} onClick={() => onSelect(r)} className="cursor-pointer transition-colors hover:bg-primary/5">
                        <td className={TD}>
                          <span className="font-semibold text-gray-01">{r.name}</span>
                          <span className="mt-0.5 block font-mont text-[11px] text-gray-05">{r.category || r.code}</span>
                        </td>
                        {/* On-Time is the COMPUTED on-time rate - "-" when the vendor has no rated receipt. */}
                        <td className={TD}>
                          {r.on_time_rate == null
                            ? <span className="font-mont text-sm text-gray-05">-</span>
                            : <Meter ratio={r.on_time_rate} color={meterScoreColor(r.on_time_rate)} />}
                        </td>
                        {/* Quality / Inv. Accuracy / Response come from the latest recorded assessment. */}
                        <td className={TD}>
                          {a ? <Meter ratio={a.quality_acceptance / 100} color={meterScoreColor(a.quality_acceptance / 100)} />
                            : <span className="font-mont text-sm text-gray-05">-</span>}
                        </td>
                        <td className={TD}>
                          {a ? <Meter ratio={a.invoice_accuracy / 100} color={meterScoreColor(a.invoice_accuracy / 100)} />
                            : <span className="font-mont text-sm text-gray-05">-</span>}
                        </td>
                        <td className={TD}>
                          {a ? <Meter ratio={a.responsiveness / 100} color={meterScoreColor(a.responsiveness / 100)} />
                            : <span className="font-mont text-sm text-gray-05">-</span>}
                        </td>
                        <td className={TD}>
                          {a ? <GradeBadge grade={a.grade} />
                            : <span className="font-mont text-[11px] text-gray-05">Not assessed</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-white-02 px-4 py-3 font-mont text-[11px] text-gray-05">
              On-time delivery is computed from each goods-receipt date vs its PO&rsquo;s expected date (receipts on a PO
              with no expected date are not rated); days-to-pay is measured from a bill&rsquo;s invoice date to the settling
              payment. Quality, invoice accuracy, responsiveness and the overall grade come from the most recent recorded
              assessment - vendors without one show &ldquo;Not assessed&rdquo;.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function VendorPerformanceDrawer({ row, entity, currency, onClose }: {
  row: VendorPerformanceRow | null;
  entity: string;
  currency?: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useGetVendorAssessmentsQuery(
    { entity, vendor: row?.code ?? "" }, { skip: !row },
  );
  const history = toArray(data?.data);
  const a = row?.latest_assessment ?? null;
  const money = (m: { kobo: number }) => formatMoney(m.kobo, currency);

  return (
    <DetailDrawer
      open={!!row} onOpenChange={(o) => !o && onClose()}
      title={row ? row.name : "Vendor"}
      description={row ? `${row.code} · performance & assessments` : ""}
      widthClass="sm:max-w-2xl"
    >
      {row && (
        <div className="space-y-5">
          <div>
            <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Computed metrics</p>
            <dl className="grid grid-cols-2 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-3">
              <Field label="Purchase orders" value={row.po_count} />
              <Field label="Ordered" value={money(row.total_ordered)} />
              <Field label="Receipts" value={`${row.receipt_count} (${row.on_time_receipts} on-time · ${row.late_receipts} late)`} />
              <Field label="On-time rate" value={otPct(row.on_time_rate) == null ? "-" : `${otPct(row.on_time_rate)}%`} />
              <Field label="Invoices" value={row.invoice_count} />
              <Field label="Billed" value={money(row.total_billed)} />
              <Field label="Payments" value={row.payment_count} />
              <Field label="Paid" value={money(row.total_paid)} />
              <Field label="Avg days to pay" value={row.avg_payment_days == null ? "-" : row.avg_payment_days} />
            </dl>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mont text-xs font-semibold text-gray-05">Latest scorecard</p>
              {a && <GradePill grade={a.grade} />}
            </div>
            {a ? (
              <dl className="grid grid-cols-2 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-3">
                <Field label="Overall score" value={`${a.overall_score} / 100`} />
                <Field label="On-time (computed)" value={otPct(row.on_time_rate) == null ? "-" : `${otPct(row.on_time_rate)}%`} />
                <Field label="Assessed" value={shortDate(a.assessment_date)} />
                <Field label="Quality acceptance" value={a.quality_acceptance} />
                <Field label="Invoice accuracy" value={a.invoice_accuracy} />
                <Field label="Responsiveness" value={a.responsiveness} />
              </dl>
            ) : (
              <EmptyPanel>This vendor has no recorded assessment yet.</EmptyPanel>
            )}
          </div>

          <div>
            <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Assessment history</p>
            {isLoading ? (
              <LoadingState rows={3} />
            ) : history.length === 0 ? (
              <EmptyPanel>No assessments recorded for this vendor.</EmptyPanel>
            ) : (
              <div className="overflow-x-auto rounded-md border border-white-02">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr>
                      {["Date", "OTD", "Qual.", "Inv.", "Resp.", "Overall", "Grade", "By"].map((h) => (
                        <th key={h} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{shortDate(h.assessment_date)}</td>
                        <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{h.on_time_delivery}</td>
                        <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{h.quality_acceptance}</td>
                        <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{h.invoice_accuracy}</td>
                        <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{h.responsiveness}</td>
                        <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold tabular-nums">{h.overall_score}</td>
                        <td className="border-t border-white-02 px-3 py-2"><Pill tone={h.grade === "A" ? "green" : h.grade === "B" ? "amber" : "red"}>{h.grade}</Pill></td>
                        <td className="border-t border-white-02 px-3 py-2 font-mont text-xs text-gray-05">{h.assessor || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </DetailDrawer>
  );
}
