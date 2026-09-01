// Accounts-Receivable RTK Query endpoints (vs_finance). Invoices + the AR
// adjustment documents and their lifecycle actions. Reads gate on *.view; each
// action gates on its own backend rbac_permission.

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope, Pagination } from "./api-types";
import type {
  ArAdjustment,
  SubmittedDocument,
  ArAdjustmentBatchInput,
  ArAdjustmentBatchResult,
  Concession,
  CreditNote,
  Customer,
  CustomerDetail,
  CustomerSummary,
  PaymentSummary,
  DunningNotice,
  DunningPolicy,
  DunningStage,
  DunningSummary,
  Payment,
  PaymentDetail,
  FeeStructure,
  Invoice,
  InvoiceDetail,
  InvoiceWriteOffResult,
  InvoiceListParams,
  InvoiceSummary,
  PaymentPlan,
  Refund,
  RefundAvailabilityCustomer,
  WriteOffRequest,
  DocumentDelivery,
  DocumentEmailPreview,
} from "./ar-types";

type EntityList = { entity: string; page?: number; status?: string; customer?: string };
type FeeLineInput = { code?: string; description: string; revenue_account: string; amount: number; tax_code?: string; is_optional?: boolean };
const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

export type VoidableArResource = "invoices" | "payments" | "credit-notes" | "refunds" | "concessions";

