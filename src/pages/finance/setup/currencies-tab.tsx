/**
 * Setup → Currencies & FX. Design topology: FX Rates / Currencies tabs; the FX
 * tab has per-pair rate cards (latest + delta + sparkline, computed from the rate
 * history), base/source filters, the rate table, and New FX rate. Currencies tab
 * lists the platform currencies. (No "Sync" - there's no live feed integration;
 * no "captured by" - FxRate has no user field.)
 */
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";
import { DataTable, StatusPill, Sparkline, FormDrawer, FormField, TabStrip, CHART_COLORS, toArray, type Column, type TabStripItem } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { P } from "../../../permissions";
import { useGetCurrenciesQuery, useGetFxRatesQuery, useCreateFxRateMutation } from "@/redux/services/finance/setup-api";
import type { Currency, FxRate } from "@/redux/services/finance/setup-types";

const selectCls = "h-9 rounded-md border border-white-02 bg-white px-2 font-mont text-sm text-black-01 focus:border-primary focus:outline-none";
const fmtRate = (r: string | number) => Number(r).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const VIEW_TABS: TabStripItem<"fx" | "currencies">[] = [
  { value: "fx", label: "FX Rates" },
  { value: "currencies", label: "Currencies" },
];

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="font-mont text-xs text-gray-05">-</span>;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return <span className={cn("inline-flex items-center gap-0.5 font-mont text-xs font-semibold", up ? "text-green-01" : "text-destructive")}><Icon className="size-3.5" />{up ? "+" : ""}{pct.toFixed(1)}%</span>;
}

