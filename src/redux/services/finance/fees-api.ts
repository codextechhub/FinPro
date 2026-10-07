/**
 * RTK Query endpoints for the receivables work beside the invoice cycle (vs_finance).
 *
 * The receivables policy, deferred fee income, the doubtful-debt provision,
 * customer deposits, write-off recovery, credit transfers between customers,
 * optional fee item assignments, opening invoices, payer links and payments
 * from a payer. Every route is entity-scoped through `?entity=` and each one is
 * gated server-side on its own key; the screens gate the same keys so nobody is
 * offered an action the server refuses.
 *
 * The runs (release, reverse, provision, forfeit) act for every branch at once,
 * so the server refuses them to a reader whose reach is not the whole school.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "./api-types";
import type { CreditNote, Invoice, WriteOffRequest } from "./ar-types";
import type {
  CustomerCreditTransfer,
  CustomerDeposit,
  DeferredIncomeReleaseResult,
  DeferredIncomeReleaseRow,
  DeferredIncomeSummary,
  DepositForfeitResult,
  DepositStatus,
  DoubtfulDebtProvision,
  FeeItemAssignments,
  OpeningInvoiceRow,
  PayerLink,
  PayerPayment,
  PayerPaymentInput,
  PayerPaymentPlan,
  PayerPaymentSplitChoices,
  ReceivablesSettingsPayload,
  ReceivablesSettingsUpdate,
  SubmittedProvision,
  SubmittedTransfer,
  WriteOffRecoveryResult,
} from "./fees-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

/** Everything a posting that moves receivables can change on screen. */
const LEDGER_TAGS = ["FinanceReports", "FinanceJournals", "FinanceInvoices", "FinanceCustomers"] as const;

/** `?branch=`: one branch the reader works in, or the rows not yet given one. */
type BranchArg = { branch?: number | "unassigned" };

