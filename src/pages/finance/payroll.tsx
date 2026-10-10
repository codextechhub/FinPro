/**
 * Payroll (§6.7), rebuilt to the Vision prototype in the house theme: five tabs -
 * Payroll runs, Employee salaries (the roster), Salary structures, Payslips and
 * Statutory returns. Salaries can be split into tranches via a reusable structure
 * (earning/deduction components as % of gross or basic); PAYE/pension/net are then
 * derived. Runs can be generated from the roster, posted, paid, and each payslip /
 * statutory schedule printed.
 *
 * Per-employee figures follow Field Access: `finance.payrollrun` for a run's lines
 * and `finance.salary` for the roster. A hidden figure has no column, no form field
 * and no line in a breakdown. A payslip or statutory schedule prints only when every
 * figure it lists is visible, because a printed zero reads as a real one.
 *
 * One run may pay all staff. At a school with several branches it posts one
 * journal per branch, each branch's share is paid from that branch's own bank
 * account, the run reads Paid only when every share is, and it cannot be voided
 * once any share is paid (see payroll-shares.ts). A run for all staff is raised
 * by somebody who covers the whole school; a branch officer raises their own
 * branch's, so the new-run drawer does not offer them the other. A branch
 * officer opens such a run through their own branch's share and is shown that
 * part alone, with nothing to post, pay or void (isBranchPartOfWholeSchoolRun).
 *
 * PAYE is worked out by the server from the national tax table, cumulatively
 * over the tax year, unless the school supplies it (Finance Settings, Payroll).
 * Each line carries its deductions and the employer's contributions (pension,
 * NHF, NSITF, ITF, voluntary deductions) and how its PAYE was worked out, shown
 * under the line's Details. A payslip is the server's own PDF, never one laid
 * out in the browser, so the bursar's copy and the person's agree.
 *
 * A roster row opens the person's salary record (payroll-record.tsx): its dated
 * history, earlier pay brought forward into the tax year, voluntary deductions
 * and tax year. People who joined after January with no earlier pay recorded
 * are listed above the roster, and named again when a run is generated.
 */

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
import { AccessField, DataTable, Money, MoneyInput, DetailDrawer, FormField, CostCenterPicker, Segmented, InfoHint, ConfirmActionModal, TabStrip, useActiveEntity, useFieldAccess, fieldWriteErrors, toArray, type Column, type FieldAccess, type FieldErrors, type ReadOnlyOptions, type TabStripItem, PostingDateField, BankAccountPicker, RaisingBranchChoiceField, useRaisingBranchChoice, useReaderBranchLens,} from "@/components/finance-ui";
import { useReaderReach } from "../../host";
import { isBranchPartOfWholeSchoolRun, isPartlyPaid, mayCancelRun, sharesOf, singleJournalBranch, unassignedStaffRefusal, unpaidShares } from "./payroll-shares";
import { EmptyState } from "@/components/finance-ui/states";
import { noAccessMessage } from "@/components/finance-ui/no-access";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../permissions";
import { printPayrollSchedule } from "../../utils/finance-print";
import { openLinePayslip } from "../../utils/payroll-documents";
import { PersonPicker } from "../../components/workflow/person-picker";
import { nextTermsLine } from "./payroll-terms";
import { fieldRefusals } from "./payroll-refusals";
import { SalaryRecordDrawer } from "./payroll-record";
import { LineItems, PayeWorkingView } from "./payroll-working";
import { PayslipContentView } from "./payslip-view";
import {
  useGetPayrollTaxStatesQuery, useGetPensionFundAdministratorsQuery, useGetPayslipContentQuery, useGetPreviousPayMissingQuery,
} from "@/redux/services/finance/payroll-api";
import type { GeneratedPayrollRun, PreviousPayMissing } from "@/redux/services/finance/payroll-types";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  useGetPayrollRunsQuery, useGetPayrollSummaryQuery, useGetPayrollRunQuery, usePostPayrollRunMutation,
  useCancelPayrollRunMutation, usePayPayrollRunMutation, useCreatePayrollRunMutation, useGeneratePayrollRunMutation,
  useGetEmployeeSalariesQuery, useCreateEmployeeSalaryMutation, useUpdateEmployeeSalaryMutation,
  useDeleteEmployeeSalaryMutation, useGetSalaryStructuresQuery, useCreateSalaryStructureMutation,
  useUpdateSalaryStructureMutation, useDeleteSalaryStructureMutation,
} from "@/redux/services/finance/ops-api";
import type { PayrollLine, PayrollRun, PayrollRunBranchShare, EmployeeSalary, SalaryStructure, SalaryComponent, PayslipComponent } from "@/redux/services/finance/ops-types";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import { FINANCE_HELP } from "./screen-help";
import { useDates } from "../../lib/display-prefs";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-gray-03/60 text-gray-05" },
  POSTED: { label: "Calculated", cls: "bg-blue-50 text-blue-700" },
  PAID: { label: "Paid", cls: "bg-green-01/10 text-green-01" },
  PART_PAID: { label: "Partly paid", cls: "bg-amber-50 text-amber-800" },
  AWAITING: { label: "Awaiting payment", cls: "bg-blue-50 text-blue-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};
function RunPill({ status }: { status: string }) {
  const s = RUN_STATUS[status] ?? RUN_STATUS.DRAFT;
  return <span className={cn(PILL, s.cls)}>{s.label}</span>;
}
/** Field Access resources: a payroll run's lines, and the salary roster. */
const PAYROLL_LINE = "finance.payrollrun";
const SALARY = "finance.salary";
type Figure = "gross_amount" | "paye_amount" | "pension_amount" | "net_amount";
const FIGURES: readonly (readonly [Figure, string])[] = [
  ["gross_amount", "Gross"], ["paye_amount", "PAYE"], ["pension_amount", "Pension"], ["net_amount", "Net"],
];
/** The figures this user may see, in display order. */
const visibleFigures = (access: FieldAccess, only?: readonly Figure[]) =>
  FIGURES.filter(([name]) => (!only || only.includes(name)) && !access.isHidden(name));
/** Everything a payslip prints; the server refuses one unless all of it is visible, so it is offered only then. */
const PAYSLIP_FIELDS = ["employee_name", "gross_amount", "paye_amount", "pension_amount", "net_amount", "components"];
export const canPrintPayslip = (access: Pick<FieldAccess, "isHidden">) => PAYSLIP_FIELDS.every((name) => !access.isHidden(name));
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

/** Payroll sections for the tab strip, built once so the sliding bar re-measures only when the active tab changes. */
const TAB_ITEMS: TabStripItem<(typeof TABS)[number]["key"]>[] = TABS.map((t) => ({
  value: t.key,
  label: <><t.icon className="size-3.5" /> {t.label}</>,
}));

export default function PayrollPage() {
  const { code: entity, currency } = useActiveEntity();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("runs");
  // Every payroll key is restricted, because a payroll run carries what each
  // named person is paid. Plenty of finance users legitimately hold none of
  // them, and the tabs below fetch on mount, so without this the screen opened
  // on a pair of 403s and a red toast rather than saying what it needs.
  const { can } = useCan();
  const canPayroll = can(P.FIN_VIEW_PAYROLL);
  if (!entity) return <FinanceShell><PageShell><NoEntityState /></PageShell></FinanceShell>;
  if (!canPayroll) return <FinanceShell><PageShell><EmptyState title="No payroll access" message={`${noAccessMessage("view payroll")} Payroll is granted on its own because a run shows what each person is paid.`} /></PageShell></FinanceShell>;

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide="finance-payroll.workspace">
        <div data-guide="finance-payroll.heading">
          <div className="flex items-center gap-1.5">
            <h1 className="font-mont text-lg font-semibold text-gray-01">Payroll</h1>
            <InfoHint ariaLabel="About payroll runs">{FINANCE_HELP.payroll}</InfoHint>
          </div>
          <p className="mt-0.5 font-mont text-xs text-gray-05">Monthly salary runs and payslips, generated from the employee roster.</p>
        </div>

        <TabStrip
          items={TAB_ITEMS}
          value={tab}
          onChange={setTab}
          variant="underline"
          ariaLabel="Payroll sections"
          dataGuide="finance-payroll.sections"
          className="w-full gap-1"
          buttonClassName="inline-flex items-center gap-1.5 px-3 py-2 font-semibold"
        />

        {tab === "runs" ? <RunsTab entity={entity} currency={currency} onShowRoster={() => setTab("employees")} />
          : tab === "employees" ? <EmployeesTab entity={entity} currency={currency} />
          : tab === "structures" ? <StructuresTab entity={entity} currency={currency} />
          : tab === "payslips" ? <PayslipsTab entity={entity} currency={currency} />
          : <StatutoryTab entity={entity} currency={currency} />}
      </PageShell>
    </FinanceShell>
  );
}

