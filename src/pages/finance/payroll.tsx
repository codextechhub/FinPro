// Payroll (§6.7), rebuilt to the Vision prototype in the house theme: five tabs -
// Payroll runs, Employee salaries (the roster), Salary structures, Payslips and
// Statutory returns. Salaries can be split into tranches via a reusable structure
// (earning/deduction components as % of gross or basic); PAYE/pension/net are then
// derived. Per-employee figures are FLS-masked unless the caller holds
// finance.payrollrun.view_sensitive; runs can be generated from the roster, posted,
// paid, and each payslip / statutory schedule printed.
//
// Honest adaptations: deductions route only to PAYE/pension (the two payables the GL
// has) - other deduction types (loans/union) are a noted backend expansion. Statutory
// schedules need per-employee figures, so they're disabled (with a tooltip) without the
// sensitive grant. PAYE/pension are remitted via Tax Remittance.

import { useMemo, useState, type ReactNode } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { Link } from "react-router";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { Plus, Trash2, Search, Sparkles, Banknote, Printer, Pencil, FileText, Users, Layers3, ScrollText, Landmark, ArrowUpRight, Ban } from "lucide-react";
import { routesPath } from "@/routes/routes-path";
import { useGetTrialBalanceQuery } from "@/redux/services/finance/reports-api";
import { useGetBranchOptionsQuery, type BranchOption } from "@/redux/services/tenants-api";
import { FinanceShell } from "./finance-shell";
import { DataTable, Money, MoneyInput, DetailDrawer, FormField, CostCenterPicker, Segmented, InfoHint, ConfirmActionModal, useActiveEntity, toArray, type Column, PostingDateField,} from "@/components/finance-ui";
import { EmptyState } from "@/components/finance-ui/states";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "@/permissions";
import { isStripped } from "@/utils/fls";
import {
  useGetPayrollRunsQuery, useGetPayrollSummaryQuery, useGetPayrollRunQuery, usePostPayrollRunMutation,
  useCancelPayrollRunMutation, usePayPayrollRunMutation, useCreatePayrollRunMutation, useGeneratePayrollRunMutation,
  useGetEmployeeSalariesQuery, useCreateEmployeeSalaryMutation, useUpdateEmployeeSalaryMutation,
  useDeleteEmployeeSalaryMutation, useGetSalaryStructuresQuery, useCreateSalaryStructureMutation,
  useUpdateSalaryStructureMutation, useDeleteSalaryStructureMutation,
} from "@/redux/services/finance/ops-api";
import type { PayrollLine, PayrollRun, EmployeeSalary, SalaryStructure, SalaryComponent, PayslipComponent } from "@/redux/services/finance/ops-types";
import { PageShell } from "@/components/layout/page-shell";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";
const fmtDate = (s: string) => new Date(s).toLocaleDateString();

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-gray-03/60 text-gray-05" },
  POSTED: { label: "Calculated", cls: "bg-blue-50 text-blue-700" },
  PAID: { label: "Paid", cls: "bg-green-01/10 text-green-01" },
  CANCELLED: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};
function RunPill({ status }: { status: string }) {
  const s = RUN_STATUS[status] ?? RUN_STATUS.DRAFT;
  return <span className={cn(PILL, s.cls)}>{s.label}</span>;
}
function maskedMoney(obj: { _stripped_fields?: string[] }, field: string, value: number | undefined, currency?: string | null) {
  if (isStripped(obj, field)) return <span className="text-gray-05">••••</span>;
  return <Money kobo={value ?? 0} currency={currency} align="right" />;
}
function Kpi({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="font-mont text-xs text-gray-05">{label}</p>
      <p className={cn("mt-1 font-mont text-xl font-semibold tabular-nums", danger ? "text-destructive" : "text-black-01")}>{value}</p>
      {hint && <p className="mt-0.5 font-mont text-[11px] text-gray-05">{hint}</p>}
    </div>
  );
}

// Native select styled to match the house pickers (h-9). Used for the salary-structure
// dropdown and the component editor's small enum selects.
function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 w-full rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

// Mirror of the backend apply_structure: earnings split the gross; deductions tagged
// PAYE/pension reduce it to net. Used for the live preview as the user types.
function deriveFromStructure(gross: number, components: SalaryComponent[]) {
  const value = (c: SalaryComponent, basic: number) => {
    if (c.calc_method === "FIXED") return c.amount || 0;
    const base = c.calc_method === "PERCENT_OF_BASIC" ? basic : gross;
    return Math.floor((base * (c.rate_bps || 0)) / 10000);
  };
  const basic = components.filter((c) => c.kind === "EARNING" && c.is_basic).reduce((s, c) => s + value(c, 0), 0);
  let paye = 0, pension = 0;
  const lines: PayslipComponent[] = components.map((c) => {
    const amount = value(c, basic);
    if (c.kind === "DEDUCTION") {
      if (c.statutory_type === "PAYE") paye += amount;
      else if (c.statutory_type === "PENSION") pension += amount;
    }
    return { name: c.name, kind: c.kind, statutory_type: c.statutory_type, amount };
  });
  return { basic, paye, pension, net: gross - paye - pension, lines };
}

const TABS = [
  { key: "runs", label: "Payroll runs", icon: FileText },
  { key: "employees", label: "Employee salaries", icon: Users },
  { key: "structures", label: "Salary structures", icon: Layers3 },
  { key: "payslips", label: "Payslips", icon: ScrollText },
  { key: "statutory", label: "Statutory returns", icon: Landmark },
] as const;

export default function PayrollPage() {
  const { code: entity, currency } = useActiveEntity();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("runs");
  if (!entity) return <FinanceShell><PageShell><EmptyState title="Select an entity" /></PageShell></FinanceShell>;

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide="finance-payroll.workspace">
        <div data-guide="finance-payroll.heading">
          <div className="flex items-center gap-1.5">
            <h1 className="font-mont text-lg font-semibold text-gray-01">Payroll</h1>
            <InfoHint ariaLabel="About payroll runs">A payroll run computes gross, PAYE, pension and net for every employee, then posts one journal - Dr salary expense; Cr PAYE payable, Cr pension payable, Cr net-wages payable. Paying it clears net-wages payable against the bank. Per-employee figures need the sensitive grant.</InfoHint>
          </div>
          <p className="mt-0.5 font-mont text-xs text-gray-05">Monthly salary runs and payslips, generated from the employee roster.</p>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-white-02" data-guide="finance-payroll.sections">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 font-mont text-xs font-semibold",
                tab === t.key ? "border-primary text-primary" : "border-transparent text-gray-05 hover:text-gray-01")}>
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "runs" ? <RunsTab entity={entity} currency={currency} />
          : tab === "employees" ? <EmployeesTab entity={entity} currency={currency} />
          : tab === "structures" ? <StructuresTab entity={entity} currency={currency} />
          : tab === "payslips" ? <PayslipsTab entity={entity} currency={currency} />
          : <StatutoryTab entity={entity} currency={currency} />}
      </PageShell>
    </FinanceShell>
  );
}

function RunsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useGetPayrollRunsQuery({ entity, page });
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;

  const summaryQ = useGetPayrollSummaryQuery({ entity });
  const s = summaryQ.data?.data;
  const kpis = { runs: s?.runs ?? 0, employees: s?.employees ?? 0, net: s?.net ?? 0, toPay: s?.to_pay ?? 0 };

  // Only where it distinguishes anything. A central school's runs all carry no
  // branch, so the column would be a stack of dashes - and a school that has not
  // opted into per-branch payroll should not be able to tell it was built.
  const showBranch = useMemo(() => rows.some((r) => r.branch_id != null), [rows]);

  const columns: Column<PayrollRun>[] = [
    { header: "Run no.", cell: (r) => <span className="font-semibold tabular-nums">{r.document_number}</span> },
    { header: "Period", cell: (r) => r.period_label || "-" },
    ...(showBranch ? [{
      header: "Branch",
      cell: (r: PayrollRun) => r.branch_name
        ? <span className="text-gray-01">{r.branch_name}</span>
        : <span className={cn(PILL, "bg-gray-03/60 text-gray-05")}>Whole school</span>,
    }] : []),
    { header: "Payment date", cell: (r) => <span className="tabular-nums text-gray-05">{fmtDate(r.pay_date)}</span> },
    { header: "Employees", align: "right", cell: (r) => <span className="tabular-nums text-gray-05">{r.lines.length}</span> },
    { header: "Total gross", align: "right", cell: (r) => <Money kobo={r.gross_total} currency={currency} align="right" /> },
    { header: "Deductions", align: "right", cell: (r) => <Money kobo={r.paye_total + r.pension_total} currency={currency} align="right" /> },
    { header: "Net pay", align: "right", cell: (r) => <Money kobo={r.net_total} currency={currency} align="right" /> },
    { header: "Status", cell: (r) => <RunPill status={r.run_status} /> },
  ];

  return (
    <div className="space-y-4" data-guide="finance-payroll.runs">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-payroll.summary">
        <Kpi label="Payroll runs" value={String(kpis.runs)} />
        <Kpi label="Employees (latest run)" value={String(kpis.employees)} />
        <Kpi label="Net pay (latest run)" value={formatMoney(kpis.net, currency)} />
        <Kpi label="Awaiting payment" value={formatMoney(kpis.toPay, currency)} danger={kpis.toPay > 0} hint="Calculated, not yet paid" />
      </div>

      <div className="flex justify-end">
        <Can permission={P.FIN_CREATE_PAYROLL}>
          <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New payroll run</Button>
        </Can>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(r) => setSelectedId(r.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No payroll runs" emptyMessage="Generate a run from the employee roster with New payroll run." />

      <RunDrawer runId={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
      <NewRunDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency}
        perBranch={s?.payroll_scope === "PER_BRANCH"} />
    </div>
  );
}

