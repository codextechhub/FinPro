// Fixed Assets, rebuilt to the Vision prototype in the house theme: a register with
// KPIs + category/status filters, a detail drawer (cost/accum/NBV cards + a yearly
// depreciation schedule + acquire / depreciate / dispose), an Add-asset drawer, and a
// period-wide Run-depreciation preview that posts one compound journal.
//
// Backed by the real model: straight-line only; the schedule is monthly (rolled up to
// years for display); depreciation posts per-asset OR period-wide; disposal posts a
// real gain/loss journal. Acquisition codes the asset (FA document number = its tag).

import { useMemo, useState, type ReactNode } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus, Sparkles, Banknote, PackageX } from "lucide-react";
import { DataTable, Money, MoneyInput, DetailDrawer, FormField, BankAccountPicker, AccountPicker, PostingRecap, KpiCard, toArray, type Column, type RecapRow, PostingDateField,} from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "@/permissions";
import {
  useGetFixedAssetsQuery, useGetFixedAssetSummaryQuery, useCreateFixedAssetMutation, useAcquireFixedAssetMutation,
  useDepreciateFixedAssetMutation, useGetDepreciationPreviewQuery, useRunDepreciationMutation,
  useDisposeFixedAssetMutation,
} from "@/redux/services/finance/ops-api";
import type { FixedAsset } from "@/redux/services/finance/ops-types";
import { todayISO } from "@/utils/posting-window";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";
const monthEndISO = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); };
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "-");

const CATEGORIES: [string, string][] = [
  ["VEHICLES", "Vehicles"], ["BUILDINGS", "Buildings"], ["PLANT_MACHINERY", "Plant & machinery"],
  ["IT_EQUIPMENT", "IT equipment"], ["FURNITURE", "Furniture & fittings"], ["EQUIPMENT", "Equipment"], ["OTHER", "Other"],
];
const METHODS: [string, string][] = [["STRAIGHT_LINE", "Straight line"], ["DECLINING_BALANCE", "Declining balance"]];
const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-gray-03/60 text-gray-05" },
  ACTIVE: { label: "In use", cls: "bg-green-01/10 text-green-01" },
  FULLY_DEPRECIATED: { label: "Fully depreciated", cls: "bg-blue-50 text-blue-700" },
  DISPOSED: { label: "Disposed", cls: "bg-destructive/10 text-destructive" },
};
function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.DRAFT;
  return <span className={cn(PILL, s.cls)}>{s.label}</span>;
}
function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

// Roll the monthly schedule up to calendar years for the drawer table.
function yearlySchedule(asset: FixedAsset) {
  const byYear = new Map<number, { dep: number; posted: number; count: number }>();
  for (const r of asset.schedule) {
    const y = new Date(r.depreciation_date).getFullYear();
    const e = byYear.get(y) ?? { dep: 0, posted: 0, count: 0 };
    e.dep += r.amount; e.count += 1; if (r.is_posted) e.posted += 1;
    byYear.set(y, e);
  }
  let nbv = asset.cost;
  return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, e]) => {
    const opening = nbv; const closing = opening - e.dep; nbv = closing;
    return { year, opening, dep: e.dep, closing, posted: e.posted, count: e.count };
  });
}