function RunsTab({ entity, currency, onShowRoster }: { entity: string; currency?: string | null; onShowRoster: () => void }) {
  const dates = useDates();
  const missing = useGetPreviousPayMissingQuery({ entity, year: Number(dates.today().slice(0, 4)) }).data?.data;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedPayrollRun | null>(null);
  const { can } = useCan();
  useActionParam("new", can(P.FIN_CREATE_PAYROLL), () => setCreating(true));
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
  const { wholeSchool, branchIds } = useReaderReach();
  const showsParts = useMemo(() => rows.some((r) => isBranchPartOfWholeSchoolRun(r, wholeSchool)), [rows, wholeSchool]);

  const columns: Column<PayrollRun>[] = [
    { header: "Run no.", cell: (r) => <span className="font-semibold tabular-nums">{r.document_number}</span> },
    { header: "Period", cell: (r) => r.period_label || "-" },
    ...(showBranch ? [{
      header: "Branch",
      cell: (r: PayrollRun) => r.branch_name
        ? <span className="text-gray-01">{r.branch_name}</span>
        : <span className={cn(PILL, "bg-gray-03/60 text-gray-05")}>Whole school</span>,
    }] : []),
    { header: "Payment date", cell: (r) => <span className="tabular-nums text-gray-05">{dates.day(r.pay_date)}</span> },
    { header: "Employees", align: "right", cell: (r) => <span className="tabular-nums text-gray-05">{r.lines.length}</span> },
    { header: "Total gross", align: "right", cell: (r) => <Money kobo={r.gross_total} currency={currency} align="right" /> },
    { header: "Deductions", align: "right", cell: (r) => <Money kobo={r.paye_total + r.pension_total + (r.other_deductions_total ?? 0)} currency={currency} align="right" /> },
    { header: "Net pay", align: "right", cell: (r) => <Money kobo={r.net_total} currency={currency} align="right" /> },
    { header: "Status", cell: (r) => <RunPill status={isPartlyPaid(r) ? "PART_PAID" : r.run_status} /> },
  ];

  return (
    <div className="space-y-4" data-guide="finance-payroll.runs">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-payroll.summary">
        <Kpi label="Payroll runs" value={String(kpis.runs)} />
        <Kpi label="Employees (latest run)" value={String(kpis.employees)} />
        <Kpi label="Net pay (latest run)" value={formatMoney(kpis.net, currency)} />
        <Kpi label="Awaiting payment" value={formatMoney(kpis.toPay, currency)} danger={kpis.toPay > 0} hint="Calculated, not yet paid" />
      </div>

      {showsParts ? (
        <p className="font-mont text-xs text-gray-05">{`Runs for the whole school show only ${yourBranchesPart(branchIds)}: its staff and its totals.`}</p>
      ) : null}

      <div className="flex justify-end">
        <Can permission={P.FIN_CREATE_PAYROLL}>
          <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New payroll run</Button>
        </Can>
      </div>

      {missing?.people.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="font-mont text-[13px] text-amber-900">
            {`${missing.people.length} ${missing.people.length === 1 ? "person" : "people"} joined after January with no earlier pay recorded for ${missing.tax_year}.`}
            {missing.required ? " A run that includes them is refused until it is." : " Their PAYE counts nothing they earned before joining until it is."}
          </p>
          <button type="button" onClick={onShowRoster} className="font-mont text-[13px] font-semibold text-amber-900 underline underline-offset-2">Earlier pay still to record</button>
        </div>
      ) : null}

      {generated ? <GeneratedRunNotice run={generated} onOpen={() => setSelectedId(generated.id)} onDismiss={() => setGenerated(null)} /> : null}

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(r) => setSelectedId(r.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No payroll runs" emptyMessage="Generate a run from the employee roster with New payroll run." />

      <RunDrawer runId={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
      <NewRunDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency}
        perBranch={s?.payroll_scope === "PER_BRANCH"} onGenerated={setGenerated} />
    </div>
  );
}

/**
 * What a run just generated from the roster left off and warns about: people a
 * live run of the month already pays, and people who joined after January with
 * no earlier pay recorded, whose PAYE counts nothing earned before they joined
 * until it is recorded. Names are left out for a reader who may not read them,
 * and the count still shows.
 */
