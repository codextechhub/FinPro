/**
 * Setup / master-data reads + month-end close + audit log (vs_finance).
 *   GET  /finance/accounts/         finance.account.view
 *   GET  /finance/periods/          finance.period.view
 *   POST /finance/periods/{id}/close/  finance.period.close
 *   GET  /finance/audit-logs/        finance.audit.view
 *   GET  /finance/currencies|tax-codes|cost-centers  (reference)
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "./api-types";
import type {
  Account,
  AccountDetail,
  ConsolidatedAccountActivityLine,
  ConsolidatedAccountActivityTotals,
  FxRate,
  CostCenter,
  Dimension,
  Currency,
  FinanceAuditLog,
  FinanceAuditFacets,
  FinanceAccountSettings,
  FinanceBankingSettingsPayload,
  FinanceDocumentSettingsPayload,
  FiscalPeriod,
  StartedFiscalYear,
  PeriodChecklist,
  PeriodCloseResult,
  PostingWindow,
  TaxCode,
} from "./setup-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

export const setupApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getAccounts: b.query<PaginatedEnvelope<Account>, { entity: string; account_type?: string; is_postable?: boolean; page?: number }>({
      query: (p) => ({ url: `/finance/accounts/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceAccounts"],
    }),
    // Full chart-of-accounts tree (un-paginated) with per-account balance + tag.
    getChartOfAccounts: b.query<ApiEnvelope<Account[]>, { entity: string }>({
      query: (p) => ({ url: `/finance/accounts/${qs({ ...p, with_balance: "true" })}`, method: "GET" }),
      providesTags: ["FinanceAccounts"],
    }),
    createAccount: b.mutation<ApiEnvelope<Account>, { entity: string; code: string; name: string; subtype?: string; parent?: number; is_postable?: boolean; is_contra?: boolean }>({
      query: ({ entity, ...body }) => ({ url: `/finance/accounts/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceAccounts"],
    }),
    // Per-account detail + posted ledger activity (the chart's detail drawer).
    getAccountDetail: b.query<ApiEnvelope<AccountDetail>, { entity: string; id: number }>({
      query: ({ entity, id }) => ({ url: `/finance/accounts/${id}/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceAccounts"],
    }),
    getAccountActivity: b.query<
      PaginatedEnvelope<ConsolidatedAccountActivityLine> & { totals: ConsolidatedAccountActivityTotals },
      { entity: string; id: number; page?: number; page_size?: number; account?: number; date_from?: string; date_to?: string }
    >({
      query: ({ entity, id, ...params }) => ({
        url: `/finance/accounts/${id}/activity/${qs({ entity, ...params })}`,
        method: "GET",
      }),
      providesTags: ["FinanceAccounts"],
    }),
    updateAccount: b.mutation<ApiEnvelope<Account>, { entity: string; id: number; name?: string; subtype?: string; description?: string; is_active?: boolean; is_postable?: boolean }>({
      query: ({ entity, id, ...body }) => ({ url: `/finance/accounts/${id}/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceAccounts"],
    }),
    // Shared report pickers stay bounded but newest-first, so current periods do
    // not disappear behind the oldest 25 rows after several years of history.
    getPeriods: b.query<PaginatedEnvelope<FiscalPeriod>, { entity: string; status?: string; year?: number }>({
      query: (p) => ({ url: `/finance/periods/${qs({ ...p, recent: "true", page_size: 100 })}`, method: "GET" }),
      providesTags: ["FinancePeriods"],
    }),
    // The close workbench reads exactly one complete fiscal calendar (4 or 12
    // rows), never the entity's unbounded lifetime history.
    getFiscalYearPeriods: b.query<ApiEnvelope<FiscalPeriod[]>, { entity: string; year: number }>({
      query: (p) => ({ url: `/finance/periods/${qs({ ...p, all: "true" })}`, method: "GET" }),
      providesTags: ["FinancePeriods"],
    }),
    startFiscalYear: b.mutation<ApiEnvelope<StartedFiscalYear>, { entity: string; year: number; start_month: number; fiscal_start_day: number; frequency: "MONTHLY" | "QUARTERLY" }>({
      query: ({ entity, ...body }) => ({ url: `/finance/fiscal-years/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePeriods"],
    }),
    // Which dates accept a posting today - feeds every document-date picker in both
    // consoles. Gated on finance-or-procurement module access (not finance.period.view)
    // so a procurement officer raising a GRN can read it, and un-paginated because
    // /finance/periods/ pages at 25 oldest-first: the current periods fall off page one.
    getPostingWindow: b.query<ApiEnvelope<PostingWindow>, { entity: string }>({
      query: (p) => ({ url: `/finance/posting-window/${qs(p)}`, method: "GET" }),
      providesTags: ["FinancePeriods"],
    }),
    getPeriodChecklist: b.query<ApiEnvelope<PeriodChecklist>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/periods/${id}/checklist/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinancePeriods"],
    }),
    closePeriod: b.mutation<ApiEnvelope<PeriodCloseResult>, { id: number; entity: string; soft?: boolean; force?: boolean; run_depreciation?: boolean }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/periods/${id}/close/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePeriods", "FinanceReports"],
    }),
    // Re-open a CLOSED/SOFT_CLOSED period (a LOCKED one can't be reopened).
    reopenPeriod: b.mutation<ApiEnvelope<FiscalPeriod>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/periods/${id}/reopen/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinancePeriods", "FinanceReports"],
    }),
    // Permanently seal a CLOSED period - irreversible.
    lockPeriod: b.mutation<ApiEnvelope<FiscalPeriod>, { id: number; entity: string }>({
      query: ({ id, entity }) => ({ url: `/finance/periods/${id}/lock/${qs({ entity })}`, method: "POST" }),
      invalidatesTags: ["FinancePeriods", "FinanceReports"],
    }),
    // Year-end close: post the closing entry (zero every P&L account, roll net profit/loss
    // into Retained Earnings 3200) and seal the fiscal year. The formal entry may use the
    // final OPEN, SOFT_CLOSED or CLOSED period, but never a permanently LOCKED one.
    closeFiscalYear: b.mutation<ApiEnvelope<{ fiscal_year: { id: number; year: number; status: string }; closing_journal: { id: number } | null; net_income: { kobo: number; naira: string } }>, { id: number; entity: string; force?: boolean; closing_date?: string }>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/fiscal-years/${id}/close/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePeriods", "FinanceReports", "FinanceJournals"],
    }),
    getCurrencies: b.query<PaginatedEnvelope<Currency>, void>({
      query: () => ({ url: `/finance/currencies/`, method: "GET" }),
      providesTags: ["FinanceSetup"],
    }),
    getTaxCodes: b.query<PaginatedEnvelope<TaxCode>, { entity: string }>({
      query: (p) => ({ url: `/finance/tax-codes/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceSetup"],
    }),
    upsertTaxCode: b.mutation<ApiEnvelope<TaxCode>, { entity: string; code: string; name: string; rate_bps: number; is_recoverable?: boolean; collected_account?: string; paid_account?: string; is_active?: boolean }>({
      query: ({ entity, ...body }) => ({ url: `/finance/tax-codes/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceSetup"],
    }),
    getCostCenters: b.query<PaginatedEnvelope<CostCenter>, { entity: string; is_active?: boolean }>({
      query: (p) => ({ url: `/finance/cost-centers/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceSetup"],
    }),
    createCostCenter: b.mutation<ApiEnvelope<CostCenter>, { entity: string; code: string; name: string; parent?: string }>({
      query: ({ entity, ...body }) => ({ url: `/finance/cost-centers/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceSetup"],
    }),
    getDimensions: b.query<PaginatedEnvelope<Dimension>, { entity: string }>({
      query: (p) => ({ url: `/finance/dimensions/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceSetup"],
    }),
    upsertDimension: b.mutation<ApiEnvelope<Dimension>, { entity: string; code: string; name: string; allowed_values?: string[]; is_active?: boolean }>({
      query: ({ entity, ...body }) => ({ url: `/finance/dimensions/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceSetup"],
    }),
    getFxRates: b.query<PaginatedEnvelope<FxRate>, void>({
      query: () => ({ url: `/finance/fx-rates/`, method: "GET" }),
      providesTags: ["FinanceSetup"],
    }),
    createFxRate: b.mutation<ApiEnvelope<FxRate>, { base: string; quote: string; rate: string; as_of: string; source?: string }>({
      query: (body) => ({ url: `/finance/fx-rates/`, method: "POST", body }),
      invalidatesTags: ["FinanceSetup"],
    }),
    getAuditLog: b.query<PaginatedEnvelope<FinanceAuditLog>, { entity: string; page?: number; action?: string; status?: string; target_type?: string; actor?: number | string; date_from?: string; date_to?: string }>({
      query: (p) => ({ url: `/finance/audit-logs/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceAuditLog"],
    }),
    // Distinct filter options (actors / target types / actions) present for the entity.
    getAuditFacets: b.query<ApiEnvelope<FinanceAuditFacets>, { entity: string }>({
      query: (p) => ({ url: `/finance/audit-logs/facets/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceAuditLog"],
    }),
    getFinanceAccountSettings: b.query<ApiEnvelope<FinanceAccountSettings>, { entity: string }>({
      query: (p) => ({ url: `/finance/settings/account-mappings/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceSettings"],
    }),
    updateFinanceAccountSettings: b.mutation<ApiEnvelope<FinanceAccountSettings>, { entity: string; mappings: Record<string, string | number | null> }>({
      query: ({ entity, mappings }) => ({
        url: `/finance/settings/account-mappings/${qs({ entity })}`,
        method: "PATCH",
        body: { mappings },
      }),
      invalidatesTags: ["FinanceSettings", "FinanceAuditLog"],
    }),
    getFinanceDocumentSettings: b.query<ApiEnvelope<FinanceDocumentSettingsPayload>, { entity: string }>({
      query: ({ entity }) => ({ url: `/finance/settings/documents/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceSettings"],
    }),
    updateFinanceDocumentSettings: b.mutation<ApiEnvelope<FinanceDocumentSettingsPayload>, { entity: string; default_invoice_due_days?: number; default_invoice_narration?: string; auto_post_manual_invoices?: boolean; allow_customer_opening_balances?: boolean; primary_collection_bank_account?: number | null }>({
      query: ({ entity, ...body }) => ({ url: `/finance/settings/documents/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceSettings", "FinanceAuditLog", "FinanceBankAccounts"],
    }),
    getFinanceBankingSettings: b.query<ApiEnvelope<FinanceBankingSettingsPayload>, { entity: string }>({
      query: ({ entity }) => ({ url: `/finance/settings/banking/${qs({ entity })}`, method: "GET" }),
      providesTags: ["FinanceSettings"],
    }),
    updateFinanceBankingSettings: b.mutation<ApiEnvelope<FinanceBankingSettingsPayload>, { entity: string; default_bank_reconciliation_tolerance_days?: number; default_group_reconciliation_matches?: boolean; default_receipt_allocation_strategy?: "oldest" | "largest"; petty_cash_low_balance_threshold_bps?: number }>({
      query: ({ entity, ...body }) => ({ url: `/finance/settings/banking/${qs({ entity })}`, method: "PATCH", body }),
      invalidatesTags: ["FinanceSettings", "FinanceAuditLog"],
    }),
  }),
});

export const {
  useGetAccountsQuery,
  useGetChartOfAccountsQuery,
  useCreateAccountMutation,
  useGetAccountDetailQuery,
  useGetAccountActivityQuery,
  useUpdateAccountMutation,
  useGetPeriodsQuery,
  useGetFiscalYearPeriodsQuery,
  useStartFiscalYearMutation,
  useGetPostingWindowQuery,
  useGetPeriodChecklistQuery,
  useClosePeriodMutation,
  useReopenPeriodMutation,
  useLockPeriodMutation,
  useCloseFiscalYearMutation,
  useGetCurrenciesQuery,
  useCreateFxRateMutation,
  useGetTaxCodesQuery,
  useUpsertTaxCodeMutation,
  useGetCostCentersQuery,
  useCreateCostCenterMutation,
  useGetDimensionsQuery,
  useUpsertDimensionMutation,
  useGetFxRatesQuery,
  useGetAuditLogQuery,
  useGetAuditFacetsQuery,
  useGetFinanceAccountSettingsQuery,
  useUpdateFinanceAccountSettingsMutation,
  useGetFinanceDocumentSettingsQuery,
  useUpdateFinanceDocumentSettingsMutation,
  useGetFinanceBankingSettingsQuery,
  useUpdateFinanceBankingSettingsMutation,
} = setupApi;
