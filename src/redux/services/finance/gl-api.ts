/**
 * General Ledger RTK Query endpoints (vs_finance, /v1/finance/). Read-only GL +
 * the two sanctioned writes: Direct Entry and journal reversal. There is NO
 * free-form journal editor (spec §1.4).
 *   GET  /finance/journals/                 finance.journal.view
 *   GET  /finance/journals/{id}/            finance.journal.view
 *   POST /finance/journals/{id}/submit/     finance.journal.submit
 *   POST /finance/journals/{id}/reverse/    finance.journal.reverse
 *   POST /finance/direct-entries/           finance.directentry.post
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "./api-types";
import type {
  DirectEntryPayload,
  JournalDetail,
  JournalListItem,
  JournalListParams,
  JournalSummary,
} from "./gl-types";

type SummaryParams = { entity: string; source?: string; date_from?: string; date_to?: string; search?: string };

export const glApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getJournals: builder.query<PaginatedEnvelope<JournalListItem>, JournalListParams>({
      query: (params) => ({
        url: `/finance/journals/${generateQueryString(params as unknown as Record<string, string | number>)}`,
        method: "GET",
      }),
      providesTags: ["FinanceJournals"],
    }),
    getJournalSummary: builder.query<ApiEnvelope<JournalSummary>, SummaryParams>({
      query: (params) => ({
        url: `/finance/journals/summary/${generateQueryString(params as unknown as Record<string, string | number>)}`,
        method: "GET",
      }),
      providesTags: ["FinanceJournals"],
    }),
    getJournal: builder.query<ApiEnvelope<JournalDetail>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({
        url: `/finance/journals/${id}/${generateQueryString({ entity })}`,
        method: "GET",
      }),
      providesTags: ["FinanceJournals"],
    }),
    submitJournal: builder.mutation<ApiEnvelope<JournalDetail>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({
        url: `/finance/journals/${id}/submit/${generateQueryString({ entity })}`,
        method: "POST",
      }),
      invalidatesTags: ["FinanceJournals", "WorkflowPending", "WorkflowSubmissions"],
    }),
    reverseJournal: builder.mutation<ApiEnvelope<JournalDetail>, { id: number; entity: string; date?: string; reversal_date?: string }>({
      query: ({ id, entity, ...body }) => ({
        url: `/finance/journals/${id}/reverse/${generateQueryString({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["FinanceJournals", "FinanceReports"],
    }),
    postDirectEntry: builder.mutation<ApiEnvelope<JournalDetail>, DirectEntryPayload>({
      query: ({ entity, ...body }) => ({
        url: `/finance/direct-entries/${generateQueryString({ entity })}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["FinanceJournals", "FinanceReports"],
    }),
  }),
});

export const {
  useGetJournalsQuery,
  useGetJournalSummaryQuery,
  useGetJournalQuery,
  useSubmitJournalMutation,
  useReverseJournalMutation,
  usePostDirectEntryMutation,
} = glApi;
