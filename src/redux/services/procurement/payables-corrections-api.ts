/**
 * Correcting posted payables: supplier credit notes, bill voids, goods returns,
 * opening supplier bills and purchase-order cancellation.
 *
 * A posted bill is never edited. It is voided while nothing has been paid or
 * credited on it, and credited otherwise; goods that went back are returned
 * against their receipt. Each correction posts its own journal and moves the
 * bill's balance, the purchase order's quantities and the AP reports with it, so
 * every mutation here invalidates the bills, receipts and orders it can touch.
 *
 * The backend reaches each document through the caller's branches, so a
 * correction can reach no further than reading the document can.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "../finance/api-types";
import type {
  GoodsReceipt,
  GoodsReturn,
  OpeningBillRow,
  PurchaseOrder,
  VendorCreditInstruction,
  VendorCreditNote,
  VendorInvoice,
} from "./procurement-types";
import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);
type Act = { id: number; entity: string };

/** The tags a posted correction can move: the bill, its credit notes, its order and receipts, and the ledger. */
const CORRECTION_TAGS = [
  "ProcVendorCreditNotes", "ProcVendorInvoices", "ProcVendorPayments", "ProcPurchaseOrders",
  "ProcGoodsReceipts", "ProcStock", "FinanceJournals", "FinanceReports",
] as const;

export type CreditNoteDraft = {
  note_date: string;
  reason: string;
  vendor_reference?: string;
} & VendorCreditInstruction;

export const payablesCorrectionsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getVendorCreditNotes: b.query<PaginatedEnvelope<VendorCreditNote>, { entity: string; page?: number; page_size?: number; status?: string; vendor?: string; vendor_invoice?: number; approval?: "returned" }>({
      query: (p) => ({ url: `/procurement/vendor-credit-notes/${qs(p)}`, method: "GET" }),
      providesTags: ["ProcVendorCreditNotes"],
    }),
    getVendorCreditNote: b.query<ApiEnvelope<VendorCreditNote>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendor-credit-notes/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["ProcVendorCreditNotes"],
    }),
    createVendorCreditNote: b.mutation<ApiEnvelope<VendorCreditNote>, { entity: string; vendor_invoice: number } & CreditNoteDraft>({
      query: ({ entity, ...body }) => ({ url: `/procurement/vendor-credit-notes/${qs({ entity })}`, method: "POST", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: ["ProcVendorCreditNotes"],
    }),
    updateVendorCreditNote: b.mutation<ApiEnvelope<VendorCreditNote>, Act & Partial<CreditNoteDraft>>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendor-credit-notes/${id}/${qs({ entity })}`, method: "PATCH", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: ["ProcVendorCreditNotes"],
    }),
    submitVendorCreditNote: b.mutation<ApiEnvelope<VendorCreditNote & { approval?: ApprovalParkState }>, Act & { confirm_without_approval?: boolean; reason?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendor-credit-notes/${id}/submit/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcVendorCreditNotes", "WorkflowInstances", "WorkflowPending"],
    }),
    postVendorCreditNote: b.mutation<ApiEnvelope<VendorCreditNote>, Act>({
      query: ({ id, entity }) => ({ url: `/procurement/vendor-credit-notes/${id}/post/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: [...CORRECTION_TAGS],
    }),
    allocateVendorCreditNote: b.mutation<ApiEnvelope<VendorCreditNote>, Act & { auto_allocate?: boolean; allocations?: { vendor_invoice: number; amount: number }[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendor-credit-notes/${id}/allocate/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...CORRECTION_TAGS],
    }),
    voidVendorCreditNote: b.mutation<ApiEnvelope<VendorCreditNote>, Act & { date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendor-credit-notes/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...CORRECTION_TAGS],
    }),

    voidVendorInvoice: b.mutation<ApiEnvelope<VendorInvoice>, Act & { date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/vendor-invoices/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...CORRECTION_TAGS],
    }),

    returnGoods: b.mutation<ApiEnvelope<{ goods_return: GoodsReturn; goods_receipt: GoodsReceipt }>, Act & { reason: string; return_date?: string; lines?: { grn_line: number; quantity: number }[] }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/goods-receipts/${id}/reverse/${qs({ entity })}`, method: "POST", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: [...CORRECTION_TAGS],
    }),

    importOpeningVendorBills: b.mutation<ApiEnvelope<VendorInvoice[]>, { entity: string; bills: OpeningBillRow[] }>({
      query: ({ entity, ...body }) => ({ url: `/procurement/vendor-invoices/opening/${qs({ entity })}`, method: "POST", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: ["ProcVendorInvoices", "FinanceJournals", "FinanceReports"],
    }),

    cancelPurchaseOrder: b.mutation<ApiEnvelope<PurchaseOrder>, Act & { reason: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/procurement/purchase-orders/${id}/cancel/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["ProcPurchaseOrders", "ProcRequisitions"],
    }),
  }),
});

export const {
  useGetVendorCreditNotesQuery,
  useGetVendorCreditNoteQuery,
  useCreateVendorCreditNoteMutation,
  useUpdateVendorCreditNoteMutation,
  useSubmitVendorCreditNoteMutation,
  usePostVendorCreditNoteMutation,
  useAllocateVendorCreditNoteMutation,
  useVoidVendorCreditNoteMutation,
  useVoidVendorInvoiceMutation,
  useReturnGoodsMutation,
  useImportOpeningVendorBillsMutation,
  useCancelPurchaseOrderMutation,
} = payablesCorrectionsApi;
