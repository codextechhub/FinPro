/**
 * Payroll approval, payment through the provider, and staff bank accounts
 * (`vs_finance.views_ops.payroll` and `.staff_bank`).
 *
 *   POST  payroll-runs/{id}/submit/                           finance.payrollrun.submit
 *   PATCH payroll-runs/{id}/                                  finance.payrollrun.create (period label, narration)
 *   GET   payroll-runs/{id}/payments/                         finance.payrollrun.view
 *   POST  payroll-runs/{id}/payments/retry/                   finance.payrollrun.pay
 *   POST  payroll-runs/{id}/payments/record-paid-from-bank/   finance.payrollrun.pay
 *   GET   staff-bank-accounts/ , /banks/ , /{employee}/       finance.staff_bank.view
 *   GET   staff-bank-accounts/missing/                        finance.staff_bank.update (staff with no account)
 *   POST  staff-bank-accounts/{employee}/                     finance.staff_bank.update (adds; 409 when one exists)
 *   PUT   staff-bank-accounts/{employee}/                     finance.staff_bank.update (edits; 404 when none)
 *   POST  staff-bank-accounts/{employee}/verify/              finance.staff_bank.update
 *   POST  staff-bank-accounts/{employee}/confirm/             finance.staff_bank.confirm
 *
 * Paying a run through the provider uses the run's ordinary pay route
 * (`usePayPayrollRunMutation`), which sends it instead of taking a bank account
 * when the school's payment route is the provider.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";
import type { ApiEnvelope, PaginatedEnvelope } from "./api-types";
import type { PayrollRun } from "./ops-types";
import type {
  PayrollPayments,
  ProviderBank,
  StaffBankAccount,
  StaffBankAccountBody,
  StaffWithoutBankAccount,
} from "./payroll-paystack-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

/** A payroll run with the payment progress a pay, retry or record-from-bank answer carries. */
export type PayrollRunWithPayments = PayrollRun & { payments?: PayrollPayments };

export const payrollPaystackApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    submitPayrollRun: b.mutation<ApiEnvelope<PayrollRun & { approval?: ApprovalParkState }>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/payroll-runs/${id}/submit/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinancePayroll", "WorkflowPending", "WorkflowSubmissions"],
    }),
    correctPayrollRun: b.mutation<ApiEnvelope<PayrollRun>, { id: number; entity: string; period_label?: string; narration?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/payroll-runs/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinancePayroll"],
    }),
    getPayrollRunPayments: b.query<ApiEnvelope<PayrollPayments>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/payroll-runs/${id}/payments/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinancePayroll"],
    }),
    retryPayrollPayments: b.mutation<ApiEnvelope<PayrollRunWithPayments>, { id: number; entity: string; line_ids?: number[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/payroll-runs/${id}/payments/retry/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayroll", "FinanceJournals", "PaymentsPayouts", "PaymentsPayoutBatches"],
    }),
    recordPayrollLinesPaidFromBank: b.mutation<
      ApiEnvelope<PayrollRunWithPayments>,
      { id: number; entity: string; line_ids: number[]; bank_account: number; pay_date?: string }
    >({
      query: ({ id, entity, ...body }) => ({ url: `/finance/payroll-runs/${id}/payments/record-paid-from-bank/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayroll", "FinanceJournals", "FinanceReports", "FinanceBankAccounts"],
    }),

    getStaffBankAccounts: b.query<PaginatedEnvelope<StaffBankAccount>, { entity: string; page?: number; page_size?: number; state?: string }>({
      query: (p) => ({ url: `/finance/staff-bank-accounts/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceStaffBank"],
    }),
    getStaffBankBanks: b.query<ApiEnvelope<ProviderBank[]>, { entity: string }>({
      query: (p) => ({ url: `/finance/staff-bank-accounts/banks/${qs(p)}`, method: "GET" }),
    }),
    getStaffWithoutBankAccount: b.query<PaginatedEnvelope<StaffWithoutBankAccount>, { entity: string; page?: number; page_size?: number; search?: string }>({
      query: (p) => ({ url: `/finance/staff-bank-accounts/missing/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceStaffBank"],
    }),
    addStaffBankAccount: b.mutation<ApiEnvelope<StaffBankAccount>, { entity: string; employee: number } & StaffBankAccountBody>({
      query: ({ entity, employee, ...body }) => ({ url: `/finance/staff-bank-accounts/${employee}/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceStaffBank"],
    }),
    saveStaffBankAccount: b.mutation<ApiEnvelope<StaffBankAccount>, { entity: string; employee: number } & StaffBankAccountBody>({
      query: ({ entity, employee, ...body }) => ({ url: `/finance/staff-bank-accounts/${employee}/${qs({ entity })}`, method: "PUT", body }),
      invalidatesTags: ["FinanceStaffBank"],
    }),
    verifyStaffBankAccount: b.mutation<ApiEnvelope<StaffBankAccount>, { entity: string; employee: number }>({
      query: ({ entity, employee }) => ({ url: `/finance/staff-bank-accounts/${employee}/verify/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceStaffBank"],
    }),
    confirmStaffBankAccount: b.mutation<ApiEnvelope<StaffBankAccount>, { entity: string; employee: number }>({
      query: ({ entity, employee }) => ({ url: `/finance/staff-bank-accounts/${employee}/confirm/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceStaffBank"],
    }),
  }),
});

export const {
  useSubmitPayrollRunMutation,
  useCorrectPayrollRunMutation,
  useGetPayrollRunPaymentsQuery,
  useRetryPayrollPaymentsMutation,
  useRecordPayrollLinesPaidFromBankMutation,
  useGetStaffBankAccountsQuery,
  useGetStaffBankBanksQuery,
  useGetStaffWithoutBankAccountQuery,
  useAddStaffBankAccountMutation,
  useSaveStaffBankAccountMutation,
  useVerifyStaffBankAccountMutation,
  useConfirmStaffBankAccountMutation,
} = payrollPaystackApi;