export function AssetsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));
  const [running, setRunning] = useState(false);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useGetFixedAssetsQuery({
    entity, page, ...(category ? { category } : {}), ...(status ? { asset_status: status } : {}),
  });
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const resetPage = () => setPage(1);

  const summaryQ = useGetFixedAssetSummaryQuery({ entity });
  const kpis = summaryQ.data?.data ?? { cost: 0, accum: 0, nbv: 0, monthly: 0 };

  const columns: Column<FixedAsset>[] = [
    { header: "Tag", cell: (a) => <span className="font-semibold tabular-nums text-gray-01">{a.document_number || "-"}</span> },
    { header: "Asset", cell: (a) => <span><span className="font-medium text-gray-01">{a.name}</span>{a.asset_code ? <span className="ml-1 text-gray-05">· {a.asset_code}</span> : null}</span> },
    { header: "Category", cell: (a) => <span className={cn(PILL, "bg-gray-03/60 text-gray-05")}>{a.category_display}</span> },
    { header: "Cost", align: "right", cell: (a) => <Money kobo={a.cost} currency={currency} align="right" /> },
    { header: "Accum. dep.", align: "right", cell: (a) => <Money kobo={a.accumulated_depreciation} currency={currency} align="right" /> },
    { header: "Net book value", align: "right", cell: (a) => <Money kobo={a.net_book_value} currency={currency} align="right" /> },
    { header: "Method", cell: (a) => <span className="font-mont text-[11px] text-gray-05">{a.method_display}</span> },
    { header: "Status", cell: (a) => <StatusPill status={a.asset_status} /> },
  ];

  return (
    <div className="space-y-5" data-guide="finance-assets.workbench">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-assets.summary">
        <KpiCard label="Total cost" value={formatMoney(kpis.cost, currency)} foot="Assets in the register" />
        <KpiCard label="Accumulated dep." value={formatMoney(kpis.accum, currency)} />
        <KpiCard label="Net book value" value={formatMoney(kpis.nbv, currency)} />
        <KpiCard label="Monthly depreciation" value={formatMoney(kpis.monthly, currency)} foot="Active assets, straight-line" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3" data-guide="finance-assets.controls">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={category} onChange={(v) => { setCategory(v); resetPage(); }} className="w-44">
            <option value="">All categories</option>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select value={status} onChange={(v) => { setStatus(v); resetPage(); }} className="w-40">
            <option value="">All status</option>
            {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Can permission={P.FIN_DEPRECIATE_FIXED_ASSET}>
            <Button variant="outline" onClick={() => setRunning(true)} className="gap-1.5"><Sparkles className="size-4" /> Run depreciation</Button>
          </Can>
          <Can permission={P.FIN_CREATE_FIXED_ASSET}>
            <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> Add asset</Button>
          </Can>
        </div>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(a) => a.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(a) => setSelectedId(a.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No fixed assets" emptyMessage="Add an asset, then acquire it to capitalise and start depreciation." />

      <AssetDrawer assetId={selectedId} assets={rows} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
      <NewAssetDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency} />
      <RunDepreciationDrawer open={running} onClose={() => setRunning(false)} entity={entity} currency={currency} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white-02 bg-white p-3">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <p className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{value}</p>
    </div>
  );
}

