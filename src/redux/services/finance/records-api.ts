/**
 * Keeping the books (vs_finance): the fiscal calendar rule, record retention,
 * archived years and the sealed figures.
 *
 *   GET/PATCH /finance/settings/calendar/          finance.settings.view / .update
 *   GET/PATCH /finance/settings/records/           finance.settings.view / .update
 *   POST /finance/fiscal-years/{id}/archive/       finance.fiscalyear.archive
 *   POST /finance/fiscal-years/{id}/unarchive/     finance.fiscalyear.archive
 *   GET  /finance/seals/verify/                    finance.seal.view
 *
 * Every write here binds every branch, so the server also wants a caller who
 * covers the whole school and answers anyone else with a 403. Archiving and
 * unarchiving need a reason, which lands on the audit row.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope } from "./api-types";
import type { FiscalYear } from "./ops-types";
import type {
  FinanceCalendarSettingsPayload,
  NextYearMode,
  RecordRetentionSettings,
  SealVerification,
} from "./records-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

export const recordsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getFinanceCalendarSettings: b.query<ApiEnvelope<FinanceCalendarSettingsPayload>, { entity: string }>({
      query: ({ entity }) => ({ url: `/finance/settings/calendar/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceSettings"],
    }),
    updateFinanceCalendarSettings: b.mutation<
      ApiEnvelope<FinanceCalendarSettingsPayload>,
      { entity: string; next_year_mode?: NextYearMode; next_year_lead_days?: number }
    >({
      query: ({ entity, ...body }) => ({ url: `/finance/settings/calendar/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceSettings", "FinanceAuditLog", "FinanceReports"],
    }),
    getRecordRetentionSettings: b.query<ApiEnvelope<RecordRetentionSettings>, { entity: string }>({
      query: ({ entity }) => ({ url: `/finance/settings/records/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceSettings"],
    }),
    /** `retention_years: null` goes back to the statutory floor. */
    updateRecordRetentionSettings: b.mutation<
      ApiEnvelope<RecordRetentionSettings>,
      { entity: string; retention_years?: number | null; archive_min_age_years?: number }
    >({
      query: ({ entity, ...body }) => ({ url: `/finance/settings/records/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceSettings", "FinanceAuditLog"],
    }),
    archiveFiscalYear: b.mutation<ApiEnvelope<FiscalYear>, { id: number; entity: string; reason: string }>({
      query: ({ id, entity, reason }) => ({ url: `/finance/fiscal-years/${id}/archive/${qs({ entity })}`, method: "POST", body: { reason } }),
      invalidatesTags: ["FinancePeriods", "FinanceReports", "FinanceJournals", "FinanceInvoices", "FinanceAuditLog"],
    }),
    unarchiveFiscalYear: b.mutation<ApiEnvelope<FiscalYear>, { id: number; entity: string; reason: string }>({
      query: ({ id, entity, reason }) => ({ url: `/finance/fiscal-years/${id}/unarchive/${qs({ entity })}`, method: "POST", body: { reason } }),
      invalidatesTags: ["FinancePeriods", "FinanceReports", "FinanceJournals", "FinanceInvoices", "FinanceAuditLog"],
    }),
    /** Read-only: recomputes every closed month and year and compares it with its seal. */
    verifySeals: b.query<ApiEnvelope<SealVerification>, { entity: string; fiscal_year?: number }>({
      query: (p) => ({ url: `/finance/seals/verify/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceReports"],
    }),
  }),
});

export const {
  useGetFinanceCalendarSettingsQuery,
  useUpdateFinanceCalendarSettingsMutation,
  useGetRecordRetentionSettingsQuery,
  useUpdateRecordRetentionSettingsMutation,
  useArchiveFiscalYearMutation,
  useUnarchiveFiscalYearMutation,
  useLazyVerifySealsQuery,
  useVerifySealsQuery,
} = recordsApi;