export function CurrenciesTab() {
  const [tab, setTab] = useState<"fx" | "currencies">("fx");
  const cur = useGetCurrenciesQuery();
  const fx = useGetFxRatesQuery();
  const currencies = toArray<Currency>(cur.data?.data);
  const rates = toArray<FxRate>(fx.data?.data);

  const [base, setBase] = useState("");
  const [source, setSource] = useState("");
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.FIN_CREATE_FX_RATE), () => setCreating(true));

  const bases = useMemo(() => [...new Set(rates.map((r) => r.base))].sort(), [rates]);
  const sources = useMemo(() => [...new Set(rates.map((r) => r.source).filter(Boolean))].sort(), [rates]);

  // Per-pair latest rate + delta vs the prior capture + sparkline of recent rates.
  const cards = useMemo(() => {
    const map = new Map<string, FxRate[]>();
    for (const r of rates) {
      const k = `${r.base}→${r.quote}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()].map(([pair, rs]) => {
      const sorted = rs.slice().sort((a, b) => a.as_of.localeCompare(b.as_of));
      const latest = sorted[sorted.length - 1];
      const prior = sorted[sorted.length - 2];
      const lr = Number(latest.rate);
      const pr = prior ? Number(prior.rate) : lr;
      return { pair, latest, deltaPct: pr ? ((lr - pr) / pr) * 100 : null, spark: sorted.slice(-8).map((r) => Number(r.rate)) };
    }).slice(0, 4);
  }, [rates]);

  const fxRows = useMemo(() => rates
    .filter((r) => (!base || r.base === base) && (!source || r.source === source))
    .slice().sort((a, b) => b.as_of.localeCompare(a.as_of)), [rates, base, source]);

  const fxCols: Column<FxRate>[] = [
    { header: "Date", cell: (r) => <span className="tabular-nums">{r.as_of}</span> },
    { header: "Pair", cell: (r) => <span className="font-semibold">{r.base} → {r.quote}</span> },
    { header: "Rate", align: "right", cell: (r) => <span className="tabular-nums">{fmtRate(r.rate)}</span> },
    { header: "Source", cell: (r) => r.source ? <span className="rounded bg-pry-01 px-1.5 py-0.5 font-mont text-[10px] font-semibold uppercase text-primary">{r.source}</span> : "-" },
  ];
  const currencyCols: Column<Currency>[] = [
    { header: "Code", cell: (c) => <span className="font-semibold">{c.code}</span> },
    { header: "Name", cell: (c) => c.name },
    { header: "Symbol", cell: (c) => c.symbol || "-" },
    { header: "Minor unit", align: "right", cell: (c) => c.minor_unit },
    { header: "Status", cell: (c) => <StatusPill status={c.is_active ? "ACTIVE" : "INACTIVE"} /> },
  ];

  return (
    <div className="space-y-4">
      {/* tabs + action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabStrip items={VIEW_TABS} value={tab} onChange={setTab} ariaLabel="Currency views" />
        {tab === "fx" && (
          <Can permission={P.FIN_CREATE_FX_RATE}>
            <Button onClick={() => setCreating(true)} className="h-9 gap-1.5 font-mont text-xs font-semibold"><Plus className="size-3.5" /> New FX rate</Button>
          </Can>
        )}
      </div>

      {tab === "fx" ? (
        <>
          {cards.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((c) => (
                <div key={c.pair} className="rounded-md bg-white p-4 ring-1 ring-white-02">
                  <p className="font-mont text-xs text-gray-05">{c.pair.replace("→", " / ")}{c.latest.source ? ` · ${c.latest.source}` : ""}</p>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <p className="font-mont text-xl font-semibold tabular-nums text-black-01">{fmtRate(c.latest.rate)}<span className="ml-1 text-xs font-normal text-gray-05">{c.latest.quote}</span></p>
                    <Sparkline data={c.spark} color={CHART_COLORS.primary} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5"><Delta pct={c.deltaPct} /><span className="font-mont text-[11px] text-gray-05">vs prior</span></div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select value={base} onChange={(e) => setBase(e.target.value)} className={selectCls} aria-label="Base currency">
              <option value="">All bases</option>
              {bases.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={selectCls} aria-label="Source">
              <option value="">All sources</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <DataTable columns={fxCols} rows={fxRows} rowKey={(r) => r.id}
            loading={fx.isLoading} error={fx.isError} onRetry={fx.refetch}
            emptyTitle="No FX rates" emptyMessage="Exchange rates will appear here." />
        </>
      ) : (
        <DataTable columns={currencyCols} rows={currencies} rowKey={(c) => c.code}
          loading={cur.isLoading} error={cur.isError} onRetry={cur.refetch} emptyTitle="No currencies" />
      )}

      <NewFxRateModal open={creating} onClose={() => setCreating(false)} currencies={currencies} />
    </div>
  );
}

function NewFxRateModal({ open, onClose, currencies }: { open: boolean; onClose: () => void; currencies: Currency[] }) {
  const [create, { isLoading }] = useCreateFxRateMutation();
  const [baseC, setBaseC] = useState("");
  const [quoteC, setQuoteC] = useState("");
  const [rate, setRate] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [src, setSrc] = useState("");
  const canSubmit = baseC !== "" && quoteC !== "" && baseC !== quoteC && Number(rate) > 0 && !!asOf;

  const submit = async () => {
    try {
      const r = await create({ base: baseC, quote: quoteC, rate, as_of: asOf, source: src.trim() || undefined }).unwrap();
      toast.success(r.message || "FX rate saved.");
      setRate(""); setSrc("");
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer open={open} onOpenChange={(o) => !o && onClose()} title="New FX rate"
      description="1 unit of base = rate units of quote, on the given date." onSubmit={submit}
      loading={isLoading} canSubmit={canSubmit} widthClass="sm:max-w-lg">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Base" required>
          <select value={baseC} onChange={(e) => setBaseC(e.target.value)} className={cn(selectCls, "w-full")}>
            <option value="">Select</option>
            {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </FormField>
        <FormField label="Quote" required>
          <select value={quoteC} onChange={(e) => setQuoteC(e.target.value)} className={cn(selectCls, "w-full")}>
            <option value="">Select</option>
            {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="Rate" required><Input value={rate} onChange={(e) => setRate(e.target.value)} type="number" step="0.0001" placeholder="e.g. 1612.40" className="bg-white font-mont" /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="As of" required><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="bg-white" /></FormField>
        <FormField label="Source"><Input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="e.g. CBN" className="bg-white" /></FormField>
      </div>
    </FormDrawer>
  );
}
