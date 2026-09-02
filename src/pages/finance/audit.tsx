// Finance audit trail (§6.9) - rebuilt to the Vision prototype in the house
// theme. The immutable log of every finance mutation for the selected entity:
// who did what, to which document. Filterable by actor / entity type / action /
// status / date. Clicking a row opens a detail drawer with the full record and
// its field-level before/after diff. Export is disabled-with-tooltip until an
// audit-export service exists (no fake download).

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { FinanceShell } from "./finance-shell";
import { DataTable, StatusPill, DetailDrawer, InfoHint, useActiveEntity, type Column } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { P } from "../../permissions";
import { EmptyState } from "@/components/finance-ui/states";
import { SearchSelect } from "@/components/custom/search-select";
import { cn } from "@/lib/utils";
import { useGetAuditLogQuery, useGetAuditFacetsQuery } from "@/redux/services/finance/setup-api";
import type { FinanceAuditLog } from "@/redux/services/finance/setup-types";
import { PageShell } from "@/components/layout/page-shell";

// Action tone: rejections read red, reversals/cancellations amber, master-data
// edits blue, everything else (posts/approvals/completions) green.
function actionTone(action: string, status: string): string {
  if (status === "FAILED" || action.includes("REJECTED")) return "bg-destructive/10 text-destructive";
  if (/(CANCELLED|VOIDED|REVERSED|REOPENED|DISPOSED|TERMINATED|WRITTEN_OFF|LOCKED)/.test(action)) return "bg-amber-50 text-amber-700";
  if (/(CREATED|UPDATED|GENERATED|PREPARED|SUBMITTED|ESTABLISHED)/.test(action)) return "bg-blue-50 text-blue-700";
  return "bg-green-01/10 text-green-01";
}

// Initials for the actor monogram (from the email local-part); "SY" for system.
function initials(actor: string | null): string {
  if (!actor) return "SY";
  const local = actor.split("@")[0] ?? actor;
  const parts = local.split(/[._-]+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2)).toUpperCase();
}

// The field-level diff: keys whose value changed (added/removed/edited).
function diffRows(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b = before ?? {}, a = after ?? {};
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ key: k, before: b[k], after: a[k] }));
}
function fmt(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") {
    // Render ISO timestamps the human way (matches the "When" column) rather
    // than the raw "2026-06-30T09:51:10.585498+00:00" the ledger stores.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString("en-GB");
    }
    return v;
  }
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