export const arApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Invoices
    getInvoices: builder.query<PaginatedEnvelope<Invoice>, InvoiceListParams>({
      query: (params) => ({ url: `/finance/invoices/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceInvoices"],
    }),
    getInvoiceSummary: builder.query<ApiEnvelope<InvoiceSummary>, { entity: string; search?: string }>({
      query: (params) => ({ url: `/finance/invoices/summary/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceInvoices"],
    }),
    getInvoiceDetail: builder.query<ApiEnvelope<InvoiceDetail>, { entity: string; id: number }>({
      query: ({ entity, id }) => ({ url: `/finance/invoices/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceInvoices"],
    }),
    createInvoice: builder.mutation<ApiEnvelope<Invoice>, {
      entity: string; customer: string | number; invoice_date: string; due_date?: string;
      reference?: string; narration?: string; post?: boolean;
      lines: { revenue_account: string | number; description?: string; quantity?: number; unit_price: number; tax_code?: string | number | null }[];
    }>({
      query: ({ entity, ...body }) => ({ url: `/finance/invoices/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceInvoices", "FinanceReports", "FinanceJournals"],
    }),
    // Backend keys: amount? · write_off_account? · write_off_date? · narration.
    writeOffInvoice: builder.mutation<ApiEnvelope<InvoiceWriteOffResult>, { id: number; entity: string; amount?: number; write_off_account?: string | number; write_off_date?: string; narration?: string; reason?: string }>({
      query: ({ id, entity, ...body }) => ({
        url: `/finance/invoices/${id}/write-off/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["FinanceInvoices", "FinanceReports", "FinanceJournals", "FinanceCustomers", "FinancePaymentPlans", "FinanceWriteOffs", "WorkflowPending", "WorkflowSubmissions"],
    }),
    recordPayment: builder.mutation<ApiEnvelope<Invoice>, {
      id: number; entity: string; amount: number; payment_date: string;
      method?: string; deposit_account: string | number; reference?: string; narration?: string;
    }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/invoices/${id}/pay/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceInvoices", "FinanceReports", "FinanceJournals", "FinancePaymentPlans"],
    }),
    remindInvoice: builder.mutation<ApiEnvelope<DunningNotice>, { id: number; entity: string; message?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/invoices/${id}/remind/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceInvoices", "FinanceDunning"],
    }),
    voidArDocument: builder.mutation<
      ApiEnvelope<Invoice | Payment | CreditNote | Refund | Concession>,
      { resource: VoidableArResource; id: number; entity: string; reversal_date?: string }
    >({
      query: ({ resource, id, entity, ...body }) => ({
        url: `/finance/${resource}/${id}/void/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: [
        "FinanceInvoices", "FinancePayments", "FinanceCreditNotes", "FinanceRefunds",
        "FinanceConcessions", "FinanceCustomers", "FinancePaymentPlans",
        "FinanceReports", "FinanceJournals",
      ],
    }),

    // Credit notes
    getCreditNotes: builder.query<PaginatedEnvelope<CreditNote>, EntityList & { kind?: string; search?: string }>({
      query: (params) => ({ url: `/finance/credit-notes/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceCreditNotes"],
    }),
    createCreditNote: builder.mutation<ApiEnvelope<CreditNote>, { entity: string; customer: string; kind: string; note_date: string; invoice?: number; reason?: string; reference?: string; lines: Record<string, unknown>[] }>({
      query: ({ entity, ...body }) => ({ url: `/finance/credit-notes/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceCreditNotes"],
    }),
    // Posting defaults to auto-allocating on the backend; pass auto_allocate:false
    // to leave the note "Issued" (unallocated) so applying stays an explicit step.
    submitCreditNote: builder.mutation<ApiEnvelope<SubmittedDocument<CreditNote>>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/credit-notes/${id}/submit/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceCreditNotes", "WorkflowPending", "WorkflowSubmissions"],
    }),
    postCreditNote: builder.mutation<ApiEnvelope<CreditNote>, { id: number; entity: string; auto_allocate?: boolean }>({
      query: ({ id, entity, ...body }) => ({
        url: `/finance/credit-notes/${id}/post/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["FinanceCreditNotes", "FinanceCustomers", "FinanceReports", "FinanceJournals", "FinanceInvoices", "FinancePaymentPlans"],
    }),
    // Backend reads `allocations` ([{invoice, amount}]) or `auto_allocate` (oldest-first).
    allocateCreditNote: builder.mutation<ApiEnvelope<CreditNote>, { id: number; entity: string; allocations?: { invoice: number; amount: number }[]; auto_allocate?: boolean }>({
      query: ({ id, entity, ...body }) => ({
        url: `/finance/credit-notes/${id}/allocate/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["FinanceCreditNotes", "FinanceCustomers", "FinanceInvoices", "FinanceReports", "FinanceJournals", "FinancePaymentPlans"],
    }),

    // Refunds
    getRefunds: builder.query<PaginatedEnvelope<Refund>, EntityList>({
      query: (params) => ({ url: `/finance/refunds/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceRefunds"],
    }),
    getRefundAvailability: builder.query<
      PaginatedEnvelope<RefundAvailabilityCustomer>,
      // `as_of` is the refund's accounting date. Credit that only arrives later
      // cannot fund a refund dated before it, so the picker must be asked for the
      // position on that date - otherwise it offers credit the post will refuse.
      { entity: string; page?: number; page_size?: number; search?: string; as_of?: string }
    >({
      query: (params) => ({ url: `/finance/refunds/availability/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceRefunds", "FinanceCustomers"],
    }),
    createRefund: builder.mutation<ApiEnvelope<Refund>, { entity: string; customer: string; refund_date: string; method?: string; amount: number; bank_account?: string | number; reference?: string; narration?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/refunds/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceRefunds"],
    }),
    postRefund: builder.mutation<ApiEnvelope<Refund>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({
        url: `/finance/refunds/${id}/post/${qs({ entity })}`,
        method: "POST",
      }),
      invalidatesTags: ["FinanceRefunds", "FinanceReports", "FinanceJournals", "FinanceCustomers"],
    }),
    submitRefund: builder.mutation<ApiEnvelope<SubmittedDocument<Refund>>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({
        url: `/finance/refunds/${id}/submit/${qs({ entity })}`,
        method: "POST",
      }),
      invalidatesTags: ["FinanceRefunds", "WorkflowPending", "WorkflowSubmissions"],
    }),
    // First-class bad-debt write-off requests.
    getWriteOffRequests: builder.query<PaginatedEnvelope<WriteOffRequest>, EntityList & { invoice?: string | number }>({
      query: (params) => ({ url: `/finance/write-offs/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceWriteOffs"],
    }),
    getWriteOffRequest: builder.query<ApiEnvelope<WriteOffRequest>, { entity: string; id: number }>({
      query: ({ entity, id }) => ({ url: `/finance/write-offs/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceWriteOffs"],
    }),
    createWriteOffRequest: builder.mutation<ApiEnvelope<WriteOffRequest>, {
      entity: string; invoice: string | number; amount?: number; write_off_account?: string | number;
      write_off_date?: string; narration?: string; reason?: string;
    }>({
      query: ({ entity, ...body }) => ({ url: `/finance/write-offs/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceWriteOffs"],
    }),
    postWriteOffRequest: builder.mutation<ApiEnvelope<WriteOffRequest>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/write-offs/${id}/post/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceWriteOffs", "FinanceInvoices", "FinanceReports", "FinanceJournals", "FinanceCustomers", "FinancePaymentPlans"],
    }),
    submitWriteOffRequest: builder.mutation<ApiEnvelope<SubmittedDocument<WriteOffRequest>>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/write-offs/${id}/submit/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceWriteOffs", "WorkflowPending", "WorkflowSubmissions"],
    }),
    // Unified refunds + write-offs, paginated, with KPI totals in the envelope.
    getArAdjustments: builder.query<
      { pagination: Pagination; kpis: { written_off_ytd: number; pending: number; refundable_credit: number }; data: ArAdjustment[] },
      { entity: string; type?: string; search?: string; page?: number }
    >({
      query: (params) => ({ url: `/finance/ar-adjustments/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceRefunds", "FinanceInvoices", "FinanceWriteOffs"],
    }),
    createArAdjustmentBatch: builder.mutation<
      ApiEnvelope<ArAdjustmentBatchResult>,
      ArAdjustmentBatchInput
    >({
      query: ({ entity, ...body }) => ({
        url: `/finance/ar-adjustments/batch/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: [
        "FinanceRefunds", "FinanceWriteOffs", "FinanceInvoices",
        "FinanceCustomers", "FinanceReports", "FinanceJournals",
        "FinancePaymentPlans", "WorkflowPending", "WorkflowSubmissions",
      ],
    }),

    // Concessions
    getConcessions: builder.query<PaginatedEnvelope<Concession>, EntityList & { kind?: string; search?: string }>({
      query: (params) => ({ url: `/finance/concessions/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceConcessions"],
    }),
    getConcessionSummary: builder.query<ApiEnvelope<{ posted_ytd: number; draft_pending: number; active_count: number }>, { entity: string }>({
      query: (params) => ({ url: `/finance/concessions/summary/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceConcessions"],
    }),
    createConcession: builder.mutation<ApiEnvelope<Concession>, { entity: string; customer: string; invoice?: string | number; kind: string; concession_date: string; amount: number; allowance_account?: string; reason?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/concessions/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceConcessions"],
    }),
    // At or above the tenant's adjustment threshold a concession must be submitted,
    // and `post` refuses. Below it, posting is still the ordinary route - read
    // `approval_required` off the document rather than guessing from the amount.
    submitConcession: builder.mutation<ApiEnvelope<SubmittedDocument<Concession>>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/concessions/${id}/submit/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceConcessions", "WorkflowPending", "WorkflowSubmissions"],
    }),
    postConcession: builder.mutation<ApiEnvelope<Concession>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/concessions/${id}/post/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceConcessions", "FinanceReports", "FinanceJournals", "FinanceInvoices"],
    }),

    // Payment plans (read + create + lifecycle)
    getPaymentPlans: builder.query<PaginatedEnvelope<PaymentPlan>, EntityList & { search?: string }>({
      query: (params) => ({ url: `/finance/payment-plans/${qs(params)}`, method: "GET" }),
      providesTags: ["FinancePaymentPlans"],
    }),
    createPaymentPlan: builder.mutation<ApiEnvelope<PaymentPlan>, { entity: string; customer: string; invoice?: number; start_date: string; frequency: string; installment_count: number; total_amount?: number; notes?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/payment-plans/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePaymentPlans"],
    }),
    activatePaymentPlan: builder.mutation<ApiEnvelope<PaymentPlan>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/payment-plans/${id}/activate/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinancePaymentPlans"],
    }),
    refreshPaymentPlan: builder.mutation<ApiEnvelope<PaymentPlan>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/payment-plans/${id}/refresh/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinancePaymentPlans"],
    }),
    cancelPaymentPlan: builder.mutation<ApiEnvelope<PaymentPlan>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/payment-plans/${id}/cancel/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinancePaymentPlans"],
    }),

    // Emailing a document to its customer. GET previews the recipients and returns
    // the delivery history; POST sends. Three documents, one shape, so the UI can
    // drive all of them through one component.
    getDocumentEmail: builder.query<
      ApiEnvelope<DocumentEmailPreview>,
      { kind: "invoices" | "payments"; id: number; entity: string } | { kind: "customers"; id: number | string; entity: string }
    >({
      query: ({ kind, id, entity }) => ({
        url: kind === "customers"
          ? `/finance/customers/${id}/statement-email/${qs({ entity })}`
          : `/finance/${kind}/${id}/email/${qs({ entity })}`,
        method: "GET",
      }),
      providesTags: ["FinanceDeliveries"],
    }),
    sendDocumentEmail: builder.mutation<
      ApiEnvelope<DocumentDelivery>,
      { kind: "invoices" | "payments" | "customers"; id: number | string; entity: string;
        note?: string; start?: string; end?: string }
    >({
      query: ({ kind, id, entity, ...body }) => ({
        url: kind === "customers"
          ? `/finance/customers/${id}/statement-email/${qs({ entity })}`
          : `/finance/${kind}/${id}/email/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["FinanceDeliveries"],
    }),
    retryDocumentEmail: builder.mutation<
      ApiEnvelope<DocumentDelivery>, { id: number; entity: string; note?: string }
    >({
      query: ({ id, entity, ...body }) => ({
        url: `/finance/document-deliveries/${id}/retry/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["FinanceDeliveries"],
    }),

    // Dunning notices + policies + cadence
    getDunningNotices: builder.query<PaginatedEnvelope<DunningNotice>, EntityList>({
      query: (params) => ({ url: `/finance/dunning-notices/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceDunning"],
    }),
    getDunningSummary: builder.query<ApiEnvelope<DunningSummary>, { entity: string }>({
      query: (params) => ({ url: `/finance/dunning/summary/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceDunning", "FinanceInvoices"],
    }),
    getDunningPolicies: builder.query<ApiEnvelope<DunningPolicy[]>, { entity: string }>({
      query: (params) => ({ url: `/finance/dunning-policies/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceDunning"],
    }),
    generateDunning: builder.mutation<ApiEnvelope<{ created: number }>, { entity: string; policy?: number; as_of?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/dunning/generate/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceDunning"],
    }),
    // Dispatches the notice over its stage's channels and flips it to SENT. The
    // notice carries the invoice it chases, so a send changes what the reminder
    // queue and the invoice's Reminders tab both show.
    sendDunningNotice: builder.mutation<ApiEnvelope<DunningNotice>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/dunning-notices/${id}/send/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinanceDunning", "FinanceInvoices"],
    }),
    cancelDunningNotice: builder.mutation<ApiEnvelope<DunningNotice>, { id: number; entity: string; reason?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/dunning-notices/${id}/cancel/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceDunning"],
    }),
    createDunningPolicy: builder.mutation<ApiEnvelope<DunningPolicy>, { entity: string; name: string; is_active?: boolean; is_default?: boolean; stages?: Omit<DunningStage, "id">[] }>({
      query: ({ entity, ...body }) => ({ url: `/finance/dunning-policies/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceDunning"],
    }),
    updateDunningPolicy: builder.mutation<ApiEnvelope<DunningPolicy>, { id: number; entity: string; name?: string; is_active?: boolean; is_default?: boolean; stages?: Omit<DunningStage, "id">[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/dunning-policies/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceDunning"],
    }),

    // Customers / payers (non-paginated, capped server-side; use toArray)
    getCustomers: builder.query<PaginatedEnvelope<Customer>, { entity: string; page?: number; page_size?: number; search?: string; is_active?: string; status?: string }>({
      query: (params) => ({ url: `/finance/customers/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceCustomers"],
    }),
    // Entity-wide KPI totals + status counts (accurate while the list paginates).
    getCustomerSummary: builder.query<ApiEnvelope<CustomerSummary>, { entity: string; search?: string; is_active?: string }>({
      query: (p) => ({ url: `/finance/customers/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceCustomers"],
    }),
    createCustomer: builder.mutation<ApiEnvelope<Customer>, { entity: string; name: string; billing_email: string; billing_phone: string; billing_address?: string; receivable_account?: string; opening_balance?: number; opening_date?: string; is_active?: boolean }>({
      query: ({ entity, ...body }) => ({ url: `/finance/customers/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceCustomers"],
    }),
    getCustomerDetail: builder.query<ApiEnvelope<CustomerDetail>, { entity: string; id: string | number }>({
      query: ({ entity, id }) => ({ url: `/finance/customers/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceCustomers"],
    }),
    updateCustomer: builder.mutation<ApiEnvelope<Customer>, { entity: string; id: string | number; name?: string; billing_email?: string; billing_phone?: string; billing_address?: string; receivable_account?: string; is_active?: boolean }>({
      query: ({ entity, id, ...body }) => ({ url: `/finance/customers/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceCustomers"],
    }),
    recordCustomerReceipt: builder.mutation<ApiEnvelope<{ id: number; payment: string; allocated: number; unallocated: number }>, { entity: string; id: string | number; amount: number; payment_date: string; method?: string; deposit_account: string | number; reference?: string; auto_allocate?: boolean; allocation_strategy?: string }>({
      query: ({ entity, id, ...body }) => ({ url: `/finance/customers/${id}/receipt/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceCustomers", "FinanceInvoices", "FinanceReports", "FinanceJournals", "FinancePayments", "FinancePaymentPlans"],
    }),
    getPayments: builder.query<PaginatedEnvelope<Payment>, { entity: string; page?: number; status?: string; method?: string; customer?: string; search?: string }>({
      query: (p) => ({ url: `/finance/payments/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayments"],
    }),
    // Entity-wide receipts KPI totals + allocation-status counts.
    getPaymentSummary: builder.query<ApiEnvelope<PaymentSummary>, { entity: string; method?: string; customer?: string; search?: string }>({
      query: (p) => ({ url: `/finance/payments/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePayments"],
    }),
    getPaymentDetail: builder.query<ApiEnvelope<PaymentDetail>, { entity: string; id: number }>({
      query: ({ entity, id }) => ({ url: `/finance/payments/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinancePayments"],
    }),
    // An allocation targets an invoice ({invoice}) or a posted DEBIT note ({debit_note}) -
    // both debit AR and are settled by a receipt.
    allocatePayment: builder.mutation<ApiEnvelope<Payment>, { entity: string; id: number; allocations?: ({ invoice: number; amount: number } | { debit_note: number; amount: number })[]; auto_allocate?: boolean; allocation_strategy?: string }>({
      query: ({ entity, id, ...body }) => ({ url: `/finance/payments/${id}/allocate/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePayments", "FinanceInvoices", "FinanceCustomers", "FinanceReports", "FinancePaymentPlans"],
    }),
    remindCustomer: builder.mutation<ApiEnvelope<{ created: number }>, { entity: string; customer: string | number }>({
      query: ({ entity, ...body }) => ({ url: `/finance/dunning/generate/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceCustomers", "FinanceDunning"],
    }),

    // Fee structures (non-paginated; use toArray)
    getFeeStructures: builder.query<ApiEnvelope<FeeStructure[]>, { entity: string; search?: string; is_active?: string; applies_to?: string }>({
      query: (params) => ({ url: `/finance/fee-structures/${qs(params)}`, method: "GET" }),
      providesTags: ["FinanceFeeStructures"],
    }),
    getFeeStructure: builder.query<ApiEnvelope<FeeStructure>, { id: string | number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/fee-structures/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceFeeStructures"],
    }),
    createFeeStructure: builder.mutation<ApiEnvelope<FeeStructure>, { entity: string; code: string; name: string; applies_to?: string; description?: string; is_active?: boolean; items: FeeLineInput[] }>({
      query: ({ entity, ...body }) => ({ url: `/finance/fee-structures/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceFeeStructures"],
    }),
    updateFeeStructure: builder.mutation<ApiEnvelope<FeeStructure>, { id: string | number; entity: string; name?: string; applies_to?: string; description?: string; is_active?: boolean; items?: FeeLineInput[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/fee-structures/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceFeeStructures"],
    }),
    duplicateFeeStructure: builder.mutation<ApiEnvelope<FeeStructure>, { id: string | number; entity: string; code: string; name?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/fee-structures/${id}/duplicate/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceFeeStructures"],
    }),
    generateFromFeeStructure: builder.mutation<ApiEnvelope<{ structure: string; generated: number; invoices: Invoice[] }>, { id: string | number; entity: string; customers?: (string | number)[]; all_active?: boolean; invoice_date?: string; due_date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/fee-structures/${id}/generate/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceFeeStructures", "FinanceInvoices"],
    }),
  }),
});

export const {
  useGetInvoicesQuery,
  useGetInvoiceSummaryQuery,
  useGetInvoiceDetailQuery,
  useCreateInvoiceMutation,
  useWriteOffInvoiceMutation,
  useRecordPaymentMutation,
  useRemindInvoiceMutation,
  useVoidArDocumentMutation,
  useGetCreditNotesQuery,
  useCreateCreditNoteMutation,
  usePostCreditNoteMutation,
  useSubmitCreditNoteMutation,
  useAllocateCreditNoteMutation,
  useGetRefundsQuery,
  useGetRefundAvailabilityQuery,
  useCreateRefundMutation,
  usePostRefundMutation,
  useSubmitRefundMutation,
  useGetWriteOffRequestsQuery,
  useGetWriteOffRequestQuery,
  useCreateWriteOffRequestMutation,
  usePostWriteOffRequestMutation,
  useSubmitWriteOffRequestMutation,
  useGetArAdjustmentsQuery,
  useCreateArAdjustmentBatchMutation,
  useGetConcessionsQuery,
  useGetConcessionSummaryQuery,
  useCreateConcessionMutation,
  usePostConcessionMutation,
  useSubmitConcessionMutation,
  useGetPaymentPlansQuery,
  useCreatePaymentPlanMutation,
  useActivatePaymentPlanMutation,
  useRefreshPaymentPlanMutation,
  useCancelPaymentPlanMutation,
  useGetDunningNoticesQuery,
  useGetDunningSummaryQuery,
  useGetDunningPoliciesQuery,
  useGenerateDunningMutation,
  useGetDocumentEmailQuery,
  useSendDocumentEmailMutation,
  useRetryDocumentEmailMutation,
  useSendDunningNoticeMutation,
  useCancelDunningNoticeMutation,
  useCreateDunningPolicyMutation,
  useUpdateDunningPolicyMutation,
  useGetCustomersQuery,
  useGetCustomerSummaryQuery,
  useCreateCustomerMutation,
  useGetCustomerDetailQuery,
  useUpdateCustomerMutation,
  useRecordCustomerReceiptMutation,
  useRemindCustomerMutation,
  useGetPaymentsQuery,
  useGetPaymentSummaryQuery,
  useGetPaymentDetailQuery,
  useAllocatePaymentMutation,
  useGetFeeStructuresQuery,
  useGetFeeStructureQuery,
  useCreateFeeStructureMutation,
  useUpdateFeeStructureMutation,
  useDuplicateFeeStructureMutation,
  useGenerateFromFeeStructureMutation,
} = arApi;
