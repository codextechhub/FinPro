// AP Aging (§6) - outstanding payables bucketed by age, as of a chosen date.
import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, Clock, HandCoins } from "lucide-react";

import {
  AgingStack, BarChart, DetailDrawer, EmptyState, ErrorState, ForbiddenState, StatCard,
  LoadingState, Money, toArray,
} from "@/components/finance-ui";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import {
  useGetApAgingQuery, useGetApAgingVendorQuery, useGetApCashRequirementsQuery,
} from "@/redux/services/procurement/procurement-ext-api";
import type { ApAging, ApCashRequirements, ApVendorDetail } from "@/redux/services/procurement/procurement-ext-types";
import type { ReportMoney } from "@/redux/services/finance/reports-types";
import { formatMoney } from "@/utils/money";
import { isForbidden, shortDate } from "../sourcing/helpers";
import { Field, EmptyPanel } from "../sourcing/shared";
import { Card, ChartEmpty, DateFilter, Pill, ScopeNote, StatusDotPill, SectionHeader, type PillTone } from "./shared";
import { PageShell } from "@/components/layout/page-shell";
import {
  BUCKET_LABEL, TD, TDR, TFOOT, TFOOTR, TH, THR, ageColor, excludedScopeNote, kobo, todayISO,
  type SectionProps,
} from "./helpers";

// Status from the vendor's real buckets - any position 31+ days late reads Overdue.
function apStatus(buckets: Record<string, ReportMoney>): { label: string; tone: PillTone } {
  const k = (name: string) => kobo(buckets[name]);
  if (k("31-60") > 0 || k("61-90") > 0 || k("90+") > 0) return { label: "Overdue", tone: "red" };
  if (k("1-30") > 0) return { label: "Due soon", tone: "amber" };
  return { label: "Current", tone: "green" };
}

// Short net-terms label for the vendor subtitle (e.g. "NET_30" → "Net 30"); "" when unset.
function termsLabel(v: string): string {
  if (!v) return "";
  if (v === "NET_0") return "Due on receipt";
  const m = /^NET_(\d+)$/.exec(v);
  return m ? `Net ${m[1]}` : v;
}

// Pill tone for a single aging bucket (green current, amber 1–30, red beyond).
function bucketTone(bucket: string): PillTone {
  if (bucket === "current") return "green";
  if (bucket === "1-30") return "amber";
  return "red";
}

export default function ApAgingScreen({ entity, currency }: SectionProps) {
  const [asOf, setAsOf] = useState(todayISO());
  const params = useMemo(() => ({ entity, ...(asOf ? { as_of: asOf } : {}) }), [entity, asOf]);
  const aging = useGetApAgingQuery(params);
  const cash = useGetApCashRequirementsQuery(params);

  const forbidden = isForbidden(aging.error) || isForbidden(cash.error);
  const d = aging.data?.data;

  return (
    <PageShell className="space-y-5 text-black-01">
      <SectionHeader title="AP Aging" subtitle="Outstanding payables bucketed by age.">
        <DateFilter label="As of" value={asOf} onChange={setAsOf} />
      </SectionHeader>

      {forbidden ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><ForbiddenState /></div>
      ) : aging.isLoading ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><LoadingState rows={8} /></div>
      ) : aging.isError || !d ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><ErrorState onRetry={aging.refetch} /></div>
      ) : (
        <ApAgingBody d={d} cash={cash.data?.data} currency={currency} entity={entity} asOf={asOf} />
      )}
    </PageShell>
  );
}