export const feesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Receivables policy (whole-school writes only)
    getReceivablesSettings: builder.query<ApiEnvelope<ReceivablesSettingsPayload>, { entity: string }>({
      query: ({ entity }) => ({ url: `/finance/settings/receivables/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceSettings"],
    }),
    updateReceivablesSettings: builder.mutation<
      ApiEnvelope<ReceivablesSettingsPayload>, { entity: string } & ReceivablesSettingsUpdate
    >({
      query: ({ entity, ...body }) => ({ url: `/finance/settings/receivables/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceSettings", "FinanceAuditLog"],
    }),

    // Deferred income
    getDeferredIncome: builder.query<ApiEnvelope<DeferredIncomeSummary>, { entity: string } & BranchArg>({
      query: (params) => ({ url: `/finance/deferred-income/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceDeferredIncome"],
    }),
    releaseDeferredIncome: builder.mutation<ApiEnvelope<DeferredIncomeReleaseResult>, { entity: string; up_to?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/deferred-income/release/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceDeferredIncome", "FinancePeriods", ...LEDGER_TAGS],
    }),
    getDeferredIncomeReleases: builder.query<
      PaginatedEnvelope<DeferredIncomeReleaseRow>,
      { entity: string; page?: number; page_size?: number; period?: number; month?: string; reversed?: "true" | "false" } & BranchArg
    >({
      query: (params) => ({ url: `/finance/deferred-income/releases/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceDeferredIncome"],
    }),
    reverseDeferredIncome: builder.mutation<ApiEnvelope<{ period: number; reversed: number }>, { entity: string; period: number }>({
      query: ({ entity, ...body }) => ({ url: `/finance/deferred-income/reverse/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceDeferredIncome", "FinancePeriods", ...LEDGER_TAGS],
    }),

    // Doubtful-debt provision
    getProvisions: builder.query<PaginatedEnvelope<DoubtfulDebtProvision>, { entity: string; page?: number; approval?: "returned" } & BranchArg>({
      query: (params) => ({ url: `/finance/provisions/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceProvisions"],
    }),
    createProvision: builder.mutation<ApiEnvelope<DoubtfulDebtProvision>, { entity: string; as_of: string; narration?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/provisions/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceProvisions"],
    }),
    submitProvision: builder.mutation<ApiEnvelope<SubmittedProvision>, { entity: string; id: number }>({
      query: ({ entity, id }) => ({ url: `/finance/provisions/${id}/submit/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceProvisions", "WorkflowPending", "WorkflowSubmissions"],
    }),
    postProvision: builder.mutation<ApiEnvelope<DoubtfulDebtProvision>, { entity: string; id: number }>({
      query: ({ entity, id }) => ({ url: `/finance/provisions/${id}/post/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceProvisions", ...LEDGER_TAGS],
    }),

    // Customer deposits
    getDeposits: builder.query<
      PaginatedEnvelope<CustomerDeposit>,
      { entity: string; page?: number; status?: DepositStatus; customer?: string } & BranchArg
    >({
      query: (params) => ({ url: `/finance/deposits/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceDeposits"],
    }),
    releaseDeposits: builder.mutation<ApiEnvelope<{ credit_notes: CreditNote[] }>, { entity: string; customer: string | number; offset?: boolean }>({
      query: ({ entity, ...body }) => ({ url: `/finance/deposits/release/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceDeposits", "FinanceCreditNotes", "FinanceRefunds", ...LEDGER_TAGS],
    }),
    forfeitDeposits: builder.mutation<ApiEnvelope<DepositForfeitResult>, { entity: string; as_of?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/deposits/forfeit/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceDeposits", ...LEDGER_TAGS],
    }),

    // Recovering a written-off debt from a later receipt
    recoverWriteOff: builder.mutation<
      ApiEnvelope<WriteOffRecoveryResult & { write_off: WriteOffRequest }>,
      { entity: string; id: number; payment: string | number; amount?: number }
    >({
      query: ({ entity, id, ...body }) => ({ url: `/finance/write-offs/${id}/recover/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceWriteOffs", "FinanceRefunds", "FinancePayments", ...LEDGER_TAGS],
    }),

    // Credit transfers between customers (always approval-gated)
    getCreditTransfers: builder.query<
      PaginatedEnvelope<CustomerCreditTransfer>, { entity: string; page?: number; status?: string; customer?: string; approval?: "returned" } & BranchArg
    >({
      query: (params) => ({ url: `/finance/credit-transfers/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceCreditTransfers"],
    }),
    createCreditTransfer: builder.mutation<ApiEnvelope<CustomerCreditTransfer>, {
      entity: string; from_customer: string; to_customer: string; amount: number;
      transfer_date: string; reason?: string; branch?: number;
    }>({
      query: ({ entity, ...body }) => ({ url: `/finance/credit-transfers/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceCreditTransfers"],
    }),
    submitCreditTransfer: builder.mutation<ApiEnvelope<SubmittedTransfer>, { entity: string; id: number }>({
      query: ({ entity, id }) => ({ url: `/finance/credit-transfers/${id}/submit/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceCreditTransfers", "WorkflowPending", "WorkflowSubmissions"],
    }),
    voidCreditTransfer: builder.mutation<ApiEnvelope<CustomerCreditTransfer>, { entity: string; id: number; reversal_date?: string }>({
      query: ({ entity, id, ...body }) => ({ url: `/finance/credit-transfers/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceCreditTransfers", "FinancePayments", ...LEDGER_TAGS],
    }),

    // Optional fee items: who takes them
    getFeeItemAssignments: builder.query<ApiEnvelope<FeeItemAssignments>, { entity: string; structure: string; item: number }>({
      query: ({ entity, structure, item }) => ({
        url: `/finance/fee-structures/${structure}/items/${item}/assignments/${qs({ entity })}`, method: "GET",
      }),
      providesTags: ["FinanceFeeAssignments"],
    }),
    assignFeeItem: builder.mutation<ApiEnvelope<FeeItemAssignments>, { entity: string; structure: string; item: number; customers: (string | number)[] }>({
      query: ({ entity, structure, item, customers }) => ({
        url: `/finance/fee-structures/${structure}/items/${item}/assignments/${qs({ entity })}`, method: "POST", body: { customers },
      }),
      invalidatesTags: ["FinanceFeeAssignments"],
    }),
    unassignFeeItem: builder.mutation<ApiEnvelope<FeeItemAssignments>, { entity: string; structure: string; item: number; customers: (string | number)[] }>({
      query: ({ entity, structure, item, customers }) => ({
        url: `/finance/fee-structures/${structure}/items/${item}/assignments/${qs({ entity })}`, method: "DELETE", body: { customers },
      }),
      invalidatesTags: ["FinanceFeeAssignments"],
    }),

    // Opening invoices carried in from before go-live, all or nothing
    importOpeningInvoices: builder.mutation<ApiEnvelope<Invoice[]>, { entity: string; invoices: OpeningInvoiceRow[] }>({
      query: ({ entity, invoices }) => ({ url: `/finance/customers/opening/${qs({ entity })}`, method: "POST", body: { invoices } }),
      invalidatesTags: [...LEDGER_TAGS],
    }),

    // Payer links
    getPayerLinks: builder.query<ApiEnvelope<PayerLink[]>, { entity: string; payer?: string | number; customer?: string | number; is_active?: "true" | "false" }>({
      query: (params) => ({ url: `/finance/payer-links/${qs(params)}`, method: "GET" }),
      providesTags: ["FinancePayerLinks"],
    }),
    createPayerLink: builder.mutation<ApiEnvelope<PayerLink>, { entity: string; payer: string | number; customer: string | number }>({
      query: ({ entity, ...body }) => ({ url: `/finance/payer-links/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayerLinks"],
    }),
    endPayerLink: builder.mutation<ApiEnvelope<PayerLink>, { entity: string; id: number }>({
      query: ({ entity, id }) => ({ url: `/finance/payer-links/${id}/${qs({ entity })}`, method: "DELETE" }),
      invalidatesTags: ["FinancePayerLinks"],
    }),

    // Payments from a payer
    getPayerPayments: builder.query<PaginatedEnvelope<PayerPayment>, { entity: string; page?: number; payer?: string; status?: string } & BranchArg>({
      query: (params) => ({ url: `/finance/payer-payments/${qs(params)}`, method: "GET" }),
      providesTags: ["FinancePayerPayments"],
    }),
    getPayerPayment: builder.query<ApiEnvelope<PayerPayment>, { entity: string; id: number }>({
      query: ({ entity, id }) => ({ url: `/finance/payer-payments/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinancePayerPayments"],
    }),
    // The choices the record form offers, readable by whoever may record: the
    // receivables settings are not, so the form never depends on them.
    getPayerPaymentSplitChoices: builder.query<ApiEnvelope<PayerPaymentSplitChoices>, { entity: string }>({
      query: ({ entity }) => ({ url: `/finance/payer-payments/preview/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceSettings"],
    }),
    // A POST that writes nothing: a mutation, so a changed amount asks again
    // rather than reading a cached split for the old one.
    previewPayerPayment: builder.mutation<ApiEnvelope<PayerPaymentPlan>, PayerPaymentInput>({
      query: ({ entity, ...body }) => ({ url: `/finance/payer-payments/preview/${qs({ entity })}`, method: "POST", body }),
    }),
    recordPayerPayment: builder.mutation<ApiEnvelope<PayerPayment>, PayerPaymentInput>({
      query: ({ entity, ...body }) => ({ url: `/finance/payer-payments/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayerPayments", "FinancePayments", "FinancePaymentPlans", ...LEDGER_TAGS],
    }),
    voidPayerPayment: builder.mutation<ApiEnvelope<PayerPayment>, { entity: string; id: number; date?: string }>({
      query: ({ entity, id, ...body }) => ({ url: `/finance/payer-payments/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayerPayments", "FinancePayments", "FinancePaymentPlans", ...LEDGER_TAGS],
    }),
  }),
});

export const {
  useGetReceivablesSettingsQuery,
  useUpdateReceivablesSettingsMutation,
  useGetDeferredIncomeQuery,
  useGetDeferredIncomeReleasesQuery,
  useReleaseDeferredIncomeMutation,
  useReverseDeferredIncomeMutation,
  useGetProvisionsQuery,
  useCreateProvisionMutation,
  useSubmitProvisionMutation,
  usePostProvisionMutation,
  useGetDepositsQuery,
  useReleaseDepositsMutation,
  useForfeitDepositsMutation,
  useRecoverWriteOffMutation,
  useGetCreditTransfersQuery,
  useCreateCreditTransferMutation,
  useSubmitCreditTransferMutation,
  useVoidCreditTransferMutation,
  useGetFeeItemAssignmentsQuery,
  useAssignFeeItemMutation,
  useUnassignFeeItemMutation,
  useImportOpeningInvoicesMutation,
  useGetPayerLinksQuery,
  useCreatePayerLinkMutation,
  useEndPayerLinkMutation,
  useGetPayerPaymentsQuery,
  useGetPayerPaymentQuery,
  useGetPayerPaymentSplitChoicesQuery,
  usePreviewPayerPaymentMutation,
  useRecordPayerPaymentMutation,
  useVoidPayerPaymentMutation,
} = feesApi;
