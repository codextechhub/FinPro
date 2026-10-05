/**
 * Setup / master-data reads + month-end close + audit log (vs_finance).
 *
 * The fiscal calendar is kept per branch. Every calendar write takes the branch
 * whose calendar changes in its body (`branch`); a school with one branch may
 * leave it out and the server uses that branch, while a school with several is
 * refused without one. The calendar reads take `?branch=` and then report that
 * branch's own state; without it they report the school's.
 *   GET  /finance/accounts/         finance.account.view
 *   GET  /finance/periods/          finance.period.view
 *   POST /finance/periods/{id}/close/  finance.period.close (force: finance.period.force_close)
 *   POST /finance/periods/{id}/reopen/ finance.period.reopen
 *   POST /finance/periods/{id}/lock/   finance.period.lock
 *   POST /finance/fiscal-years/{id}/close/ finance.period.close (force: finance.period.force_close)
 *   POST /finance/fiscal-years/{id}/reopen/ finance.fiscalyear.reopen
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
  BranchPeriodState,
  FiscalPeriod,
  StartedFiscalYear,
  PeriodChecklist,
  PeriodCloseResult,
  PostingWindow,
  TaxCode,
  TaxTreatment,
} from "./setup-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

/**
 * A close either keeps its checks or forces past them. Forcing needs a reason,
 * which the backend stores on the audit row and refuses blank, so the two
 * shapes are typed apart and a forced close without one does not compile.
 */
type CloseOverride = { force?: false; reason?: never } | { force: true; reason: string };

/**
 * The branch whose fiscal calendar an action changes or a read reports. Left
 * out at a school with one branch, where the server takes that branch.
 */
type CalendarBranchArg = { branch?: number };

/**
 * The months of an archived fiscal year are left out of the calendar reads
 * unless this asks for them; see `use-archived-years.ts`.
 */
type IncludeArchivedArg = { include_archived?: "true" };

/** The body fields that name the branch: none when no branch is given. */
const branchBody = (branch: number | undefined) => (branch != null ? { branch } : {});

/** What a period re-open or lock returns: the period alone at a school with one
 *  branch, the period beside the branch's own state at a school with several. */
