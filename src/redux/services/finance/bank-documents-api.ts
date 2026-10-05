/**
 * Bank transactions (`/finance/bank-transactions/`) and transfers between one
 * branch's own accounts (`/finance/bank-transfers/`).
 *
 * Both follow their own approval route the way a direct entry follows the
 * journal's: a route with steps holds the document for approval, and a school
 * with an empty route is asked by the host whether to post without one. Either
 * can be voided until a bank statement line is matched to it.
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
type ListArgs = { entity: string; page?: number; bank_account?: number; status?: string };

/** What posting or voiding a bank document moves: the bank's balance and the ledger. */
const BANK_DOCUMENT_TAGS = ["FinanceBankDocuments", "FinanceBankAccounts", "FinanceStatementLines", "FinanceJournals", "FinanceReports"] as const;

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
      { entity: string; bank_account: number; direction: BankTransactionDirection; amount: number; counter_account: string; transaction_date: string; narration: string; reference?: string }
    >({
      query: ({ entity, ...body }) => ({ url: `/finance/bank-transactions/${qs({ entity })}`, method: "POST", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: [...BANK_DOCUMENT_TAGS],
    }),
    voidBankTransaction: b.mutation<ApiEnvelope<BankTransactionDocument>, Act & { date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-transactions/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...BANK_DOCUMENT_TAGS],
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
      { entity: string; from_account: number; to_account: number; amount: number; transfer_date: string; narration: string; reference?: string }
    >({
      query: ({ entity, ...body }) => ({ url: `/finance/bank-transfers/${qs({ entity })}`, method: "POST", body }),
      extraOptions: { inlineValidation: true },
      invalidatesTags: [...BANK_DOCUMENT_TAGS],
    }),
    voidBankTransfer: b.mutation<ApiEnvelope<BankTransferDocument>, Act & { date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-transfers/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...BANK_DOCUMENT_TAGS],
    }),
  }),
});

export const {
  useGetBankTransactionsQuery,
  useGetBankTransactionDocumentQuery,
  useCreateBankTransactionMutation,
  useVoidBankTransactionMutation,
  useGetBankTransfersQuery,
  useGetBankTransferDocumentQuery,
  useCreateBankTransferMutation,
  useVoidBankTransferMutation,
} = bankDocumentsApi;
