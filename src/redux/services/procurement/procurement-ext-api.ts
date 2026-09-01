// vs_procurement extended: sourcing (RFQ + quotations), contracts, inventory
// (stock + movements) and analytics reports (§7.3–7.5).

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "../finance/api-types";
import type {
  ContractLinkedPo,
  ContractSummary,
  Quotation,
  QuotationDetail,
  Rfq,
  RfqDetail,
  RfqSummary,
  StockBalance,
  StockItem,
  StockItemDetail,
  StockLocation,
  StockMovement,
  StockSummary,
  VendorContract,
} from "./procurement-types";
import type {
  ApAging,
  ApCashRequirements,
  ApReconciliation,
  ApVendorDetail,
  GrirAging,
  GrirBalance,
  GrirGrnDetail,
  GrirPoLineDetail,
  GrirPoLines,
  ProcurementDashboard,
  ProcurementApprovalDetail,
  ProcurementApprovalRow,
  SpendAnalysis,
  VendorAssessment,
  VendorAssessmentInput,
  VendorPerformance,
} from "./procurement-ext-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);
type E = { entity: string; page?: number; status?: string };
type Act = { id: number; entity: string };

export const procurementExtApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Approvals - entity-safe adapters over the shared vs_workflow engine.
    getProcurementApprovals: b.query<PaginatedEnvelope<ProcurementApprovalRow>, { entity: string; page?: number; search?: string; document_type?: string }>({
      query: (p) => ({ url: `/procurement/approvals/${qs(p)}`, method: "GET" }),
      providesTags: ["WorkflowPending"],
    }),
    getProcurementApproval: b.query<ApiEnvelope<ProcurementApprovalDetail>, { id: string; entity: string }>({
      query: ({ id, entity }) => ({ url: `/procurement/approvals/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["WorkflowInstances"],
    }),
    recordProcurementApprovalAction: b.mutation<ApiEnvelope<{ id: string; status: string; current_stage_label: string | null }>, { id: string; entity: string; action: "APPROVED" | "REJECTED" | "RETURNED"; comment?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/approvals/${id}/actions/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [
        "WorkflowPending", "WorkflowInstances", "WorkflowSubmissions", "WorkflowTeamLoad",
        "ProcRequisitions", "ProcPurchaseOrders", "ProcVendorInvoices", "ProcVendorPayments",
      ],
    }),

    // Contracts
    getContracts: b.query<PaginatedEnvelope<VendorContract>, E & { vendor?: string; q?: string; expiring?: number; status?: string }>({
      query: (p) => ({ url: `/procurement/contracts/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcContracts"],
    }),
    getContract: b.query<ApiEnvelope<VendorContract>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/contracts/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcContracts"],
    }),
    getContractsSummary: b.query<ApiEnvelope<ContractSummary>, { entity: string }>({
      query: (p) => ({ url: `/procurement/contracts/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcContracts"],
    }),
    getContractLinkedPos: b.query<ApiEnvelope<ContractLinkedPo[]>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/contracts/${id}/linked-pos/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcContracts"],
    }),
    createContract: b.mutation<ApiEnvelope<VendorContract>, { entity: string; title: string; vendor: string; reference?: string; start_date?: string; end_date?: string; contract_value?: number; payment_terms?: string; auto_renew?: boolean; renewal_notice_days?: number; notes?: string; milestones?: Record<string, unknown>[] }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/contracts/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcContracts"],
    }),
    updateContract: b.mutation<ApiEnvelope<VendorContract>, { id: number; entity: string; title?: string; start_date?: string | null; end_date?: string | null; contract_value?: number; payment_terms?: string; auto_renew?: boolean; renewal_notice_days?: number; notes?: string; milestones?: Record<string, unknown>[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/contracts/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcContracts"],
    }),
    activateContract: b.mutation<ApiEnvelope<VendorContract>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/contracts/${id}/activate/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["ProcContracts"],
    }),
    renewContract: b.mutation<ApiEnvelope<VendorContract>, Act & { reference?: string; start_date: string; end_date: string; contract_value?: number; copy_milestones?: boolean }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/contracts/${id}/renew/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcContracts"],
    }),
    terminateContract: b.mutation<ApiEnvelope<VendorContract>, Act & { reason?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/contracts/${id}/terminate/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcContracts"],
    }),
    completeMilestone: b.mutation<ApiEnvelope<VendorContract>, { id: number; entity: string; milestoneId: number; completed_date?: string }>({
      query: ({ id, entity, milestoneId, ...body }) => ({ url: `/procurement/contracts/${id}/milestones/${milestoneId}/complete/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcContracts"],
    }),

    // RFQs
    getRfqs: b.query<PaginatedEnvelope<Rfq>, E & { q?: string }>({
      query: (p) => ({ url: `/procurement/rfqs/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcRfqs"],
    }),
    getRfq: b.query<ApiEnvelope<RfqDetail>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/rfqs/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcRfqs"],
    }),
    getRfqSummary: b.query<ApiEnvelope<RfqSummary>, { entity: string }>({
      query: (p) => ({ url: `/procurement/rfqs/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcRfqs"],
    }),
    createRfq: b.mutation<ApiEnvelope<RfqDetail>, { entity: string; title?: string; issue_date: string; response_due_date?: string; budget_estimate?: number | null; invited_vendors?: string[]; notes?: string; lines: Record<string, unknown>[] }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/rfqs/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcRfqs"],
    }),
    updateRfq: b.mutation<ApiEnvelope<RfqDetail>, { id: number; entity: string; title?: string; issue_date?: string; response_due_date?: string; budget_estimate?: number | null; invited_vendors?: string[]; notes?: string; lines?: Record<string, unknown>[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/rfqs/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcRfqs"],
    }),
    issueRfq: b.mutation<ApiEnvelope<RfqDetail>, Act & { competition_exception_reason?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/rfqs/${id}/issue/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcRfqs"],
    }),
    closeRfq: b.mutation<ApiEnvelope<RfqDetail>, Act & { reason?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/rfqs/${id}/close/${qs({ entity })}`, method: "POST", body }),
      // Closing rejects the RFQ's live quotations, so refresh the quotation lists too.
      invalidatesTags: ["ProcRfqs", "ProcQuotations"],
    }),
    cancelRfq: b.mutation<ApiEnvelope<RfqDetail>, Act & { reason?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/rfqs/${id}/cancel/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcRfqs", "ProcQuotations"],
    }),
    resendRfqInvitation: b.mutation<ApiEnvelope<null>, Act & { invitationId: number }>({
      query: ({ id, entity, invitationId }) => ({ url: `/procurement/rfqs/${id}/invitations/${invitationId}/resend/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["ProcRfqs"],
    }),
    extendRfqInvitation: b.mutation<ApiEnvelope<{ deadline: string; deadline_display: string }>, Act & { invitationId: number; deadline: string }>({
      query: ({ id, entity, invitationId, deadline }) => ({ url: `/procurement/rfqs/${id}/invitations/${invitationId}/extend/${qs({ entity })}`, method: "POST", body: { deadline } }),
      invalidatesTags: ["ProcRfqs"],
    }),
    createRfqAmendment: b.mutation<ApiEnvelope<RfqDetail>, Act & { summary: string; response_required: boolean; deadline?: string; lines?: Record<string, unknown>[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/rfqs/${id}/amendments/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcRfqs", "ProcQuotations"],
    }),

    // Quotations
    getQuotations: b.query<PaginatedEnvelope<Quotation>, E & { rfq?: string; vendor?: string; q?: string }>({
      query: (p) => ({ url: `/procurement/quotations/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcQuotations"],
    }),
    getQuotation: b.query<ApiEnvelope<QuotationDetail>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/quotations/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcQuotations"],
    }),
    createQuotation: b.mutation<ApiEnvelope<QuotationDetail>, { entity: string; rfq: number; vendor: string; quote_date: string; valid_until?: string; lead_time_days?: number; reference?: string; notes?: string; lines: Record<string, unknown>[] }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/quotations/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcQuotations"],
    }),
    updateQuotation: b.mutation<ApiEnvelope<QuotationDetail>, { id: number; entity: string; quote_date?: string; valid_until?: string; lead_time_days?: number; reference?: string; notes?: string; lines?: Record<string, unknown>[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/quotations/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcQuotations"],
    }),
    submitQuotation: b.mutation<ApiEnvelope<QuotationDetail>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/quotations/${id}/submit/${qs({ entity })}`, method: "POST" }),
      // A submitted quote becomes a "response" the RFQ list counts, so refresh RFQs too.
      invalidatesTags: ["ProcQuotations", "ProcRfqs"],
    }),
    awardQuotation: b.mutation<ApiEnvelope<Quotation>, Act & { competition_exception_reason?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/quotations/${id}/award/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcQuotations", "ProcRfqs", "ProcPurchaseOrders"],
    }),

    // Inventory - stock locations
    // Ordered default-first then by code by the server, so the first active row is
    // the entity's default without a second pass.
    getStockLocations: b.query<PaginatedEnvelope<StockLocation>, { entity: string; page?: number; page_size?: number; is_active?: string }>({
      query: (p) => ({ url: `/procurement/stock-locations/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcStockLocations"],
    }),
    createStockLocation: b.mutation<ApiEnvelope<StockLocation>, {
      entity: string; code: string; name: string; description?: string;
      // Branch id or branch code; omit entirely for an entity-wide store.
      branch?: string | number; is_default?: boolean; is_active?: boolean;
    }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/stock-locations/${qs({ entity })}`, method: "POST", body }),
      // Creating a default moves the flag off the previous one, so the whole list
      // is stale, not just the new row.
      invalidatesTags: ["ProcStockLocations"],
    }),
    updateStockLocation: b.mutation<ApiEnvelope<StockLocation>, {
      id: number; entity: string; name?: string; description?: string;
      branch?: string | number | null; is_default?: boolean; is_active?: boolean;
    }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/stock-locations/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcStockLocations"],
    }),
    // held_only=true hides rows that are zero quantity *and* zero value.
    getStockBalances: b.query<PaginatedEnvelope<StockBalance>, {
      entity: string; page?: number; page_size?: number;
      stock_item?: string | number; location?: string | number; held_only?: string;
    }>({
      query: (p) => ({ url: `/procurement/stock-balances/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcStock", "ProcStockLocations"],
    }),

    // Inventory
    getStockItems: b.query<PaginatedEnvelope<StockItem>, E & { q?: string; needs_reorder?: string }>({
      query: (p) => ({ url: `/procurement/stock-items/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcStock"],
    }),
    getStockItem: b.query<ApiEnvelope<StockItemDetail>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/stock-items/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcStock"],
    }),
    getStockSummary: b.query<ApiEnvelope<StockSummary>, { entity: string; location?: string | number }>({
      query: (p) => ({ url: `/procurement/stock-items/summary/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcStock"],
    }),
    createStockItem: b.mutation<ApiEnvelope<StockItemDetail>, { entity: string; code?: string; name: string; description?: string; unit_of_measure?: string; catalog_item?: string; inventory_account: string; default_expense_account?: string; reorder_level?: number; reorder_qty?: number; is_active?: boolean }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/stock-items/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcStock"],
    }),
    updateStockItem: b.mutation<ApiEnvelope<StockItemDetail>, { id: number; entity: string; name?: string; description?: string; unit_of_measure?: string; catalog_item?: string | null; inventory_account?: string; default_expense_account?: string | null; reorder_level?: number; reorder_qty?: number; is_active?: boolean }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/stock-items/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcStock"],
    }),
    // Issue posts a real journal (Dr expense · Cr inventory) - refresh finance journals too.
    // `location` (id or code) is optional with one active location and REQUIRED with
    // more than one: the server refuses a movement that names none rather than
    // silently drawing from the default store.
    issueStock: b.mutation<ApiEnvelope<{ movement: StockMovement; stock_item: StockItemDetail }>, { id: number; entity: string; quantity: number; location?: string | number; movement_date?: string; expense_account?: string; reference?: string; narration?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/stock-items/${id}/issue/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcStock", "FinanceJournals"],
    }),
    // Adjust posts a real journal (write-up or shrinkage) - refresh finance journals too.
    adjustStock: b.mutation<ApiEnvelope<{ movement: StockMovement; stock_item: StockItemDetail }>, { id: number; entity: string; quantity_delta: number; location?: string | number; movement_date?: string; unit_cost?: number; adjustment_account?: string; reference?: string; narration?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/stock-items/${id}/adjust/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcStock", "FinanceJournals"],
    }),
    getStockMovements: b.query<PaginatedEnvelope<StockMovement>, { entity: string; page?: number; stock_item?: string; movement_type?: string; location?: string | number }>({
      query: (p) => ({ url: `/procurement/stock-movements/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcStock"],
    }),
    // With no `location` the numbers are identical to the pre-location reports.
    // Both reports paginate `rows` while keeping the report object in `data`.

    // Analytics reports
    getProcurementDashboard: b.query<ApiEnvelope<ProcurementDashboard>, { entity: string }>({
      query: (p) => ({ url: `/procurement/reports/dashboard/${qs(p)}`, method: "GET" }),
      providesTags: [
        "ProcVendors", "ProcContracts", "ProcRequisitions", "ProcPurchaseOrders",
        "ProcGoodsReceipts", "ProcVendorInvoices", "ProcVendorPayments", "ProcStock",
        "WorkflowPending",
      ],
    }),
    getApAging: b.query<ApiEnvelope<ApAging>, { entity: string; as_of?: string }>({
      query: (p) => ({ url: `/procurement/reports/ap-aging/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcStock"],
    }),
    getApReconciliation: b.query<ApiEnvelope<ApReconciliation>, { entity: string; as_of?: string }>({
      query: (p) => ({ url: `/procurement/reports/ap-reconciliation/${qs(p)}`, method: "GET" }),
    }),
    getApCashRequirements: b.query<ApiEnvelope<ApCashRequirements>, { entity: string; as_of?: string }>({
      query: (p) => ({ url: `/procurement/reports/ap-cash-requirements/${qs(p)}`, method: "GET" }),
    }),
    getGrirBalance: b.query<ApiEnvelope<GrirBalance>, { entity: string }>({
      query: (p) => ({ url: `/procurement/reports/grir/${qs(p)}`, method: "GET" }),
    }),
    getGrirAging: b.query<ApiEnvelope<GrirAging>, { entity: string; as_of?: string }>({
      query: (p) => ({ url: `/procurement/reports/grir-aging/${qs(p)}`, method: "GET" }),
    }),
    // GR/IR at the PO-line grain (feeds the GR/IR table + its per-line drawer).
    getGrirPoLines: b.query<ApiEnvelope<GrirPoLines>, { entity: string; as_of?: string }>({
      query: (p) => ({ url: `/procurement/reports/grir-lines/${qs(p)}`, method: "GET" }),
    }),
    getGrirPoLineDetail: b.query<ApiEnvelope<GrirPoLineDetail>, { entity: string; po_line: number; as_of?: string }>({
      query: (p) => ({ url: `/procurement/reports/grir-lines/detail/${qs(p)}`, method: "GET" }),
    }),
    getSpendAnalysis: b.query<ApiEnvelope<SpendAnalysis>, { entity: string; start_date?: string; end_date?: string; category?: string }>({
      query: (p) => ({ url: `/procurement/reports/spend-analysis/${qs(p)}`, method: "GET" }),
    }),
    getVendorPerformance: b.query<ApiEnvelope<VendorPerformance>, { entity: string; start_date?: string; end_date?: string }>({
      query: (p) => ({ url: `/procurement/reports/vendor-performance/${qs(p)}`, method: "GET" }),
      // Refetch when a new assessment lands so the scorecard columns stay live.
      providesTags: ["ProcVendorAssessments"],
    }),
    // Report-drawer detail endpoints - all report.view-gated.
    getApAgingVendor: b.query<ApiEnvelope<ApVendorDetail>, { entity: string; vendor: string; as_of?: string }>({
      query: (p) => ({ url: `/procurement/reports/ap-aging/vendor/${qs(p)}`, method: "GET" }),
    }),
    getGrirGrnDetail: b.query<ApiEnvelope<GrirGrnDetail>, { entity: string; grn: number; as_of?: string }>({
      query: (p) => ({ url: `/procurement/reports/grir-aging/grn/${qs(p)}`, method: "GET" }),
    }),

    // Vendor assessments - list rides report.view; create needs vendor_assessment.create.
    getVendorAssessments: b.query<ApiEnvelope<VendorAssessment[]>, { entity: string; vendor?: string }>({
      query: (p) => ({ url: `/procurement/vendor-assessments/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcVendorAssessments"],
    }),
    createVendorAssessment: b.mutation<ApiEnvelope<VendorAssessment>, VendorAssessmentInput>({
      query: ({ entity, ...body }) => ({ url: `/procurement/vendor-assessments/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcVendorAssessments"],
    }),
  }),
});

export const {
  useGetProcurementApprovalsQuery,
  useGetProcurementApprovalQuery,
  useRecordProcurementApprovalActionMutation,
  useGetContractsQuery,
  useGetContractQuery,
  useGetContractsSummaryQuery,
  useGetContractLinkedPosQuery,
  useCreateContractMutation,
  useUpdateContractMutation,
  useActivateContractMutation,
  useRenewContractMutation,
  useTerminateContractMutation,
  useCompleteMilestoneMutation,
  useGetRfqsQuery,
  useGetRfqQuery,
  useGetRfqSummaryQuery,
  useCreateRfqMutation,
  useUpdateRfqMutation,
  useIssueRfqMutation,
  useCloseRfqMutation,
  useCancelRfqMutation,
  useResendRfqInvitationMutation,
  useExtendRfqInvitationMutation,
  useCreateRfqAmendmentMutation,
  useGetQuotationsQuery,
  useGetQuotationQuery,
  useCreateQuotationMutation,
  useUpdateQuotationMutation,
  useSubmitQuotationMutation,
  useAwardQuotationMutation,
  useGetStockLocationsQuery,
  useCreateStockLocationMutation,
  useUpdateStockLocationMutation,
  useGetStockBalancesQuery,
  useGetStockItemsQuery,
  useGetStockItemQuery,
  useGetStockSummaryQuery,
  useCreateStockItemMutation,
  useUpdateStockItemMutation,
  useIssueStockMutation,
  useAdjustStockMutation,
  useGetStockMovementsQuery,
  useGetProcurementDashboardQuery,
  useGetApAgingQuery,
  useGetApReconciliationQuery,
  useGetApCashRequirementsQuery,
  useGetGrirBalanceQuery,
  useGetGrirAgingQuery,
  useGetGrirPoLinesQuery,
  useGetGrirPoLineDetailQuery,
  useGetSpendAnalysisQuery,
  useGetVendorPerformanceQuery,
  useGetApAgingVendorQuery,
  useGetGrirGrnDetailQuery,
  useGetVendorAssessmentsQuery,
  useCreateVendorAssessmentMutation,
} = procurementExtApi;