type PeriodTransition = FiscalPeriod | { period: FiscalPeriod; branch_period: BranchPeriodState };

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
    /**
     * Full chart (un-paginated) with each account's `tag` (CONTROL / CASH) and
     * no balances. Readable on any finance key, so a form that only needs to
     * know which account is the receivable control does not need the chart of
     * accounts permission that the balances sit behind.
     */
    getTaggedAccounts: b.query<ApiEnvelope<Account[]>, { entity: string }>({
      query: (p) => ({ url: `/finance/accounts/${qs({ ...p, with_tags: "true" })}`, method: "GET" }),
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
    getPeriods: b.query<PaginatedEnvelope<FiscalPeriod>, { entity: string; status?: string; year?: number } & IncludeArchivedArg>({
      query: (p) => ({ url: `/finance/periods/${qs({ ...p, recent: "true", page_size: 100 })}`, method: "GET" }),
      providesTags: ["FinancePeriods"],
    }),
    // The close workbench reads exactly one complete fiscal calendar (4 or 12
    // rows), never the entity's unbounded lifetime history.
    getFiscalYearPeriods: b.query<ApiEnvelope<FiscalPeriod[]>, { entity: string; year: number } & CalendarBranchArg & IncludeArchivedArg>({
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
    getPeriodChecklist: b.query<ApiEnvelope<PeriodChecklist>, { id: number; entity: string } & CalendarBranchArg>({
      query: ({ id, entity, branch }) => ({ url: `/finance/periods/${id}/checklist/${qs({ entity, branch })}`, method: "GET" }),
      providesTags: ["FinancePeriods"],
    }),
    closePeriod: b.mutation<ApiEnvelope<PeriodCloseResult>, { id: number; entity: string; soft?: boolean; run_depreciation?: boolean } & CalendarBranchArg & CloseOverride>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/periods/${id}/close/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePeriods", "FinanceReports"],
    }),
    /**
     * Re-open a CLOSED or SOFT_CLOSED period. The reason is required and lands
     * on the audit row. Refused for a LOCKED or already OPEN period, and for any
     * period of a CLOSED or LOCKED fiscal year, whose year must be reopened first.
     * Re-opening one branch's month also re-opens the school's month.
     */
    reopenPeriod: b.mutation<ApiEnvelope<PeriodTransition>, { id: number; entity: string; reason: string } & CalendarBranchArg>({
      query: ({ id, entity, reason, branch }) => ({ url: `/finance/periods/${id}/reopen/${qs({ entity })}`, method: "POST", body: { ...branchBody(branch), reason } }),
      invalidatesTags: ["FinancePeriods", "FinanceReports"],
    }),
    // Permanently seal a CLOSED period - irreversible.
    lockPeriod: b.mutation<ApiEnvelope<PeriodTransition>, { id: number; entity: string } & CalendarBranchArg>({
      query: ({ id, entity, branch }) => ({ url: `/finance/periods/${id}/lock/${qs({ entity })}`, method: "POST", body: branchBody(branch) }),
      invalidatesTags: ["FinancePeriods", "FinanceReports"],
    }),
    /**
     * Year-end close: post the closing entry (zero every P&L account, roll net
     * profit or loss into Retained Earnings 3200) and seal the fiscal year. The
     * formal entry may use the final OPEN, SOFT_CLOSED or CLOSED period, but never
     * a permanently LOCKED one. Forcing it over OPEN months needs a reason.
     * Closing one branch's year closes the school's year once every branch's
     * year is closed.
     */
    closeFiscalYear: b.mutation<ApiEnvelope<{ fiscal_year: { id: number; year: number; status: string }; closing_journal: { id: number } | null; net_income: { kobo: number; naira: string } }>, { id: number; entity: string; closing_date?: string } & CalendarBranchArg & CloseOverride>({
      query: ({ id, entity, ...body }) => ({ url: `/finance/fiscal-years/${id}/close/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinancePeriods", "FinanceReports", "FinanceJournals"],
    }),
    /**
     * Re-open a CLOSED fiscal year for one branch: reverse that branch's
     * year-end closing journal inside the year and set its year back to OPEN,
     * so a month can be corrected and the year closed again. The school's year
     * re-opens with it. The reason is required and lands on the audit row. A
     * LOCKED or archived year is refused.
     */
    reopenFiscalYear: b.mutation<ApiEnvelope<{ fiscal_year: { id: number; year: number; status: string }; reversals: { id: number }[] }>, { id: number; entity: string; reason: string } & CalendarBranchArg>({
      query: ({ id, entity, branch, reason }) => ({ url: `/finance/fiscal-years/${id}/reopen/${qs({ entity })}`, method: "POST", body: { ...branchBody(branch), reason } }),
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
    upsertTaxCode: b.mutation<ApiEnvelope<TaxCode>, { entity: string; code: string; name: string; rate_bps: number; treatment?: TaxTreatment; is_recoverable?: boolean; collected_account?: string; paid_account?: string; is_active?: boolean }>({
      query: ({ entity, ...body }) => ({ url: `/finance/tax-codes/${qs({ entity })}`, method: "POST", body }),
      invalidatesTags: ["FinanceSetup"],
    }),
    getCostCenters: b.query<PaginatedEnvelope<CostCenter>, { entity: string; is_active?: boolean }>({
      query: (p) => ({ url: `/finance/cost-centers/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceSetup"],
    }),
    createCostCenter: b.mutation<ApiEnvelope<CostCenter>, { entity: string; code: string; name: string; parent?: string; is_active?: boolean }>({
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
    updateFinanceDocumentSettings: b.mutation<ApiEnvelope<FinanceDocumentSettingsPayload>, { entity: string; default_invoice_due_days?: number; default_invoice_narration?: string; auto_post_manual_invoices?: boolean; allow_customer_opening_balances?: boolean; term_collection_target_pct?: number; primary_collection_bank_account?: number | null; auto_apply_customer_credit?: boolean; concession_second_person_threshold?: number }>({
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
  useGetTaggedAccountsQuery,
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
  useReopenFiscalYearMutation,
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
