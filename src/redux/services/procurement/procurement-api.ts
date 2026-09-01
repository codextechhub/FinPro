// vs_procurement RTK Query - master data (vendors, categories, catalog) and the
// Procure-to-Pay chain (requisition → PO → goods receipt → vendor invoice with
// 3-way match → vendor payment with WHT). Reads gate on *.view; actions on their
// own rbac_permission. Every call is entity-scoped.

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "../finance/api-types";
import type {
  CatalogItem,
  CatalogItemInsights,
  GoodsReceipt,
  PurchaseOrder,
  PurchaseOrderEmailPreview,
  PurchaseOrderSummary,
  Requisition,
  RequisitionBudgetAvailability,
  RequisitionSummary,
  Vendor,
  VendorCategory,
  VendorCategoryInsight,
  VendorInsights,
  DocumentAttachment,
  VendorInvoice,
  VendorInvoiceReferenceCheck,
  VendorInvoiceSummary,
  VendorPayment,
  VendorPaymentEligibleInvoice,
  VendorSummary,
  ProcurementSettingsPayload,
} from "./procurement-types";
// Every submit-for-approval response says whether anybody can actually approve
// what was just submitted; see useNoApproverPrompt.
import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);
type E = { entity: string; page?: number; page_size?: number; status?: string; search?: string };
type Act = { id: number; entity: string };

