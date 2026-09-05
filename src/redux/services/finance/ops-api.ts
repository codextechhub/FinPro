// Finance-operations RTK Query endpoints (vs_finance views_ops): banking,
// expense claims, petty cash, payroll, budgets, fixed assets, tax. Reads gate on
// *.view; actions on their own rbac_permission.

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "./api-types";
import type {
  BankAccount,
  BankAccountDetail,
  BankBookLine,
  BankReconciliationRun,
  BankStatementDetail,
  BankStatementLine,
  Budget,
  BudgetLineInput,
  BudgetVariance,
  BudgetHeatmap,
  FiscalYear,
  ExpenseClaim,
  FixedAsset,
  DepreciationPreview,
  EmployeeSalary,
  PayrollRun,
  SalaryComponent,
  SalaryStructure,
  PettyCashFund,
  PettyCashFundDetail,
  PettyCashVoucher,
  TaxFiling,
  TaxObligation,
} from "./ops-types";
import type { ImportBatch } from "@/redux/services/dashboard/import-types";
import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);
type E = { entity: string; page?: number; page_size?: number; status?: string };
type Act = { id: number; entity: string };

export const opsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Banking
    getBankAccounts: b.query<PaginatedEnvelope<BankAccount>, E>({
      query: (p) => ({ url: `/finance/bank-accounts/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceBankAccounts"],
    }),
    getBankAccount: b.query<ApiEnvelope<BankAccountDetail>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/bank-accounts/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    createBankAccount: b.mutation<ApiEnvelope<BankAccount>, { entity: string; name: string; bank_name?: string; account_number?: string; gl_account: string; currency?: string; is_active?: boolean; is_primary?: boolean; is_primary_collection?: boolean }>({
      query: ({ entity, ...body }) => ({ url: `/finance/bank-accounts/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceBankAccounts"],
    }),
    updateBankAccount: b.mutation<ApiEnvelope<BankAccount>, Act & { name?: string; bank_name?: string; account_number?: string; currency?: string; is_active?: boolean; is_primary?: boolean; is_primary_collection?: boolean }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-accounts/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceBankAccounts"],
    }),
    getStatementLines: b.query<ApiEnvelope<BankStatementLine[]>, Act & { status?: string }>({
      query: ({ id, ...p }) => ({ url: `/finance/bank-accounts/${id}/statement-lines/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceStatementLines"],
    }),
    getBankStatement: b.query<ApiEnvelope<BankStatementDetail>, Act & { statementId: number }>({
      query: ({ id, statementId, entity }) => ({
        url: `/finance/bank-accounts/${id}/statements/${statementId}/${qs({ entity })}`,
        method: "GET",
      }),
      providesTags: ["FinanceStatementLines"],
    }),
    updateBankStatement: b.mutation<
      ApiEnvelope<BankStatementDetail>,
      Act & {
        statementId: number;
        statement_date: string;
        period_label?: string;
        opening_balance: number;
        lines: {
          id?: number;
          txn_date: string;
          amount: number;
          description?: string;
          reference?: string;
          external_id?: string;
        }[];
      }
    >({
      query: ({ id, statementId, entity, ...body }) => ({
        url: `/finance/bank-accounts/${id}/statements/${statementId}/${qs({ entity })}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    deleteBankStatementLine: b.mutation<
      ApiEnvelope<{ deleted_line_id: number; deleted_statement_id: number | null }>,
      { id: number; entity: string }
    >({
      query: ({ id, entity }) => ({
        url: `/finance/statement-lines/${id}/${qs({ entity })}`,
        method: "DELETE",
      }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    // Returns { imported, suspected_duplicates }: rows matching an existing line on
    // (date, amount, description, reference) are held back unless force=true.
    importStatement: b.mutation<ApiEnvelope<{ imported: BankStatementLine[]; suspected_duplicates: Record<string, unknown>[] }>, Act & { lines: { txn_date: string; amount: number; description?: string; reference?: string }[]; period_label?: string; statement_date?: string; opening_balance?: number; closing_balance?: number; force?: boolean }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-accounts/${id}/statement-lines/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    uploadBankStatementBatch: b.mutation<ApiEnvelope<ImportBatch>, Act & { formData: FormData }>({
      query: ({ id, entity, formData }) => ({
        url: `/finance/bank-accounts/${id}/statement-imports/${qs({ entity })}`,
        method: "POST",
        body: formData,
      }),
      invalidatesTags: ["ImportBatches"],
    }),
    downloadBankStatementTemplate: b.mutation<string, Act & { format: "csv" | "xlsx" }>({
      query: ({ id, entity, format }) => ({
        url: `/finance/bank-accounts/${id}/statement-imports/template/${qs({ entity, file_format: format })}`,
        method: "GET",
        responseHandler: (response) => response.blob(),
      }),
      transformResponse: (blob: Blob) => URL.createObjectURL(blob),
    }),
    autoReconcile: b.mutation<ApiEnvelope<BankStatementLine[]>, Act & { tolerance_days?: number }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-accounts/${id}/auto-reconcile/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    // Unmatched GL lines - paginated server-side (page_size capped at 100). Request
    // the max page so the matcher shows as many as possible; page through the rest.
    getBookLines: b.query<PaginatedEnvelope<BankBookLine>, Act & { page?: number }>({
      query: ({ id, entity, page }) => ({ url: `/finance/bank-accounts/${id}/book-lines/${qs({ entity, page_size: 100, ...(page ? { page } : {}) })}`, method: "GET" }),
      providesTags: ["FinanceStatementLines"],
    }),
    matchStatementLine: b.mutation<ApiEnvelope<BankStatementLine>, { id: number; entity: string; journal_line: number }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/statement-lines/${id}/match/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    // `posting_date` is optional: omitted, the server books on the line's own date,
    // or the earliest open day after it when that month has since closed (a
    // statement legitimately covers a closed period). The line's date is kept on
    // the journal as the bank's value date either way.
    adjustStatementLine: b.mutation<ApiEnvelope<BankStatementLine>, { id: number; entity: string; counter_account?: string; narration?: string; posting_date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/statement-lines/${id}/adjust/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    unmatchStatementLine: b.mutation<ApiEnvelope<BankStatementLine>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/statement-lines/${id}/unmatch/${qs({ entity })}`, method: "POST", body: {} }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    // Mark an unmatched line IGNORED (known dup / opening balance), or revert with
    // { ignored: false }. Ignored lines carry no ledger effect and drop out of the
    // unreconciled count, so MATCHED + IGNORED can still reconcile.
    ignoreStatementLine: b.mutation<ApiEnvelope<BankStatementLine>, { id: number; entity: string; ignored?: boolean; reason?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/statement-lines/${id}/ignore/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    // Many-to-one: match one statement line to several cash journal lines whose signed
    // amounts sum to it (a settlement covering many receipts).
    groupMatchStatementLine: b.mutation<ApiEnvelope<BankStatementLine>, { id: number; entity: string; journal_lines: number[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/statement-lines/${id}/match-group/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    // The reverse (one-to-many): match one cash journal line to several statement lines
    // that sum to it (a ledger movement the bank split). `id` is the bank account.
    splitMatchLine: b.mutation<ApiEnvelope<Record<string, unknown>>, { id: number; entity: string; journal_line: number; statement_lines: number[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-accounts/${id}/split-match/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),
    completeReconciliation: b.mutation<ApiEnvelope<BankReconciliationRun>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/bank-accounts/${id}/reconcile/complete/${qs({ entity })}`, method: "POST", body: {} }),
      invalidatesTags: ["FinanceBankAccounts", "FinanceStatementLines"],
    }),

    // Expense claims
    getExpenseClaims: b.query<PaginatedEnvelope<ExpenseClaim>, E & { payment_status?: string; display_status?: string; q?: string }>({
      query: (p) => ({ url: `/finance/expense-claims/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceExpenseClaims"],
    }),
    getExpenseClaimSummary: b.query<ApiEnvelope<{ open: number; month_total: number; avg: number; awaiting: number }>, { entity: string }>({
      query: (p) => ({ url: `/finance/expense-claims/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceExpenseClaims"],
    }),
    createExpenseClaim: b.mutation<ApiEnvelope<ExpenseClaim>, { entity: string; claimant_name?: string; claim_date: string; title?: string; narration?: string; lines: { description: string; expense_account: string; quantity: number; unit_price: number; tax_code?: string; cost_center?: string }[] }>({
      query: ({ entity, ...body }) => ({ url: `/finance/expense-claims/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceExpenseClaims"],
    }),
    getExpenseClaim: b.query<ApiEnvelope<ExpenseClaim>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/expense-claims/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceExpenseClaims"],
    }),
    postExpenseClaim: b.mutation<ApiEnvelope<ExpenseClaim>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/expense-claims/${id}/post/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceExpenseClaims", "FinanceJournals", "FinanceReports"],
    }),
    submitExpenseClaim: b.mutation<ApiEnvelope<ExpenseClaim & { approval?: ApprovalParkState }>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/expense-claims/${id}/submit/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceExpenseClaims"],
    }),
    rejectExpenseClaim: b.mutation<ApiEnvelope<ExpenseClaim>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/expense-claims/${id}/reject/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceExpenseClaims"],
    }),
    settleExpenseClaim: b.mutation<ApiEnvelope<ExpenseClaim>, Act & { bank_account?: string; pay_date: string; amount?: number }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/expense-claims/${id}/settle/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceExpenseClaims", "FinanceJournals", "FinanceReports"],
    }),
    // Void a posted, un-reimbursed claim: reverses its journal + marks CANCELLED.
    voidExpenseClaim: b.mutation<ApiEnvelope<ExpenseClaim>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/expense-claims/${id}/void/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceExpenseClaims", "FinanceJournals", "FinanceReports"],
    }),
    uploadExpenseReceipt: b.mutation<ApiEnvelope<ExpenseClaim>, { id: number; lineId: number; entity: string; file: File }>({
      query: ({ id, lineId, entity, file }) => {
        const fd = new FormData(); fd.append("file", file);
        return { url: `/finance/expense-claims/${id}/lines/${lineId}/receipt/${qs({ entity })}`, method: "POST", body: fd };
      },
      invalidatesTags: ["FinanceExpenseClaims"],
    }),
    deleteExpenseReceipt: b.mutation<ApiEnvelope<ExpenseClaim>, { id: number; lineId: number; entity: string }>({
      query: ({ id, lineId, entity }) => ({ url: `/finance/expense-claims/${id}/lines/${lineId}/receipt/${qs({ entity })}`, method: "DELETE" }),
      invalidatesTags: ["FinanceExpenseClaims"],
    }),

    // Petty cash
    getPettyCashFunds: b.query<PaginatedEnvelope<PettyCashFund>, E>({
      query: (p) => ({ url: `/finance/petty-cash-funds/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePettyCash"],
    }),
    getPettyCashFund: b.query<ApiEnvelope<PettyCashFundDetail>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/petty-cash-funds/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinancePettyCash"],
    }),
    createPettyCashFund: b.mutation<ApiEnvelope<PettyCashFund>, { entity: string; name: string; gl_account: string; custodian_name?: string; float_amount?: number; currency?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/petty-cash-funds/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePettyCash"],
    }),
    establishPettyCash: b.mutation<ApiEnvelope<PettyCashFund>, Act & { date: string; amount: number; bank_account?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/petty-cash-funds/${id}/establish/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePettyCash", "FinanceJournals"],
    }),
    replenishPettyCash: b.mutation<ApiEnvelope<PettyCashFund>, Act & { date: string; amount?: number; bank_account?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/petty-cash-funds/${id}/replenish/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePettyCash", "FinanceJournals"],
    }),
    getPettyCashVouchers: b.query<PaginatedEnvelope<PettyCashVoucher>, E & { fund?: number }>({
      query: (p) => ({ url: `/finance/petty-cash-vouchers/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePettyCash"],
    }),
    createPettyCashVoucher: b.mutation<ApiEnvelope<PettyCashVoucher>, { entity: string; fund: number; voucher_date: string; payee?: string; reference?: string; lines: { description: string; expense_account: string; quantity: number; unit_price: number; tax_code?: string; cost_center?: string }[] }>({
      query: ({ entity, ...body }) => ({ url: `/finance/petty-cash-vouchers/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePettyCash"],
    }),
    postPettyCashVoucher: b.mutation<ApiEnvelope<PettyCashVoucher>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/petty-cash-vouchers/${id}/post/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinancePettyCash", "FinanceJournals"],
    }),
    // Void a posted voucher: reverses its journal, returns cash to the tin, CANCELLED.
    voidPettyCashVoucher: b.mutation<ApiEnvelope<PettyCashVoucher>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/petty-cash-vouchers/${id}/void/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinancePettyCash", "FinanceJournals", "FinanceReports"],
    }),

    // Payroll
    getPayrollRuns: b.query<PaginatedEnvelope<PayrollRun>, E & { run_status?: string }>({
      query: (p) => ({ url: `/finance/payroll-runs/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    // `payroll_scope` rides on the summary because the screen has to know
    // whether to ask which branch a run is for, and reading the setting through
    // the config API needs `config.value.view` - a settings key no payroll
    // officer holds.
    getPayrollSummary: b.query<ApiEnvelope<{ payroll_scope: "CENTRAL" | "PER_BRANCH"; runs: number; employees: number; net: number; to_pay: number }>, { entity: string }>({
      query: (p) => ({ url: `/finance/payroll-runs/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    createPayrollRun: b.mutation<ApiEnvelope<PayrollRun>, { entity: string; pay_date: string; period_label?: string; narration?: string; branch?: number; lines: { employee_name: string; gross_amount: number; paye_amount: number; pension_amount: number }[] }>({
      query: ({ entity, ...body }) => ({ url: `/finance/payroll-runs/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    getPayrollRun: b.query<ApiEnvelope<PayrollRun>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/payroll-runs/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    postPayrollRun: b.mutation<ApiEnvelope<PayrollRun>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/payroll-runs/${id}/post/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinancePayroll", "FinanceJournals"],
    }),
    // Undo a run raised in error: DRAFT → just cancelled; POSTED → reverses the accrual
    // journal then cancelled; PAID is refused server-side (reverse the disbursement first).
    cancelPayrollRun: b.mutation<ApiEnvelope<PayrollRun>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/payroll-runs/${id}/cancel/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinancePayroll", "FinanceJournals", "FinanceReports"],
    }),
    payPayrollRun: b.mutation<ApiEnvelope<PayrollRun>, Act & { bank_account?: string; pay_date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/payroll-runs/${id}/pay/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayroll", "FinanceJournals", "FinanceReports"],
    }),
    // `branch` is omitted for a whole-school run, and omitted entirely for a
    // caller pinned to one branch - the backend stamps hers, and naming a
    // different one is refused rather than silently retargeted.
    generatePayrollRun: b.mutation<ApiEnvelope<PayrollRun>, { entity: string; pay_date: string; period_label?: string; narration?: string; branch?: number }>({
      query: ({ entity, ...body }) => ({ url: `/finance/payroll-runs/generate/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    // `branch` accepts a branch id, or the literal "unassigned" for the people
    // who belong to no branch yet. The roster tab narrows in memory instead
    // (the endpoint is unpaginated, so it already holds every row), but the
    // parameter is part of the contract and other callers use it.
    getEmployeeSalaries: b.query<ApiEnvelope<EmployeeSalary[]>, { entity: string; search?: string; is_active?: string; branch?: string }>({
      query: (p) => ({ url: `/finance/employee-salaries/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    createEmployeeSalary: b.mutation<ApiEnvelope<EmployeeSalary>, { entity: string; name: string; gross_amount: number; structure?: number; paye_amount?: number; pension_amount?: number; cost_center?: string; branch?: number | null }>({
      query: ({ entity, ...body }) => ({ url: `/finance/employee-salaries/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    // `branch` is left out of the body unless it changed: the backend reads the
    // key's presence as "retarget this row", and for a branch-pinned caller a
    // blank one means their own branch, so sending it unchanged would move
    // people nobody asked to move.
    updateEmployeeSalary: b.mutation<ApiEnvelope<EmployeeSalary>, { id: number; entity: string; name?: string; gross_amount?: number; structure?: number | null; paye_amount?: number; pension_amount?: number; cost_center?: string; is_active?: boolean; branch?: number | null }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/employee-salaries/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    deleteEmployeeSalary: b.mutation<ApiEnvelope<unknown>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/employee-salaries/${id}/${qs({ entity })}`, method: "DELETE" }),
      invalidatesTags: ["FinancePayroll"],
    }),

    // Salary structures (reusable pay templates)
    getSalaryStructures: b.query<ApiEnvelope<SalaryStructure[]>, { entity: string; is_active?: string }>({
      query: (p) => ({ url: `/finance/salary-structures/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    createSalaryStructure: b.mutation<ApiEnvelope<SalaryStructure>, { entity: string; name: string; description?: string; is_active?: boolean; components: SalaryComponent[] }>({
      query: ({ entity, ...body }) => ({ url: `/finance/salary-structures/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    updateSalaryStructure: b.mutation<ApiEnvelope<SalaryStructure>, { id: number; entity: string; name?: string; description?: string; is_active?: boolean; components?: SalaryComponent[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/salary-structures/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    deleteSalaryStructure: b.mutation<ApiEnvelope<unknown>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/salary-structures/${id}/${qs({ entity })}`, method: "DELETE" }),
      invalidatesTags: ["FinancePayroll"],
    }),

    // Budgets
    getBudgets: b.query<PaginatedEnvelope<Budget>, { entity: string; page?: number; page_size?: number; status?: string }>({
      query: (p) => ({ url: `/finance/budgets/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceBudgets"],
    }),
    getBudget: b.query<ApiEnvelope<Budget>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/budgets/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceBudgets"],
    }),
    getBudgetVariance: b.query<ApiEnvelope<BudgetVariance>, Act & { period_no?: number }>({
      query: ({ id, entity, period_no }) => ({ url: `/finance/budgets/${id}/variance/${qs({ entity, period_no })}`, method: "GET" }),
      providesTags: ["FinanceBudgets"],
    }),
    getBudgetHeatmap: b.query<ApiEnvelope<BudgetHeatmap>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/budgets/${id}/heatmap/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceBudgets"],
    }),
    getFiscalYears: b.query<ApiEnvelope<FiscalYear[]>, { entity: string; status?: string }>({
      query: (p) => ({ url: `/finance/fiscal-years/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePeriods"],
    }),
    createBudget: b.mutation<ApiEnvelope<Budget>, { entity: string; name: string; fiscal_year: number; lines?: BudgetLineInput[] }>({
      query: ({ entity, ...body }) => ({ url: `/finance/budgets/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceBudgets"],
    }),
    updateBudget: b.mutation<ApiEnvelope<Budget>, { id: number; entity: string; name?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/budgets/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceBudgets"],
    }),
    setBudgetLines: b.mutation<ApiEnvelope<Budget>, { id: number; entity: string; lines: BudgetLineInput[] }>({
      query: ({ id, entity, lines }) => ({ url: `/finance/budgets/${id}/lines/${qs({ entity })}`, method: "PUT", body: { lines } }),
      invalidatesTags: ["FinanceBudgets"],
    }),
    deleteBudgetLine: b.mutation<ApiEnvelope<Budget>, { id: number; entity: string; lineId: number }>({
      query: ({ id, entity, lineId }) => ({ url: `/finance/budgets/${id}/lines/${lineId}/${qs({ entity })}`, method: "DELETE" }),
      invalidatesTags: ["FinanceBudgets"],
    }),
    approveBudget: b.mutation<ApiEnvelope<Budget>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/budgets/${id}/approve/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceBudgets"],
    }),
    // Delete a DRAFT budget (backend refuses once approved).
    deleteBudget: b.mutation<ApiEnvelope<unknown>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/budgets/${id}/${qs({ entity })}`, method: "DELETE" }),
      invalidatesTags: ["FinanceBudgets"],
    }),

    // Fixed assets
    getFixedAssets: b.query<PaginatedEnvelope<FixedAsset>, { entity: string; page?: number; category?: string; asset_status?: string }>({
      query: (p) => ({ url: `/finance/fixed-assets/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceFixedAssets"],
    }),
    getFixedAssetSummary: b.query<ApiEnvelope<{ cost: number; accum: number; nbv: number; monthly: number }>, { entity: string }>({
      query: (p) => ({ url: `/finance/fixed-assets/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceFixedAssets"],
    }),
    createFixedAsset: b.mutation<ApiEnvelope<FixedAsset>, { entity: string; name: string; asset_code?: string; category?: string; acquisition_date: string; cost: number; salvage_value?: number; useful_life_months: number; method?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/fixed-assets/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceFixedAssets"],
    }),
    acquireFixedAsset: b.mutation<ApiEnvelope<FixedAsset>, Act & { bank_account?: string; credit_account?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/fixed-assets/${id}/acquire/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceFixedAssets", "FinanceJournals"],
    }),
    depreciateFixedAsset: b.mutation<ApiEnvelope<FixedAsset>, Act & { up_to_date: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/fixed-assets/${id}/depreciate/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceFixedAssets", "FinanceJournals"],
    }),
    getDepreciationPreview: b.query<ApiEnvelope<DepreciationPreview>, { entity: string; up_to_date: string }>({
      query: (p) => ({ url: `/finance/fixed-assets/run-depreciation/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceFixedAssets"],
    }),
    runDepreciation: b.mutation<ApiEnvelope<{ journal_id: number; journal_ids?: number[]; period_count?: number; total: number; charge_count: number; asset_count: number }>, { entity: string; up_to_date: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/fixed-assets/run-depreciation/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceFixedAssets", "FinanceJournals", "FinanceReports"],
    }),
    disposeFixedAsset: b.mutation<ApiEnvelope<FixedAsset>, { id: number; entity: string; disposal_date: string; proceeds?: number; bank_account?: string; gain_loss_account?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/fixed-assets/${id}/dispose/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceFixedAssets", "FinanceJournals", "FinanceReports"],
    }),

    // Tax
    getTaxObligations: b.query<ApiEnvelope<TaxObligation[]>, { entity: string; is_active?: string }>({
      query: (p) => ({ url: `/finance/tax-obligations/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceTax"],
    }),
    createTaxObligation: b.mutation<ApiEnvelope<TaxObligation>, { entity: string; code: string; name?: string; obligation_type: string; liability_account: string; authority_name?: string; frequency?: string; filing_day?: number }>({
      query: ({ entity, ...body }) => ({ url: `/finance/tax-obligations/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceTax"],
    }),
    getTaxFilings: b.query<PaginatedEnvelope<TaxFiling>, { entity: string; page?: number; filing_status?: string; obligation?: number }>({
      query: (p) => ({ url: `/finance/tax-filings/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceTax"],
    }),
    getTaxFilingSummary: b.query<ApiEnvelope<{ outstanding: number; open: number; filed: number; paid: number }>, { entity: string }>({
      query: (p) => ({ url: `/finance/tax-filings/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceTax"],
    }),
    createTaxFiling: b.mutation<ApiEnvelope<TaxFiling>, { entity: string; obligation: number; period_start: string; period_end: string; due_date?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/tax-filings/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceTax"],
    }),
    fileTaxFiling: b.mutation<ApiEnvelope<TaxFiling>, { id: number; entity: string; filed_date: string; filing_reference?: string; adjustment_amount?: number; adjustment_account?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/tax-filings/${id}/file/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceTax", "FinanceJournals"],
    }),
    // Revert a FILED return to DRAFT (reverses the netting/penalty journal). Backend
    // refuses once any remittance is recorded.
    unfileTaxFiling: b.mutation<ApiEnvelope<TaxFiling>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/tax-filings/${id}/unfile/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceTax", "FinanceJournals"],
    }),
    payTaxFiling: b.mutation<ApiEnvelope<TaxFiling>, { id: number; entity: string; bank_account: string; pay_date: string; amount?: number }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/tax-filings/${id}/pay/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceTax", "FinanceJournals", "FinanceReports"],
    }),
  }),
});

export const {
  useGetBankAccountsQuery,
  useGetBankAccountQuery,
  useCreateBankAccountMutation,
  useUpdateBankAccountMutation,
  useGetStatementLinesQuery,
  useGetBankStatementQuery,
  useUpdateBankStatementMutation,
  useDeleteBankStatementLineMutation,
  useImportStatementMutation,
  useUploadBankStatementBatchMutation,
  useDownloadBankStatementTemplateMutation,
  useAutoReconcileMutation,
  useGetBookLinesQuery,
  useMatchStatementLineMutation,
  useAdjustStatementLineMutation,
  useUnmatchStatementLineMutation,
  useIgnoreStatementLineMutation,
  useGroupMatchStatementLineMutation,
  useSplitMatchLineMutation,
  useCompleteReconciliationMutation,
  useGetExpenseClaimsQuery,
  useGetExpenseClaimSummaryQuery,
  useGetExpenseClaimQuery,
  useCreateExpenseClaimMutation,
  usePostExpenseClaimMutation,
  useSubmitExpenseClaimMutation,
  useRejectExpenseClaimMutation,
  useSettleExpenseClaimMutation,
  useVoidExpenseClaimMutation,
  useUploadExpenseReceiptMutation,
  useDeleteExpenseReceiptMutation,
  useGetPettyCashFundsQuery,
  useGetPettyCashFundQuery,
  useCreatePettyCashFundMutation,
  useEstablishPettyCashMutation,
  useReplenishPettyCashMutation,
  useGetPettyCashVouchersQuery,
  useCreatePettyCashVoucherMutation,
  usePostPettyCashVoucherMutation,
  useVoidPettyCashVoucherMutation,
  useGetPayrollRunsQuery,
  useGetPayrollSummaryQuery,
  useGetPayrollRunQuery,
  useCreatePayrollRunMutation,
  usePostPayrollRunMutation,
  useCancelPayrollRunMutation,
  usePayPayrollRunMutation,
  useGeneratePayrollRunMutation,
  useGetEmployeeSalariesQuery,
  useCreateEmployeeSalaryMutation,
  useUpdateEmployeeSalaryMutation,
  useDeleteEmployeeSalaryMutation,
  useGetSalaryStructuresQuery,
  useCreateSalaryStructureMutation,
  useUpdateSalaryStructureMutation,
  useDeleteSalaryStructureMutation,
  useGetBudgetsQuery,
  useGetBudgetQuery,
  useGetBudgetVarianceQuery,
  useGetBudgetHeatmapQuery,
  useGetFiscalYearsQuery,
  useCreateBudgetMutation,
  useUpdateBudgetMutation,
  useSetBudgetLinesMutation,
  useDeleteBudgetLineMutation,
  useApproveBudgetMutation,
  useDeleteBudgetMutation,
  useGetFixedAssetsQuery,
  useGetFixedAssetSummaryQuery,
  useCreateFixedAssetMutation,
  useAcquireFixedAssetMutation,
  useDepreciateFixedAssetMutation,
  useGetDepreciationPreviewQuery,
  useRunDepreciationMutation,
  useDisposeFixedAssetMutation,
  useGetTaxObligationsQuery,
  useCreateTaxObligationMutation,
  useGetTaxFilingsQuery,
  useGetTaxFilingSummaryQuery,
  useCreateTaxFilingMutation,
  useFileTaxFilingMutation,
  useUnfileTaxFilingMutation,
  usePayTaxFilingMutation,
} = opsApi;
