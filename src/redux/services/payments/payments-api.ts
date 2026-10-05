/**
 * vs_payments RTK Query endpoints (/v1/payments/). Receivable cash arrives by
 * confirming a Collection (verify), never by a "record receipt" form (spec §1.7).
 *   GET  /payments/collections/              payments.collection.view
 *   POST /payments/collections/              payments.collection.create
 *   GET  /payments/collections/{id}/?verify=1 confirm + book the receipt
 *   POST /payments/virtual-accounts/         payments.virtual_account.create
 *   GET  /payments/payouts/ , /payout-batches/  payments.payout.view (slice 6)
 *   GET/PATCH /payments/settings/custody/    payments.settings.view / .update (whole school)
 *   POST /payments/subaccounts/              payments.settings.update (whole school)
 *   POST /payments/settlements/              payments.settlement.create
 *   GET  /payments/held-settlements/         payments.report.view, narrowed to the reader's branches
 *   /payments/platform/...                   platform staff only, with no `entity`
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "@/redux/services/finance/api-types";
import type {
  BookSettlementPayload,
  BookedSettlement,
  Collection,
  CollectionSummary,
  CreatePayoutBatchPayload,
  CustodyPayload,
  HeldReconciliation,
  HeldSettlement,
  HeldSettlementStatus,
  InitiateCollectionPayload,
  InitiatePayoutPayload,
  Movement,
  MovementsSummary,
  PayoutBatch,
  PayoutBatchKpis,
  PayoutBatchSummary,
  PayoutInstruction,
  PayoutSummary,
  PlatformHeldSettlement,
  ProviderSettings,
  ProviderSweep,
  SaveSubaccountPayload,
  SavedSubaccount,
  SettlementReconciliation,
  TransactionLogEntry,
  UpdateCustodyPayload,
  VirtualAccount,
  VirtualAccountKpis,
  WebhookEvent,
  WebhookSummary,
} from "./payments-types";
import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

export const paymentsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCollections: builder.query<PaginatedEnvelope<Collection>, { entity: string; page?: number; group?: string; status?: string; provider?: string; virtual_account?: number }>({
      query: (p) => ({ url: `/payments/collections/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsCollections"],
    }),
    getCollectionsSummary: builder.query<ApiEnvelope<CollectionSummary>, { entity: string; provider?: string }>({
      query: (p) => ({ url: `/payments/collections/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsCollections"],
    }),
    initiateCollection: builder.mutation<ApiEnvelope<Collection>, InitiateCollectionPayload>({
      query: ({ entity, ...body }) => ({
        url: `/payments/collections/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["PaymentsCollections"],
    }),
    // ?verify=1 polls the PSP and books the receipt if settled.
    verifyCollection: builder.mutation<ApiEnvelope<Collection>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({
        url: `/payments/collections/${id}/${qs({ entity, verify: 1 })}`,
        method: "GET",
      }),
      invalidatesTags: ["PaymentsCollections", "FinanceInvoices", "FinanceReports"],
    }),

    getVirtualAccounts: builder.query<PaginatedEnvelope<VirtualAccount> & { kpis: VirtualAccountKpis }, { entity: string; page?: number; status?: string; provider?: string; search?: string }>({
      query: (p) => ({ url: `/payments/virtual-accounts/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsVirtualAccounts"],
    }),
    createVirtualAccount: builder.mutation<ApiEnvelope<VirtualAccount>, { entity: string; customer: string | number; provider?: string; deposit_account?: string; bank_code?: string }>({
      query: ({ entity, ...body }) => ({
        url: `/payments/virtual-accounts/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["PaymentsVirtualAccounts"],
    }),
    updateVirtualAccount: builder.mutation<ApiEnvelope<VirtualAccount>, { id: number; entity: string; status: string }>({
      query: ({ id, entity, ...body }) => ({
        url: `/payments/virtual-accounts/${id}/${qs({ entity })}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["PaymentsVirtualAccounts"],
    }),

    // Payouts (slice 6): paginated; KPIs + group counts come from the summary endpoint.
    getPayouts: builder.query<PaginatedEnvelope<PayoutInstruction>, { entity: string; page?: number; group?: string; status?: string; provider?: string }>({
      query: (p) => ({ url: `/payments/payouts/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsPayouts"],
    }),
    getPayoutsSummary: builder.query<ApiEnvelope<PayoutSummary>, { entity: string; provider?: string }>({
      query: (p) => ({ url: `/payments/payouts/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsPayouts"],
    }),
    // Initiate a single payout to a vendor; the provider transfer is requested
    // immediately (PROCESSING) and the ledger entry books on confirmation.
    initiatePayout: builder.mutation<ApiEnvelope<PayoutInstruction>, InitiatePayoutPayload>({
      query: ({ entity, ...body }) => ({
        url: `/payments/payouts/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["PaymentsPayouts", "PaymentsTransactions"],
    }),
    getPayoutBatches: builder.query<PaginatedEnvelope<PayoutBatchSummary>, { entity: string; page?: number; status?: string }>({
      query: (p) => ({ url: `/payments/payout-batches/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsPayoutBatches"],
    }),
    getPayoutBatchesSummary: builder.query<ApiEnvelope<PayoutBatchKpis>, { entity: string }>({
      query: (p) => ({ url: `/payments/payout-batches/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsPayoutBatches"],
    }),
    // Assemble a batch (DRAFT) of vendor payouts; pass submit:true to dispatch now.
    createPayoutBatch: builder.mutation<ApiEnvelope<PayoutBatch>, CreatePayoutBatchPayload>({
      query: ({ entity, ...body }) => ({
        url: `/payments/payout-batches/${qs({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["PaymentsPayoutBatches", "PaymentsPayouts", "PaymentsTransactions"],
    }),
    getPayoutBatch: builder.query<ApiEnvelope<PayoutBatch>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/payments/payout-batches/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["PaymentsPayoutBatches"],
    }),
    // POST the batch detail submits its pending instructions to the PSP directly.
    // Refused (400) once the batch is approval-gated - use submitPayoutBatchForApproval.
    submitPayoutBatch: builder.mutation<ApiEnvelope<PayoutBatch>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/payments/payout-batches/${id}/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["PaymentsPayoutBatches", "PaymentsPayouts"],
    }),
    // Route an approval-gated batch through vs_workflow; the PSP submission fires only
    // on final approval (handled in the workflow approvals inbox).
    // The response carries an `approval` block alongside the batch: it says whether
    // anybody can actually approve what was just submitted, so the screen can warn
    // when the batch has parked instead of letting it wait unnoticed.
    submitPayoutBatchForApproval: builder.mutation<
      ApiEnvelope<PayoutBatch & { approval?: ApprovalParkState }>, { id: number; entity: string }
    >({
      query: ({ id, entity }) => ({ url: `/payments/payout-batches/${id}/submit-for-approval/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["PaymentsPayoutBatches", "PaymentsPayouts", "WorkflowPending", "WorkflowSubmissions"],
    }),
    getSettlementReconciliation: builder.query<ApiEnvelope<SettlementReconciliation>, { entity: string; provider?: string; start_date?: string; end_date?: string }>({
      query: (p) => ({ url: `/payments/reports/settlement-reconciliation/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsCollections"],
    }),
    // Books a bank line as the settlement of the online payments it carries:
    // Dr bank (net), Dr bank charges (fee), Cr gateway clearing (gross).
    bookSettlement: builder.mutation<ApiEnvelope<BookedSettlement>, BookSettlementPayload>({
      query: ({ entity, ...body }) => ({ url: `/payments/settlements/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["PaymentsCollections", "FinanceStatementLines", "FinanceBankAccounts", "FinanceJournals", "FinanceReports"],
    }),

    getCustodySettings: builder.query<ApiEnvelope<CustodyPayload>, { entity: string }>({
      query: (p) => ({ url: `/payments/settings/custody/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsCustody"],
    }),
    updateCustodySettings: builder.mutation<ApiEnvelope<CustodyPayload>, UpdateCustodyPayload>({
      query: ({ entity, ...body }) => ({ url: `/payments/settings/custody/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["PaymentsCustody"],
    }),
    // Creates the branch collection account's provider subaccount, or points an
    // existing one at the account's current details.
    saveCollectionSubaccount: builder.mutation<ApiEnvelope<SavedSubaccount>, SaveSubaccountPayload>({
      query: ({ entity, ...body }) => ({ url: `/payments/subaccounts/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["PaymentsCustody", "FinanceBankAccounts"],
    }),

    // The school's own read-only list of what the platform has paid its branches.
    getHeldSettlements: builder.query<ApiEnvelope<HeldSettlement[]>, { entity: string; status?: HeldSettlementStatus; limit?: number }>({
      query: (p) => ({ url: `/payments/held-settlements/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsHeldSettlements"],
    }),

    // Platform scope (CodeX staff only): no `entity`, every school at once.
    getPlatformHeldSettlements: builder.query<ApiEnvelope<PlatformHeldSettlement[]>, { status?: HeldSettlementStatus; client?: string; limit?: number }>({
      query: (p) => ({ url: `/payments/platform/held-settlements/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsHeldSettlements"],
    }),
    submitPlatformHeldSettlement: builder.mutation<
      ApiEnvelope<PlatformHeldSettlement & { approval?: ApprovalParkState }>, { id: number }
    >({
      query: ({ id }) => ({ url: `/payments/platform/held-settlements/${id}/submit/`, method: "POST" }),
      invalidatesTags: ["PaymentsHeldSettlements", "WorkflowPending", "WorkflowSubmissions"],
    }),
    getPlatformHeldReconciliations: builder.query<ApiEnvelope<HeldReconciliation[]>, { agrees?: "true" | "false"; limit?: number }>({
      query: (p) => ({ url: `/payments/platform/held-reconciliations/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsHeldChecks"],
    }),
    getPlatformProviderSettings: builder.query<ApiEnvelope<ProviderSettings>, void>({
      query: () => ({ url: `/payments/platform/provider-settings/`, method: "GET" }),
      providesTags: ["PaymentsHeldChecks"],
    }),
    updatePlatformProviderSettings: builder.mutation<ApiEnvelope<ProviderSettings>, { balance_swept: boolean; reason: string }>({
      query: (body) => ({ url: `/payments/platform/provider-settings/`, method: "PATCH", body }),
      invalidatesTags: ["PaymentsHeldChecks"],
    }),
    getPlatformProviderSweeps: builder.query<ApiEnvelope<ProviderSweep[]>, { limit?: number }>({
      query: (p) => ({ url: `/payments/platform/provider-sweeps/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsHeldChecks"],
    }),
    // Append-only gateway action log (PaymentEvent), paginated.
    getTransactionsLog: builder.query<PaginatedEnvelope<TransactionLogEntry>, { entity: string; page?: number; action?: string; provider?: string; succeeded?: string }>({
      query: (p) => ({ url: `/payments/transactions/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsTransactions"],
    }),
    // Unified, paginated money-movement feed (collections in + payouts out) + its summary.
    getMovements: builder.query<PaginatedEnvelope<Movement>, { entity: string; page?: number; direction?: string; group?: string; provider?: string }>({
      query: (p) => ({ url: `/payments/movements/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsCollections", "PaymentsPayouts", "PaymentsHeldSettlements"],
    }),
    getMovementsSummary: builder.query<ApiEnvelope<MovementsSummary>, { entity: string; provider?: string }>({
      query: (p) => ({ url: `/payments/movements/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsCollections", "PaymentsPayouts", "PaymentsHeldSettlements"],
    }),
    // Inbound provider events that need an operator. Defaults to FAILED + IGNORED:
    // money has usually moved at the provider by the time one of these appears.
    getWebhookEvents: builder.query<PaginatedEnvelope<WebhookEvent>, { entity: string; page?: number; status?: string; provider?: string; search?: string }>({
      query: (p) => ({ url: `/payments/webhooks/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsWebhooks"],
    }),
    getWebhookSummary: builder.query<ApiEnvelope<WebhookSummary>, { entity: string }>({
      query: (p) => ({ url: `/payments/webhooks/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsWebhooks"],
    }),
    // Re-runs the stored event. Booking a receipt touches collections and the
    // finance ledger, so invalidate those too.
    replayWebhookEvent: builder.mutation<ApiEnvelope<WebhookEvent>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({
        url: `/payments/webhooks/${id}/replay/${qs({ entity })}`, method: "POST",
      }),
      invalidatesTags: ["PaymentsWebhooks", "PaymentsCollections", "PaymentsTransactions"],
    }),

    // Platform scope (CX staff only), so deliberately NO `entity` parameter: these are
    // the events that matched neither a collection nor a payout, which is exactly why
    // they have no entity to be scoped by. The backend gates both on the caller's home
    // tenant being the platform one plus a dedicated permission key.
    getUnattributedWebhooks: builder.query<PaginatedEnvelope<WebhookEvent>, { page?: number; status?: string; provider?: string; search?: string }>({
      query: (p) => ({ url: `/payments/webhooks/unattributed/${qs(p)}`, method: "GET" }),
      providesTags: ["PaymentsWebhooks"],
    }),
    // A replay that succeeds books a receipt into some tenant's ledger, so the same
    // collection/ledger caches are invalidated as for the entity-scoped replay.
    replayUnattributedWebhook: builder.mutation<ApiEnvelope<WebhookEvent>, { id: number }>({
      query: ({ id }) => ({
        url: `/payments/webhooks/unattributed/${id}/replay/`, method: "POST",
      }),
      invalidatesTags: ["PaymentsWebhooks", "PaymentsCollections", "PaymentsTransactions"],
    }),
  }),
});

export const {
  useGetCollectionsQuery,
  useGetCollectionsSummaryQuery,
  useInitiateCollectionMutation,
  useVerifyCollectionMutation,
  useGetVirtualAccountsQuery,
  useCreateVirtualAccountMutation,
  useUpdateVirtualAccountMutation,
  useGetPayoutsQuery,
  useGetPayoutsSummaryQuery,
  useInitiatePayoutMutation,
  useGetPayoutBatchesQuery,
  useGetPayoutBatchesSummaryQuery,
  useCreatePayoutBatchMutation,
  useGetPayoutBatchQuery,
  useSubmitPayoutBatchMutation,
  useSubmitPayoutBatchForApprovalMutation,
  useGetMovementsQuery,
  useGetMovementsSummaryQuery,
  useGetSettlementReconciliationQuery,
  useBookSettlementMutation,
  useGetCustodySettingsQuery,
  useUpdateCustodySettingsMutation,
  useSaveCollectionSubaccountMutation,
  useGetHeldSettlementsQuery,
  useGetPlatformHeldSettlementsQuery,
  useSubmitPlatformHeldSettlementMutation,
  useGetPlatformHeldReconciliationsQuery,
  useGetPlatformProviderSettingsQuery,
  useUpdatePlatformProviderSettingsMutation,
  useGetPlatformProviderSweepsQuery,
  useGetTransactionsLogQuery,
  useGetWebhookEventsQuery,
  useGetWebhookSummaryQuery,
  useReplayWebhookEventMutation,
  useGetUnattributedWebhooksQuery,
  useReplayUnattributedWebhookMutation,
} = paymentsApi;