function ApAgingBody({ d, cash, currency, entity, asOf }: {
  d: ApAging;
  cash?: ApCashRequirements;
  currency?: string | null;
  entity: string;
  asOf: string;
}) {
  const [sel, setSel] = useState<{ code: string; name: string } | null>(null);
  const rows = toArray(d.rows);
  const buckets = d.buckets;
  // What we owe is the open bills. Money paid ahead of a bill is not a smaller
  // payable, it is a separate asset (vendor advances), so it gets its own card
  // instead of being quietly netted off the headline.
  const outstanding = kobo(d.total_outstanding);
  const advances = kobo(d.total_unallocated_credit);
  const totalNet = kobo(d.total_net);
  // Overdue = everything past its due date = outstanding less the not-yet-due "current".
  const overdue = outstanding - kobo(d.bucket_totals.current);
  const dueThisWeek = cash ? kobo(cash.bucket_totals["0-7"]) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total payable" value={formatMoney(outstanding, currency)} icon={Banknote} tone="primary" sub="open vendor bills" />
        <StatCard label="Overdue" value={formatMoney(overdue, currency)} icon={AlertTriangle} tone="red" sub="past due" />
        <StatCard label="Due this week" value={formatMoney(dueThisWeek, currency)} icon={Clock} tone="amber" sub="next 7 days" />
        <StatCard label="Paid in advance" value={formatMoney(advances, currency)} icon={HandCoins} tone="primary" sub="held in vendor advances" />
      </div>

      {/* A branch-bound reader's totals are a subset, so say how many bills sit outside
          them rather than let a narrowed figure read as the entity's whole payable. */}
      <ScopeNote>{excludedScopeNote(d.unassigned_excluded_count, "vendor bill")}</ScopeNote>

      <Card title="Payables by age bucket" subtitle="Outstanding bills across aging windows">
        <BarChart
          height={200}
          showValues
          format={(v) => formatMoney(v, currency)}
          data={buckets.map((b) => ({ label: BUCKET_LABEL[b] ?? b, value: kobo(d.bucket_totals[b]), color: ageColor(b) }))}
        />
      </Card>

      <section className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
        {rows.length === 0 ? (
          <EmptyState title="No outstanding payables" message="Nothing is owed to vendors as of this date." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Vendor</th>
                  {buckets.map((b) => <th key={b} className={THR}>{BUCKET_LABEL[b] ?? b}</th>)}
                  {/* Net, not Total: this column is the buckets less anything paid in
                      advance, so a vendor we are ahead with reads negative. */}
                  <th className={THR}>Net</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = apStatus(r.buckets);
                  return (
                    <tr key={r.vendor_id} onClick={() => setSel({ code: r.code, name: r.name })} className="cursor-pointer transition-colors hover:bg-primary/5">
                      <td className={TD}>
                        <span className="font-semibold text-gray-01">{r.name}</span>
                        {termsLabel(r.payment_terms) && (
                          <span className="mt-0.5 block font-mont text-[11px] text-gray-05">{termsLabel(r.payment_terms)}</span>
                        )}
                      </td>
                      {buckets.map((b) => (
                        <td key={b} className={TDR}><Money kobo={kobo(r.buckets[b])} currency={currency} align="right" /></td>
                      ))}
                      <td className={cn(TDR, "font-semibold")}><Money kobo={kobo(r.net)} currency={currency} align="right" /></td>
                      <td className={TD}><StatusDotPill tone={st.tone}>{st.label}</StatusDotPill></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className={TFOOT}>Total</td>
                  {buckets.map((b) => (
                    <td key={b} className={TFOOTR}><Money kobo={kobo(d.bucket_totals[b])} currency={currency} align="right" /></td>
                  ))}
                  <td className={TFOOTR}><Money kobo={totalNet} currency={currency} align="right" /></td>
                  <td className={TFOOT} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <ApVendorDrawer sel={sel} entity={entity} asOf={asOf} currency={currency} onClose={() => setSel(null)} />
    </div>
  );
}

function ApVendorDrawer({ sel, entity, asOf, currency, onClose }: {
  sel: { code: string; name: string } | null;
  entity: string;
  asOf: string;
  currency?: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useGetApAgingVendorQuery(
    { entity, vendor: sel?.code ?? "", ...(asOf ? { as_of: asOf } : {}) }, { skip: !sel },
  );
  const d = data?.data;
  return (
    <DetailDrawer
      open={!!sel} onOpenChange={(o) => !o && onClose()}
      title={sel ? sel.name : "Vendor"}
      description={sel ? `${sel.code} · open payables` : ""}
      widthClass="sm:max-w-2xl"
    >
      {sel && (
        isLoading ? <LoadingState rows={6} />
          : isError || !d ? <ErrorState onRetry={refetch} />
            : <ApVendorBody d={d} currency={currency} />
      )}
    </DetailDrawer>
  );
}

function ApVendorBody({ d, currency }: { d: ApVendorDetail; currency?: string | null }) {
  const invoices = toArray(d.invoices);
  const outstanding = kobo(d.outstanding);
  const stack = d.buckets
    .map((b) => ({ key: b, label: BUCKET_LABEL[b] ?? b, amount: kobo(d.bucket_amounts[b]), color: ageColor(b) }))
    .filter((x) => x.amount > 0);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Aging breakdown</p>
        {outstanding > 0 && stack.length > 0 ? (
          <AgingStack buckets={stack.map((x) => ({
            key: x.key, label: x.label,
            pct: Math.round((x.amount / outstanding) * 100),
            amount: formatMoney(x.amount, currency), color: x.color,
          }))} />
        ) : (
          <ChartEmpty>No aged outstanding balance for this vendor.</ChartEmpty>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-3">
        <Field label="Outstanding" value={formatMoney(outstanding, currency)} />
        <Field label="Paid in advance" value={formatMoney(kobo(d.unallocated_credit), currency)} />
        <Field label="Net payable" value={formatMoney(kobo(d.net), currency)} />
      </dl>

      <div>
        <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Open invoices</p>
        {invoices.length === 0 ? (
          <EmptyPanel>No open invoices for this vendor.</EmptyPanel>
        ) : (
          <div className="overflow-x-auto rounded-md border border-white-02">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr>
                  {["Invoice", "Invoice date", "Due date", "Days overdue", "Bucket", "Balance due"].map((h, i) => (
                    <th key={h} className={cn("bg-[#F1F1F1] px-3 py-2 font-mont text-[11px] font-semibold text-gray-01 whitespace-nowrap", i === 5 ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoice_id}>
                    <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold tabular-nums text-primary">{inv.document_number}</td>
                    <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{shortDate(inv.invoice_date)}</td>
                    <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{inv.due_date ? shortDate(inv.due_date) : "-"}</td>
                    <td className={cn("border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums", inv.days_overdue > 0 ? "text-destructive" : "text-gray-05")}>{inv.days_overdue > 0 ? `${inv.days_overdue}d` : "-"}</td>
                    <td className="border-t border-white-02 px-3 py-2"><Pill tone={bucketTone(inv.bucket)}>{BUCKET_LABEL[inv.bucket] ?? inv.bucket}</Pill></td>
                    <td className="border-t border-white-02 px-3 py-2 text-right"><Money kobo={kobo(inv.balance_due)} currency={currency} align="right" /></td>
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
