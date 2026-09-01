// The caller's own tenant structures, shared by every module that files a row
// against a branch.
//
// Deliberately not under finance/ or dashboard/: branches belong to the tenant,
// not to whichever console happens to need them first. Payroll is the first
// screen to ask; procurement will be the second.

import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope } from "@/redux/services/finance/api-types";

/** A branch as something to pick. Narrower than the School Management row. */
export interface BranchOption {
  id: number;
  name: string;
  code: number | null;
  is_main: boolean;
  status: string;
}

export const tenantsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    /**
     * GET /tenants/branches/ - the branches this caller may work in.
     *
     * Not "every branch the school has": the backend derives the list from the
     * same grants the write path narrows a save by, so a branch offered here is
     * one the save will accept. Out-of-service branches are already excluded.
     */
    getBranchOptions: b.query<ApiEnvelope<BranchOption[]>, void>({
      query: () => ({ url: `/tenants/branches/`, method: "GET" }),
      providesTags: ["Branches"],
    }),
  }),
});

export const { useGetBranchOptionsQuery } = tenantsApi;
