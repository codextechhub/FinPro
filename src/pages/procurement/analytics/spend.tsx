// Spend Analytics (§6) - spend by category, vendor and over time, for a window.
import { useMemo, useState } from "react";

import { Banknote, FileText, Receipt, Wallet } from "lucide-react";

import {
  DetailDrawer, Donut, EmptyState, ErrorState, ForbiddenState, Money, StatCard, LoadingState, TrendArea, toArray,
} from "@/components/finance-ui";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { useGetSpendAnalysisQuery } from "@/redux/services/procurement/procurement-ext-api";
import type { SpendAnalysis } from "@/redux/services/procurement/procurement-ext-types";
import { formatMoney } from "@/utils/money";
import { isForbidden } from "../sourcing/helpers";
import { Field } from "../sourcing/shared";
import { Card, ChartEmpty, DateFilter, HBars, Meter, ScopeNote, SectionHeader } from "./shared";
import { DONUT_COLORS, TD, TDR, TH, THR, excludedScopeNote, kobo, type SectionProps } from "./helpers";
import { PageShell } from "@/components/layout/page-shell";

export default function SpendScreen({ entity, currency }: SectionProps) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const params = useMemo(
    () => ({ entity, ...(start ? { start_date: start } : {}), ...(end ? { end_date: end } : {}) }),
    [entity, start, end],
  );
  const { data, isLoading, isError, error, refetch } = useGetSpendAnalysisQuery(params);
  const d = data?.data;

  return (
    <PageShell className="space-y-5 text-black-01">
      <SectionHeader title="Spend Analytics" subtitle="Spend by category, vendor and over time.">
        <DateFilter label="From" value={start} onChange={setStart} />
        <DateFilter label="To" value={end} onChange={setEnd} />
      </SectionHeader>

      {isForbidden(error) ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><ForbiddenState /></div>
      ) : isLoading ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><LoadingState rows={8} /></div>
      ) : isError || !d ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}><ErrorState onRetry={refetch} /></div>
      ) : (
        <SpendBody d={d} currency={currency} entity={entity} start={start} end={end} />
      )}
    </PageShell>
  );
}