const DATE_PRESETS = [
  { value: "", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

function presetToDateFrom(preset: string): string | undefined {
  if (!preset) return undefined;
  const d = new Date();
  if (preset === "7") d.setDate(d.getDate() - 7);
  else if (preset === "30") d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// A plain styled dropdown for the small fixed-option filters (status, date).
function FilterSelect({ value, onChange, className, children }: { value: string; onChange: (v: string) => void; className?: string; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <div className="mt-0.5 font-mont text-xs font-semibold text-black-01">{children}</div>
    </div>
  );
}

const thd = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdd = "border-t border-white-02 px-3 py-2 align-top font-mont text-xs";

function AuditDetail({ log }: { log: FinanceAuditLog }) {
  const rows = diffRows(log.before, log.after);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="When">{new Date(log.created_at).toLocaleString("en-GB")}</Stat>
        <Stat label="Actor">{log.actor ?? "System"}</Stat>
        <Stat label="Action">
          <span className={cn("inline-flex rounded px-2 py-0.5 font-mont text-xs font-medium", actionTone(log.action, log.status))}>
            {log.action_display || log.action}
          </span>
        </Stat>
        <Stat label="Status"><StatusPill status={log.status} /></Stat>
        <Stat label="Entity">{log.target_type || "-"}</Stat>
        <Stat label="Reference"><span className="font-mono">{log.document_number || (log.target_id ? `#${log.target_id}` : "-")}</span></Stat>
        {log.message ? <div className="col-span-2"><Stat label="Message">{log.message}</Stat></div> : null}
      </div>

      <div>
        <p className="mb-2 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Field changes</p>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-white-02 px-3 py-4 text-center font-mont text-xs text-gray-05">
            No field-level changes recorded for this action.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-white-02">
            <table className="w-full">
              <thead><tr>
                <th className={thd}>Field</th><th className={thd}>Before</th><th className={thd}>After</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className={cn(tdd, "font-mono text-gray-01")}>{r.key}</td>
                    <td className={cn(tdd, "bg-destructive/5 break-words text-gray-05")}>{fmt(r.before)}</td>
                    <td className={cn(tdd, "bg-green-01/5 break-words font-medium text-black-01")}>{fmt(r.after)}</td>
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

export default function FinanceAuditPage() {
  const { code: entity } = useActiveEntity();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [status, setStatus] = useState("");
  const [actor, setActor] = useState("");
  const [datePreset, setDatePreset] = useState("");
  const [selected, setSelected] = useState<FinanceAuditLog | null>(null);

  // Any filter change resets to page 1.
  const bind = (setter: (v: string) => void) => (v: string) => { setter(v); setPage(1); };
  const onSelect = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => bind(setter)(e.target.value);

  const params = useMemo(() => ({
    entity: entity!, page,
    ...(action ? { action } : {}),
    ...(targetType ? { target_type: targetType } : {}),
    ...(status ? { status } : {}),
    ...(actor ? { actor } : {}),
    ...(presetToDateFrom(datePreset) ? { date_from: presetToDateFrom(datePreset) } : {}),
  }), [entity, page, action, targetType, status, actor, datePreset]);

  // finance.audit.view is a restricted key, so plenty of legitimate finance
  // users do not hold it. Asking anyway spent two 403s and a red toast on every
  // visit; the screen now says who may read the trail instead.
  const { can } = useCan();
  const canAudit = can(P.FIN_VIEW_AUDIT);
  const { data, isLoading, isFetching, isError, refetch } = useGetAuditLogQuery(params, { skip: !entity || !canAudit });
  const { data: facetsData } = useGetAuditFacetsQuery({ entity: entity! }, { skip: !entity || !canAudit });
  const facets = facetsData?.data;
  const rows = data?.data ?? [];
  const pg = data?.pagination;

  // Lead each list with an explicit "All …" option so the default (value "")
  // renders as a real, dark-text selection - matching the plain dropdowns beside
  // it - instead of a faint placeholder.
  const actionOptions = useMemo(() => [{ value: "", label: "All actions" }, ...(facets?.actions ?? []).map((a) => ({ value: a.value, label: a.label }))], [facets]);
  const entityOptions = useMemo(() => [{ value: "", label: "All entities" }, ...(facets?.target_types ?? []).map((t) => ({ value: t, label: t }))], [facets]);
  const actorOptions = useMemo(() => [{ value: "", label: "All actors" }, ...(facets?.actors ?? []).map((a) => ({ value: String(a.id), label: a.email }))], [facets]);

  const columns: Column<FinanceAuditLog>[] = [
    { header: "When", cell: (l) => <span className="whitespace-nowrap tabular-nums text-gray-01">{new Date(l.created_at).toLocaleString("en-GB")}</span> },
    { header: "Actor", cell: (l) => (
      <span className="flex items-center gap-2">
        <span className={cn("grid size-6 shrink-0 place-content-center rounded-full text-[10px] font-semibold",
          l.actor ? "bg-primary/10 text-primary" : "bg-gray-03 text-gray-05")}>{initials(l.actor)}</span>
        <span className="truncate">{l.actor ?? "System"}</span>
      </span>
    ) },
    { header: "Action", cell: (l) => (
      <span className={cn("inline-flex rounded px-2 py-0.5 font-mont text-xs font-medium", actionTone(l.action, l.status))}>
        {l.action_display || l.action}
      </span>
    ) },
    { header: "Entity", cell: (l) => l.target_type || "-" },
    { header: "Reference", cell: (l) => (
      <span className="font-mono text-xs text-gray-01">{l.document_number || (l.target_id ? `#${l.target_id}` : "-")}</span>
    ) },
    { header: "Status", cell: (l) => <StatusPill status={l.status} /> },
  ];

  if (!entity) return <FinanceShell><PageShell><EmptyState title="Select an entity" /></PageShell></FinanceShell>;
  if (!canAudit) return <FinanceShell><PageShell><EmptyState title="No audit access" message="The finance audit trail needs finance.audit.view, which is a restricted grant." /></PageShell></FinanceShell>;

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">Audit Trail</h1>
              <InfoHint ariaLabel="About the finance audit trail">
                The audit trail is your accountability layer. Every finance action - posts, reversals,
                approvals, rejections, period closes and system postings - is captured with a field-level
                before/after snapshot, and rows can never be edited or deleted. Click a row to see exactly
                what moved.
              </InfoHint>
            </div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">Every finance mutation, recorded immutably for this entity.</p>
          </div>
          <button type="button" disabled title="Audit export is not available yet"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-white-02 px-2.5 py-1.5 font-mont text-xs font-semibold text-gray-04 opacity-70">
            <Download className="size-3.5" /> Export
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchSelect size="sm" containerClass="w-52" options={actionOptions} value={action}
            placeholder="All actions" onChange={onSelect(setAction)} />
          <SearchSelect size="sm" containerClass="w-44" options={entityOptions} value={targetType}
            placeholder="All entities" onChange={onSelect(setTargetType)} />
          <SearchSelect size="sm" containerClass="w-52" options={actorOptions} value={actor}
            placeholder="All actors" onChange={onSelect(setActor)} />
          <FilterSelect value={status} onChange={bind(setStatus)} className="w-36">
            <option value="">All statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
          </FilterSelect>
          <FilterSelect value={datePreset} onChange={bind(setDatePreset)} className="w-40">
            {DATE_PRESETS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </FilterSelect>
        </div>

        <DataTable columns={columns} rows={rows} rowKey={(l) => l.id} onRowClick={setSelected}
          loading={isLoading || isFetching} error={isError} onRetry={refetch}
          emptyTitle="No audit entries" emptyMessage="Finance actions matching these filters will be logged here."
          page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage} />

        <DetailDrawer open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}
          title={selected?.action_display || selected?.action || "Audit entry"}
          description={selected ? (selected.document_number || (selected.target_id ? `#${selected.target_id}` : undefined)) : undefined}>
          {selected ? <AuditDetail log={selected} /> : null}
        </DetailDrawer>
      </PageShell>
    </FinanceShell>
  );
}