function AssetDrawer({ assetId, assets, entity, currency, onClose }: { assetId: number | null; assets: FixedAsset[]; entity: string; currency?: string | null; onClose: () => void }) {
  const asset = useMemo(() => assets.find((a) => a.id === assetId) ?? null, [assets, assetId]);
  const [acquiring, setAcquiring] = useState(false);
  const [disposing, setDisposing] = useState(false);
  const [depreciate, { isLoading: depreciating }] = useDepreciateFixedAssetMutation();

  if (assetId == null || !asset) return null;
  const years = yearlySchedule(asset);
  const hasDue = asset.schedule.some((r) => !r.is_posted && r.depreciation_date <= todayISO());

  const doDepreciate = async () => {
    try { const r = await depreciate({ id: asset.id, entity, up_to_date: todayISO() }).unwrap(); toast.success(r.message || "Depreciation posted."); }
    catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
        title={asset.name} description={`${asset.document_number || "Draft"} · ${asset.category_display}`} widthClass="sm:max-w-3xl"
        footer={<>
          <StatusPill status={asset.asset_status} />
          <div className="flex-1" />
          {asset.asset_status === "DRAFT" ? <Can permission={P.FIN_ACQUIRE_FIXED_ASSET}><Button onClick={() => setAcquiring(true)} className="gap-1.5"><Banknote className="size-4" /> Acquire</Button></Can> : null}
          {asset.asset_status === "ACTIVE" && hasDue ? <Can permission={P.FIN_DEPRECIATE_FIXED_ASSET}><Button variant="outline" disabled={depreciating} onClick={doDepreciate} className="gap-1.5"><Sparkles className="size-4" />{depreciating ? "Posting…" : "Depreciate to date"}</Button></Can> : null}
          {(asset.asset_status === "ACTIVE" || asset.asset_status === "FULLY_DEPRECIATED") ? <Can permission={P.FIN_DISPOSE_FIXED_ASSET}><Button onClick={() => setDisposing(true)} className="gap-1.5"><PackageX className="size-4" /> Dispose</Button></Can> : null}
        </>}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Cost" value={formatMoney(asset.cost, currency)} />
            <Metric label="Accumulated dep." value={formatMoney(asset.accumulated_depreciation, currency)} />
            <Metric label="Net book value" value={formatMoney(asset.net_book_value, currency)} />
            <Metric label={asset.asset_status === "DISPOSED" ? "Disposed" : "In service"} value={asset.asset_status === "DISPOSED" ? fmtDate(asset.disposal_date) : fmtDate(asset.acquisition_date)} />
          </div>

          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">
              Depreciation schedule · {asset.method_display} · {asset.useful_life_months}-month life
            </p>
            {years.length === 0 ? (
              <p className="rounded-md border border-dashed border-white-02 px-3 py-4 text-center font-mont text-[11px] text-gray-05">No schedule yet - acquire the asset to build it.</p>
            ) : (
              <div className="overflow-hidden rounded-md border border-white-02">
                <table className="w-full border-collapse">
                  <thead><tr>
                    <th className={thCls}>Year</th><th className={cn(thCls, "text-right")}>Opening NBV</th>
                    <th className={cn(thCls, "text-right")}>Depreciation</th><th className={cn(thCls, "text-right")}>Closing NBV</th>
                    <th className={cn(thCls, "text-right")}>Posted</th>
                  </tr></thead>
                  <tbody>
                    {years.map((y) => (
                      <tr key={y.year}>
                        <td className={cn(tdCls, "tabular-nums")}>{y.year}</td>
                        <td className={cn(tdCls, "text-right tabular-nums")}>{formatMoney(y.opening, currency)}</td>
                        <td className={cn(tdCls, "text-right tabular-nums text-destructive")}>{formatMoney(y.dep, currency)}</td>
                        <td className={cn(tdCls, "text-right tabular-nums")}>{formatMoney(y.closing, currency)}</td>
                        <td className={cn(tdCls, "text-right")}><span className={cn("font-mont text-[11px]", y.posted === y.count ? "text-green-01" : "text-gray-05")}>{y.posted}/{y.count}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DetailDrawer>

      {acquiring ? <AcquireDrawer asset={asset} entity={entity} currency={currency} onClose={() => setAcquiring(false)} /> : null}
      {disposing ? <DisposeDrawer asset={asset} entity={entity} currency={currency} onClose={() => setDisposing(false)} /> : null}
    </>
  );
}

function AcquireDrawer({ asset, entity, currency, onClose }: { asset: FixedAsset; entity: string; currency?: string | null; onClose: () => void }) {
  const [bank, setBank] = useState("");
  const [acquire, { isLoading }] = useAcquireFixedAssetMutation();
  const submit = async () => {
    try { const r = await acquire({ id: asset.id, entity, bank_account: bank || undefined }).unwrap(); toast.success(r.message || "Asset capitalised."); onClose(); }
    catch { /* central */ }
  };
  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Acquire asset" description={`${asset.name} · ${formatMoney(asset.cost, currency)}`} widthClass="sm:max-w-md"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !bank} onClick={submit} className="gap-1.5"><Banknote className="size-4" />{isLoading ? "Posting…" : "Capitalise"}</Button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03/40 px-3 py-2 font-mont text-[11px] text-gray-05">
          Capitalises the cost - Dr PP&E, Cr the funding account - and lays down the straight-line depreciation schedule.
        </p>
        <FormField label="Funded from (bank account)" required><BankAccountPicker entity={entity} value={bank} onChange={setBank} /></FormField>
      </div>
    </DetailDrawer>
  );
}

function DisposeDrawer({ asset, entity, currency, onClose }: { asset: FixedAsset; entity: string; currency?: string | null; onClose: () => void }) {
  const [date, setDate] = useState("");
  const [proceeds, setProceeds] = useState(0);
  const [bank, setBank] = useState("");
  const [glAccount, setGlAccount] = useState("");
  const [dispose, { isLoading }] = useDisposeFixedAssetMutation();
  const nbv = asset.net_book_value;
  const gainLoss = proceeds - nbv;
  const needsGl = gainLoss !== 0;
  // The backend refuses disposal while depreciation due on/before the disposal date is
  // unposted (gain/loss must be computed on an up-to-date book value). Surface that here
  // rather than letting the request 400.
  const hasUnpostedDue = asset.schedule.some((r) => !r.is_posted && r.depreciation_date <= date);
  const submit = async () => {
    try {
      const r = await dispose({ id: asset.id, entity, disposal_date: date, proceeds, bank_account: bank || undefined, gain_loss_account: glAccount || undefined }).unwrap();
      toast.success(r.message || "Asset disposed."); onClose();
    } catch { /* central */ }
  };
  const canSubmit = !!date && !hasUnpostedDue && (proceeds <= 0 || !!bank) && (!needsGl || !!glAccount);
  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Dispose asset" description={`${asset.name} · NBV ${formatMoney(nbv, currency)}`} widthClass="sm:max-w-md"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5"><PackageX className="size-4" />{isLoading ? "Posting…" : "Dispose"}</Button>
      </>}>
      <div className="space-y-4">
        {hasUnpostedDue ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-[11px] text-amber-700">
            Depreciation is still due on or before this date. Post it first (Depreciate to date) so the gain/loss is computed on an up-to-date book value, then dispose.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <PostingDateField label="Disposal date" entity={entity} value={date} onChange={setDate} />
          <FormField label="Proceeds"><MoneyInput valueKobo={proceeds} onChangeKobo={setProceeds} currency={currency} className="[&_input]:h-9" /></FormField>
        </div>
        {proceeds > 0 ? <FormField label="Proceeds into (bank)" required><BankAccountPicker entity={entity} value={bank} onChange={setBank} /></FormField> : null}
        {needsGl ? <FormField label={gainLoss >= 0 ? "Gain account (income)" : "Loss account (expense)"} required><AccountPicker entity={entity} value={glAccount} onChange={setGlAccount} accountType="INCOME,EXPENSE" postableOnly /></FormField> : null}
        <div className="flex items-center justify-between rounded-md border border-gray-03 bg-gray-03/40 px-3 py-2">
          <span className="font-mont text-[11px] text-gray-05">{gainLoss >= 0 ? "Gain on disposal" : "Loss on disposal"}</span>
          <span className={cn("font-mont text-sm font-semibold tabular-nums", gainLoss >= 0 ? "text-green-01" : "text-destructive")}>{formatMoney(Math.abs(gainLoss), currency)}</span>
        </div>
        <p className="font-mont text-[11px] text-gray-05">Posts Dr accumulated dep + Dr bank (proceeds) {gainLoss >= 0 ? "· Cr gain" : "· Dr loss"} · Cr asset cost, and marks the asset disposed.</p>
      </div>
    </DetailDrawer>
  );
}

function NewAssetDrawer({ open, onClose, entity, currency }: { open: boolean; onClose: () => void; entity: string; currency?: string | null }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [method, setMethod] = useState("STRAIGHT_LINE");
  const [acqDate, setAcqDate] = useState("");
  const [cost, setCost] = useState(0);
  const [salvage, setSalvage] = useState(0);
  const [life, setLife] = useState("");
  const [create, { isLoading }] = useCreateFixedAssetMutation();
  const close = () => { setName(""); setCode(""); setCategory("OTHER"); setMethod("STRAIGHT_LINE"); setAcqDate(""); setCost(0); setSalvage(0); setLife(""); onClose(); };
  const submit = async () => {
    try {
      const r = await create({ entity, name: name.trim(), asset_code: code.trim() || undefined, category, method, acquisition_date: acqDate, cost, salvage_value: salvage, useful_life_months: Number(life) }).unwrap();
      toast.success(r.message || "Asset created."); close();
    } catch { /* central */ }
  };
  const canSubmit = !!name.trim() && cost > 0 && Number(life) >= 1;
  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="Add asset" description="Register a capital asset. Acquire it next to capitalise & schedule depreciation." widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5"><Plus className="size-4" />{isLoading ? "Creating…" : "Add asset"}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label="Asset name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Toyota Coaster 30-seat bus" className="h-9 bg-white" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Tag / serial"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Optional" className="h-9 bg-white" /></FormField>
          <div>
            <p className="mb-1 font-mont text-xs text-gray-05">Category</p>
            <Select value={category} onChange={setCategory} className="w-full">{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PostingDateField label="Acquisition date" entity={entity} value={acqDate} onChange={setAcqDate} />
          <FormField label="Useful life (months)" required><Input type="number" min={1} value={life} onChange={(e) => setLife(e.target.value)} placeholder="e.g. 96" className="h-9 bg-white" /></FormField>
        </div>
        <div>
          <p className="mb-1 font-mont text-xs text-gray-05">Depreciation method</p>
          <Select value={method} onChange={setMethod} className="w-full">{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <p className="mt-1 font-mont text-[11px] text-gray-05">{method === "DECLINING_BALANCE" ? "Front-loaded: more depreciation early, tapering to salvage." : "Equal charge each month over the life."}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Cost" required><MoneyInput valueKobo={cost} onChangeKobo={setCost} currency={currency} className="[&_input]:h-9" /></FormField>
          <FormField label="Salvage value"><MoneyInput valueKobo={salvage} onChangeKobo={setSalvage} currency={currency} className="[&_input]:h-9" /></FormField>
        </div>
        <div className="flex items-center justify-between rounded-md border border-gray-03 bg-gray-03/40 px-3 py-2">
          <span className="font-mont text-[11px] text-gray-05">Depreciable base (cost − salvage)</span>
          <span className="font-mont text-sm font-semibold tabular-nums text-black-01">{formatMoney(Math.max(0, cost - salvage), currency)}</span>
        </div>
      </div>
    </DetailDrawer>
  );
}

function RunDepreciationDrawer({ open, onClose, entity, currency }: { open: boolean; onClose: () => void; entity: string; currency?: string | null }) {
  const [upTo, setUpTo] = useState(monthEndISO());
  const { data, isFetching } = useGetDepreciationPreviewQuery({ entity, up_to_date: upTo }, { skip: !open || !upTo });
  const preview = data?.data;
  const [run, { isLoading }] = useRunDepreciationMutation();
  const dr: RecapRow[] = (preview?.debits ?? []).map((l) => ({ code: l.account, name: l.name, amount: l.amount }));
  const cr: RecapRow[] = (preview?.credits ?? []).map((l) => ({ code: l.account, name: l.name, amount: l.amount }));
  const nothing = !!preview && preview.total === 0;
  const submit = async () => {
    try { const r = await run({ entity, up_to_date: upTo }).unwrap(); toast.success(r.message || "Depreciation posted."); onClose(); }
    catch { /* central */ }
  };
  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : onClose())}
      title="Run depreciation" description="Preview the period's depreciation posting." widthClass="sm:max-w-2xl"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || isFetching || nothing || !preview} onClick={submit} className="gap-1.5"><Sparkles className="size-4" />{isLoading ? "Posting…" : "Post depreciation"}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label="Post all charges due up to"><Input type="date" value={upTo} onChange={(e) => setUpTo(e.target.value)} className="h-9 w-52 bg-white" /></FormField>
        {isFetching && !preview ? <p className="py-6 text-center font-mont text-xs text-gray-05">Loading…</p> : null}
        {preview ? (
          nothing ? (
            <p className="rounded-md border border-dashed border-white-02 px-3 py-6 text-center font-mont text-xs text-gray-05">No depreciation is due up to {fmtDate(upTo)}.</p>
          ) : (
            <>
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-[11px] text-amber-700">
                This posts depreciation for {preview.asset_count} in-use asset(s) - one compound journal per fiscal period in range. A closed period in the range will block the run; re-open it first.
              </p>
              <PostingRecap title={`Depreciation posting - to ${fmtDate(upTo)}`} dr={dr} cr={cr} currency={currency} />
            </>
          )
        ) : null}
      </div>
    </DetailDrawer>
  );
}
