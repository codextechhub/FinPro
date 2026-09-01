// Shared helpers, status maps, activity feed and the Compare modal for the
// Sourcing section (RFQs + Quotations). Kept here so both pages stay lean and the
// competitive-comparison logic lives in one place.
import { useEffect, useState } from "react";
import { Award, X } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ActionButton, StatusPill } from "@/components/finance-ui";
import { cn } from "@/lib/utils";
import { P } from "../../../permissions";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useGetRfqsQuery, useGetRfqQuery, useGetQuotationsQuery, useGetQuotationQuery,
  useAwardQuotationMutation,
} from "@/redux/services/procurement/procurement-ext-api";
import type {
  Quotation, QuotationDetail, RfqDetail,
} from "@/redux/services/procurement/procurement-types";
import { toArray } from "@/components/finance-ui";
import { formatMoney } from "@/utils/money";
import { ScrollArea } from "@/components/ui/scroll-area";
import { shortDate } from "./helpers";

// ── Small presentational helpers (match the finance-ui drawer typography) ─────
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mont text-[11px] text-gray-05">{label}</dt>
      <dd className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{value || "-"}</dd>
    </div>
  );
}

export function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">
      {children}
    </div>
  );
}

// The amber lapsed-validity overlay pill (shown alongside, never replacing, status).
export function ExpiredPill() {
  return (
    <span className="rounded bg-amber-100 px-2 py-0.5 font-mont text-[11px] font-medium text-amber-700">
      Expired
    </span>
  );
}

export { ActivityFeed } from "../activity-feed";

// ── Compare modal ─────────────────────────────────────────────────────────────
// Centered wide modal (the prototype shows one). Pick an RFQ that has ≥1 received
// quotation, then read a real, honest side-by-side of its competing bids: only
// total, lead time, valid-until, submitted date, reference, status and the
// per-RFQ-line unit-price matrix. No invented spec/warranty/grade/recommendation.

// Loads one quotation's detail and reports it up so the parent can compute the
// per-line lowest across every column (a variable number of quotes → one hook per
// child component, never a hook in a loop).
function DetailFetcher({ id, entity, onLoaded }: { id: number; entity: string; onLoaded: (d: QuotationDetail) => void }) {
  const { data } = useGetQuotationQuery({ id, entity });
  const detail = data?.data;
  useEffect(() => { if (detail) onLoaded(detail); }, [detail, onLoaded]);
  return null;
}