function SpendBody({ d, currency, entity, start, end }: {
  d: SpendAnalysis;
  currency?: string | null;
  entity: string;
  start: string;
  end: string;
}) {
  const [sel, setSel] = useState<{ key: string; label: string } | null>(null);
  const byCategory = toArray(d.by_category);
  const byVendor = toArray(d.by_vendor);
  const byPeriod = toArray(d.by_period);
  const totalGross = kobo(d.total_gross);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total spend" value={formatMoney(totalGross, currency)} icon={Banknote} tone="primary" sub="gross of posted bills" />
        <StatCard label="Net" value={formatMoney(kobo(d.total_net), currency)} icon={Wallet} tone="primary" sub="ex-tax" />
        <StatCard label="Tax" value={formatMoney(kobo(d.total_tax), currency)} icon={Receipt} tone="amber" sub="input tax" />
        <StatCard label="Invoices" value={String(d.invoice_count)} icon={FileText} tone="primary" sub="posted in window" />
      </div>

      {/* Spend read under one branch is a subset: name the bills left outside it so the
          total is not mistaken for what the whole entity spent. */}
      <ScopeNote>{excludedScopeNote(d.unassigned_excluded_count, "vendor bill")}</ScopeNote>

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Spend by category" subtitle="Gross across vendor categories">
          {byCategory.length === 0 ? (
            <ChartEmpty>No posted spend in this window.</ChartEmpty>
          ) : (
            <Donut
              data={byCategory.map((c, i) => ({ label: c.label, value: kobo(c.gross), color: DONUT_COLORS[i % DONUT_COLORS.length] }))}
              center={{ main: formatMoney(totalGross, currency), sub: "Total" }}
              formatValue={(v) => formatMoney(v, currency)}
            />
          )}
        </Card>

        <Card title="Top vendors by spend" subtitle="Highest gross suppliers in the window">
          {byVendor.length === 0 ? (
            <ChartEmpty>No posted spend in this window.</ChartEmpty>
          ) : (
            <HBars items={byVendor.slice(0, 8).map((v) => ({ label: v.label, value: kobo(v.gross) }))} currency={currency} />
          )}
        </Card>
      </div>

      <Card title="Monthly spend trend" subtitle="Gross posted spend by month">
        {byPeriod.length === 0 ? (
          <ChartEmpty>No posted spend to trend in this window.</ChartEmpty>
        ) : (
          <TrendArea
            height={200}
            labels={byPeriod.map((p) => p.label)}
            series={[{ name: "Spend", data: byPeriod.map((p) => kobo(p.gross)), color: "var(--color-primary, #2563eb)" }]}
            format={(v) => formatMoney(v, currency)}
            showLegend={false}
          />
        )}
      </Card>

      <section className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
        {byCategory.length === 0 ? (
          <EmptyState title="No spend" message="No posted vendor invoices fall in this window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Category</th>
                  <th className={THR}>Invoices</th>
                  <th className={THR}>Net</th>
                  <th className={THR}>Tax</th>
                  <th className={THR}>Gross</th>
                  <th className={TH}>Share</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((c) => {
                  const gross = kobo(c.gross);
                  const ratio = totalGross > 0 ? gross / totalGross : 0;
                  return (
                    <tr key={c.key} onClick={() => setSel({ key: c.key, label: c.label })} className="cursor-pointer transition-colors hover:bg-primary/5">
                      <td className={TD}><span className="font-semibold text-gray-01">{c.label}</span></td>
                      <td className={TDR}>{c.invoice_count}</td>
                      <td className={TDR}><Money kobo={kobo(c.net)} currency={currency} align="right" /></td>
                      <td className={TDR}><Money kobo={kobo(c.tax)} currency={currency} align="right" /></td>
                      <td className={cn(TDR, "font-semibold")}><Money kobo={gross} currency={currency} align="right" /></td>
                      <td className={TD}><Meter ratio={ratio} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SpendCategoryDrawer sel={sel} entity={entity} start={start} end={end} currency={currency} onClose={() => setSel(null)} />
    </div>
  );
}

function SpendCategoryDrawer({ sel, entity, start, end, currency, onClose }: {
  sel: { key: string; label: string } | null;
  entity: string;
  start: string;
  end: string;
  currency?: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useGetSpendAnalysisQuery(
    { entity, category: sel?.key ?? "", ...(start ? { start_date: start } : {}), ...(end ? { end_date: end } : {}) },
    { skip: !sel },
  );
  const d = data?.data;
  return (
    <DetailDrawer
      open={!!sel} onOpenChange={(o) => !o && onClose()}
      title={sel ? sel.label : "Category"}
      description={sel ? "Spend by vendor and over time" : ""}
      widthClass="sm:max-w-2xl"
    >
      {sel && (
        isLoading ? <LoadingState rows={6} />
          : isError || !d ? <ErrorState onRetry={refetch} />
            : <SpendCategoryBody d={d} currency={currency} />
      )}
    </DetailDrawer>
  );
}

function SpendCategoryBody({ d, currency }: { d: SpendAnalysis; currency?: string | null }) {
  const byVendor = toArray(d.by_vendor);
  const byPeriod = toArray(d.by_period);
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-4">
        <Field label="Total spend" value={formatMoney(kobo(d.total_gross), currency)} />
        <Field label="Net" value={formatMoney(kobo(d.total_net), currency)} />
        <Field label="Tax" value={formatMoney(kobo(d.total_tax), currency)} />
        <Field label="Invoices" value={d.invoice_count} />
      </dl>

      <div>
        <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Vendors in this category</p>
        {byVendor.length === 0 ? (
          <ChartEmpty>No posted spend for this category in the window.</ChartEmpty>
        ) : (
          <HBars items={byVendor.slice(0, 10).map((v) => ({ label: v.label, value: kobo(v.gross) }))} currency={currency} />
        )}
      </div>

      <div>
        <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Monthly trend</p>
        {byPeriod.length === 0 ? (
          <ChartEmpty>No posted spend to trend.</ChartEmpty>
        ) : (
          <TrendArea
            height={180}
            labels={byPeriod.map((p) => p.label)}
            series={[{ name: "Spend", data: byPeriod.map((p) => kobo(p.gross)), color: "var(--color-primary, #2563eb)" }]}
            format={(v) => formatMoney(v, currency)}
            showLegend={false}
          />
        )}
      </div>
    </div>
  );
}
