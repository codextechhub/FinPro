// RTK Query endpoints for ledger entities (vs_finance, mounted at /v1/finance/).
// Entities are the tenant of every finance/procurement document; this client
// powers the global <EntitySelect /> and the Setup → Entities area.
//   GET  /finance/entities/      finance.entity.view
//   POST /finance/entities/      finance.entity.create

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope, PaginatedEnvelope } from "./api-types";
import type { CreateEntityPayload, EntityListParams, LedgerEntity } from "./entity-types";

export const entityApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getEntities: builder.query<PaginatedEnvelope<LedgerEntity>, EntityListParams | void>({
      query: (params) => ({
        url: `/finance/entities/${generateQueryString((params ?? {}) as Record<string, string | number | boolean>)}`,
        method: "GET",
      }),
      providesTags: ["FinanceEntities"],
    }),
    createEntity: builder.mutation<ApiEnvelope<LedgerEntity>, CreateEntityPayload>({
      query: (body) => ({
        url: `/finance/entities/`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["FinanceEntities"],
    }),
  }),
});

export const { useGetEntitiesQuery, useCreateEntityMutation } = entityApi;
