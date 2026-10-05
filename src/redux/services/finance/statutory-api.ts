/**
 * National payroll tax data: PAYE tables, PAYE states and pension fund administrators.
 *
 *   GET        /finance/payroll/tax-tables/                       anybody in finance
 *   POST       /finance/payroll/tax-tables/                       finance.statutory.create, platform staff
 *   PATCH      /finance/payroll/tax-tables/{id}/                  finance.statutory.update, platform staff
 *   GET/POST   /finance/payroll/tax-states/                       (same gates)
 *   PATCH      /finance/payroll/tax-states/{id}/
 *   GET/POST   /finance/payroll/pension-fund-administrators/
 *   PATCH      /finance/payroll/pension-fund-administrators/{id}/
 *
 * None takes `entity`: the rows belong to no tenant.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope } from "./api-types";
import type {
  PayeTaxTable,
  PayeTaxTableBody,
  PayrollTaxState,
  PensionFundAdministrator,
} from "./statutory-types";

const qs = (p: object) => generateQueryString(p as Record<string, string | number>);

export const statutoryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPayeTaxTables: builder.query<ApiEnvelope<PayeTaxTable[]>, { country?: string } | void>({
      query: (p) => ({ url: `/finance/payroll/tax-tables/${qs(p ?? {})}`, method: "GET" }),
      providesTags: ["FinanceStatutory"],
    }),
    createPayeTaxTable: builder.mutation<ApiEnvelope<PayeTaxTable>, PayeTaxTableBody & { country?: string; tax_year: number }>({
      query: (body) => ({ url: `/finance/payroll/tax-tables/`, method: "POST", body }),
      invalidatesTags: ["FinanceStatutory"],
    }),
    updatePayeTaxTable: builder.mutation<ApiEnvelope<PayeTaxTable>, PayeTaxTableBody & { id: number }>({
      query: ({ id, ...body }) => ({ url: `/finance/payroll/tax-tables/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["FinanceStatutory", "FinancePayroll"],
    }),

    getPayrollTaxStates: builder.query<ApiEnvelope<PayrollTaxState[]>, { country?: string } | void>({
      query: (p) => ({ url: `/finance/payroll/tax-states/${qs(p ?? {})}`, method: "GET" }),
      providesTags: ["FinanceStatutory"],
    }),
    createPayrollTaxState: builder.mutation<ApiEnvelope<PayrollTaxState>, { country?: string; code: string; name: string; authority_name: string }>({
      query: (body) => ({ url: `/finance/payroll/tax-states/`, method: "POST", body }),
      invalidatesTags: ["FinanceStatutory"],
    }),
    updatePayrollTaxState: builder.mutation<ApiEnvelope<PayrollTaxState>, { id: number; name?: string; authority_name?: string; is_active?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/finance/payroll/tax-states/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["FinanceStatutory"],
    }),

    getPensionFundAdministrators: builder.query<ApiEnvelope<PensionFundAdministrator[]>, { is_active?: "true" | "false" } | void>({
      query: (p) => ({ url: `/finance/payroll/pension-fund-administrators/${qs(p ?? {})}`, method: "GET" }),
      providesTags: ["FinanceStatutory"],
    }),
    createPensionFundAdministrator: builder.mutation<ApiEnvelope<PensionFundAdministrator>, { code: string; name: string }>({
      query: (body) => ({ url: `/finance/payroll/pension-fund-administrators/`, method: "POST", body }),
      invalidatesTags: ["FinanceStatutory"],
    }),
    updatePensionFundAdministrator: builder.mutation<ApiEnvelope<PensionFundAdministrator>, { id: number; name?: string; is_active?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/finance/payroll/pension-fund-administrators/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["FinanceStatutory"],
    }),
  }),
});

export const {
  useGetPayeTaxTablesQuery,
  useCreatePayeTaxTableMutation,
  useUpdatePayeTaxTableMutation,
  useGetPayrollTaxStatesQuery,
  useCreatePayrollTaxStateMutation,
  useUpdatePayrollTaxStateMutation,
  useGetPensionFundAdministratorsQuery,
  useCreatePensionFundAdministratorMutation,
  useUpdatePensionFundAdministratorMutation,
} = statutoryApi;
