/**
 * Tax returns read whole and acted on share by share (vs_finance).
 *
 *   GET  /finance/tax-filings/{id}/                       finance.tax.view
 *   POST /finance/tax-filings/{id}/file/                  finance.tax.file (whole school)
 *   POST /finance/tax-filings/{id}/pay/                   finance.tax.pay
 *   POST /finance/tax-filings/{id}/remittances/{r}/reverse/  finance.tax.pay (whole school)
 *
 * A penalty is borne by the branch named in `adjustment_branch`; left out, it
 * is shared by each branch's share of the tax. A payment names the share it
 * pays (`branch`) and is paid from that branch's own bank account; a
 * branch-bound bursar pays her own branches' shares only. Reversing a payment
 * needs a reason and puts the return back to Filed.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope } from "./api-types";
import type { TaxFilingDetail } from "./tax-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

export const taxApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getTaxFiling: b.query<ApiEnvelope<TaxFilingDetail>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/tax-filings/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceTax"],
    }),
    fileTaxReturn: b.mutation<
      ApiEnvelope<TaxFilingDetail>,
      { id: number; entity: string; filed_date: string; filing_reference?: string; adjustment_amount?: number; adjustment_account?: string; adjustment_branch?: number }
    >({
      query: ({ id, entity, ...body }) => ({ url: `/finance/tax-filings/${id}/file/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceTax", "FinanceJournals"],
    }),
    /** One payment of one share; `branch` names the share when the return has several. */
    payTaxShare: b.mutation<
      ApiEnvelope<TaxFilingDetail>,
      { id: number; entity: string; pay_date: string; bank_account: string; amount?: number; branch?: number }
    >({
      query: ({ id, entity, ...body }) => ({ url: `/finance/tax-filings/${id}/pay/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceTax", "FinanceJournals", "FinanceReports", "FinanceBankAccounts"],
    }),
    reverseTaxRemittance: b.mutation<
      ApiEnvelope<TaxFilingDetail>,
      { id: number; remittanceId: number; entity: string; reason: string }
    >({
      query: ({ id, remittanceId, entity, reason }) => ({
        url: `/finance/tax-filings/${id}/remittances/${remittanceId}/reverse/${qs({ entity })}`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: ["FinanceTax", "FinanceJournals", "FinanceReports", "FinanceBankAccounts"],
    }),
  }),
});

export const {
  useGetTaxFilingQuery,
  useFileTaxReturnMutation,
  usePayTaxShareMutation,
  useReverseTaxRemittanceMutation,
} = taxApi;
