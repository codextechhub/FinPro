// Financial-statement report endpoints (vs_finance). All gate on
// finance.report.view and return plain JSON (not paginated). Each also accepts
// ?export=csv|xlsx|pdf for a file download (handled in the UI via a direct link).

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope } from "./api-types";
import type {
  AnalyticsSlice,
  ArAging,
  BalanceSheet,
  CashFlow,
  ChangesInEquity,
  FinanceDashboard,
  IncomeStatement,
  ReportParams,
  TrialBalance,
} from "./reports-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

export const reportsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTrialBalance: builder.query<ApiEnvelope<TrialBalance>, ReportParams>({
      query: (p) => ({ url: `/finance/reports/trial-balance/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceReports"],
    }),
    getIncomeStatement: builder.query<ApiEnvelope<IncomeStatement>, ReportParams>({
      query: (p) => ({ url: `/finance/reports/income-statement/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceReports"],
    }),
    getBalanceSheet: builder.query<ApiEnvelope<BalanceSheet>, ReportParams>({
      query: (p) => ({ url: `/finance/reports/balance-sheet/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceReports"],
    }),
    getCashFlow: builder.query<ApiEnvelope<CashFlow>, ReportParams>({
      query: (p) => ({ url: `/finance/reports/cash-flow/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceReports"],
    }),
    getChangesInEquity: builder.query<ApiEnvelope<ChangesInEquity>, ReportParams>({
      query: (p) => ({ url: `/finance/reports/changes-in-equity/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceReports"],
    }),
    getArAging: builder.query<ApiEnvelope<ArAging>, ReportParams>({
      query: (p) => ({ url: `/finance/reports/ar-aging/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceReports"],
    }),
    // Net activity per account bucketed by an axis (cost_center or a dimension code).
    getAnalyticsSlice: builder.query<ApiEnvelope<AnalyticsSlice>, ReportParams & { axis: string; account_type?: string }>({
      query: (p) => ({ url: `/finance/reports/analytics-slice/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceReports"],
    }),
    // Aggregated Finance-overview dashboard - every block in one call.
    getFinanceDashboard: builder.query<ApiEnvelope<FinanceDashboard>, ReportParams>({
      query: (p) => ({ url: `/finance/reports/dashboard/${qs(p)}`, method: "GET" }),
      providesTags: ["FinanceReports"],
    }),
  }),
});

export const {
  useGetTrialBalanceQuery,
  useGetIncomeStatementQuery,
  useGetBalanceSheetQuery,
  useGetCashFlowQuery,
  useGetChangesInEquityQuery,
  useGetArAgingQuery,
  useGetAnalyticsSliceQuery,
  useGetFinanceDashboardQuery,
} = reportsApi;