export function GeneratedRunNotice({ run, onOpen, onDismiss }: { run: GeneratedPayrollRun; onOpen: () => void; onDismiss: () => void }) {
  const missing = run.previous_pay_missing ?? [];
  const skipped = run.skipped ?? [];
  if (!missing.length && !skipped.length) return null;
  const named = (names: (string | null)[]) => names.filter((name): name is string => !!name);
  return (
    <div role="status" className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 font-mont text-xs leading-5 text-amber-900">
      <p className="font-semibold">{`${run.document_number} was generated.`}</p>
      {missing.length ? (
        <p>
          {`${missing.length} ${missing.length === 1 ? "person" : "people"} on it joined after January with no earlier pay recorded, so their PAYE counts nothing earned before they joined`}
          {named(missing).length ? `: ${named(missing).join(", ")}` : ""}
          {". To count it, cancel this draft, record it on their salary record under Earlier pay (zeros if there was no previous employer), and generate the run again."}
        </p>
      ) : null}
      {skipped.length ? (
        <p>
          {`${skipped.length} ${skipped.length === 1 ? "person was" : "people were"} left off because another run already pays them for this month`}
          {skipped.some((row) => row.name) ? `: ${skipped.map((row) => row.name ? `${row.name} (${row.run})` : null).filter(Boolean).join(", ")}` : ""}.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onOpen} className="font-semibold underline underline-offset-2">Open the run</button>
        <button type="button" onClick={onDismiss} className="underline underline-offset-2">Dismiss</button>
      </div>
    </div>
  );
}

export function RunDrawer({ runId, entity, currency, onClose }: { runId: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const [paying, setPaying] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { data } = useGetPayrollRunQuery(runId != null ? { id: runId, entity } : skipToken);
  const [post, { isLoading: posting }] = usePostPayrollRunMutation();
  const [cancelRun, { isLoading: cancelling }] = useCancelPayrollRunMutation();
  const [unassigned, setUnassigned] = useState<{ runId: number; message: string; employees: string[] } | null>(null);
  const access = useFieldAccess(PAYROLL_LINE);
  const { wholeSchool, branchIds } = useReaderReach();
  const r = data?.data;
  if (runId == null || !r) return null;
  const partOnly = isBranchPartOfWholeSchoolRun(r, wholeSchool);
  const shares = sharesOf(r);
  const status = isPartlyPaid(r) ? "PART_PAID" : r.run_status;
  const refusal = unassigned?.runId === r.id ? unassigned : null;
  // Only when the lines name more than one branch; a branch run's all read the same.
  const showLineBranch = new Set(r.lines.map((l) => l.branch_name ?? null)).size > 1;
  const showName = !access.isHidden("employee_name");
  const figures = visibleFigures(access);
  const payslips = canPrintPayslip(access);
  // The pay breakdown switch covers a line's items and its two extra totals.
  const breakdown = !access.isHidden("components");
  const working = !access.isHidden("paye_amount");
  const showOther = breakdown && r.lines.some((l) => (l.other_deductions_amount ?? 0) > 0);
  const showEmployer = breakdown && r.lines.some((l) => (l.employer_contributions_amount ?? 0) > 0);
  const hasDetails = (l: PayrollLine) => (breakdown && (l.items?.length ?? 0) > 0) || (working && !!l.paye_source);
  const statutory = breakdown ? statutoryTotals(r.lines) : [];

  const doPost = async () => {
    setUnassigned(null);
    try { const res = await post({ id: r.id, entity }).unwrap(); toast.success(res.message || "Run posted."); }
    catch (error) {
      // Answered here rather than by a toast: it names the people to fix.
      const staff = unassignedStaffRefusal(error);
      if (staff) setUnassigned({ runId: r.id, ...staff });
    }
  };
  // Undo a run raised in error; see mayCancelRun for when it is still possible.
  const canCancel = !partOnly && mayCancelRun(r);
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
            <RunPill status={status} />
            <div className="flex-1" />
            {canCancel ? <Can permission={P.FIN_POST_PAYROLL}><Button variant="outline" disabled={cancelling} onClick={() => setCancelOpen(true)} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"><Ban className="size-4" />{isPosted ? "Void run" : "Cancel run"}</Button></Can> : null}
            {r.run_status === "DRAFT" && !partOnly ? <Can permission={P.FIN_POST_PAYROLL}><Button disabled={posting} onClick={doPost} className="gap-1.5"><Banknote className="size-4" />{posting ? "Posting…" : "Calculate & post"}</Button></Can> : null}
            {r.run_status === "POSTED" && !partOnly ? <Can permission={P.FIN_PAY_PAYROLL}><Button onClick={() => setPaying(true)} className="gap-1.5"><Banknote className="size-4" /> Pay net</Button></Can> : null}
          </>
        }>
        <div className="space-y-5">
          {partOnly ? (
            <p role="note" className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-xs leading-5 text-gray-05">
              {`This run covers the whole school. You are shown only ${yourBranchesPart(branchIds)}. Posting, paying and voiding it are for someone who covers the whole school.`}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Metric label="Gross" kobo={r.gross_total} currency={currency} />
            <Metric label="PAYE" kobo={r.paye_total} currency={currency} />
            <Metric label="Pension" kobo={r.pension_total} currency={currency} />
            <Metric label="Net" kobo={r.net_total} currency={currency} />
            <div className="rounded-md border border-white-02 bg-white p-3"><p className="font-mont text-[11px] text-gray-05">Status</p><div className="mt-1.5"><RunPill status={status} /></div></div>
          </div>
          {(r.other_deductions_total ?? 0) > 0 || (r.employer_contributions_total ?? 0) > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Metric label="Other deductions (NHF, voluntary)" kobo={r.other_deductions_total ?? 0} currency={currency} />
              <Metric label="Employer contributions (pension, NSITF, ITF)" kobo={r.employer_contributions_total ?? 0} currency={currency} />
            </div>
          ) : null}
          {statutory.length ? <StatutoryTotals totals={statutory} currency={currency} /> : null}

          {refusal ? (
            <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="font-mont text-xs font-semibold text-amber-900">This run was not posted: some staff have no branch</p>
              {refusal.employees.length ? (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 font-mont text-xs text-amber-900">
                  {refusal.employees.map((name) => <li key={name}>{name}</li>)}
                </ul>
              ) : <p className="mt-1 font-mont text-xs leading-5 text-amber-900">{refusal.message}</p>}
              <p className="mt-1.5 font-mont text-xs leading-5 text-amber-900">Give each of them a branch under Employee salaries, then post the run again.</p>
            </div>
          ) : null}

          {shares.length ? <BranchShares shares={shares} currency={currency} /> : null}
          {!partOnly && r.run_status === "POSTED" && shares.some((share) => share.status === "PAID") ? (
            <p className="font-mont text-[11px] text-gray-05">A branch&rsquo;s share has been paid, so this run can no longer be voided.</p>
          ) : null}

          {showName || figures.length ? (
            <div>
              <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Payslips · {r.lines.length}</p>
              <div className="overflow-x-auto rounded-md border border-white-02">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead><tr>
                    {showName ? <th className={thCls}>Employee</th> : null}
                    {showLineBranch ? <th className={thCls}>Branch</th> : null}
                    {figures.map(([name, label]) => <th key={name} className={cn(thCls, "text-right")}>{label}</th>)}
                    {showOther ? <th className={cn(thCls, "text-right")}>Other deductions</th> : null}
                    {showEmployer ? <th className={cn(thCls, "text-right")}>Employer</th> : null}
                    <th className={thCls} />
                  </tr></thead>
                  <tbody>
                    {r.lines.map((l) => (
                      <LineRow key={l.id} line={l} columns={(showName ? 1 : 0) + (showLineBranch ? 1 : 0) + figures.length + (showOther ? 1 : 0) + (showEmployer ? 1 : 0) + 1}
                        expandable={hasDetails(l)} breakdown={breakdown} working={working} currency={currency}
                        payslip={payslips ? () => void openLinePayslip(entity, r.id, l.id) : null}>
                        {showName ? <td className={cn(tdCls, "whitespace-nowrap")}>{l.employee_name || "-"}</td> : null}
                        {showLineBranch ? <td className={cn(tdCls, "text-gray-05")}>{l.branch_name || "No branch yet"}</td> : null}
                        {figures.map(([name]) => (
                          <td key={name} className={cn(tdCls, "text-right tabular-nums", name === "net_amount" && "font-medium")}><Money kobo={l[name] ?? 0} currency={currency} align="right" /></td>
                        ))}
                        {showOther ? <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={l.other_deductions_amount ?? 0} currency={currency} align="right" /></td> : null}
                        {showEmployer ? <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={l.employer_contributions_amount ?? 0} currency={currency} align="right" /></td> : null}
                      </LineRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </DetailDrawer>

      {paying ? <PayDrawer run={r} entity={entity} currency={currency} onClose={() => setPaying(false)} /> : null}
      <ConfirmActionModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`${isPosted ? "Void" : "Cancel"} ${r.document_number}?`}
        description={isPosted
          ? "Reverses this run's journal (backing out the salaries and the PAYE, pension and net wages it said were owed) and cancels the run. Use this to undo a run posted in error - it can't be voided once net pay has been paid."
          : "Discards this draft run. Nothing was posted, so no journal is affected."}
        confirmText={isPosted ? "Void run" : "Cancel run"}
        destructive
        loading={cancelling}
        onConfirm={doCancel}
      />
    </>
  );
}

/**
 * One person's row on a run, with a Details row under it: the line's
 * deductions and the employer's contributions, and how its PAYE was worked out.
 * Each part is there only when the reader's switches show it.
 */
function LineRow({ line, columns, expandable, breakdown, working, currency, payslip, children }: {
  line: PayrollLine; columns: number; expandable: boolean; breakdown: boolean; working: boolean;
  currency?: string | null; payslip: (() => void) | null; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        {children}
        <td className={cn(tdCls, "whitespace-nowrap text-right")}>
          <span className="inline-flex items-center gap-3">
            {expandable ? (
              <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="font-mont text-[11px] font-medium text-primary hover:underline">{open ? "Hide" : "Details"}</button>
            ) : null}
            {payslip ? (
              <button type="button" onClick={payslip} className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-primary hover:underline"><Printer className="size-3" /> Payslip</button>
            ) : null}
          </span>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={columns} className="border-t border-white-02 bg-gray-03/30 px-3 py-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {breakdown && line.items?.length ? <LineItems items={line.items} currency={currency} /> : null}
              {working && line.paye_source ? (
                <div>
                  <p className="mb-2 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">How PAYE was worked out</p>
                  <PayeWorkingView line={line} currency={currency} />
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** The run's NHF, employer pension, NSITF and ITF, summed from the lines the reader holds. */
export function statutoryTotals(lines: PayrollLine[]): { code: string; label: string; amount: number }[] {
  const codes = [["NHF", "NHF"], ["EMPLOYER_PENSION", "Employer pension"], ["NSITF", "NSITF"], ["ITF", "ITF"]] as const;
  return codes
    .map(([code, label]) => ({
      code, label,
      amount: lines.reduce((sum, line) => sum + (line.items ?? []).filter((item) => item.code === code).reduce((s, item) => s + item.amount, 0), 0),
    }))
    .filter((row) => row.amount > 0);
}

function StatutoryTotals({ totals, currency }: { totals: { code: string; label: string; amount: number }[]; currency?: string | null }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-md border border-white-02 bg-white px-3 py-2 font-mont text-xs">
      {totals.map((row) => (
        <span key={row.code} className="text-gray-05">{row.label} <span className="font-medium tabular-nums text-black-01">{formatMoney(row.amount, currency)}</span></span>
      ))}
    </div>
  );
}

/** Each branch's share of a run posted one journal per branch, and whether it is paid. */
function BranchShares({ shares, currency }: { shares: PayrollRunBranchShare[]; currency?: string | null }) {
  const showEmployer = shares.some((share) => (share.employer_contributions_total ?? 0) > 0);
  return (
    <div>
      <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">By branch · {shares.length}</p>
      <div className="overflow-x-auto rounded-md border border-white-02">
        <table className="w-full border-collapse">
          <thead><tr>
            <th className={thCls}>Branch</th>
            <th className={cn(thCls, "text-right")}>Gross</th>
            <th className={cn(thCls, "text-right")}>Net</th>
            {showEmployer ? <th className={cn(thCls, "text-right")}>Employer</th> : null}
            <th className={thCls}>Status</th>
          </tr></thead>
          <tbody>
            {shares.map((share) => (
              <tr key={share.id}>
                <td className={tdCls}>{share.branch_name}</td>
                <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={share.gross_total} currency={currency} align="right" /></td>
                <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={share.net_total} currency={currency} align="right" /></td>
                {showEmployer ? <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={share.employer_contributions_total ?? 0} currency={currency} align="right" /></td> : null}
                <td className={tdCls}><RunPill status={share.status === "POSTED" ? "AWAITING" : share.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "your branch's part", or "your branches' part" for a reader who works in several. */
function yourBranchesPart(branchIds: number[] | null): string {
  return (branchIds?.length ?? 0) > 1 ? "your branches' part" : "your branch's part";
}

function Metric({ label, kobo, currency }: { label: string; kobo: number; currency?: string | null }) {
  return <div className="rounded-md border border-white-02 bg-white p-3"><p className="font-mont text-[11px] text-gray-05">{label}</p><p className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{formatMoney(kobo, currency)}</p></div>;
}

/**
 * Pays a posted run's net wages.
 *
 * A run posted as one journal is paid from one account, of the run's own branch
 * (left blank, the server uses its default). A run posted per branch is paid
 * branch by branch: each unpaid share gets its own account picker, narrowed to
 * that branch's accounts, and the shares given an account are paid together;
 * any left blank stay unpaid until a later payment names theirs.
 */
export function PayDrawer({ run, entity, currency, onClose }: { run: PayrollRun; entity: string; currency?: string | null; onClose: () => void }) {
  const [payDate, setPayDate] = useState(run.pay_date || "");
  const [bank, setBank] = useState("");
  const [shareBanks, setShareBanks] = useState<Record<number, string>>({});
  const [pay, { isLoading }] = usePayPayrollRunMutation();
  const shares = unpaidShares(run);
  const perBranch = sharesOf(run).length > 0;
  const chosen = shares.filter((share) => shareBanks[share.id]);
  const amount = perBranch ? chosen.reduce((sum, share) => sum + share.net_total, 0) : run.net_total;
  const ready = !!payDate && (!perBranch || chosen.length > 0);
  const submit = async () => {
    const accounts = perBranch
      ? { bank_accounts: chosen.map((share) => Number(shareBanks[share.id])) }
      : bank ? { bank_account: Number(bank) } : {};
    try { const res = await pay({ id: run.id, entity, pay_date: payDate, ...accounts }).unwrap(); toast.success(res.message || "Net pay disbursed."); onClose(); }
    catch { /* central */ }
  };
  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Pay net wages" description={`${run.document_number} · ${run.period_label || "-"}`} widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !ready} onClick={submit} className="gap-1.5"><Banknote className="size-4" />{isLoading ? "Paying…" : `Pay ${formatMoney(amount, currency)}`}</Button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          {perBranch
            ? "Each branch's net pay is paid from that branch's own account - Dr net-wages payable, Cr bank - clearing the liability raised when the run was posted. Pay some branches now and the rest later if you need to."
            : `Disburses net pay (${formatMoney(run.net_total, currency)}) - Dr net-wages payable, Cr bank - clearing the liability raised when the run was posted.`}
        </p>
        <PostingDateField
          label="Payment date" entity={entity} value={payDate} onChange={setPayDate}
          notBefore={run.pay_date}
          notBeforeLabel={`payroll run ${run.document_number}`}
        />
        {perBranch ? (
          <div className="space-y-3">
            {shares.map((share) => (
              <FormField key={share.id} label={`${share.branch_name} · ${formatMoney(share.net_total, currency)}`}>
                <BankAccountPicker entity={entity} value={shareBanks[share.id] ?? ""} placeholder="Not paying this branch now"
                  onChange={(value) => setShareBanks((current) => ({ ...current, [share.id]: value }))}
                  documentBranchId={share.branch_id} />
              </FormField>
            ))}
          </div>
        ) : (
          <FormField label="Pay from">
            <BankAccountPicker entity={entity} value={bank} onChange={setBank} placeholder="Default cash/bank" documentBranchId={singleJournalBranch(run)} />
          </FormField>
        )}
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

/**
 * Raises a payroll run, from the roster or by hand.
 *
 * A run for all staff is raised only by somebody who covers the whole school
 * (`useReaderReach().wholeSchool`). A branch officer at a school with several
 * branches is refused one: at a central school the roster run is always for all
 * staff, so they are offered only the hand-typed run, filed to their branch (and
 * asked which, if they cover several); at a per-branch school they are offered their
 * own branches and never "the whole school".
 */
export function NewRunDrawer({ open, onClose, entity, currency, perBranch, onGenerated }: { open: boolean; onClose: () => void; entity: string; currency?: string | null; perBranch: boolean; onGenerated?: (run: GeneratedPayrollRun) => void }) {
  const { wholeSchool } = useReaderReach();
  const [mode, setMode] = useState("roster");
  const [payDate, setPayDate] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [scopeChoice, setScopeChoice] = useState("");
  const [lines, setLines] = useState<EmpRow[]>([emptyEmp()]);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const access = useFieldAccess(PAYROLL_LINE);
  // A manual line is a name and a gross; without both there is nothing to raise by hand.
  const manualAllowed = !access.isReadOnly("employee_name", { creating: true }) && !access.isReadOnly("gross_amount", { creating: true });
  // A central school's roster run is for all staff, which a branch officer may not raise.
  const rosterAllowed = perBranch || wholeSchool;
  const activeMode = rosterAllowed ? mode : "manual";
  // A central school's hand-typed run from a branch officer names their branch.
  const manualBranch = useRaisingBranchChoice({ unless: perBranch || wholeSchool });
  const { data: rosterData } = useGetEmployeeSalariesQuery({ entity, is_active: "true" }, { skip: !open });
  const roster = useMemo(() => toArray(rosterData?.data), [rosterData]);
  const { data: branchData } = useGetBranchOptionsQuery(undefined, { skip: !open || !perBranch });
  const branches = useMemo(() => toArray(branchData?.data), [branchData]);

  // Only where there is a choice to make. A caller pinned to one branch has
  // already answered by being pinned - the backend stamps their branch and
  // refuses any other - so asking them would be a question with one answer. A
  // central school is never asked at all: its runs cover everybody by design.
  const asksForScope = perBranch && branches.length > 1;
  const offersWholeSchool = wholeSchool;
  const [generate, { isLoading: generating }] = useGeneratePayrollRunMutation();
  const [create, { isLoading: creating }] = useCreatePayrollRunMutation();
  const isLoading = generating || creating;

  const setRow = (i: number, patch: Partial<EmpRow>) => setLines((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const validLines = lines.filter((l) => l.employee_name.trim() && l.gross > 0);
  const close = () => { setMode("roster"); setPayDate(""); setPeriodLabel(""); setScopeChoice(""); setLines([emptyEmp()]); setDenied(null); manualBranch.reset(); onClose(); };

  // Left out for a whole-school run and for a caller who was not asked, so the
  // backend applies its own rule rather than being told an answer we guessed.
  const branchArg = asksForScope && scopeChoice && scopeChoice !== WHOLE_SCHOOL
    ? { branch: Number(scopeChoice) } : manualBranch.body();

  const submit = async () => {
    setDenied(null);
    try {
      if (activeMode === "roster") {
        const res = await generate({ entity, pay_date: payDate, period_label: periodLabel.trim() || undefined, ...branchArg }).unwrap();
        toast.success(res.message || "Run generated.");
        onGenerated?.(res.data);
      } else {
        const res = await create({ entity, pay_date: payDate, period_label: periodLabel.trim() || undefined, ...branchArg,
          lines: validLines.map((l) => access.writableOnly({ employee_name: l.employee_name.trim(), gross_amount: l.gross, paye_amount: l.paye, pension_amount: l.pension }, { creating: true })) }).unwrap();
        toast.success(res.message || "Run created.");
      }
      close();
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  // The people this run would pay, as chosen. Shown before they commit, because
  // "the whole school" and "Lekki" are the same two clicks apart and only one
  // of them is usually meant.
  const covered = useMemo(() => {
    if (!asksForScope || !scopeChoice || scopeChoice === WHOLE_SCHOOL) return roster;
    return roster.filter((e) => String(e.branch_id) === scopeChoice);
  }, [roster, asksForScope, scopeChoice]);
  const coverageLabel = scopeChoice === WHOLE_SCHOOL
    ? "every branch"
    : branches.find((b) => String(b.id) === scopeChoice)?.name ?? "";

  // No default when they are asked. A whole-school run under per-branch payroll is
  // a legitimate thing to raise - a whole-school bursar does it - but it should be picked,
  // not fallen into by leaving a field alone.
  const canSubmit = !!payDate && (!asksForScope || !!scopeChoice) && manualBranch.ready
    && (activeMode === "roster" ? covered.length > 0 : manualAllowed && validLines.length > 0);

  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New payroll run" description="Generate from the employee roster, or enter lines manually."
      widthClass={activeMode === "manual" ? "sm:max-w-4xl" : "sm:max-w-lg"}
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5">
          {activeMode === "roster" ? <Sparkles className="size-4" /> : <Plus className="size-4" />}
          {isLoading ? "Working…" : activeMode === "roster" ? "Generate run" : "Create run"}
        </Button>
      </>}>
      <div className="space-y-4">
        {manualAllowed && rosterAllowed ? <Segmented value={mode} onChange={setMode} options={[["roster", "From roster"], ["manual", "Manual"]]} /> : null}
        {!rosterAllowed ? (
          <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
            {manualAllowed
              ? "A run for all staff from the roster is raised by someone who covers the whole school. You can raise one for your branch by entering its lines."
              : "A run for all staff is raised by someone who covers the whole school, so there is no run for you to raise here."}
          </p>
        ) : null}
        {!rosterAllowed ? <RaisingBranchChoiceField choice={manualBranch} /> : null}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Period" ><Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. June 2026" className="h-9 bg-white" /></FormField>
          <PostingDateField label="Payment date" entity={entity} value={payDate} onChange={setPayDate} />
        </div>

        {asksForScope ? (
          <div>
            <FormField label="This run covers" required>
              <Select value={scopeChoice} onChange={setScopeChoice}>
                <option value="">Choose…</option>
                {offersWholeSchool ? <option value={WHOLE_SCHOOL}>The whole school</option> : null}
                {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name} only</option>)}
              </Select>
            </FormField>
            <p className="mt-1 font-mont text-[11px] text-gray-05">
              {offersWholeSchool
                ? "This school runs payroll per branch. A whole-school run pays every branch at once, and no branch run can be raised for the same period afterwards."
                : "This school runs payroll per branch. Choose which of your branches this run pays."}
            </p>
          </div>
        ) : null}

        {!rosterAllowed && !manualAllowed ? null : activeMode === "roster" ? (
          <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-3 font-mont text-[11px] text-gray-05">
            {asksForScope && !scopeChoice
              ? <>Choose what this run covers to see who it would pay.</>
              : covered.length > 0
              ? <>This will raise a draft run for the <span className="font-medium text-gray-01">{covered.length}</span> active employee(s){coverageLabel ? <> at <span className="font-medium text-gray-01">{coverageLabel}</span></> : null}, working out each one's PAYE, pension and other deductions from their pay terms for the month. Nobody already paid for the month is put on it. Review, then post.</>
              : <>No active employees{coverageLabel ? <> at <span className="font-medium text-gray-01">{coverageLabel}</span></> : <> on the roster yet</>}. Add them under <span className="font-medium text-gray-01">Employee salaries</span>{manualAllowed ? ", or switch to Manual" : ""}.</>}
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
                    <AccessField access={access} name="employee_name" creating errors={denied} className="col-span-5"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Employee</p><Input value={l.employee_name} onChange={(e) => setRow(i, { employee_name: e.target.value })} placeholder="Name" className="h-9 bg-white text-sm" /></AccessField>
                    <AccessField access={access} name="gross_amount" creating errors={denied} className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Gross</p><MoneyInput valueKobo={l.gross} onChangeKobo={(k) => setRow(i, { gross: k })} currency={currency} className="[&_input]:h-9" /></AccessField>
                    <AccessField access={access} name="paye_amount" creating errors={denied} className="col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">PAYE</p><MoneyInput valueKobo={l.paye} onChangeKobo={(k) => setRow(i, { paye: k })} currency={currency} className="[&_input]:h-9" /></AccessField>
                    <AccessField access={access} name="pension_amount" creating errors={denied} className="col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Pension</p><MoneyInput valueKobo={l.pension} onChangeKobo={(k) => setRow(i, { pension: k })} currency={currency} className="[&_input]:h-9" /></AccessField>
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

/** A person's branch, or a visible gap where one should be. */
function BranchCell({ salary }: { salary: EmployeeSalary }) {
  if (salary.branch_name) return <span className="text-gray-01">{salary.branch_name}</span>;
  return <span className={cn(PILL, "bg-amber-50 text-amber-700")}>Unassigned</span>;
}

function EmployeesTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const dates = useDates();
  const [searchInput, setSearchInput] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [editing, setEditing] = useState<EmployeeSalary | "new" | null>(null);
  const [viewing, setViewing] = useState<EmployeeSalary | null>(null);
  const { data, isLoading, isFetching, isError, refetch } = useGetEmployeeSalariesQuery({ entity });
  const all = useMemo(() => toArray(data?.data), [data]);
  // At a school with one branch the branch is the same on every row, so it is not shown.
  const multiBranch = useReaderBranchLens().applies;

  // The branches this caller may work in, from the tenant rather than from the
  // rows. Reading them off the roster only ever offered branches that already had
  // somebody on them, which is never the new branch they are trying to fill.
  const { data: branchData } = useGetBranchOptionsQuery();
  const branches = useMemo(() => toArray(branchData?.data), [branchData]);
  const unassignedCount = useMemo(() => all.filter((e) => e.branch_id == null).length, [all]);
  const showBranch = multiBranch || unassignedCount > 0;

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

  const access = useFieldAccess(SALARY);
  const lineAccess = useFieldAccess(PAYROLL_LINE);
  const [remove] = useDeleteEmployeeSalaryMutation();
  const doRemove = async (id: number) => { try { await remove({ id, entity }).unwrap(); toast.success("Employee removed. They stay on the roster as inactive, with their history."); } catch { /* central */ } };
  const year = Number(dates.today().slice(0, 4));
  const missingQ = useGetPreviousPayMissingQuery({ entity, year });
  const missing = missingQ.data?.data;
  const openRecord = (id: number) => { const row = all.find((e) => e.id === id); if (row) setViewing(row); };

  const cols: Column<EmployeeSalary>[] = [
    { header: "Employee", cell: (e) => {
      const next = nextTermsLine(e, { money: (kobo) => formatMoney(kobo, currency), day: (iso) => dates.day(iso), multiBranch });
      return (
        <span className="block min-w-0">
          <span className="font-medium text-gray-01">{e.name}</span>
          {next ? <span className="block font-mont text-[11px] text-blue-700">{next}</span> : null}
        </span>
      );
    } },
    { header: "Structure", cell: (e) => e.structure_name ? <span className={cn(PILL, "bg-blue-50 text-blue-700")}>{e.structure_name}</span> : <span className="font-mont text-[11px] text-gray-05">Flat</span> },
    ...(showBranch ? [{ header: "Branch", cell: (e: EmployeeSalary) => <BranchCell salary={e} /> }] : []),
    { header: "Cost center", cell: (e) => <span className="tabular-nums text-gray-05">{e.cost_center || "-"}</span> },
    ...visibleFigures(access).map(([name, label]): Column<EmployeeSalary> => ({ header: label, align: "right", cell: (e) => <Money kobo={e[name] ?? 0} currency={currency} align="right" /> })),
    { header: "Status", cell: (e) => <span className={cn(PILL, e.is_active ? "bg-green-01/10 text-green-01" : "bg-gray-03/60 text-gray-05")}>{e.is_active ? "Active" : "Inactive"}</span> },
    { header: "", align: "right", cell: (e) => (can(P.FIN_UPDATE_SALARY) || can(P.FIN_DELETE_SALARY)) ? (
      <span className="inline-flex items-center gap-2">
        {can(P.FIN_UPDATE_SALARY) ? <button type="button" onClick={(event) => { event.stopPropagation(); setEditing(e); }} className="text-gray-05 hover:text-primary" aria-label="Edit"><Pencil className="size-3.5" /></button> : null}
        {can(P.FIN_DELETE_SALARY) && e.is_active ? <button type="button" onClick={(event) => { event.stopPropagation(); void doRemove(e.id); }} className="text-gray-05 hover:text-destructive" aria-label="Remove"><Trash2 className="size-3.5" /></button> : null}
      </span>
    ) : null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search employee" className="h-9 w-full bg-white pl-8 font-mont" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showBranch && (branches.length > 1 || unassignedCount) ? (
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
            <span className="font-semibold">{unassignedCount}</span> {unassignedCount === 1 ? "person is" : "people are"} not assigned to a branch. Per-branch payroll cannot be switched on until {unassignedCount === 1 ? "they have" : "each of them has"} a branch.
          </p>
          <button type="button" onClick={() => setBranchFilter(UNASSIGNED)} className="font-mont text-[13px] font-semibold text-amber-900 underline underline-offset-2">Show them</button>
        </div>
      ) : null}

      {missing?.people.length ? <PreviousPayMissingBanner missing={missing} multiBranch={multiBranch} onOpen={openRecord} /> : null}

      <DataTable columns={cols} rows={rows} rowKey={(e) => e.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setViewing}
        emptyTitle={searchInput || branchFilter ? "No matching employees" : "No employees yet"}
        emptyMessage={searchInput || branchFilter ? "Try a different search or branch." : "Add employees to generate payroll runs from the roster."} />

      <EmployeeDrawer open={editing !== null} salary={editing === "new" ? null : editing} entity={entity} currency={currency} branches={branches} showBranch={showBranch} onClose={() => setEditing(null)} />
      <SalaryRecordDrawer salary={viewing ? all.find((e) => e.id === viewing.id) ?? viewing : null} entity={entity} currency={currency}
        multiBranch={multiBranch} canPrintSummary={canPrintPayslip(lineAccess)} onClose={() => setViewing(null)}
        onEdit={can(P.FIN_UPDATE_SALARY) ? (salary) => { setViewing(null); setEditing(salary); } : undefined} />
    </div>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Who joined after January with no earlier pay recorded, from the server's
 * list for this tax year. Their PAYE counts nothing earned before they joined
 * until it is recorded, so a previous employer's tax goes uncounted. Where the
 * school requires earlier pay, a run that would pay them is refused instead.
 * Bayo, straight from university, is recorded as zeros and drops off.
 */
export function PreviousPayMissingBanner({ missing, multiBranch, onOpen }: { missing: PreviousPayMissing; multiBranch: boolean; onOpen: (salaryId: number) => void }) {
  return (
    <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5" data-testid="previous-pay-missing">
      <p className="font-mont text-[13px] font-semibold text-amber-900">{`Earlier pay still to record for ${missing.tax_year}`}</p>
      <p className="mt-0.5 font-mont text-xs leading-5 text-amber-900">
        {missing.required
          ? "These people joined after January. This school requires their earlier pay before they are paid, so a run that includes them is refused until it is recorded (zeros if there was no previous employer)."
          : "These people joined after January. Until their earlier pay is recorded, PAYE counts nothing they earned before joining. Record zeros for anyone with no previous employer."}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {missing.people.map((person) => (
          <li key={person.salary_id} className="flex flex-wrap items-center gap-x-2 font-mont text-xs text-amber-900">
            <button type="button" onClick={() => onOpen(person.salary_id)} className="font-semibold underline underline-offset-2">{person.name}</button>
            <span>{[multiBranch ? person.branch_name ?? "No branch yet" : null, `first paid ${MONTHS[person.first_month - 1] ?? person.first_month}`].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A structure's lines with the order numbers they are saved under.
 *
 * Lines still in their stored order keep their stored numbers, so saving a
 * structure whose lines were numbered 1, 2, 3 elsewhere does not rewrite them
 * as 0, 1, 2 and read as a change to a reader who may not change pay. Once a
 * line is added, removed or moved, the order no longer matches and every line
 * is renumbered from 0 in the order shown.
 */
export function withSequences<T extends { sequence: number }>(lines: T[]): T[] {
  const kept = lines.every((line, i) => i === 0 || line.sequence > lines[i - 1].sequence);
  return kept ? lines : lines.map((line, i) => ({ ...line, sequence: i }));
}

/**
 * The salary structures a roster row's drawer offers: the active ones, plus the
 * one the row is already on when that has been retired.
 *
 * A person keeps a retired structure until someone moves them off it. Offering
 * active ones only made Tunde's retired "2025 Scale" vanish from his drawer, so
 * the drawer read him as flat and a save by a pay writer stripped his structure.
 */
export function offeredStructures(all: SalaryStructure[], currentId: string): SalaryStructure[] {
  return all.filter((s) => s.is_active || String(s.id) === currentId);
}

/** What a roster edit form holds, by the body key each value is sent under. */
export interface SalaryFormFields {
  name: string;
  cost_center?: string;
  structure: number | null;
  gross_amount: number;
  paye_amount?: number;
  pension_amount?: number;
  residence_state?: string | null;
  pfa?: number | null;
  tax_id?: string;
  pension_pin?: string;
  annual_rent?: number;
  paye_override?: number | null;
  paye_override_reason?: string;
}

/**
 * The body an edit to a roster row sends: only the fields that changed, and
 * only those the reader may change.
 *
 * The server judges a pay write by the fields a body carries, so echoing the
 * record back would ask to change pay the reader may only read. A bursar whose
 * role shows Tunde's pay but cannot change it corrects his name and sends the
 * name alone; the structure, gross and statutory figures stay out of the body.
 * A field the reader may not read is absent from the row, so it is never
 * compared and never sent. An override's reason travels with it: a changed
 * reason alone resends the override, which the server needs to accept it.
 */
export function salaryChanges(
  salary: EmployeeSalary,
  fields: SalaryFormFields,
  active: boolean,
  access: Pick<FieldAccess, "writableOnly">,
  mode: ReadOnlyOptions,
) {
  const stored: Record<string, unknown> = {
    name: salary.name, cost_center: salary.cost_center || undefined, structure: salary.structure_id ?? null,
    gross_amount: salary.gross_amount, paye_amount: salary.paye_amount, pension_amount: salary.pension_amount,
    residence_state: salary.residence_state ?? null, pfa: salary.pfa_id ?? null,
    tax_id: salary.tax_id ?? "", pension_pin: salary.pension_pin ?? "", annual_rent: salary.annual_rent ?? 0,
    paye_override: salary.paye_override ?? null, paye_override_reason: salary.paye_override_reason ?? "",
  };
  const changed = Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => value !== undefined && value !== stored[key]),
  ) as Partial<SalaryFormFields>;
  if ("paye_override_reason" in changed && !("paye_override" in changed)) changed.paye_override = fields.paye_override ?? null;
  if ("paye_override" in changed && changed.paye_override != null) changed.paye_override_reason = fields.paye_override_reason ?? "";
  if ("paye_override" in changed && changed.paye_override == null) delete changed.paye_override_reason;
  return { ...access.writableOnly(changed, mode), ...(active !== salary.is_active ? { is_active: active } : {}) };
}

export function EmployeeDrawer({ open, salary, entity, currency, branches, showBranch = branches.length > 0, onClose }: {
  open: boolean; salary: EmployeeSalary | null; entity: string; currency?: string | null; branches: BranchOption[];
  /** Whether the school has a branch dimension to show: several branches, or someone without one. */
  showBranch?: boolean;
  onClose: () => void;
}) {
  const isEdit = !!salary;
  const dates = useDates();
  const [name, setName] = useState("");
  const [person, setPerson] = useState("");
  const [branchId, setBranchId] = useState("");
  const [structureId, setStructureId] = useState("");
  const [gross, setGross] = useState(0);
  const [paye, setPaye] = useState(0);
  const [pension, setPension] = useState(0);
  const [costCenter, setCostCenter] = useState("");
  const [active, setActive] = useState(true);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState("");
  const [pfa, setPfa] = useState("");
  const [taxId, setTaxId] = useState("");
  const [pin, setPin] = useState("");
  const [rent, setRent] = useState(0);
  const [overrideOn, setOverrideOn] = useState(false);
  const [override, setOverride] = useState(0);
  const [overrideReason, setOverrideReason] = useState("");
  // Every structure, so a person on a retired one keeps it; only active ones are offered.
  const { data: structData } = useGetSalaryStructuresQuery({ entity }, { skip: !open });
  const structures = useMemo(() => offeredStructures(toArray(structData?.data), structureId), [structData, structureId]);
  const { data: stateData } = useGetPayrollTaxStatesQuery({ country: "NG" }, { skip: !open });
  const states = useMemo(() => toArray(stateData?.data).filter((row) => row.is_active || row.code === state), [stateData, state]);
  const { data: pfaData } = useGetPensionFundAdministratorsQuery({}, { skip: !open });
  const pfas = useMemo(() => toArray(pfaData?.data).filter((row) => row.is_active || String(row.id) === pfa), [pfaData, pfa]);
  const [create, { isLoading: creating }] = useCreateEmployeeSalaryMutation();
  const [update, { isLoading: updating }] = useUpdateEmployeeSalaryMutation();
  const isLoading = creating || updating;
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [refused, setRefused] = useState<Record<string, string>>({});
  // The server lists residence_state, pfa and structure as read-only where the figure they change is.
  const access = useFieldAccess(SALARY, salary);
  const mode = { creating: !salary };
  const grossOpen = !access.isReadOnly("gross_amount", mode);
  // A breakdown worked out from a figure the user cannot see would show it, or show zero.
  const showBreakdown = visibleFigures(access).length === FIGURES.length && !access.isHidden("components");

  // Seed the form to the row being edited when the drawer opens (a hidden amount
  // is absent and seeds as zero). Adjusted during render, not in an effect.
  const seedKey = salary?.id ?? "new";
  const [seededFor, setSeededFor] = useState<number | string | null>(null);
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setDenied(null);
    setRefused({});
    setPerson(""); setEffectiveFrom(""); setReason("");
    if (salary) {
      setName(salary.name); setBranchId(salary.branch_id ? String(salary.branch_id) : ""); setStructureId(salary.structure_id ? String(salary.structure_id) : ""); setGross(salary.gross_amount ?? 0); setPaye(salary.paye_amount ?? 0); setPension(salary.pension_amount ?? 0); setCostCenter(salary.cost_center ?? ""); setActive(salary.is_active);
      setState(salary.residence_state ?? ""); setPfa(salary.pfa_id ? String(salary.pfa_id) : ""); setTaxId(salary.tax_id ?? ""); setPin(salary.pension_pin ?? ""); setRent(salary.annual_rent ?? 0);
      setOverrideOn(salary.paye_override != null); setOverride(salary.paye_override ?? 0); setOverrideReason(salary.paye_override_reason ?? "");
    } else {
      setName(""); setBranchId(""); setStructureId(""); setGross(0); setPaye(0); setPension(0); setCostCenter(""); setActive(true);
      setState(""); setPfa(""); setTaxId(""); setPin(""); setRent(0); setOverrideOn(false); setOverride(0); setOverrideReason("");
    }
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const structure = structures.find((s) => String(s.id) === structureId);
  const derived = structure ? deriveFromStructure(gross, structure.components) : null;

  // Only sent when it actually changed: the backend reads the key's presence as
  // "retarget this row", and a blank one means "my own branch" to a caller
  // pinned to a single branch, so sending it unchanged would move people.
  const branchChanged = String(salary?.branch_id ?? "") !== branchId;
  const branchPatch = branchChanged ? { branch: branchId ? Number(branchId) : null } : {};
  const overrideField = access.isHidden("paye_override", mode) ? undefined : (overrideOn ? override : null);
  const overrideMissingReason = overrideOn && !access.isReadOnly("paye_override", mode) && !overrideReason.trim();
  const linkable = !isEdit || salary?.employee_id == null;
  const chosenBranch = branches.find((b) => String(b.id) === branchId)?.name;
  const movesBranch = isEdit && branchChanged && !!branchId;

  const submit = async () => {
    setDenied(null);
    setRefused({});
    try {
      // In flat mode the manual figures are sent; with a structure they're derived server-side.
      const statutory = {
        residence_state: state || null, pfa: pfa ? Number(pfa) : null, tax_id: taxId.trim(), pension_pin: pin.trim(),
        annual_rent: rent, paye_override: overrideField, paye_override_reason: overrideOn ? overrideReason.trim() : "",
      };
      const visibleStatutory = Object.fromEntries(Object.entries(statutory).filter(([key]) => !access.isHidden(key, mode))) as Partial<typeof statutory>;
      const fields: SalaryFormFields = {
        name: name.trim(), cost_center: costCenter || undefined,
        structure: structure ? structure.id : null, gross_amount: gross,
        ...(structure ? {} : { paye_amount: paye, pension_amount: pension }),
        ...visibleStatutory,
      };
      const dated = { ...(effectiveFrom ? { effective_from: effectiveFrom } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) };
      if (isEdit && salary) {
        const r = await update({
          id: salary.id, entity, ...salaryChanges(salary, fields, active, access, mode), ...branchPatch,
          ...(person ? { employee: Number(person) } : {}), ...dated,
        }).unwrap();
        toast.success(r.message || "Updated.");
      } else {
        // A new record holds nothing for a key left out, so blanks are not sent.
        const filled = Object.fromEntries(Object.entries({ ...fields, structure: structure ? structure.id : undefined })
          .filter(([, value]) => value !== undefined && value !== null && value !== "")) as Partial<SalaryFormFields>;
        const sent = access.writableOnly(filled, mode);
        const r = await create({
          entity, ...sent, name: fields.name, ...(branchId ? { branch: Number(branchId) } : {}),
          ...(person ? { employee: Number(person) } : {}),
        } as Parameters<typeof create>[0]).unwrap();
        toast.success(r.message || "Employee added.");
      }
      onClose();
    } catch (error) {
      setDenied(fieldWriteErrors(error));
      setRefused(fieldRefusals(error));
    }
  };

  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : onClose())}
      title={isEdit ? "Edit employee salary" : "Add employee"} description="Standard monthly pay and the details PAYE and pension need."
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !name.trim() || (grossOpen && gross <= 0) || overrideMissingReason} onClick={submit} className="gap-1.5"><Plus className="size-4" />{isLoading ? "Saving…" : isEdit ? "Save changes" : "Add employee"}</Button>
      </>}>
      <div className="space-y-4">
        {refused.employee ? (
          <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-900">{refused.employee}</p>
        ) : null}
        {linkable ? (
          <div>
            <PersonPicker id="payroll-person" label="Staff member" value={person} activeOnly placeholder="Search staff (optional)"
              onChange={(id) => { setPerson(id); setRefused({}); }} />
            <p className="mt-1 font-mont text-[11px] text-gray-05">Links this record to their account, so they can read their own payslips. Each person has one salary record.</p>
          </div>
        ) : null}
        <FormField label="Employee name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={person ? "Taken from their account if left blank" : "Full name"} className="h-9 bg-white" /></FormField>
        {showBranch && branches.length ? (
          <div>
            <FormField label="Branch">
              <Select value={branchId} onChange={setBranchId}>
                <option value="">Unassigned</option>
                {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
              </Select>
            </FormField>
            <p className="mt-1 font-mont text-[11px] text-gray-05">{isEdit
              ? "To move this person, change the branch here; their record and history go with them. Each person is paid by one branch."
              : "The branch this person is paid from. Everyone needs one before the school can switch to per-branch payroll."}</p>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AccessField access={access} name="gross_amount" label="Gross (monthly)" required={grossOpen} creating={mode.creating} errors={denied}><MoneyInput valueKobo={gross} onChangeKobo={setGross} currency={currency} className="[&_input]:h-9" /></AccessField>
          <FormField label="Cost center"><CostCenterPicker entity={entity} value={costCenter} onChange={setCostCenter} /></FormField>
        </div>
        <AccessField access={access} name="structure" creating={mode.creating} errors={denied}>
          <FormField label="Salary structure">
            <Select value={structureId} onChange={setStructureId}>
              <option value="">Flat (manual PAYE / pension)</option>
              {structures.map((s) => <option key={s.id} value={s.id}>{s.is_active ? s.name : `${s.name} (retired)`}</option>)}
            </Select>
          </FormField>
          {showBreakdown ? <p className="mt-1 font-mont text-[11px] text-gray-05">{structure ? "Earnings are split by the structure. Where PAYE is computed, each run works out PAYE and pension from the tax table." : "Flat - the PAYE and pension below are used where the school supplies its own PAYE."}</p> : null}
        </AccessField>

        {structure && derived ? showBreakdown ? (
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
        ) : null : (
          <>
            {access.anyVisible("paye_amount", "pension_amount", mode) ? (
              <div className="grid grid-cols-2 gap-3">
                <AccessField access={access} name="paye_amount" label="PAYE" creating={mode.creating} errors={denied}><MoneyInput valueKobo={paye} onChangeKobo={setPaye} currency={currency} className="[&_input]:h-9" /></AccessField>
                <AccessField access={access} name="pension_amount" label="Pension" creating={mode.creating} errors={denied}><MoneyInput valueKobo={pension} onChangeKobo={setPension} currency={currency} className="[&_input]:h-9" /></AccessField>
              </div>
            ) : null}
            {visibleFigures(access).length === FIGURES.length ? (
              <div className="flex items-center justify-between rounded-md border border-gray-03 bg-gray-03 px-3 py-2">
                <span className="font-mont text-[11px] text-gray-05">Net (take-home)</span>
                <span className="font-mont text-sm font-semibold tabular-nums text-black-01">{formatMoney(gross - paye - pension, currency)}</span>
              </div>
            ) : null}
          </>
        )}

        <div className="space-y-3 rounded-md border border-white-02 bg-white p-3">
          <p className="font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Tax and pension</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AccessField access={access} name="residence_state" creating={mode.creating} errors={denied}>
              <FormField label="State of residence">
                <Select value={state} onChange={setState}>
                  <option value="">Their branch&apos;s state</option>
                  {states.map((row) => <option key={row.id} value={row.code}>{row.name}</option>)}
                </Select>
              </FormField>
            </AccessField>
            <AccessField access={access} name="tax_id" label="Tax ID" creating={mode.creating} errors={denied}>
              <Input value={taxId} maxLength={32} onChange={(e) => setTaxId(e.target.value)} className="h-9 bg-white" />
            </AccessField>
            <AccessField access={access} name="pfa" creating={mode.creating} errors={denied}>
              <FormField label="Pension administrator">
                <Select value={pfa} onChange={setPfa}>
                  <option value="">Not chosen</option>
                  {pfas.map((row) => <option key={row.id} value={String(row.id)}>{row.name}</option>)}
                </Select>
              </FormField>
            </AccessField>
            <AccessField access={access} name="pension_pin" label="Pension PIN" creating={mode.creating} errors={denied}>
              <Input value={pin} maxLength={32} onChange={(e) => setPin(e.target.value)} className="h-9 bg-white" />
            </AccessField>
            <AccessField access={access} name="annual_rent" label="Annual rent (for rent relief)" creating={mode.creating} errors={denied}>
              <MoneyInput valueKobo={rent} onChangeKobo={setRent} currency={currency} className="[&_input]:h-9" />
            </AccessField>
          </div>
          <p className="font-mont text-[11px] text-gray-05">PAYE is paid to the state they live in, and pension to their administrator.</p>
          <AccessField access={access} name="paye_override" creating={mode.creating} errors={denied}>
            <label className="flex items-center gap-2 font-mont text-xs text-gray-01">
              <input type="checkbox" checked={overrideOn} onChange={(e) => setOverrideOn(e.target.checked)} className="accent-primary" /> Set their PAYE by hand
            </label>
            {overrideOn ? (
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="PAYE each month" required><MoneyInput valueKobo={override} onChangeKobo={setOverride} currency={currency} className="[&_input]:h-9" /></FormField>
                <FormField label="Reason" required><Input value={overrideReason} maxLength={255} onChange={(e) => setOverrideReason(e.target.value)} placeholder="e.g. Tax office direction" className="h-9 bg-white" /></FormField>
                <p className="font-mont text-[11px] text-gray-05 sm:col-span-2">Used in place of the computed PAYE on every run until it is cleared. The change and its reason go in the audit trail.</p>
              </div>
            ) : null}
          </AccessField>
        </div>

        {isEdit ? (
          <div className="space-y-3 rounded-md border border-white-02 bg-white p-3">
            <p className="font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">When pay changes take effect</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Takes effect on"><DatePickerInput value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></FormField>
              <FormField label="Reason for the change"><Input value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Promotion" className="h-9 bg-white" /></FormField>
            </div>
            <p className="font-mont text-[11px] leading-5 text-gray-05">
              {movesBranch && effectiveFrom
                ? `${salary?.branch_name ?? "Their current branch"} keeps paying them until ${dates.day(effectiveFrom)}; from that day ${chosenBranch ?? "the new branch"} pays them and holds their record.`
                : "Applies to a change of branch, structure, pay, cost centre or state. Left empty, it applies from the first month not yet paid. A date ahead changes nothing until that day."}
            </p>
          </div>
        ) : null}
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
    const payload = withSequences(comps).map((c) => ({ ...c, name: c.name.trim() }));
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
  const dates = useDates();
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<PayslipRow | null>(null);
  // This view flattens *every* run into payslips, so pull a wide page rather than the
  // default 25 (no per-payslip endpoint exists yet).
  const { data, isLoading, isFetching, isError, refetch } = useGetPayrollRunsQuery({ entity, page_size: 100 });
  const access = useFieldAccess(PAYROLL_LINE);
  const payslips = canPrintPayslip(access);
  const opensBreakdown = access.anyVisible("gross_amount", "paye_amount", "pension_amount", "net_amount", "components");
  const runs = useMemo(() => toArray(data?.data), [data]);
  const rows = useMemo<PayslipRow[]>(() => {
    const flat = runs.flatMap((run) => run.lines.map((line) => ({ run, line })));
    const q = searchInput.trim().toLowerCase();
    return q ? flat.filter(({ line }) => (line.employee_name || "").toLowerCase().includes(q)) : flat;
  }, [runs, searchInput]);

  const cols: Column<PayslipRow>[] = [
    ...(access.isHidden("employee_name") ? [] : [{ header: "Employee", cell: ({ line }: PayslipRow) => <span className="font-medium text-gray-01">{line.employee_name || "-"}</span> }]),
    { header: "Period", cell: ({ run }) => run.period_label || "-" },
    { header: "Run no.", cell: ({ run }) => <span className="tabular-nums text-gray-05">{run.document_number}</span> },
    { header: "Pay date", cell: ({ run }) => <span className="tabular-nums text-gray-05">{dates.day(run.pay_date)}</span> },
    ...visibleFigures(access, ["gross_amount", "net_amount"]).map(([name, label]): Column<PayslipRow> => ({ header: label, align: "right", cell: ({ line }) => <Money kobo={line[name] ?? 0} currency={currency} align="right" /> })),
    { header: "Status", cell: ({ run }) => <RunPill status={run.run_status} /> },
    ...(payslips ? [{ header: "", align: "right" as const, cell: ({ run, line }: PayslipRow) => (
      <button type="button" onClick={(e) => { e.stopPropagation(); void openLinePayslip(entity, run.id, line.id); }} className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-primary hover:underline"><Printer className="size-3" /> PDF</button>
    ) }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search employee" className="h-9 w-64 bg-white pl-8 font-mont" />
        </div>
        <p className="font-mont text-[11px] text-gray-05">Every payslip across all runs{opensBreakdown ? " - click a row for the breakdown" : ""}.</p>
      </div>
      <DataTable columns={cols} rows={rows} rowKey={({ run, line }) => `${run.id}-${line.id}`}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={opensBreakdown ? setSelected : undefined}
        emptyTitle={searchInput ? "No matching payslips" : "No payslips yet"}
        emptyMessage={searchInput ? "Try a different search." : "Generate and post a payroll run to produce payslips."} />
      <PayslipDrawer row={selected} entity={entity} access={access} currency={currency} onClose={() => setSelected(null)} />
    </div>
  );
}

/**
 * A payslip's earnings, deductions and net: itemised when a structure populated the
 * line's components, else the flat gross / PAYE / pension summary. Each figure the
 * user cannot see is left out; components are absent when hidden, which falls back
 * to the flat summary.
 */
function PayslipBreakdown({ line, access, currency }: { line: PayrollLine; access: FieldAccess; currency?: string | null }) {
  const comps = line.components ?? [];
  const shows = (name: Figure) => !access.isHidden(name);
  type BreakdownRow =
    | { sec: string }
    | { label: string; amount: number; ded: boolean; strong?: boolean };
  const rows: BreakdownRow[] = comps.length
    ? [
        { sec: "Earnings" as const },
        ...comps.filter((c) => c.kind === "EARNING").map((c) => ({ label: c.name, amount: c.amount, ded: false })),
        ...(shows("gross_amount") ? [{ label: "Gross pay", amount: line.gross_amount ?? 0, ded: false, strong: true }] : []),
        { sec: "Deductions" as const },
        ...comps.filter((c) => c.kind === "DEDUCTION").map((c) => ({ label: `${c.name} (${c.statutory_type})`, amount: c.amount, ded: true })),
      ]
    : [
        ...(shows("gross_amount") ? [{ label: "Gross pay", amount: line.gross_amount ?? 0, ded: false }] : []),
        ...(shows("paye_amount") ? [{ label: "PAYE (income tax)", amount: line.paye_amount ?? 0, ded: true }] : []),
        ...(shows("pension_amount") ? [{ label: "Pension", amount: line.pension_amount ?? 0, ded: true }] : []),
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
        {shows("net_amount") ? (
          <div className="flex items-center justify-between bg-gray-03 px-3 py-2.5 font-mont text-sm font-semibold">
            <span>Net pay</span><span className="tabular-nums">{formatMoney(line.net_amount ?? 0, currency)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One payslip. A reader who sees every figure on it gets the server's own
 * payslip, with this employer's year to date and any earlier pay kept apart,
 * and its PDF; anyone else gets the figures they may see, and no PDF.
 */
function PayslipDrawer({ row, entity, access, currency, onClose }: { row: PayslipRow | null; entity: string; access: FieldAccess; currency?: string | null; onClose: () => void }) {
  const dates = useDates();
  const whole = canPrintPayslip(access);
  const { data: contentData, isLoading } = useGetPayslipContentQuery(row && whole ? { entity, runId: row.run.id, lineId: row.line.id } : skipToken);
  if (!row) return null;
  const { run, line } = row;
  const metrics = visibleFigures(access, ["gross_amount", "net_amount"]);
  const content = contentData?.data;
  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={(!access.isHidden("employee_name") && line.employee_name) || "Payslip"} description={`${run.period_label || "-"} · ${run.document_number} · paid ${dates.day(run.pay_date)}`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>Close</Button>
        {whole ? <Button onClick={() => void openLinePayslip(entity, run.id, line.id)} className="gap-1.5"><Printer className="size-4" /> Payslip PDF</Button> : null}
      </>}>
      {whole ? (
        isLoading ? <p className="font-mont text-xs text-gray-05">Loading the payslip…</p>
          : content ? <PayslipContentView content={content} />
          : <p className="font-mont text-xs text-gray-05">This payslip could not be read.</p>
      ) : <div className="space-y-4">
        {metrics.length ? (
          <div className="grid grid-cols-2 gap-3">
            {metrics.map(([name, label]) => <Metric key={name} label={name === "net_amount" ? "Net pay" : label} kobo={line[name] ?? 0} currency={currency} />)}
          </div>
        ) : null}
        <PayslipBreakdown line={line} access={access} currency={currency} />
        {line.cost_center ? <p className="font-mont text-[11px] text-gray-05">Cost center · {line.cost_center}</p> : null}
      </div>}
    </DetailDrawer>
  );
}

// ── Statutory returns (filing-ready PAYE / pension schedules) ─────────────────
/** A schedule lists each employee's name and figure, so it prints only when both are visible. */
function SchedButton({ run, kind, access, currency, label }: { run: PayrollRun; kind: "PAYE" | "PENSION"; access: FieldAccess; currency?: string | null; label?: string }) {
  const dates = useDates();
  if (access.isHidden("employee_name") || access.isHidden(kind === "PAYE" ? "paye_amount" : "pension_amount")) return null;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); printPayrollSchedule(run, kind, currency, dates.prefs); }}
      title={`Print the ${kind} schedule`}
      className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-primary hover:underline">
      <Printer className="size-3" /> {label ?? (kind === "PAYE" ? "PAYE" : "Pension")}
    </button>
  );
}

function StatutoryTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const [selected, setSelected] = useState<PayrollRun | null>(null);
  const access = useFieldAccess(PAYROLL_LINE);
  const schedules = !access.isHidden("employee_name") && access.anyVisible("paye_amount", "pension_amount");
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
    { header: "Pay date", cell: (r) => <span className="tabular-nums text-gray-05">{dates.day(r.pay_date)}</span> },
    { header: "PAYE payable", align: "right", cell: (r) => <Money kobo={r.paye_total} currency={currency} align="right" /> },
    { header: "Pension payable", align: "right", cell: (r) => <Money kobo={r.pension_total} currency={currency} align="right" /> },
    { header: "Status", cell: (r) => <RunPill status={r.run_status} /> },
    ...(schedules ? [{ header: "Schedules", align: "right" as const, cell: (r: PayrollRun) => <span className="inline-flex items-center gap-3"><SchedButton run={r} kind="PAYE" access={access} currency={currency} /><SchedButton run={r} kind="PENSION" access={access} currency={currency} /></span> }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="PAYE payable (all posted runs)" value={formatMoney(kpis.paye, currency)} hint="Remit via Tax Remittance" />
        <Kpi label="Pension payable (all posted runs)" value={formatMoney(kpis.pension, currency)} hint="Remit to the PFA" />
        <Kpi label="Posted runs" value={String(runs.length)} />
      </div>
      <p className="font-mont text-xs text-gray-05">PAYE and pension schedules for each posted run - click a row for the per-employee breakdown and remittance status. The returns themselves, one per state and one per pension administrator with the people behind each, are filed and paid under Tax Remittance, which also has the annual PAYE return.</p>
      <DataTable columns={cols} rows={runs} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(r) => setSelected(r)}
        emptyTitle="No statutory returns yet" emptyMessage="Post a payroll run to raise PAYE and pension liabilities to file." />
      <StatutoryDrawer run={selected} entity={entity} access={access} currency={currency} onClose={() => setSelected(null)} />
    </div>
  );
}

function StatutoryDrawer({ run, entity, access, currency, onClose }: { run: PayrollRun | null; entity: string; access: FieldAccess; currency?: string | null; onClose: () => void }) {
  const dates = useDates();
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
  const showName = !access.isHidden("employee_name");
  const figures = visibleFigures(access, ["paye_amount", "pension_amount"]);
  const totals: Record<string, number> = { paye_amount: run.paye_total, pension_amount: run.pension_total };

  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={`Statutory · ${run.period_label || run.document_number}`} description={`${run.document_number} · pay date ${dates.day(run.pay_date)}`}
      widthClass="sm:max-w-2xl"
      footer={<>
        <SchedButton run={run} kind="PAYE" access={access} currency={currency} label="PAYE schedule" />
        <SchedButton run={run} kind="PENSION" access={access} currency={currency} label="Pension schedule" />
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

        {showName && figures.length ? (
          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Per-employee schedule · {run.lines.length}</p>
            <div className="overflow-hidden rounded-md border border-white-02">
              <table className="w-full border-collapse">
                <thead><tr>
                  <th className={thCls}>Employee</th>
                  {figures.map(([name, label]) => <th key={name} className={cn(thCls, "text-right")}>{label}</th>)}
                </tr></thead>
                <tbody>
                  {run.lines.map((l) => (
                    <tr key={l.id}>
                      <td className={tdCls}>{l.employee_name || "-"}</td>
                      {figures.map(([name]) => <td key={name} className={cn(tdCls, "text-right tabular-nums")}><Money kobo={l[name] ?? 0} currency={currency} align="right" /></td>)}
                    </tr>
                  ))}
                  <tr>
                    <td className={cn(tdCls, "font-semibold")}>Total</td>
                    {figures.map(([name]) => <td key={name} className={cn(tdCls, "text-right font-semibold tabular-nums")}>{formatMoney(totals[name], currency)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </DetailDrawer>
  );
}

function RemitRow({ label, code, outstanding, currency }: { label: string; code: string | null; outstanding: number | null; currency?: string | null }) {
  const settled = outstanding === 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 font-mont text-xs">
      <span className="text-black-01">{label}{code ? <span className="ml-1 text-[11px] text-gray-05">· {code}</span> : null}</span>
      {outstanding == null
        ? <span className="text-gray-05">-</span>
        : settled
          ? <span className={cn(PILL, "bg-green-01/10 text-green-01")}>Settled</span>
          : <span className="inline-flex items-center gap-2"><span className="tabular-nums text-destructive">{formatMoney(outstanding, currency)}</span><span className={cn(PILL, "bg-amber-50 text-amber-700")}>Outstanding</span></span>}
    </div>
  );
}
