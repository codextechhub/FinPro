/**
 * Bank transactions (`/finance/bank-transactions/`) and transfers between one
 * branch's own accounts (`/finance/bank-transfers/`).
 *
 * Both follow their own approval route the way a direct entry follows the
 * journal's: a route with steps holds the document for approval, and a school
 * with an empty route is asked by the host whether to post without one. Either
 * can be voided until a bank statement line is matched to it.
 *
 * One that comes back from approval as a draft (rejected, or its request
 * withdrawn or cancelled) can be corrected (PATCH, only the fields that change),
 * sent again through the same route (`submit/`) or cancelled (`cancel/`, which
 * posts nothing). The server refuses all three with a 422 while approvers hold
 * the document or once it is final, and the central handler words it.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "./api-types";
import type {
  BankTransactionDirection,
  BankTransactionDocument,
  BankTransferDocument,
} from "./bank-documents-types";
import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);
type Act = { id: number; entity: string };
type ListArgs = { entity: string; page?: number; bank_account?: number; status?: string; approval?: "returned" };
type TransactionFields = { bank_account: number; direction: BankTransactionDirection; amount: number; counter_account: string; transaction_date: string; narration: string; reference?: string };
type TransferFields = { from_account: number; to_account: number; amount: number; transfer_date: string; narration: string; reference?: string };

/** What posting or voiding a bank document moves: the bank's balance and the ledger. */
const BANK_DOCUMENT_TAGS = ["FinanceBankDocuments", "FinanceBankAccounts", "FinanceStatementLines", "FinanceJournals", "FinanceReports"] as const;

/** Sending a draft again or cancelling it also moves the approval queues. */
const REWORK_TAGS = [...BANK_DOCUMENT_TAGS, "WorkflowInstances", "WorkflowPending"] as const;

export const bankDocumentsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getBankTransactions: b.query<PaginatedEnvelope<BankTransactionDocument>, ListArgs>({
      query: (p) => ({ url: `/finance/bank-transactions/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceBankDocuments"],
    }),
    getBankTransactionDocument: b.query<ApiEnvelope<BankTransactionDocument>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/bank-transactions/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceBankDocuments"],
    }),
    createBankTransaction: b.mutation<
      ApiEnvelope<BankTransactionDocument & { approval?: ApprovalParkState }>,
      { entity: string } & TransactionFields
    >({
      query: ({ entity, ...body }) => ({ url: `/finance/bank-transactions/${qs({ entity })}`, method: "POST", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: [...BANK_DOCUMENT_TAGS],
    }),
    voidBankTransaction: b.mutation<ApiEnvelope<BankTransactionDocument>, Act & { date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-transactions/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...BANK_DOCUMENT_TAGS],
    }),
    updateBankTransaction: b.mutation<ApiEnvelope<BankTransactionDocument>, Act & Partial<TransactionFields>>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-transactions/${id}/${qs({ entity })}`, method: "PATCH", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: [...BANK_DOCUMENT_TAGS],
    }),
    submitBankTransaction: b.mutation<ApiEnvelope<BankTransactionDocument & { approval?: ApprovalParkState }>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/bank-transactions/${id}/submit/${qs({ entity })}`, method: "POST", body: {} }),
      invalidatesTags: [...REWORK_TAGS],
    }),
    cancelBankTransaction: b.mutation<ApiEnvelope<BankTransactionDocument>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/bank-transactions/${id}/cancel/${qs({ entity })}`, method: "POST", body: {} }),
      invalidatesTags: [...REWORK_TAGS],
    }),

    getBankTransfers: b.query<PaginatedEnvelope<BankTransferDocument>, ListArgs>({
      query: (p) => ({ url: `/finance/bank-transfers/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceBankDocuments"],
    }),
    getBankTransferDocument: b.query<ApiEnvelope<BankTransferDocument>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/bank-transfers/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceBankDocuments"],
    }),
    createBankTransfer: b.mutation<
      ApiEnvelope<BankTransferDocument & { approval?: ApprovalParkState }>,
      { entity: string } & TransferFields
    >({
      query: ({ entity, ...body }) => ({ url: `/finance/bank-transfers/${qs({ entity })}`, method: "POST", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: [...BANK_DOCUMENT_TAGS],
    }),
    voidBankTransfer: b.mutation<ApiEnvelope<BankTransferDocument>, Act & { date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-transfers/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...BANK_DOCUMENT_TAGS],
    }),
    updateBankTransfer: b.mutation<ApiEnvelope<BankTransferDocument>, Act & Partial<TransferFields>>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-transfers/${id}/${qs({ entity })}`, method: "PATCH", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: [...BANK_DOCUMENT_TAGS],
    }),
    submitBankTransfer: b.mutation<ApiEnvelope<BankTransferDocument & { approval?: ApprovalParkState }>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/bank-transfers/${id}/submit/${qs({ entity })}`, method: "POST", body: {} }),
      invalidatesTags: [...REWORK_TAGS],
    }),
    cancelBankTransfer: b.mutation<ApiEnvelope<BankTransferDocument>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/bank-transfers/${id}/cancel/${qs({ entity })}`, method: "POST", body: {} }),
      invalidatesTags: [...REWORK_TAGS],
    }),
  }),
});

export const {
  useGetBankTransactionsQuery,
  useGetBankTransactionDocumentQuery,
  useCreateBankTransactionMutation,
  useVoidBankTransactionMutation,
  useUpdateBankTransactionMutation,
  useSubmitBankTransactionMutation,
  useCancelBankTransactionMutation,
  useGetBankTransfersQuery,
  useGetBankTransferDocumentQuery,
  useCreateBankTransferMutation,
  useVoidBankTransferMutation,
  useUpdateBankTransferMutation,
  useSubmitBankTransferMutation,
  useCancelBankTransferMutation,
} = bankDocumentsApi;