export function CompareModal({ entity, currency, open, onClose }: { entity: string; currency?: string | null; open: boolean; onClose: () => void }) {
  const { data: rfqData } = useGetRfqsQuery({ entity, page: 1 }, { skip: !open });
  // Only RFQs with at least one non-draft quotation are worth comparing.
  const comparable = toArray(rfqData?.data).filter((r) => r.response_count > 0);
  const [rfqId, setRfqId] = useState<number | null>(null);
  const selected = rfqId ?? comparable[0]?.id ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="console-geist max-h-[92dvh] w-[95vw] sm:max-w-4xl flex flex-col">
        <ScrollArea className="min-h-0 flex-auto">
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="font-mont text-base font-semibold text-black-01">Compare quotations</DialogTitle>
              <DialogDescription className="font-mont text-sm text-gray-05">
                Side-by-side of the bids received against one RFQ. Award the chosen quotation to raise its purchase order.
              </DialogDescription>
            </DialogHeader>

            {comparable.length === 0 ? (
              <EmptyPanel>No RFQ has received a quotation yet.</EmptyPanel>
            ) : (
              <div className="space-y-4 py-1">
                <div className="flex max-w-full flex-wrap gap-2">
                  {comparable.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRfqId(r.id)}
                      className={cn(
                        "rounded border px-3 py-1.5 font-mont text-xs font-medium whitespace-nowrap",
                        selected === r.id ? "border-primary bg-primary/5 text-primary" : "border-white-02 text-gray-05",
                      )}
                    >
                      {r.document_number}
                      <span className="ml-1.5 text-gray-04">· {r.response_count} bid{r.response_count === 1 ? "" : "s"}</span>
                    </button>
                  ))}
                </div>
                {selected != null && <CompareMatrix key={selected} rfqId={selected} entity={entity} currency={currency} onAwarded={onClose} />}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded border border-white-02 px-3 py-1.5 font-mont text-xs font-medium text-gray-05">
                <X className="size-3.5" /> Close
              </button>
            </div>

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function CompareMatrix({ rfqId, entity, currency, onAwarded }: { rfqId: number; entity: string; currency?: string | null; onAwarded: () => void }) {
  const [competitionExceptionReason, setCompetitionExceptionReason] = useState("");
  const { hasPermission } = usePermissions();
  const canOverrideCompetition = hasPermission(P.PROC_OVERRIDE_COMPETITION);
  const { data: rfqDetailData } = useGetRfqQuery({ id: rfqId, entity });
  const rfq: RfqDetail | undefined = rfqDetailData?.data;
  // Columns come from the quotation list (all summary criteria, no per-line prices).
  const { data: quotesData } = useGetQuotationsQuery({ entity, rfq: String(rfqId), page: 1 });
  const quotes = toArray(quotesData?.data).filter((q) => q.quotation_status !== "DRAFT");
  const [award] = useAwardQuotationMutation();

  // Central store of each column's line detail, so per-line lowest can be computed.
  const [details, setDetails] = useState<Record<number, QuotationDetail>>({});
  const onLoaded = (d: QuotationDetail) => setDetails((prev) => (prev[d.id] === d ? prev : { ...prev, [d.id]: d }));

  if (quotes.length === 0) return <EmptyPanel>This RFQ has no submitted quotations to compare.</EmptyPanel>;

  const money = (value: number) => formatMoney(value, currency);
  const lowestTotal = Math.min(...quotes.map((q) => q.total));
  const rfqLines = rfq?.lines ?? [];

  // price for (rfq_line, quote) from the fetched detail; null when the quote did
  // not price that line (unlinked lines legitimately show "-").
  const priceFor = (rfqLineId: number, quoteId: number): number | null => {
    const line = details[quoteId]?.lines.find((l) => l.rfq_line_id === rfqLineId);
    return line ? line.unit_price : null;
  };
  const lowestForLine = (rfqLineId: number): number | null => {
    const prices = quotes.map((q) => priceFor(rfqLineId, q.id)).filter((p): p is number => p != null);
    return prices.length ? Math.min(...prices) : null;
  };

  const labelCell = "sticky left-0 z-10 border-t border-white-02 bg-white px-3 py-2 font-mont text-[11px] font-semibold text-gray-05";
  const dataCell = "border-t border-l border-white-02 px-3 py-2 font-mont text-xs tabular-nums text-black-01";

  return (
    <>
      {quotes.map((q) => <DetailFetcher key={q.id} id={q.id} entity={entity} onLoaded={onLoaded} />)}
      <div className="overflow-x-auto rounded-md border border-white-02">
        <table className="min-w-max border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">Criteria</th>
              {quotes.map((q) => (
                <th key={q.id} className="border-l border-white-02 bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">
                  <div className="flex items-center gap-1.5">
                    <span>{q.vendor_name || q.vendor_code}</span>
                    {q.total === lowestTotal && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Lowest bid</span>}
                  </div>
                  <p className="mt-0.5 font-normal text-gray-05">{q.document_number}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <MatrixRow label="Total quoted" labelCell={labelCell}>
              {quotes.map((q) => <td key={q.id} className={cn(dataCell, "font-semibold")}>{money(q.total)}</td>)}
            </MatrixRow>
            <MatrixRow label="Lead time" labelCell={labelCell}>
              {quotes.map((q) => <td key={q.id} className={dataCell}>{q.lead_time_days == null ? "-" : `${q.lead_time_days} days`}</td>)}
            </MatrixRow>
            <MatrixRow label="Valid until" labelCell={labelCell}>
              {quotes.map((q) => (
                <td key={q.id} className={dataCell}>
                  {shortDate(q.valid_until)}{q.is_expired && <span className="ml-1.5 text-amber-600">(expired)</span>}
                </td>
              ))}
            </MatrixRow>
            <MatrixRow label="Submitted" labelCell={labelCell}>
              {quotes.map((q) => <td key={q.id} className={dataCell}>{shortDate(q.quote_date)}</td>)}
            </MatrixRow>
            <MatrixRow label="Reference" labelCell={labelCell}>
              {quotes.map((q) => <td key={q.id} className={dataCell}>{q.reference || "-"}</td>)}
            </MatrixRow>
            <MatrixRow label="Status" labelCell={labelCell}>
              {quotes.map((q) => <td key={q.id} className={cn(dataCell, "whitespace-nowrap")}><StatusPill status={q.quotation_status} /></td>)}
            </MatrixRow>

            {rfqLines.length > 0 && (
              <tr>
                <td colSpan={quotes.length + 1} className="border-t border-white-02 bg-gray-50 px-3 py-1.5 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">
                  Unit price by RFQ line
                </td>
              </tr>
            )}
            {rfqLines.map((line) => {
              const low = lowestForLine(line.id);
              return (
                <MatrixRow key={line.id} label={line.description} labelCell={cn(labelCell, "font-normal text-black-01")}>
                  {quotes.map((q) => {
                    const price = priceFor(line.id, q.id);
                    return (
                      <td key={q.id} className={cn(dataCell, price != null && low != null && price === low && "font-semibold text-emerald-700")}>
                        {price == null ? "-" : money(price)}
                      </td>
                    );
                  })}
                </MatrixRow>
              );
            })}

            <tr>
              <td className="sticky left-0 z-10 border-t border-white-02 bg-white px-3 py-2" />
              {quotes.map((q) => (
                <td key={q.id} className="border-t border-l border-white-02 px-3 py-2">
                  {q.quotation_status === "SUBMITTED" && !q.is_expired && !q.awarded_po_id ? (
                    <ActionButton
                      asLink label="Award" permission={P.PROC_AWARD_QUOTATION}
                      title="Award this quotation?"
                      description={`Awards ${q.document_number} from ${q.vendor_name || q.vendor_code} and raises a draft purchase order. The other quotations on this RFQ will be rejected.`}
                      onConfirm={async () => {
                        const res = await award({ id: q.id, entity, competition_exception_reason: competitionExceptionReason.trim() || undefined }).unwrap();
                        toast.success(res.message || "Quotation awarded.");
                        setCompetitionExceptionReason("");
                        onAwarded();
                      }}
                    >{canOverrideCompetition ? <label className="block font-mont text-xs font-semibold text-gray-01">Exception reason (only if below the bid minimum)<Textarea className="mt-2 min-h-20 bg-white font-mont text-sm" value={competitionExceptionReason} onChange={(event) => setCompetitionExceptionReason(event.target.value)} maxLength={1000} placeholder="Explain why award should proceed with limited competition" /></label> : null}</ActionButton>
                  ) : q.awarded_po_id ? (
                    <span className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-emerald-700"><Award className="size-3" /> Awarded</span>
                  ) : (
                    <span className="font-mont text-[11px] text-gray-04">-</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="font-mont text-[11px] text-gray-05">
        Only real, recorded criteria are compared - there is no spec-compliance, warranty or vendor grade in the data.
      </p>
    </>
  );
}

function MatrixRow({ label, labelCell, children }: { label: string; labelCell: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className={labelCell}>{label}</td>
      {children}
    </tr>
  );
}

// Re-export so pages can share the row-per-quote sub-table type without extra imports.
export type { Quotation };
