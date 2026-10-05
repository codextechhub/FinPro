/**
 * Undoing a journal's source document from the journal screen.
 *
 * A journal a document posted is never reversed on its own: the server refuses,
 * because the document and its sub-ledger would no longer agree with the ledger.
 * The journal screen therefore offers the document's own correction, a void or
 * a reversal, and sends it to the document's route. The route is chosen from a
 * fixed table in the screen (see ledger/document-correction.ts), never from the
 * server's text, so this endpoint carries only paths that table builds.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope } from "./api-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

export const documentCorrectionsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    correctSourceDocument: b.mutation<ApiEnvelope<unknown>, { path: string; entity: string }>({
      query: ({ path, entity }) => ({ url: `/${path}${qs({ entity })}`, method: "POST", body: {} }),
      invalidatesTags: [
        "FinanceJournals", "FinanceReports", "FinanceBankAccounts", "FinanceBankDocuments", "FinanceStatementLines",
        "ProcVendorInvoices", "ProcVendorCreditNotes", "ProcVendorPayments", "ProcPurchaseOrders", "ProcGoodsReceipts", "ProcStock",
      ],
    }),
  }),
});

export const { useCorrectSourceDocumentMutation } = documentCorrectionsApi;
