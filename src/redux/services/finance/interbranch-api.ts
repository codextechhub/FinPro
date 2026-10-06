/**
 * Inter-branch RTK Query endpoints: transfers and requests, receivable moves,
 * the pair balances, money held for another branch, recharges, shared-cost
 * rules and the shared bank account split.
 *
 * Every write invalidates `FinanceInterBranch` together with the journals and
 * bank tags it touches, because each one posts a journal in two branches'
 * books. A receivable move or a forwarded receipt also changes what customers
 * owe, so those refresh the receivables lists as well.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "./api-types";
import type {
  BankSplitBody,
  BankSplitPreview,
  BankSplitResult,
  CreateRechargeBody,
  ForwardHeldReceiptBody,
  HeldReceipt,
  HeldReceiptCustomer,
  InterBranchBalances,
  InterBranchListParams,
  InterBranchTransfer,
  ReceivableMoveBody,
  ReceivableMoveResult,
  Recharge,
  RecordHeldReceiptBody,
  RequestMoneyBody,
  SendMoneyBody,
  SendRequestedBody,
  SharedCostRule,
  SharedCostRuleBody,
} from "./interbranch-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);
type Act = { id: number; entity: string };

const MONEY_TAGS = ["FinanceInterBranch", "FinanceJournals", "FinanceBankAccounts", "FinanceReports"] as const;
const RECEIVABLE_TAGS = [
  ...MONEY_TAGS, "FinanceInvoices", "FinanceCustomers", "FinancePayments", "FinanceCreditNotes",
] as const;

export const interBranchApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getInterBranchTransfers: b.query<PaginatedEnvelope<InterBranchTransfer>, InterBranchListParams>({
      query: (p) => ({ url: `/finance/inter-branch-transfers/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceInterBranch"],
    }),
    getInterBranchTransfer: b.query<ApiEnvelope<InterBranchTransfer>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/inter-branch-transfers/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceInterBranch"],
    }),
    sendInterBranchMoney: b.mutation<ApiEnvelope<InterBranchTransfer>, SendMoneyBody>({
      query: ({ entity, ...body }) => ({ url: `/finance/inter-branch-transfers/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...MONEY_TAGS],
    }),
    requestInterBranchMoney: b.mutation<ApiEnvelope<InterBranchTransfer>, RequestMoneyBody>({
      query: ({ entity, ...body }) => ({ url: `/finance/inter-branch-transfers/requests/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceInterBranch"],
    }),
    sendRequestedTransfer: b.mutation<ApiEnvelope<InterBranchTransfer>, SendRequestedBody>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/inter-branch-transfers/${id}/send/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...MONEY_TAGS],
    }),
    declineInterBranchRequest: b.mutation<ApiEnvelope<InterBranchTransfer>, Act & { reason?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/inter-branch-transfers/${id}/decline/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceInterBranch"],
    }),
    confirmInterBranchArrival: b.mutation<ApiEnvelope<InterBranchTransfer>, Act & { arrival_date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/inter-branch-transfers/${id}/confirm/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceInterBranch"],
    }),
    voidInterBranchTransfer: b.mutation<ApiEnvelope<InterBranchTransfer>, Act & { date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/inter-branch-transfers/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...RECEIVABLE_TAGS],
    }),
    moveReceivables: b.mutation<ApiEnvelope<ReceivableMoveResult>, ReceivableMoveBody>({
      query: ({ entity, ...body }) => ({ url: `/finance/inter-branch-transfers/receivable-moves/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...RECEIVABLE_TAGS],
    }),
    getInterBranchBalances: b.query<ApiEnvelope<InterBranchBalances>, { entity: string }>({
      query: (p) => ({ url: `/finance/inter-branch-balances/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceInterBranch"],
    }),

    getHeldReceipts: b.query<PaginatedEnvelope<HeldReceipt>, { entity: string; status?: string; approval?: "returned"; page?: number; page_size?: number }>({
      query: (p) => ({ url: `/finance/held-receipts/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceInterBranch"],
    }),
    // Exact code only; a 404 is the form's own answer ("no such customer"), so it is not toasted.
    getHeldReceiptCustomer: b.query<ApiEnvelope<HeldReceiptCustomer>, { entity: string; for_branch: number; code: string }>({
      query: (p) => ({ url: `/finance/held-receipts/customer-lookup/${qs(p)}`, method: "GET" }),
      extraOptions: { silent: true },
      providesTags: ["FinanceCustomers"],
    }),
    getHeldReceipt: b.query<ApiEnvelope<HeldReceipt>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/held-receipts/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceInterBranch"],
    }),
    recordHeldReceipt: b.mutation<ApiEnvelope<HeldReceipt>, RecordHeldReceiptBody>({
      query: ({ entity, ...body }) => ({ url: `/finance/held-receipts/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...MONEY_TAGS],
    }),
    forwardHeldReceipt: b.mutation<ApiEnvelope<InterBranchTransfer>, ForwardHeldReceiptBody>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/held-receipts/${id}/forward/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...RECEIVABLE_TAGS],
    }),
    voidHeldReceipt: b.mutation<ApiEnvelope<HeldReceipt>, Act & { date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/held-receipts/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...MONEY_TAGS],
    }),

    getRecharges: b.query<PaginatedEnvelope<Recharge>, { entity: string; page?: number; page_size?: number }>({
      query: (p) => ({ url: `/finance/recharges/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceInterBranch"],
    }),
    getRecharge: b.query<ApiEnvelope<Recharge>, Act>({
      query: ({ id, entity }) => ({ url: `/finance/recharges/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceInterBranch"],
    }),
    createRecharge: b.mutation<ApiEnvelope<Recharge>, CreateRechargeBody>({
      query: ({ entity, ...body }) => ({ url: `/finance/recharges/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...MONEY_TAGS],
    }),
    voidRecharge: b.mutation<ApiEnvelope<Recharge>, Act & { date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/recharges/${id}/void/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...MONEY_TAGS],
    }),
    getSharedCostRules: b.query<PaginatedEnvelope<SharedCostRule>, { entity: string; page?: number; page_size?: number }>({
      query: (p) => ({ url: `/finance/shared-cost-rules/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceInterBranch"],
    }),
    createSharedCostRule: b.mutation<ApiEnvelope<SharedCostRule>, SharedCostRuleBody>({
      query: ({ entity, ...body }) => ({ url: `/finance/shared-cost-rules/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceInterBranch"],
    }),
    updateSharedCostRule: b.mutation<ApiEnvelope<SharedCostRule>, SharedCostRuleBody & { id: number }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/shared-cost-rules/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceInterBranch"],
    }),

    getBankSplitPreview: b.query<ApiEnvelope<BankSplitPreview>, { id: number; entity: string; split_date?: string }>({
      query: ({ id, ...p }) => ({ url: `/finance/bank-accounts/${id}/split-by-branch/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceBankAccounts", "FinanceJournals"],
    }),
    splitBankAccountByBranch: b.mutation<ApiEnvelope<BankSplitResult>, BankSplitBody>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/bank-accounts/${id}/split-by-branch/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: [...MONEY_TAGS, "FinanceAccounts"],
    }),
  }),
});

export const {
  useGetInterBranchTransfersQuery,
  useGetBankSplitPreviewQuery,
  useGetInterBranchTransferQuery,
  useSendInterBranchMoneyMutation,
  useRequestInterBranchMoneyMutation,
  useSendRequestedTransferMutation,
  useDeclineInterBranchRequestMutation,
  useConfirmInterBranchArrivalMutation,
  useVoidInterBranchTransferMutation,
  useMoveReceivablesMutation,
  useGetInterBranchBalancesQuery,
  useGetHeldReceiptsQuery,
  useGetHeldReceiptQuery,
  useGetHeldReceiptCustomerQuery,
  useRecordHeldReceiptMutation,
  useForwardHeldReceiptMutation,
  useVoidHeldReceiptMutation,
  useGetRechargesQuery,
  useGetRechargeQuery,
  useCreateRechargeMutation,
  useVoidRechargeMutation,
  useGetSharedCostRulesQuery,
  useCreateSharedCostRuleMutation,
  useUpdateSharedCostRuleMutation,
  useSplitBankAccountByBranchMutation,
} = interBranchApi;