function RunDrawer({ runId, entity, currency, onClose }: { runId: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const [paying, setPaying] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { data } = useGetPayrollRunQuery(runId != null ? { id: runId, entity } : skipToken);
  const [post, { isLoading: posting }] = usePostPayrollRunMutation();
  const [cancelRun, { isLoading: cancelling }] = useCancelPayrollRunMutation();
  const r = data?.data;
  if (runId == null || !r) return null;

  const doPost = async () => { try { const res = await post({ id: r.id, entity }).unwrap(); toast.success(res.message || "Run posted."); } catch { /* central */ } };
  // Undo a run raised in error. Only offered before it's paid (DRAFT/POSTED); the
  // backend refuses a paid run - reverse the disbursement first.
  const canCancel = r.run_status === "DRAFT" || r.run_status === "POSTED";
  const isPosted = r.run_status === "POSTED";
  const doCancel = async () => { try { const res = await cancelRun({ id: r.id, entity }).unwrap(); toast.success(res.message || "Run cancelled."); setCancelOpen(false); } catch { /* central */ } };

  return (
    <>
      <DetailDrawer open={runId != null} onOpenChange={(o) => (o ? undefined : onClose())}
        title={r.document_number}
        description={[r.period_label || "-", r.branch_name, `${r.lines.length} employees`].filter(Boolean).join(" · ")}
        widthClass="sm:max-w-3xl"
        footer={
          <>
            <RunPill status={r.run_status} />
            <div className="flex-1" />
            {canCancel ? <Can permission={P.FIN_POST_PAYROLL}><Button variant="outline" disabled={cancelling} onClick={() => setCancelOpen(true)} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"><Ban className="size-4" />{isPosted ? "Void run" : "Cancel run"}</Button></Can> : null}
            {r.run_status === "DRAFT" ? <Can permission={P.FIN_POST_PAYROLL}><Button disabled={posting} onClick={doPost} className="gap-1.5"><Banknote className="size-4" />{posting ? "Posting…" : "Calculate & post"}</Button></Can> : null}
            {r.run_status === "POSTED" ? <Can permission={P.FIN_PAY_PAYROLL}><Button onClick={() => setPaying(true)} className="gap-1.5"><Banknote className="size-4" /> Pay net</Button></Can> : null}
          </>
        }>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Metric label="Gross" kobo={r.gross_total} currency={currency} />
            <Metric label="PAYE" kobo={r.paye_total} currency={currency} />
            <Metric label="Pension" kobo={r.pension_total} currency={currency} />
            <Metric label="Net" kobo={r.net_total} currency={currency} />
            <div className="rounded-md border border-white-02 bg-white p-3"><p className="font-mont text-[11px] text-gray-05">Status</p><div className="mt-1.5"><RunPill status={r.run_status} /></div></div>
          </div>

          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Payslips · {r.lines.length}</p>
            <div className="overflow-hidden rounded-md border border-white-02">
              <table className="w-full border-collapse">
                <thead><tr>
                  <th className={thCls}>Employee</th><th className={cn(thCls, "text-right")}>Gross</th>
                  <th className={cn(thCls, "text-right")}>PAYE</th><th className={cn(thCls, "text-right")}>Pension</th>
                  <th className={cn(thCls, "text-right")}>Net</th><th className={thCls} />
                </tr></thead>
                <tbody>
                  {r.lines.map((l) => (
                    <tr key={l.id}>
                      <td className={tdCls}>{isStripped(l, "employee_name") ? <span className="text-gray-05">••••</span> : l.employee_name || "-"}</td>
                      <td className={cn(tdCls, "text-right tabular-nums")}>{maskedMoney(l, "gross_amount", l.gross_amount, currency)}</td>
                      <td className={cn(tdCls, "text-right tabular-nums")}>{maskedMoney(l, "paye_amount", l.paye_amount, currency)}</td>
                      <td className={cn(tdCls, "text-right tabular-nums")}>{maskedMoney(l, "pension_amount", l.pension_amount, currency)}</td>
                      <td className={cn(tdCls, "text-right tabular-nums font-medium")}>{maskedMoney(l, "net_amount", l.net_amount, currency)}</td>
                      <td className={cn(tdCls, "text-right")}>
                        {!isStripped(l, "net_amount") ? <button type="button" onClick={() => printPayslip(r, l, currency)} className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-primary hover:underline"><Printer className="size-3" /> Payslip</button> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DetailDrawer>

      {paying ? <PayDrawer run={r} entity={entity} currency={currency} onClose={() => setPaying(false)} /> : null}
      <ConfirmActionModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`${isPosted ? "Void" : "Cancel"} ${r.document_number}?`}
        description={isPosted
          ? "Reverses this run's accrual journal (a mirror entry backing out the salary expense and the PAYE, pension and net-wages payables) and cancels the run. Use this to undo a run posted in error - it can't be voided once net pay has been paid."
          : "Discards this draft run. Nothing was posted, so no journal is affected."}
        confirmText={isPosted ? "Void run" : "Cancel run"}
        destructive
        loading={cancelling}
        onConfirm={doCancel}
      />
    </>
  );
}

function Metric({ label, kobo, currency }: { label: string; kobo: number; currency?: string | null }) {
  return <div className="rounded-md border border-white-02 bg-white p-3"><p className="font-mont text-[11px] text-gray-05">{label}</p><p className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{formatMoney(kobo, currency)}</p></div>;
}

function PayDrawer({ run, entity, currency, onClose }: { run: PayrollRun; entity: string; currency?: string | null; onClose: () => void }) {
  const [payDate, setPayDate] = useState(run.pay_date || "");
  const [pay, { isLoading }] = usePayPayrollRunMutation();
  const submit = async () => {
    try { const res = await pay({ id: run.id, entity, pay_date: payDate }).unwrap(); toast.success(res.message || "Net pay disbursed."); onClose(); }
    catch { /* central */ }
  };
  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Pay net wages" description={`${run.document_number} · ${run.period_label || "-"}`} widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !payDate} onClick={submit} className="gap-1.5"><Banknote className="size-4" />{isLoading ? "Paying…" : `Pay ${formatMoney(run.net_total, currency)}`}</Button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          Disburses net pay ({formatMoney(run.net_total, currency)}) - Dr net-wages payable, Cr bank - clearing the liability raised when the run was posted.
        </p>
        <PostingDateField
          label="Payment date" entity={entity} value={payDate} onChange={setPayDate}
          notBefore={run.pay_date}
          notBeforeLabel={`payroll run ${run.document_number}`}
        />
      </div>
    </DetailDrawer>
  );
}

// ── New payroll run ──────────────────────────────────────────────────────────
type EmpRow = { employee_name: string; gross: number; paye: number; pension: number };
const emptyEmp = (): EmpRow => ({ employee_name: "", gross: 0, paye: 0, pension: 0 });

/** Sentinel for "this run covers the whole school", kept apart from "" so an
 *  unanswered picker and a deliberate whole-school run are different states. */
const WHOLE_SCHOOL = "all";

function NewRunDrawer({ open, onClose, entity, currency, perBranch }: { open: boolean; onClose: () => void; entity: string; currency?: string | null; perBranch: boolean }) {
  const [mode, setMode] = useState("roster");
  const [payDate, setPayDate] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [scopeChoice, setScopeChoice] = useState("");
  const [lines, setLines] = useState<EmpRow[]>([emptyEmp()]);
  const { data: rosterData } = useGetEmployeeSalariesQuery({ entity, is_active: "true" }, { skip: !open });
  const roster = useMemo(() => toArray(rosterData?.data), [rosterData]);
  const { data: branchData } = useGetBranchOptionsQuery(undefined, { skip: !open || !perBranch });
  const branches = useMemo(() => toArray(branchData?.data), [branchData]);

  // Only where there is a choice to make. A caller pinned to one site has
  // already answered by being pinned - the backend stamps her branch and
  // refuses any other - so asking her would be a question with one answer. A
  // central school is never asked at all: its runs cover everybody by design.
  const asksForScope = perBranch && branches.length > 1;
  const [generate, { isLoading: generating }] = useGeneratePayrollRunMutation();
  const [create, { isLoading: creating }] = useCreatePayrollRunMutation();
  const isLoading = generating || creating;

  const setRow = (i: number, patch: Partial<EmpRow>) => setLines((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const validLines = lines.filter((l) => l.employee_name.trim() && l.gross > 0);
  const close = () => { setMode("roster"); setPayDate(""); setPeriodLabel(""); setScopeChoice(""); setLines([emptyEmp()]); onClose(); };

  // Left out for a whole-school run and for a caller who was not asked, so the
  // backend applies its own rule rather than being told an answer we guessed.
  const branchArg = asksForScope && scopeChoice && scopeChoice !== WHOLE_SCHOOL
    ? { branch: Number(scopeChoice) } : {};

  const submit = async () => {
    try {
      if (mode === "roster") {
        const res = await generate({ entity, pay_date: payDate, period_label: periodLabel.trim() || undefined, ...branchArg }).unwrap();
        toast.success(res.message || "Run generated.");
      } else {
        const res = await create({ entity, pay_date: payDate, period_label: periodLabel.trim() || undefined, ...branchArg,
          lines: validLines.map((l) => ({ employee_name: l.employee_name.trim(), gross_amount: l.gross, paye_amount: l.paye, pension_amount: l.pension })) }).unwrap();
        toast.success(res.message || "Run created.");
      }
      close();
    } catch { /* central */ }
  };

  // The people this run would pay, as chosen. Shown before she commits, because
  // "the whole school" and "Lekki" are the same two clicks apart and only one
  // of them is usually meant.
  const covered = useMemo(() => {
    if (!asksForScope || !scopeChoice || scopeChoice === WHOLE_SCHOOL) return roster;
    return roster.filter((e) => String(e.branch_id) === scopeChoice);
  }, [roster, asksForScope, scopeChoice]);
  const coverageLabel = scopeChoice === WHOLE_SCHOOL
    ? "every site"
    : branches.find((b) => String(b.id) === scopeChoice)?.name ?? "";

  // No default when she is asked. A whole-school run under per-branch payroll is
  // a legitimate thing to raise - head office does it - but it should be picked,
  // not fallen into by leaving a field alone.
  const canSubmit = !!payDate && (!asksForScope || !!scopeChoice)
    && (mode === "roster" ? covered.length > 0 : validLines.length > 0);

  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New payroll run" description="Generate from the employee roster, or enter lines manually."
      widthClass={mode === "manual" ? "sm:max-w-4xl" : "sm:max-w-lg"}
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5">
          {mode === "roster" ? <Sparkles className="size-4" /> : <Plus className="size-4" />}
          {isLoading ? "Working…" : mode === "roster" ? "Generate run" : "Create run"}
        </Button>
      </>}>
      <div className="space-y-4">
        <Segmented value={mode} onChange={setMode} options={[["roster", "From roster"], ["manual", "Manual"]]} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Period" ><Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. June 2026" className="h-9 bg-white" /></FormField>
          <PostingDateField label="Payment date" entity={entity} value={payDate} onChange={setPayDate} />
        </div>

        {asksForScope ? (
          <div>
            <FormField label="This run covers" required>
              <Select value={scopeChoice} onChange={setScopeChoice}>
                <option value="">Choose…</option>
                <option value={WHOLE_SCHOOL}>The whole school</option>
                {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name} only</option>)}
              </Select>
            </FormField>
            <p className="mt-1 font-mont text-[11px] text-gray-05">
              This school runs payroll per branch. A whole-school run pays every site at once, and no branch run can be raised for the same period afterwards.
            </p>
          </div>
        ) : null}

        {mode === "roster" ? (
          <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-3 font-mont text-[11px] text-gray-05">
            {asksForScope && !scopeChoice
              ? <>Choose what this run covers to see who it would pay.</>
              : covered.length > 0
              ? <>This will raise a draft run for the <span className="font-medium text-gray-01">{covered.length}</span> active employee(s){coverageLabel ? <> at <span className="font-medium text-gray-01">{coverageLabel}</span></> : null}, copying each one's standard gross, PAYE and pension. Review, then post.</>
              : <>No active employees{coverageLabel ? <> at <span className="font-medium text-gray-01">{coverageLabel}</span></> : <> on the roster yet</>}. Add them under <span className="font-medium text-gray-01">Employee salaries</span>, or switch to Manual.</>}
          </p>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Employees</p>
              <Button variant="outline" size="sm" onClick={() => setLines((rs) => [...rs, emptyEmp()])} className="gap-1.5"><Plus className="size-3.5" /> Add</Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-end gap-2 rounded-md border border-white-02 bg-white p-2.5">
                  <div className="grid flex-1 grid-cols-12 gap-2">
                    <div className="col-span-5"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Employee</p><Input value={l.employee_name} onChange={(e) => setRow(i, { employee_name: e.target.value })} placeholder="Name" className="h-9 bg-white text-sm" /></div>
                    <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Gross</p><MoneyInput valueKobo={l.gross} onChangeKobo={(k) => setRow(i, { gross: k })} currency={currency} className="[&_input]:h-9" /></div>
                    <div className="col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">PAYE</p><MoneyInput valueKobo={l.paye} onChangeKobo={(k) => setRow(i, { paye: k })} currency={currency} className="[&_input]:h-9" /></div>
                    <div className="col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Pension</p><MoneyInput valueKobo={l.pension} onChangeKobo={(k) => setRow(i, { pension: k })} currency={currency} className="[&_input]:h-9" /></div>
                  </div>
                  <button type="button" onClick={() => setLines((rs) => rs.filter((_, idx) => idx !== i))} disabled={lines.length <= 1} className="mb-0.5 shrink-0 rounded p-1.5 text-gray-05 hover:bg-destructive/5 hover:text-destructive disabled:opacity-30"><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DetailDrawer>
  );
}

// ── Employee salaries (roster) ───────────────────────────────────────────────

/** Filter value for "belongs to no branch". Matches the literal the roster
 *  endpoint accepts on `?branch=`, so the two spellings cannot drift. */
const UNASSIGNED = "unassigned";

/** A person's site, or a visible gap where one should be. */
function BranchCell({ salary }: { salary: EmployeeSalary }) {
  if (salary.branch_name) return <span className="text-gray-01">{salary.branch_name}</span>;
  return <span className={cn(PILL, "bg-amber-50 text-amber-700")}>Unassigned</span>;
}

function EmployeesTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const [searchInput, setSearchInput] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [editing, setEditing] = useState<EmployeeSalary | "new" | null>(null);
  const { data, isLoading, isFetching, isError, refetch } = useGetEmployeeSalariesQuery({ entity });
  const all = useMemo(() => toArray(data?.data), [data]);

  // The branches this caller may work in, from the tenant rather than from the
  // rows. Reading them off the roster only ever offered sites that already had
  // somebody on them, which is never the new site she is trying to fill.
  const { data: branchData } = useGetBranchOptionsQuery();
  const branches = useMemo(() => toArray(branchData?.data), [branchData]);
  const unassignedCount = useMemo(() => all.filter((e) => e.branch_id == null).length, [all]);

  // A filter must not outlive what it filters on. Assigning the last unassigned
  // person removes the "Unassigned" option, and a <select> whose value matches
  // no option falls back to showing the first one - so the control would read
  // "All branches" while the list stayed narrowed to nobody. Switching entity
  // does the same thing to branch ids, which do not carry across sets of books.
  const filterStillExists = !branchFilter
    || (branchFilter === UNASSIGNED ? unassignedCount > 0 : branches.some((b) => String(b.id) === branchFilter));
  if (!filterStillExists) setBranchFilter("");

  const rows = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    let out = q ? all.filter((e) => e.name.toLowerCase().includes(q)) : all;
    if (!filterStillExists) return out;
    if (branchFilter === UNASSIGNED) out = out.filter((e) => e.branch_id == null);
    else if (branchFilter) out = out.filter((e) => String(e.branch_id) === branchFilter);
    return out;
  }, [all, searchInput, branchFilter, filterStillExists]);

  const [remove] = useDeleteEmployeeSalaryMutation();
  const doRemove = async (id: number) => { try { await remove({ id, entity }).unwrap(); toast.success("Employee removed."); } catch { /* central */ } };

  const cols: Column<EmployeeSalary>[] = [
    { header: "Employee", cell: (e) => <span className="font-medium text-gray-01">{e.name}</span> },
    { header: "Structure", cell: (e) => e.structure_name ? <span className={cn(PILL, "bg-blue-50 text-blue-700")}>{e.structure_name}</span> : <span className="font-mont text-[11px] text-gray-05">Flat</span> },
    { header: "Branch", cell: (e) => <BranchCell salary={e} /> },
    { header: "Cost center", cell: (e) => <span className="tabular-nums text-gray-05">{e.cost_center || "-"}</span> },
    { header: "Gross", align: "right", cell: (e) => maskedMoney(e, "gross_amount", e.gross_amount, currency) },
    { header: "PAYE", align: "right", cell: (e) => maskedMoney(e, "paye_amount", e.paye_amount, currency) },
    { header: "Pension", align: "right", cell: (e) => maskedMoney(e, "pension_amount", e.pension_amount, currency) },
    { header: "Net", align: "right", cell: (e) => maskedMoney(e, "net_amount", e.net_amount, currency) },
    { header: "Status", cell: (e) => <span className={cn(PILL, e.is_active ? "bg-green-01/10 text-green-01" : "bg-gray-03/60 text-gray-05")}>{e.is_active ? "Active" : "Inactive"}</span> },
    { header: "", align: "right", cell: (e) => (can(P.FIN_UPDATE_SALARY) || can(P.FIN_DELETE_SALARY)) ? (
      <span className="inline-flex items-center gap-2">
        {can(P.FIN_UPDATE_SALARY) ? <button type="button" onClick={() => setEditing(e)} className="text-gray-05 hover:text-primary" aria-label="Edit"><Pencil className="size-3.5" /></button> : null}
        {can(P.FIN_DELETE_SALARY) ? <button type="button" onClick={() => doRemove(e.id)} className="text-gray-05 hover:text-destructive" aria-label="Remove"><Trash2 className="size-3.5" /></button> : null}
      </span>
    ) : null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search employee" className="h-9 w-64 bg-white pl-8 font-mont" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {branches.length || unassignedCount ? (
            <Select value={branchFilter} onChange={setBranchFilter} className="h-9 w-52 bg-white">
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
              {unassignedCount ? <option value={UNASSIGNED}>Unassigned ({unassignedCount})</option> : null}
            </Select>
          ) : null}
          <Can permission={P.FIN_CREATE_SALARY}>
            <Button onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> Add employee</Button>
          </Can>
        </div>
      </div>

      {/* Named, not counted. Per-branch payroll is refused while anyone is
          unassigned, and a bursar told "4 staff are unassigned" has to search
          the whole roster to find out who. */}
      {unassignedCount && branchFilter !== UNASSIGNED ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="font-mont text-[13px] text-amber-900">
            <span className="font-semibold">{unassignedCount}</span> {unassignedCount === 1 ? "person is" : "people are"} not assigned to a branch. Per-branch payroll cannot be switched on until {unassignedCount === 1 ? "they have" : "each of them has"} a site.
          </p>
          <button type="button" onClick={() => setBranchFilter(UNASSIGNED)} className="font-mont text-[13px] font-semibold text-amber-900 underline underline-offset-2">Show them</button>
        </div>
      ) : null}

      <DataTable columns={cols} rows={rows} rowKey={(e) => e.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        emptyTitle={searchInput || branchFilter ? "No matching employees" : "No employees yet"}
        emptyMessage={searchInput || branchFilter ? "Try a different search or branch." : "Add employees to generate payroll runs from the roster."} />

      <EmployeeDrawer open={editing !== null} salary={editing === "new" ? null : editing} entity={entity} currency={currency} branches={branches} onClose={() => setEditing(null)} />
    </div>
  );
}

