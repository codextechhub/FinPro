/**
 * Statutory payroll endpoints (`vs_finance.views_ops.payroll_statutory` and the
 * payroll settings screen).
 *
 * Reads gate on the payroll, salary and tax view keys and the reader's branch
 * reach; a salary record and everything hung off it (history, deductions, pay
 * brought forward, tax year) is reached through the record, so another branch's
 * person is a 404. The two "my" endpoints need no payroll key at all: they
 * answer only for the signed-in person, and a colleague's payslip id is a 404.
 *
 * Every figure is kobo, and every figure follows the reader's Field Access
 * switches: absent when hidden, refused with 403 `field_write_denied` when a
 * write would change one the reader may not change.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope } from "./api-types";
import type {
  AnnualPayeReturn,
  EmployeeDeduction,
  FinancePayrollSettingsBody,
  FinancePayrollSettingsPayload,
  MyPayslip,
  PayBroughtForward,
  PayBroughtForwardBody,
  PayrollDeductionType,
  PayrollTaxState,
  PayslipContent,
  PensionFundAdministrator,
  PreviousPayMissing,
  RemittanceSchedule,
  SalaryVersion,
  TaxSummary,
} from "./payroll-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);
type OnSalary = { entity: string; salaryId: number };
type OnRow = { entity: string; id: number };

export const payrollApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // National data: the states PAYE goes to and the pension administrators.
    getPayrollTaxStates: b.query<ApiEnvelope<PayrollTaxState[]>, { country?: string }>({
      query: (p) => ({ url: `/finance/payroll/tax-states/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    getPensionFundAdministrators: b.query<ApiEnvelope<PensionFundAdministrator[]>, { is_active?: string }>({
      query: (p) => ({ url: `/finance/payroll/pension-fund-administrators/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),

    // One salary record's dated versions, oldest first.
    getSalaryHistory: b.query<ApiEnvelope<SalaryVersion[]>, OnSalary>({
      query: ({ entity, salaryId }) => ({ url: `/finance/employee-salaries/${salaryId}/history/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),

    // Voluntary deductions: the tenant's kinds, and each person's.
    getPayrollDeductionTypes: b.query<ApiEnvelope<PayrollDeductionType[]>, { entity: string }>({
      query: (p) => ({ url: `/finance/payroll/deduction-types/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    createPayrollDeductionType: b.mutation<ApiEnvelope<PayrollDeductionType>, { entity: string; code: string; name: string; liability_account: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/payroll/deduction-types/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    updatePayrollDeductionType: b.mutation<ApiEnvelope<PayrollDeductionType>, OnRow & { name?: string; liability_account?: string; is_active?: boolean }>({
      query: ({ entity, id, ...body }) => ({ url: `/finance/payroll/deduction-types/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    getEmployeeDeductions: b.query<ApiEnvelope<EmployeeDeduction[]>, OnSalary>({
      query: ({ entity, salaryId }) => ({ url: `/finance/employee-salaries/${salaryId}/deductions/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    createEmployeeDeduction: b.mutation<ApiEnvelope<EmployeeDeduction>, OnSalary & { deduction_type: number; amount: number; total_limit?: number | null; start_date?: string; end_date?: string; reference?: string }>({
      query: ({ entity, salaryId, ...body }) => ({ url: `/finance/employee-salaries/${salaryId}/deductions/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    updateEmployeeDeduction: b.mutation<ApiEnvelope<EmployeeDeduction>, OnRow & { amount?: number; total_limit?: number | null; start_date?: string | null; end_date?: string | null; is_active?: boolean }>({
      query: ({ entity, id, ...body }) => ({ url: `/finance/employee-deductions/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    stopEmployeeDeduction: b.mutation<ApiEnvelope<unknown>, OnRow>({
      query: ({ entity, id }) => ({ url: `/finance/employee-deductions/${id}/${qs({ entity })}`, method: "DELETE" }),
      invalidatesTags: ["FinancePayroll"],
    }),

    // Pay brought forward into a tax year: one record of each kind a year.
    getPayBroughtForward: b.query<ApiEnvelope<PayBroughtForward[]>, OnSalary>({
      query: ({ entity, salaryId }) => ({ url: `/finance/employee-salaries/${salaryId}/pay-brought-forward/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    createPayBroughtForward: b.mutation<ApiEnvelope<PayBroughtForward>, OnSalary & PayBroughtForwardBody>({
      query: ({ entity, salaryId, ...body }) => ({ url: `/finance/employee-salaries/${salaryId}/pay-brought-forward/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    updatePayBroughtForward: b.mutation<ApiEnvelope<PayBroughtForward>, OnRow & PayBroughtForwardBody>({
      query: ({ entity, id, ...body }) => ({ url: `/finance/employee-pay-brought-forward/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    deletePayBroughtForward: b.mutation<ApiEnvelope<unknown>, OnRow>({
      query: ({ entity, id }) => ({ url: `/finance/employee-pay-brought-forward/${id}/${qs({ entity })}`, method: "DELETE" }),
      invalidatesTags: ["FinancePayroll"],
    }),
    // Who joined after January of `year` with nothing recorded, in the reader's reach.
    getPreviousPayMissing: b.query<ApiEnvelope<PreviousPayMissing>, { entity: string; year?: number }>({
      query: (p) => ({ url: `/finance/employee-salaries/previous-pay-missing/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),

    // Payslips and tax years, for payroll staff.
    getPayslipContent: b.query<ApiEnvelope<PayslipContent>, { entity: string; runId: number; lineId: number }>({
      query: ({ entity, runId, lineId }) => ({ url: `/finance/payroll-runs/${runId}/lines/${lineId}/payslip/${qs({ entity, output: "json" })}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    getSalaryTaxSummary: b.query<ApiEnvelope<TaxSummary>, OnSalary & { year?: number }>({
      query: ({ entity, salaryId, year }) => ({ url: `/finance/employee-salaries/${salaryId}/tax-summary/${qs({ entity, year })}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),

    // The people behind a payroll return, and the employer's annual PAYE return.
    getTaxFilingSchedule: b.query<ApiEnvelope<RemittanceSchedule>, OnRow>({
      query: ({ entity, id }) => ({ url: `/finance/tax-filings/${id}/schedule/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceTax", "FinancePayroll"],
    }),
    getAnnualPayeReturn: b.query<ApiEnvelope<AnnualPayeReturn>, { entity: string; year: number }>({
      query: (p) => ({ url: `/finance/payroll/annual-return/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceTax", "FinancePayroll"],
    }),

    // The payroll policy of a set of books; written only by a reader who covers the whole school.
    getFinancePayrollSettings: b.query<ApiEnvelope<FinancePayrollSettingsPayload>, { entity: string }>({
      query: ({ entity }) => ({ url: `/finance/settings/payroll/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceSettings"],
    }),
    updateFinancePayrollSettings: b.mutation<ApiEnvelope<FinancePayrollSettingsPayload>, { entity: string } & FinancePayrollSettingsBody>({
      query: ({ entity, ...body }) => ({ url: `/finance/settings/payroll/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceSettings", "FinanceAuditLog", "FinancePayroll"],
    }),

    // The signed-in person's own payslips and tax year. No payroll key needed.
    getMyPayslips: b.query<ApiEnvelope<MyPayslip[]>, void>({
      query: () => ({ url: "/finance/my-payslips/", method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    getMyPayslip: b.query<ApiEnvelope<PayslipContent>, { id: number }>({
      query: ({ id }) => ({ url: `/finance/my-payslips/${id}/`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    getMyTaxSummary: b.query<ApiEnvelope<TaxSummary[]>, { year: number }>({
      query: (p) => ({ url: `/finance/my-tax-summary/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
  }),
});

export const {
  useGetPayrollTaxStatesQuery,
  useGetPensionFundAdministratorsQuery,
  useGetSalaryHistoryQuery,
  useGetPayrollDeductionTypesQuery,
  useCreatePayrollDeductionTypeMutation,
  useUpdatePayrollDeductionTypeMutation,
  useGetEmployeeDeductionsQuery,
  useCreateEmployeeDeductionMutation,
  useUpdateEmployeeDeductionMutation,
  useStopEmployeeDeductionMutation,
  useGetPayBroughtForwardQuery,
  useCreatePayBroughtForwardMutation,
  useUpdatePayBroughtForwardMutation,
  useDeletePayBroughtForwardMutation,
  useGetPreviousPayMissingQuery,
  useGetPayslipContentQuery,
  useGetSalaryTaxSummaryQuery,
  useGetTaxFilingScheduleQuery,
  useGetAnnualPayeReturnQuery,
  useGetFinancePayrollSettingsQuery,
  useUpdateFinancePayrollSettingsMutation,
  useGetMyPayslipsQuery,
  useGetMyPayslipQuery,
  useGetMyTaxSummaryQuery,
} = payrollApi;