export const procurementApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getProcurementSettings: b.query<ApiEnvelope<ProcurementSettingsPayload>, { entity: string }>({
      query: ({ entity }) => ({ url: `/procurement/settings/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcSettings"],
    }),
    updateProcurementSettings: b.mutation<ApiEnvelope<ProcurementSettingsPayload>, { entity: string; default_payment_terms?: string; default_delivery_address?: string; quantity_tolerance_bps?: number; price_tolerance_bps?: number; allow_non_po_invoices?: boolean; vendor_purchase_kyc_requirement?: "PENDING_OR_VERIFIED" | "VERIFIED_ONLY"; require_purchase_order_for_receipts?: boolean; default_requisition_lead_days?: number; contract_renewal_notice_days?: number; default_rfq_response_days?: number; rfq_closing_soon_days?: number; minimum_rfq_invited_vendors?: number; minimum_submitted_quotations_before_award?: number }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/settings/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcSettings", "FinanceAuditLog"],
    }),
    // Master data
    getVendors: b.query<PaginatedEnvelope<Vendor>, E & { q?: string; is_active?: boolean; on_hold?: boolean; kyc_status?: string; purchase_eligible?: boolean }>({
      query: (p) => ({ url: `/procurement/vendors/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcVendors"],
    }),
    getVendor: b.query<ApiEnvelope<Vendor>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendors/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcVendors"],
    }),
    getVendorSummary: b.query<ApiEnvelope<VendorSummary>, { entity: string }>({
      query: ({ entity }) => ({ url: `/procurement/vendors/summary/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcVendors"],
    }),
    getVendorInsights: b.query<ApiEnvelope<VendorInsights>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendors/${id}/insights/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcVendors"],
    }),
    createVendor: b.mutation<ApiEnvelope<Vendor>, { entity: string; name: string; category?: string; email?: string; phone?: string; address?: string; tax_id?: string; bank_name?: string; bank_account_number?: string; bank_account_name?: string; payable_account?: string; default_expense_account?: string; default_wht_tax_code?: string; payment_terms?: string; contacts?: Array<Record<string, unknown>> }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/vendors/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcVendors"],
    }),
    updateVendor: b.mutation<ApiEnvelope<Vendor>, { id: number; entity: string; name?: string; category?: string; email?: string; phone?: string; address?: string; tax_id?: string; bank_name?: string; bank_account_number?: string; bank_account_name?: string; payable_account?: string; default_expense_account?: string; default_wht_tax_code?: string; payment_terms?: string; kyc_status?: string; risk?: string; on_hold?: boolean; is_active?: boolean; contacts?: Array<Record<string, unknown>> }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendors/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcVendors"],
    }),
    getCategories: b.query<PaginatedEnvelope<VendorCategory>, E & { q?: string; is_active?: boolean }>({
      query: (p) => ({ url: `/procurement/categories/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcCategories"],
    }),
    getCategory: b.query<ApiEnvelope<VendorCategory>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/categories/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcCategories"],
    }),
    getCategoryInsights: b.query<ApiEnvelope<VendorCategoryInsight[]>, { entity: string }>({
      query: ({ entity }) => ({ url: `/procurement/categories/insights/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcCategories"],
    }),
    createCategory: b.mutation<ApiEnvelope<VendorCategory>, { entity: string; code: string; name: string; parent?: string; default_expense_account?: string; is_active?: boolean }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/categories/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcCategories"],
    }),
    updateCategory: b.mutation<ApiEnvelope<VendorCategory>, { id: number; entity: string; code?: string; name?: string; parent?: string; default_expense_account?: string; is_active?: boolean }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/categories/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcCategories", "ProcVendors"],
    }),
    getCatalogItems: b.query<PaginatedEnvelope<CatalogItem>, E & { q?: string; is_active?: boolean; vendor?: string; category?: string }>({
      query: (p) => ({ url: `/procurement/catalog-items/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcCatalog"],
    }),
    getCatalogItem: b.query<ApiEnvelope<CatalogItem>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/catalog-items/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcCatalog"],
    }),
    getCatalogItemInsights: b.query<ApiEnvelope<CatalogItemInsights>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/catalog-items/${id}/insights/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcCatalog"],
    }),
    createCatalogItem: b.mutation<ApiEnvelope<CatalogItem>, { entity: string; code?: string; name: string; description?: string; unit_of_measure: string; category?: string; preferred_vendor?: string; default_expense_account?: string; default_tax_code?: string; lead_time_days?: number | null; standard_unit_price: number; is_active?: boolean }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/catalog-items/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcCatalog"],
    }),
    updateCatalogItem: b.mutation<ApiEnvelope<CatalogItem>, { id: number; entity: string; code?: string; name?: string; description?: string; unit_of_measure?: string; category?: string; preferred_vendor?: string; default_expense_account?: string; default_tax_code?: string; lead_time_days?: number | null; standard_unit_price?: number; is_active?: boolean }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/catalog-items/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcCatalog", "ProcCategories"],
    }),

    // Requisitions
    getRequisitions: b.query<PaginatedEnvelope<Requisition>, E>({
      query: (p) => ({ url: `/procurement/requisitions/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcRequisitions"],
    }),
    getRequisition: b.query<ApiEnvelope<Requisition>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/requisitions/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcRequisitions"],
    }),
    getRequisitionSummary: b.query<ApiEnvelope<RequisitionSummary>, { entity: string }>({
      query: ({ entity }) => ({ url: `/procurement/requisitions/summary/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcRequisitions"],
    }),
    getRequisitionBudgetAvailability: b.query<ApiEnvelope<RequisitionBudgetAvailability>, { entity: string; cost_center: string; date?: string }>({
      query: (p) => ({ url: `/procurement/requisitions/budget-availability/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcRequisitions"],
    }),
    createRequisition: b.mutation<ApiEnvelope<Requisition>, { entity: string; title?: string; request_date: string; needed_by?: string; cost_center?: string; justification?: string; lines: Record<string, unknown>[] }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/requisitions/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcRequisitions"],
    }),
    updateRequisition: b.mutation<ApiEnvelope<Requisition>, { id: number; entity: string; title?: string; request_date?: string; needed_by?: string; cost_center?: string; justification?: string; lines?: Record<string, unknown>[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/requisitions/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcRequisitions"],
    }),
    submitRequisition: b.mutation<ApiEnvelope<Requisition & { approval?: ApprovalParkState }>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/requisitions/${id}/submit/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["ProcRequisitions"],
    }),

    // Purchase orders (created from an approved requisition; lines are copied)
    getPurchaseOrders: b.query<PaginatedEnvelope<PurchaseOrder>, E & { vendor?: string }>({
      query: (p) => ({ url: `/procurement/purchase-orders/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcPurchaseOrders"],
    }),
    getPurchaseOrder: b.query<ApiEnvelope<PurchaseOrder>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/purchase-orders/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcPurchaseOrders"],
    }),
    getPurchaseOrderSummary: b.query<ApiEnvelope<PurchaseOrderSummary>, { entity: string }>({
      query: ({ entity }) => ({ url: `/procurement/purchase-orders/summary/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcPurchaseOrders"],
    }),
    createPurchaseOrder: b.mutation<ApiEnvelope<PurchaseOrder>, { entity: string; requisition: number; vendor: string; order_date: string; expected_date?: string; delivery_address?: string; payment_terms?: string; contract?: string }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/purchase-orders/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcPurchaseOrders", "ProcRequisitions", "ProcContracts"],
    }),
    updatePurchaseOrder: b.mutation<ApiEnvelope<PurchaseOrder>, { id: number; entity: string; vendor?: string; order_date?: string; expected_date?: string; delivery_address?: string; payment_terms?: string; contract?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/purchase-orders/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcPurchaseOrders", "ProcContracts"],
    }),
    submitPurchaseOrder: b.mutation<ApiEnvelope<PurchaseOrder & { approval?: ApprovalParkState }>, Act & { auto_email_vendor?: boolean; email_message?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/purchase-orders/${id}/submit/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcPurchaseOrders"],
    }),
    getPurchaseOrderEmailPreview: b.query<ApiEnvelope<PurchaseOrderEmailPreview>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/purchase-orders/${id}/email-preview/${qs({ entity })}`, method: "GET" }),
    }),
    sendPurchaseOrderEmail: b.mutation<ApiEnvelope<PurchaseOrder>, Act & { email_message?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/purchase-orders/${id}/email/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcPurchaseOrders", "FinanceAuditLog"],
    }),
    retryPurchaseOrderEmail: b.mutation<ApiEnvelope<PurchaseOrder>, Act & { deliveryId: number; email_message?: string }>({
      query: ({ id, deliveryId, entity, ...body }) => ({ url: `/procurement/purchase-orders/${id}/email-deliveries/${deliveryId}/retry/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcPurchaseOrders", "FinanceAuditLog"],
    }),

    // Goods receipts
    getGoodsReceipts: b.query<PaginatedEnvelope<GoodsReceipt>, E>({
      query: (p) => ({ url: `/procurement/goods-receipts/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcGoodsReceipts"],
    }),
    getGoodsReceipt: b.query<ApiEnvelope<GoodsReceipt>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/goods-receipts/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcGoodsReceipts"],
    }),
    createGoodsReceipt: b.mutation<ApiEnvelope<GoodsReceipt>, { entity: string; vendor: string; purchase_order?: number; received_date: string; reference?: string; narration?: string; lines: Record<string, unknown>[] }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/goods-receipts/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcGoodsReceipts"],
    }),
    updateGoodsReceipt: b.mutation<ApiEnvelope<GoodsReceipt>, { id: number; entity: string; received_date?: string; reference?: string; narration?: string; lines?: Record<string, unknown>[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/goods-receipts/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcGoodsReceipts", "ProcPurchaseOrders"],
    }),
    postGoodsReceipt: b.mutation<ApiEnvelope<GoodsReceipt>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/goods-receipts/${id}/post/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["ProcGoodsReceipts", "ProcPurchaseOrders"],
    }),

    // Vendor invoices (3-way match)
    getVendorInvoices: b.query<PaginatedEnvelope<VendorInvoice>, E & { vendor?: string; match_status?: string; payment_status?: string; display_status?: string }>({
      query: (p) => ({ url: `/procurement/vendor-invoices/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcVendorInvoices"],
    }),
    getVendorInvoice: b.query<ApiEnvelope<VendorInvoice>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendor-invoices/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcVendorInvoices"],
    }),
    getVendorInvoiceSummary: b.query<ApiEnvelope<VendorInvoiceSummary>, { entity: string }>({
      query: ({ entity }) => ({ url: `/procurement/vendor-invoices/summary/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcVendorInvoices"],
    }),
    checkVendorInvoiceReference: b.query<ApiEnvelope<VendorInvoiceReferenceCheck>, { entity: string; vendor: string; reference: string; exclude?: number }>({
      query: (p) => ({ url: `/procurement/vendor-invoices/reference-check/${qs(p)}`, method: "GET" }),
      extraOptions: { inlineValidation: true, silent: true },
    }),
    createVendorInvoice: b.mutation<ApiEnvelope<VendorInvoice>, { entity: string; idempotency_key: string; vendor: string; purchase_order?: number; invoice_date: string; due_date?: string; vendor_reference?: string; narration?: string; confirm_cross_vendor_reference?: boolean; lines: Record<string, unknown>[] }>({
      query: ({ entity, idempotency_key, ...body }) => ({
        url: `/procurement/vendor-invoices/${qs({ entity })}`,
        method: "POST",
        headers: { "Idempotency-Key": idempotency_key },
        body,
      }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: ["ProcVendorInvoices"],
    }),
    updateVendorInvoice: b.mutation<ApiEnvelope<VendorInvoice>, { id: number; entity: string; vendor?: string; purchase_order?: number | null; invoice_date?: string; due_date?: string; vendor_reference?: string; narration?: string; confirm_cross_vendor_reference?: boolean; lines?: Record<string, unknown>[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendor-invoices/${id}/${qs({ entity })}`, method: "PATCH", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: ["ProcVendorInvoices"],
    }),
    matchVendorInvoice: b.mutation<ApiEnvelope<VendorInvoice>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendor-invoices/${id}/match/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["ProcVendorInvoices"],
    }),
    submitVendorInvoice: b.mutation<ApiEnvelope<VendorInvoice & { approval?: ApprovalParkState }>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendor-invoices/${id}/submit/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["ProcVendorInvoices"],
    }),
    postVendorInvoice: b.mutation<ApiEnvelope<VendorInvoice>, Act & { allow_variance?: boolean }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendor-invoices/${id}/post/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcVendorInvoices", "FinanceJournals"],
    }),

    // Supplier evidence. Multipart, so the body is a FormData and no Content-Type is
    // set by hand - the browser must supply its own multipart boundary.
    // Available on a posted bill too: the supplier's formal invoice usually turns up
    // after the charge has been booked.
    attachVendorInvoiceFile: b.mutation<ApiEnvelope<DocumentAttachment>, Act & { file: File; caption?: string }>({
      query: ({ id, entity, file, caption }) => {
        const body = new FormData();
        body.append("file", file);
        if (caption) body.append("caption", caption);
        return { url: `/procurement/vendor-invoices/${id}/attachments/${qs({ entity })}`, method: "POST", body };
      },
      extraOptions: { inlineValidation: true },
      invalidatesTags: ["ProcVendorInvoices"],
    }),
    deleteVendorInvoiceFile: b.mutation<ApiEnvelope<{ attachments: DocumentAttachment[] }>, Act & { attachmentId: number }>({
      query: ({ id, entity, attachmentId }) => ({
        url: `/procurement/vendor-invoices/${id}/attachments/${attachmentId}/${qs({ entity })}`,
        method: "DELETE",
      }),
      invalidatesTags: ["ProcVendorInvoices"],
    }),

    // Vendor payments
    getVendorPayments: b.query<PaginatedEnvelope<VendorPayment>, E & { approval_state?: string }>({
      query: (p) => ({ url: `/procurement/vendor-payments/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcVendorPayments"],
    }),
    getVendorPayment: b.query<ApiEnvelope<VendorPayment>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendor-payments/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcVendorPayments"],
    }),
    getVendorPaymentEligibleInvoices: b.query<ApiEnvelope<VendorPaymentEligibleInvoice[]>, { entity: string; vendor?: string }>({
      query: (p) => ({ url: `/procurement/vendor-payments/eligible-invoices/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcVendorInvoices"],
    }),
    createVendorPayment: b.mutation<ApiEnvelope<VendorPayment>, { entity: string; vendor: string; payment_date: string; method?: string; bank_account: number; wht_amount?: number; wht_tax_code?: string; reference?: string; narration?: string; allocations: { vendor_invoice: number; amount: number }[] }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/vendor-payments/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcVendorPayments"],
    }),
    updateVendorPayment: b.mutation<ApiEnvelope<VendorPayment>, { id: number; entity: string; vendor: string; payment_date: string; method?: string; bank_account: number; wht_amount?: number; wht_tax_code?: string; reference?: string; narration?: string; allocations: { vendor_invoice: number; amount: number }[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendor-payments/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["ProcVendorPayments"],
    }),
    submitVendorPayment: b.mutation<ApiEnvelope<{ approval?: ApprovalParkState }>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendor-payments/${id}/submit/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["ProcVendorPayments"],
    }),
    postVendorPayment: b.mutation<ApiEnvelope<VendorPayment>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendor-payments/${id}/post/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["ProcVendorPayments", "ProcVendorInvoices", "FinanceJournals"],
    }),
    cancelVendorPayment: b.mutation<ApiEnvelope<VendorPayment>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendor-payments/${id}/cancel/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["ProcVendorPayments"],
    }),
    // Draws a posted payment's vendor advance onto bills raised since. No cash moves:
    // it reclassifies 1240 into AP, so the vendor invoices and the ledger both change.
    allocateVendorAdvance: b.mutation<ApiEnvelope<VendorPayment>, Act & { auto_allocate?: boolean; allocations?: { vendor_invoice: number; amount: number }[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendor-payments/${id}/allocate/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcVendorPayments", "ProcVendorInvoices", "FinanceJournals"],
    }),
    reverseVendorPayment: b.mutation<ApiEnvelope<VendorPayment>, Act & { date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendor-payments/${id}/reverse/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcVendorPayments", "ProcVendorInvoices", "FinanceJournals"],
    }),

    // The receipt the vendor issued. Necessarily uploaded after the payment posts,
    // so this is never gated on the document being a draft.
    attachVendorPaymentFile: b.mutation<ApiEnvelope<DocumentAttachment>, Act & { file: File; caption?: string }>({
      query: ({ id, entity, file, caption }) => {
        const body = new FormData();
        body.append("file", file);
        if (caption) body.append("caption", caption);
        return { url: `/procurement/vendor-payments/${id}/attachments/${qs({ entity })}`, method: "POST", body };
      },
      extraOptions: { inlineValidation: true },
      invalidatesTags: ["ProcVendorPayments"],
    }),
    deleteVendorPaymentFile: b.mutation<ApiEnvelope<{ attachments: DocumentAttachment[] }>, Act & { attachmentId: number }>({
      query: ({ id, entity, attachmentId }) => ({
        url: `/procurement/vendor-payments/${id}/attachments/${attachmentId}/${qs({ entity })}`,
        method: "DELETE",
      }),
      invalidatesTags: ["ProcVendorPayments"],
    }),
  }),
});

export const {
  useGetProcurementSettingsQuery,
  useUpdateProcurementSettingsMutation,
  useGetVendorsQuery,
  useGetVendorQuery,
  useGetVendorSummaryQuery,
  useGetVendorInsightsQuery,
  useCreateVendorMutation,
  useUpdateVendorMutation,
  useGetCategoriesQuery,
  useGetCategoryQuery,
  useGetCategoryInsightsQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useGetCatalogItemsQuery,
  useGetCatalogItemQuery,
  useGetCatalogItemInsightsQuery,
  useCreateCatalogItemMutation,
  useUpdateCatalogItemMutation,
  useGetRequisitionsQuery,
  useGetRequisitionQuery,
  useGetRequisitionSummaryQuery,
  useGetRequisitionBudgetAvailabilityQuery,
  useCreateRequisitionMutation,
  useUpdateRequisitionMutation,
  useSubmitRequisitionMutation,
  useGetPurchaseOrdersQuery,
  useGetPurchaseOrderQuery,
  useGetPurchaseOrderSummaryQuery,
  useCreatePurchaseOrderMutation,
  useUpdatePurchaseOrderMutation,
  useSubmitPurchaseOrderMutation,
  useGetPurchaseOrderEmailPreviewQuery,
  useSendPurchaseOrderEmailMutation,
  useRetryPurchaseOrderEmailMutation,
  useGetGoodsReceiptsQuery,
  useGetGoodsReceiptQuery,
  useCreateGoodsReceiptMutation,
  useUpdateGoodsReceiptMutation,
  usePostGoodsReceiptMutation,
  useGetVendorInvoicesQuery,
  useGetVendorInvoiceQuery,
  useGetVendorInvoiceSummaryQuery,
  useLazyCheckVendorInvoiceReferenceQuery,
  useCreateVendorInvoiceMutation,
  useUpdateVendorInvoiceMutation,
  useMatchVendorInvoiceMutation,
  useSubmitVendorInvoiceMutation,
  usePostVendorInvoiceMutation,
  useAttachVendorInvoiceFileMutation,
  useDeleteVendorInvoiceFileMutation,
  useGetVendorPaymentsQuery,
  useGetVendorPaymentQuery,
  useGetVendorPaymentEligibleInvoicesQuery,
  useCreateVendorPaymentMutation,
  useUpdateVendorPaymentMutation,
  useSubmitVendorPaymentMutation,
  usePostVendorPaymentMutation,
  useCancelVendorPaymentMutation,
  useReverseVendorPaymentMutation,
  useAttachVendorPaymentFileMutation,
  useDeleteVendorPaymentFileMutation,
  useAllocateVendorAdvanceMutation,
} = procurementApi;