function EmployeeDrawer({ open, salary, entity, currency, branches, onClose }: { open: boolean; salary: EmployeeSalary | null; entity: string; currency?: string | null; branches: BranchOption[]; onClose: () => void }) {
  const isEdit = !!salary;
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [structureId, setStructureId] = useState("");
  const [gross, setGross] = useState(0);
  const [paye, setPaye] = useState(0);
  const [pension, setPension] = useState(0);
  const [costCenter, setCostCenter] = useState("");
  const [active, setActive] = useState(true);
  const { data: structData } = useGetSalaryStructuresQuery({ entity, is_active: "true" }, { skip: !open });
  const structures = useMemo(() => toArray(structData?.data), [structData]);
  const [create, { isLoading: creating }] = useCreateEmployeeSalaryMutation();
  const [update, { isLoading: updating }] = useUpdateEmployeeSalaryMutation();
  const isLoading = creating || updating;

  // Seed the form to the row being edited when the drawer opens (amounts only
  // populate if not FLS-stripped). Adjusted during render, not in an effect.
  const seedKey = salary?.id ?? "new";
  const [seededFor, setSeededFor] = useState<number | string | null>(null);
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    if (salary) { setName(salary.name); setBranchId(salary.branch_id ? String(salary.branch_id) : ""); setStructureId(salary.structure_id ? String(salary.structure_id) : ""); setGross(salary.gross_amount ?? 0); setPaye(salary.paye_amount ?? 0); setPension(salary.pension_amount ?? 0); setCostCenter(salary.cost_center ?? ""); setActive(salary.is_active); }
    else { setName(""); setBranchId(""); setStructureId(""); setGross(0); setPaye(0); setPension(0); setCostCenter(""); setActive(true); }
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const structure = structures.find((s) => String(s.id) === structureId);
  const derived = structure ? deriveFromStructure(gross, structure.components) : null;

  // Only sent when it actually changed: the backend reads the key's presence as
  // "retarget this row", and a blank one means "my own branch" to a caller
  // pinned to a single site, so sending it unchanged would move people.
  const branchChanged = String(salary?.branch_id ?? "") !== branchId;
  const branchPatch = branchChanged ? { branch: branchId ? Number(branchId) : null } : {};

  const submit = async () => {
    try {
      const base = { name: name.trim(), gross_amount: gross, cost_center: costCenter || undefined,
        structure: structure ? structure.id : (null as number | null),
        // In flat mode the manual figures are sent; with a structure they're derived server-side.
        ...(structure ? {} : { paye_amount: paye, pension_amount: pension }) };
      if (isEdit && salary) { const r = await update({ id: salary.id, entity, is_active: active, ...base, ...branchPatch }).unwrap(); toast.success(r.message || "Updated."); }
      else { const r = await create({ entity, ...base, structure: structure ? structure.id : undefined, ...(branchId ? { branch: Number(branchId) } : {}) }).unwrap(); toast.success(r.message || "Employee added."); }
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : onClose())}
      title={isEdit ? "Edit employee salary" : "Add employee"} description="Standard monthly pay used to generate runs."
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !name.trim() || gross <= 0} onClick={submit} className="gap-1.5"><Plus className="size-4" />{isLoading ? "Saving…" : isEdit ? "Save changes" : "Add employee"}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label="Employee name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="h-9 bg-white" /></FormField>
        {branches.length ? (
          <div>
            <FormField label="Branch">
              <Select value={branchId} onChange={setBranchId}>
                <option value="">Unassigned</option>
                {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
              </Select>
            </FormField>
            <p className="mt-1 font-mont text-[11px] text-gray-05">The site this person is paid from. Everyone needs one before the school can switch to per-branch payroll.</p>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Gross (monthly)" required><MoneyInput valueKobo={gross} onChangeKobo={setGross} currency={currency} className="[&_input]:h-9" /></FormField>
          <FormField label="Cost center"><CostCenterPicker entity={entity} value={costCenter} onChange={setCostCenter} /></FormField>
        </div>
        <div>
          <FormField label="Salary structure">
            <Select value={structureId} onChange={setStructureId}>
              <option value="">Flat (manual PAYE / pension)</option>
              {structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormField>
          <p className="mt-1 font-mont text-[11px] text-gray-05">{structure ? "PAYE, pension and net are derived from the structure applied to gross." : "Flat - enter PAYE and pension manually below."}</p>
        </div>

        {structure && derived ? (
          <div className="rounded-md border border-white-02 bg-white">
            <p className="border-b border-white-02 px-3 py-2 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Derived breakdown</p>
            <div className="divide-y divide-white-02">
              {derived.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 font-mont text-xs">
                  <span className={cn(l.kind === "DEDUCTION" ? "text-gray-05" : "text-black-01")}>{l.name}{l.kind === "DEDUCTION" ? <span className="ml-1 text-[10px] text-gray-05">({l.statutory_type})</span> : null}</span>
                  <span className={cn("tabular-nums", l.kind === "DEDUCTION" ? "text-destructive" : "text-black-01")}>{l.kind === "DEDUCTION" ? "− " : ""}{formatMoney(l.amount, currency)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-gray-03 px-3 py-2 font-mont text-xs font-semibold">
                <span>Net (take-home)</span>
                <span className="tabular-nums">{formatMoney(derived.net, currency)}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="PAYE"><MoneyInput valueKobo={paye} onChangeKobo={setPaye} currency={currency} className="[&_input]:h-9" /></FormField>
              <FormField label="Pension"><MoneyInput valueKobo={pension} onChangeKobo={setPension} currency={currency} className="[&_input]:h-9" /></FormField>
            </div>
            <div className="flex items-center justify-between rounded-md border border-gray-03 bg-gray-03 px-3 py-2">
              <span className="font-mont text-[11px] text-gray-05">Net (take-home)</span>
              <span className="font-mont text-sm font-semibold tabular-nums text-black-01">{formatMoney(gross - paye - pension, currency)}</span>
            </div>
          </>
        )}
        {isEdit ? <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active (included in generated runs)</label> : null}
      </div>
    </DetailDrawer>
  );
}

// ── Salary structures ────────────────────────────────────────────────────────
function StructuresTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const [editing, setEditing] = useState<SalaryStructure | "new" | null>(null);
  const { data, isLoading, isFetching, isError, refetch } = useGetSalaryStructuresQuery({ entity });
  const rows = useMemo(() => toArray(data?.data), [data]);
  const [remove] = useDeleteSalaryStructureMutation();
  const doRemove = async (id: number) => { try { await remove({ id, entity }).unwrap(); toast.success("Structure removed."); } catch { /* central */ } };

  const summarize = (s: SalaryStructure) => {
    const earn = s.components.filter((c) => c.kind === "EARNING").length;
    const ded = s.components.filter((c) => c.kind === "DEDUCTION").length;
    return `${earn} earning${earn === 1 ? "" : "s"} · ${ded} deduction${ded === 1 ? "" : "s"}`;
  };

  const cols: Column<SalaryStructure>[] = [
    { header: "Structure", cell: (s) => <span className="font-medium text-gray-01">{s.name}</span> },
    { header: "Components", cell: (s) => <span className="font-mont text-[11px] text-gray-05">{summarize(s)}</span> },
    { header: "Employees", align: "right", cell: (s) => <span className="tabular-nums text-gray-05">{s.employee_count}</span> },
    { header: "Status", cell: (s) => <span className={cn(PILL, s.is_active ? "bg-green-01/10 text-green-01" : "bg-gray-03/60 text-gray-05")}>{s.is_active ? "Active" : "Inactive"}</span> },
    { header: "", align: "right", cell: (s) => (can(P.FIN_UPDATE_SALARY) || can(P.FIN_DELETE_SALARY)) ? (
      <span className="inline-flex items-center gap-2">
        {can(P.FIN_UPDATE_SALARY) ? <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(s); }} className="text-gray-05 hover:text-primary" aria-label="Edit"><Pencil className="size-3.5" /></button> : null}
        {can(P.FIN_DELETE_SALARY) ? <button type="button" onClick={(e) => { e.stopPropagation(); doRemove(s.id); }} className="text-gray-05 hover:text-destructive" aria-label="Remove"><Trash2 className="size-3.5" /></button> : null}
      </span>
    ) : null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl font-mont text-xs text-gray-05">Reusable pay templates - split gross into tranches (Basic, Housing…) and set PAYE & pension as a % of gross or basic. Assign one to an employee and their figures are derived.</p>
        <Can permission={P.FIN_CREATE_SALARY}><Button onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> New structure</Button></Can>
      </div>
      <DataTable columns={cols} rows={rows} rowKey={(s) => s.id} loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(s) => setEditing(s)}
        emptyTitle="No salary structures" emptyMessage="Create a structure to split salaries into components and derive PAYE/pension." />
      <StructureDrawer open={editing !== null} structure={editing === "new" ? null : editing} entity={entity} currency={currency} onClose={() => setEditing(null)} />
    </div>
  );
}

const KIND_OPTS: [SalaryComponent["kind"], string][] = [["EARNING", "Earning"], ["DEDUCTION", "Deduction"]];
const METHOD_OPTS: [SalaryComponent["calc_method"], string][] = [["PERCENT_OF_GROSS", "% of gross"], ["PERCENT_OF_BASIC", "% of basic"], ["FIXED", "Fixed ₦ amount"]];
const emptyComp = (kind: SalaryComponent["kind"] = "EARNING"): SalaryComponent => ({
  name: "", kind, calc_method: "PERCENT_OF_GROSS", rate_bps: 0, amount: 0,
  is_basic: false, statutory_type: kind === "DEDUCTION" ? "PAYE" : "NONE", sequence: 0,
});

function StructureDrawer({ open, structure, entity, currency, onClose }: { open: boolean; structure: SalaryStructure | null; entity: string; currency?: string | null; onClose: () => void }) {
  const isEdit = !!structure;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [comps, setComps] = useState<SalaryComponent[]>([emptyComp()]);
  const [previewGross, setPreviewGross] = useState(50000000);
  const [create, { isLoading: creating }] = useCreateSalaryStructureMutation();
  const [update, { isLoading: updating }] = useUpdateSalaryStructureMutation();
  const isLoading = creating || updating;

  // Seed the form when the drawer opens or the edited structure changes
  // (render-phase, not an effect).
  const seedKey = structure?.id ?? "new";
  const [seededFor, setSeededFor] = useState<number | string | null>(null);
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    if (structure) { setName(structure.name); setDescription(structure.description); setActive(structure.is_active); setComps(structure.components.length ? structure.components.map((c) => ({ ...c })) : [emptyComp()]); }
    else { setName(""); setDescription(""); setActive(true); setComps([emptyComp()]); }
    setPreviewGross(50000000);
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const setComp = (i: number, patch: Partial<SalaryComponent>) => setComps((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const setKind = (i: number, kind: SalaryComponent["kind"]) => setComp(i, kind === "DEDUCTION"
    ? { kind, statutory_type: comps[i].statutory_type === "NONE" ? "PAYE" : comps[i].statutory_type, is_basic: false }
    : { kind, statutory_type: "NONE" });

  const valid = (c: SalaryComponent) => c.name.trim() && (c.calc_method === "FIXED" ? c.amount > 0 : c.rate_bps > 0);
  const canSubmit = !!name.trim() && comps.length > 0 && comps.every(valid);
  const preview = useMemo(() => deriveFromStructure(previewGross, comps), [previewGross, comps]);

  const submit = async () => {
    const payload = comps.map((c, i) => ({ ...c, name: c.name.trim(), sequence: i }));
    try {
      if (isEdit && structure) { const r = await update({ id: structure.id, entity, name: name.trim(), description: description.trim(), is_active: active, components: payload }).unwrap(); toast.success(r.message || "Structure updated."); }
      else { const r = await create({ entity, name: name.trim(), description: description.trim(), is_active: active, components: payload }).unwrap(); toast.success(r.message || "Structure created."); }
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : onClose())}
      title={isEdit ? "Edit salary structure" : "New salary structure"} description="Earnings split the gross; deductions tagged PAYE / pension reduce it to net."
      widthClass="sm:max-w-3xl"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5"><Plus className="size-4" />{isLoading ? "Saving…" : isEdit ? "Save changes" : "Create structure"}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Structure name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior staff" className="h-9 bg-white" /></FormField>
          <FormField label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="h-9 bg-white" /></FormField>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Components</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setComps((cs) => [...cs, emptyComp("EARNING")])} className="gap-1.5"><Plus className="size-3.5" /> Earning</Button>
              <Button variant="outline" size="sm" onClick={() => setComps((cs) => [...cs, emptyComp("DEDUCTION")])} className="gap-1.5"><Plus className="size-3.5" /> Deduction</Button>
            </div>
          </div>
          <div className="space-y-2">
            {comps.map((c, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-white-02 bg-white p-2.5">
                <div className="grid flex-1 grid-cols-12 gap-2">
                  <div className="col-span-4"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Name</p><Input value={c.name} onChange={(e) => setComp(i, { name: e.target.value })} placeholder={c.kind === "DEDUCTION" ? "e.g. PAYE" : "e.g. Basic"} className="h-9 bg-white text-sm" /></div>
                  <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Type</p><Select value={c.kind} onChange={(v) => setKind(i, v as SalaryComponent["kind"])}>{KIND_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
                  <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Method</p><Select value={c.calc_method} onChange={(v) => setComp(i, { calc_method: v as SalaryComponent["calc_method"] })}>{METHOD_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
                  <div className="col-span-2">
                    <p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">{c.calc_method === "FIXED" ? "Naira amount" : "Rate"}</p>
                    {c.calc_method === "FIXED"
                      ? <MoneyInput valueKobo={c.amount} onChangeKobo={(k) => setComp(i, { amount: k })} currency={currency} className="[&_input]:h-9" />
                      : (
                        <div className="relative">
                          <Input type="number" min={0} step="0.5" value={c.rate_bps ? c.rate_bps / 100 : ""} onChange={(e) => setComp(i, { rate_bps: Math.round(Number(e.target.value || 0) * 100) })} placeholder="0" className="h-9 bg-white pr-7 text-sm tabular-nums" />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mont text-xs text-gray-05">%</span>
                        </div>
                      )}
                  </div>
                  <div className="col-span-12 flex items-center gap-3">
                    {c.kind === "EARNING"
                      ? <label className="flex items-center gap-1.5 font-mont text-[11px] text-gray-05"><input type="checkbox" checked={c.is_basic} onChange={(e) => setComp(i, { is_basic: e.target.checked })} className="accent-primary" /> Counts as basic (base for “% of basic”)</label>
                      : <label className="flex items-center gap-1.5 font-mont text-[11px] text-gray-05">Remits to <Select value={c.statutory_type} onChange={(v) => setComp(i, { statutory_type: v as SalaryComponent["statutory_type"] })} className="h-7 w-28"><option value="PAYE">PAYE</option><option value="PENSION">Pension</option></Select></label>}
                  </div>
                </div>
                <button type="button" onClick={() => setComps((cs) => cs.filter((_, idx) => idx !== i))} disabled={comps.length <= 1} className="mt-5 shrink-0 rounded p-1.5 text-gray-05 hover:bg-destructive/5 hover:text-destructive disabled:opacity-30"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-gray-03 bg-gray-03/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Preview on a sample gross</p>
            <div className="w-40"><MoneyInput valueKobo={previewGross} onChangeKobo={setPreviewGross} currency={currency} className="[&_input]:h-8" /></div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {preview.lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between font-mont text-[11px]">
                <span className={l.kind === "DEDUCTION" ? "text-gray-05" : "text-black-01"}>{l.name}</span>
                <span className={cn("tabular-nums", l.kind === "DEDUCTION" ? "text-destructive" : "text-black-01")}>{l.kind === "DEDUCTION" ? "− " : ""}{formatMoney(l.amount, currency)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-white-02 pt-2 font-mont text-xs font-semibold">
            <span>Net (take-home)</span><span className="tabular-nums">{formatMoney(preview.net, currency)}</span>
          </div>
        </div>

        {isEdit ? <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active</label> : null}
      </div>
    </DetailDrawer>
  );
}

// ── Payslips (flattened across runs) ─────────────────────────────────────────
type PayslipRow = { run: PayrollRun; line: PayrollLine };
function PayslipsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<PayslipRow | null>(null);
  // This view flattens *every* run into payslips, so pull a wide page rather than the
  // default 25 (no per-payslip endpoint exists yet).
  const { data, isLoading, isFetching, isError, refetch } = useGetPayrollRunsQuery({ entity, page_size: 100 });
  const runs = useMemo(() => toArray(data?.data), [data]);
  const rows = useMemo<PayslipRow[]>(() => {
    const flat = runs.flatMap((run) => run.lines.map((line) => ({ run, line })));
    const q = searchInput.trim().toLowerCase();
    return q ? flat.filter(({ line }) => (line.employee_name || "").toLowerCase().includes(q)) : flat;
  }, [runs, searchInput]);

  const cols: Column<PayslipRow>[] = [
    { header: "Employee", cell: ({ line }) => isStripped(line, "employee_name") ? <span className="text-gray-05">••••</span> : <span className="font-medium text-gray-01">{line.employee_name || "-"}</span> },
    { header: "Period", cell: ({ run }) => run.period_label || "-" },
    { header: "Run no.", cell: ({ run }) => <span className="tabular-nums text-gray-05">{run.document_number}</span> },
    { header: "Pay date", cell: ({ run }) => <span className="tabular-nums text-gray-05">{fmtDate(run.pay_date)}</span> },
    { header: "Gross", align: "right", cell: ({ line }) => maskedMoney(line, "gross_amount", line.gross_amount, currency) },
    { header: "Net", align: "right", cell: ({ line }) => maskedMoney(line, "net_amount", line.net_amount, currency) },
    { header: "Status", cell: ({ run }) => <RunPill status={run.run_status} /> },
    { header: "", align: "right", cell: ({ run, line }) => !isStripped(line, "net_amount")
      ? <button type="button" onClick={(e) => { e.stopPropagation(); printPayslip(run, line, currency); }} className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-primary hover:underline"><Printer className="size-3" /> Print</button>
      : null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search employee" className="h-9 w-64 bg-white pl-8 font-mont" />
        </div>
        <p className="font-mont text-[11px] text-gray-05">Every payslip across all runs - click a row for the breakdown. Figures need the sensitive payroll grant.</p>
      </div>
      <DataTable columns={cols} rows={rows} rowKey={({ run, line }) => `${run.id}-${line.id}`}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(r) => !isStripped(r.line, "net_amount") && setSelected(r)}
        emptyTitle={searchInput ? "No matching payslips" : "No payslips yet"}
        emptyMessage={searchInput ? "Try a different search." : "Generate and post a payroll run to produce payslips."} />
      <PayslipDrawer row={selected} currency={currency} onClose={() => setSelected(null)} />
    </div>
  );
}

// Shared earnings/deductions/net breakdown - itemised when a structure populated the
// line's components, else the flat gross / PAYE / pension / net summary.
function PayslipBreakdown({ line, currency }: { line: PayrollLine; currency?: string | null }) {
  const comps = line.components ?? [];
  type BreakdownRow =
    | { sec: string }
    | { label: string; amount: number; ded: boolean; strong?: boolean };
  const rows: BreakdownRow[] = comps.length
    ? [
        { sec: "Earnings" as const },
        ...comps.filter((c) => c.kind === "EARNING").map((c) => ({ label: c.name, amount: c.amount, ded: false })),
        { label: "Gross pay", amount: line.gross_amount ?? 0, ded: false, strong: true },
        { sec: "Deductions" as const },
        ...comps.filter((c) => c.kind === "DEDUCTION").map((c) => ({ label: `${c.name} (${c.statutory_type})`, amount: c.amount, ded: true })),
      ]
    : [
        { label: "Gross pay", amount: line.gross_amount ?? 0, ded: false },
        { label: "PAYE (income tax)", amount: line.paye_amount ?? 0, ded: true },
        { label: "Pension", amount: line.pension_amount ?? 0, ded: true },
      ];
  return (
    <div className="overflow-hidden rounded-md border border-white-02 bg-white">
      <div className="divide-y divide-white-02">
        {rows.map((r, i) => "sec" in r
          ? <p key={i} className="bg-gray-03/40 px-3 py-1.5 font-mont text-[10px] font-semibold uppercase tracking-wide text-gray-05">{r.sec}</p>
          : (
            <div key={i} className={cn("flex items-center justify-between px-3 py-2 font-mont text-xs", r.strong && "font-semibold")}>
              <span className={r.ded ? "text-gray-05" : "text-black-01"}>{r.label}</span>
              <span className={cn("tabular-nums", r.ded ? "text-destructive" : "text-black-01")}>{r.ded ? "− " : ""}{formatMoney(r.amount, currency)}</span>
            </div>
          ))}
        <div className="flex items-center justify-between bg-gray-03 px-3 py-2.5 font-mont text-sm font-semibold">
          <span>Net pay</span><span className="tabular-nums">{formatMoney(line.net_amount ?? 0, currency)}</span>
        </div>
      </div>
    </div>
  );
}

function PayslipDrawer({ row, currency, onClose }: { row: PayslipRow | null; currency?: string | null; onClose: () => void }) {
  if (!row) return null;
  const { run, line } = row;
  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={line.employee_name || "Payslip"} description={`${run.period_label || "-"} · ${run.document_number} · paid ${fmtDate(run.pay_date)}`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={() => printPayslip(run, line, currency)} className="gap-1.5"><Printer className="size-4" /> Print payslip</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Gross" kobo={line.gross_amount ?? 0} currency={currency} />
          <Metric label="Net pay" kobo={line.net_amount ?? 0} currency={currency} />
        </div>
        <PayslipBreakdown line={line} currency={currency} />
        {line.cost_center ? <p className="font-mont text-[11px] text-gray-05">Cost center · {line.cost_center}</p> : null}
      </div>
    </DetailDrawer>
  );
}

// ── Statutory returns (filing-ready PAYE / pension schedules) ─────────────────
function schedStripped(run: PayrollRun, kind: "PAYE" | "PENSION") {
  return run.lines.some((l) => isStripped(l, kind === "PAYE" ? "paye_amount" : "pension_amount"));
}
function SchedButton({ run, kind, currency, label }: { run: PayrollRun; kind: "PAYE" | "PENSION"; currency?: string | null; label?: string }) {
  const stripped = schedStripped(run, kind);
  return (
    <button type="button" disabled={stripped} onClick={(e) => { e.stopPropagation(); printSchedule(run, kind, currency); }}
      title={stripped ? "Needs the sensitive payroll grant to list per-employee figures" : `Print the ${kind} schedule`}
      className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-gray-05 disabled:no-underline">
      <Printer className="size-3" /> {label ?? (kind === "PAYE" ? "PAYE" : "Pension")}
    </button>
  );
}

function StatutoryTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [selected, setSelected] = useState<PayrollRun | null>(null);
  // Roll-up of statutory liabilities across all posted runs - pull a wide page.
  const { data, isLoading, isFetching, isError, refetch } = useGetPayrollRunsQuery({ entity, page_size: 100 });
  const runs = useMemo(() => toArray(data?.data).filter((r) => r.run_status === "POSTED" || r.run_status === "PAID"), [data]);
  const kpis = useMemo(() => ({
    paye: runs.reduce((s, r) => s + r.paye_total, 0),
    pension: runs.reduce((s, r) => s + r.pension_total, 0),
  }), [runs]);

  const cols: Column<PayrollRun>[] = [
    { header: "Period", cell: (r) => r.period_label || "-" },
    { header: "Run no.", cell: (r) => <span className="tabular-nums text-gray-05">{r.document_number}</span> },
    { header: "Pay date", cell: (r) => <span className="tabular-nums text-gray-05">{fmtDate(r.pay_date)}</span> },
    { header: "PAYE payable", align: "right", cell: (r) => <Money kobo={r.paye_total} currency={currency} align="right" /> },
    { header: "Pension payable", align: "right", cell: (r) => <Money kobo={r.pension_total} currency={currency} align="right" /> },
    { header: "Status", cell: (r) => <RunPill status={r.run_status} /> },
    { header: "Schedules", align: "right", cell: (r) => <span className="inline-flex items-center gap-3"><SchedButton run={r} kind="PAYE" currency={currency} /><SchedButton run={r} kind="PENSION" currency={currency} /></span> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="PAYE payable (all posted runs)" value={formatMoney(kpis.paye, currency)} hint="Remit via Tax Remittance" />
        <Kpi label="Pension payable (all posted runs)" value={formatMoney(kpis.pension, currency)} hint="Remit to the PFA" />
        <Kpi label="Posted runs" value={String(runs.length)} />
      </div>
      <p className="font-mont text-xs text-gray-05">Filing-ready PAYE & pension schedules per posted run - click a row for the per-employee breakdown and remittance status. The liabilities are settled under Tax Remittance.</p>
      <DataTable columns={cols} rows={runs} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(r) => setSelected(r)}
        emptyTitle="No statutory returns yet" emptyMessage="Post a payroll run to raise PAYE and pension liabilities to file." />
      <StatutoryDrawer run={selected} entity={entity} currency={currency} onClose={() => setSelected(null)} />
    </div>
  );
}

function StatutoryDrawer({ run, entity, currency, onClose }: { run: PayrollRun | null; entity: string; currency?: string | null; onClose: () => void }) {
  // Real outstanding balance of the run's PAYE / pension payable accounts (from the
  // trial balance). Honest: this is the entity-wide unremitted liability for that
  // account - remittance isn't tracked per run, so we never fake a per-run "remitted".
  const { data: tb, isSuccess: tbReady } = useGetTrialBalanceQuery(run ? { entity } : skipToken);
  const outstanding = (accountId: number | null) => {
    // Unknown (null) until the trial balance actually loads - otherwise a forbidden or
    // pending query would read as a misleading "Settled". An absent row in a loaded TB
    // means the liability netted to zero (genuinely settled).
    if (accountId == null || !tbReady) return null;
    const row = toArray(tb?.data?.rows).find((r) => r.account_id === accountId);
    return row ? row.credit.kobo - row.debit.kobo : 0; // net credit (liability still owed)
  };
  if (!run) return null;
  const payeOut = outstanding(run.paye_payable_account_id);
  const pensionOut = outstanding(run.pension_payable_account_id);

  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={`Statutory · ${run.period_label || run.document_number}`} description={`${run.document_number} · pay date ${fmtDate(run.pay_date)}`}
      widthClass="sm:max-w-2xl"
      footer={<>
        <SchedButton run={run} kind="PAYE" currency={currency} label="PAYE schedule" />
        <SchedButton run={run} kind="PENSION" currency={currency} label="Pension schedule" />
        <div className="flex-1" />
        <Button variant="outline" onClick={onClose}>Close</Button>
      </>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Metric label={`PAYE payable (this run · ${run.paye_payable_account || "2310"})`} kobo={run.paye_total} currency={currency} />
          <Metric label={`Pension payable (this run · ${run.pension_payable_account || "2320"})`} kobo={run.pension_total} currency={currency} />
        </div>

        <div className="rounded-md border border-white-02 bg-white">
          <div className="flex items-center justify-between border-b border-white-02 px-3 py-2">
            <p className="font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Remittance status</p>
            <Link to={`${routesPath.PROTECTED.FINANCE.BUDGETS}/tax`} className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-primary hover:underline">Tax Remittance <ArrowUpRight className="size-3" /></Link>
          </div>
          <div className="divide-y divide-white-02">
            <RemitRow label="PAYE payable" code={run.paye_payable_account} outstanding={payeOut} currency={currency} />
            <RemitRow label="Pension payable" code={run.pension_payable_account} outstanding={pensionOut} currency={currency} />
          </div>
          <p className="border-t border-white-02 px-3 py-2 font-mont text-[11px] text-gray-05">Outstanding is the current balance on the liability account (all runs, this entity) - remittance is tracked against the account, not per run. Settle it under Tax Remittance.</p>
        </div>

        <div>
          <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Per-employee schedule · {run.lines.length}</p>
          <div className="overflow-hidden rounded-md border border-white-02">
            <table className="w-full border-collapse">
              <thead><tr>
                <th className={thCls}>Employee</th><th className={cn(thCls, "text-right")}>PAYE</th><th className={cn(thCls, "text-right")}>Pension</th>
              </tr></thead>
              <tbody>
                {run.lines.map((l) => (
                  <tr key={l.id}>
                    <td className={tdCls}>{isStripped(l, "employee_name") ? <span className="text-gray-05">••••</span> : l.employee_name || "-"}</td>
                    <td className={cn(tdCls, "text-right tabular-nums")}>{maskedMoney(l, "paye_amount", l.paye_amount, currency)}</td>
                    <td className={cn(tdCls, "text-right tabular-nums")}>{maskedMoney(l, "pension_amount", l.pension_amount, currency)}</td>
                  </tr>
                ))}
                <tr>
                  <td className={cn(tdCls, "font-semibold")}>Total</td>
                  <td className={cn(tdCls, "text-right font-semibold tabular-nums")}>{formatMoney(run.paye_total, currency)}</td>
                  <td className={cn(tdCls, "text-right font-semibold tabular-nums")}>{formatMoney(run.pension_total, currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
}

function RemitRow({ label, code, outstanding, currency }: { label: string; code: string | null; outstanding: number | null; currency?: string | null }) {
  const settled = outstanding === 0;
  return (
    <div className="flex items-center justify-between px-3 py-2.5 font-mont text-xs">
      <span className="text-black-01">{label}{code ? <span className="ml-1 text-[11px] text-gray-05">· {code}</span> : null}</span>
      {outstanding == null
        ? <span className="text-gray-05">-</span>
        : settled
          ? <span className={cn(PILL, "bg-green-01/10 text-green-01")}>Settled</span>
          : <span className="inline-flex items-center gap-2"><span className="tabular-nums text-destructive">{formatMoney(outstanding, currency)}</span><span className={cn(PILL, "bg-amber-50 text-amber-700")}>Outstanding</span></span>}
    </div>
  );
}

function printSchedule(run: PayrollRun, kind: "PAYE" | "PENSION", currency?: string | null) {
  const money = (k?: number) => formatMoney(k ?? 0, currency);
  const field = kind === "PAYE" ? "paye_amount" : "pension_amount";
  const title = kind === "PAYE" ? "PAYE remittance schedule" : "Pension remittance schedule";
  const total = kind === "PAYE" ? run.paye_total : run.pension_total;
  const rows = run.lines.map((l) => `<tr><td>${l.employee_name || "-"}</td><td class="r">${money(money2(l, field))}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title} - ${run.document_number}</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;padding:32px;max-width:560px;margin:auto}
  h1{font-size:18px;margin:0 0 2px}.sub{color:#666;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 0;border-bottom:1px solid #eee;text-align:left}
  td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}.tot td{font-weight:700;border-top:2px solid #ddd;border-bottom:none}</style></head><body>
  <h1>${title}</h1>
  <div class="sub">${run.period_label || ""} · ${run.document_number} · pay date ${fmtDate(run.pay_date)}</div>
  <table><thead><tr><th>Employee</th><th class="r">${kind} withheld</th></tr></thead><tbody>
    ${rows}
    <tr class="tot"><td>Total ${kind} payable</td><td class="r">${money(total)}</td></tr>
  </tbody></table></body></html>`;
  const w = window.open("", "_blank", "width=600,height=760");
  if (!w) { toast.error("Pop-up blocked - allow pop-ups to print."); return; }
  w.document.write(html); w.document.close(); w.focus(); w.print();
}
// reads the (possibly FLS-stripped) numeric field off a line; schedules are only offered
// when the lines aren't stripped, so this is always a number here.
function money2(line: PayrollLine, field: string): number {
  return (line as unknown as Record<string, number>)[field] ?? 0;
}

function printPayslip(run: PayrollRun, line: PayrollLine, currency?: string | null) {
  const money = (k?: number) => formatMoney(k ?? 0, currency);
  const comps = line.components ?? [];
  const earnings = comps.filter((c) => c.kind === "EARNING");
  const deductions = comps.filter((c) => c.kind === "DEDUCTION");
  // With a structure: itemise the earning tranches and each deduction. Flat lines fall
  // back to the gross / PAYE / pension / net summary.
  const body = comps.length
    ? `<tr class="sec"><td colspan="2">Earnings</td></tr>
       ${earnings.map((c) => `<tr><td>${c.name}</td><td class="r">${money(c.amount)}</td></tr>`).join("")}
       <tr class="sub2"><td>Gross pay</td><td class="r">${money(line.gross_amount)}</td></tr>
       <tr class="sec"><td colspan="2">Deductions</td></tr>
       ${deductions.map((c) => `<tr><td>${c.name} (${c.statutory_type})</td><td class="r">− ${money(c.amount)}</td></tr>`).join("")}
       <tr class="net"><td>Net pay</td><td class="r">${money(line.net_amount)}</td></tr>`
    : `<tr><td>Gross pay</td><td class="r">${money(line.gross_amount)}</td></tr>
       <tr><td>PAYE (income tax)</td><td class="r">− ${money(line.paye_amount)}</td></tr>
       <tr><td>Pension</td><td class="r">− ${money(line.pension_amount)}</td></tr>
       <tr class="net"><td>Net pay</td><td class="r">${money(line.net_amount)}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payslip - ${line.employee_name}</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;padding:32px;max-width:520px;margin:auto}
  h1{font-size:18px;margin:0 0 2px}.sub{color:#666;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:13px}td{padding:7px 0;border-bottom:1px solid #eee}
  td.r{text-align:right;font-variant-numeric:tabular-nums}
  .sec td{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#888;padding-top:14px;border-bottom:none}
  .sub2 td{font-weight:600;border-top:1px solid #ddd}
  .net td{font-weight:700;border-top:2px solid #ddd;border-bottom:none}</style></head><body>
  <h1>Payslip</h1>
  <div class="sub">${line.employee_name} · ${run.period_label || ""} · ${run.document_number} · paid ${fmtDate(run.pay_date)}</div>
  <table>${body}</table></body></html>`;
  const w = window.open("", "_blank", "width=560,height=720");
  if (!w) { toast.error("Pop-up blocked - allow pop-ups to print."); return; }
  w.document.write(html); w.document.close(); w.focus(); w.print();
}
