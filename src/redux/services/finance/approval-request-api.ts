/**
 * Which approval request a finance document's detail read names.
 *
 * A finance drawer opened from a list row has the row's fields only, and a
 * list row need not name the document's approval request
 * (`workflow_instance_id`), which is what tells a reader whether they sent it
 * and what Resume posts to, and a list whose rows carry no approval state at
 * all (refunds and write-offs, listed together) cannot say whether one was sent
 * back. This reads the document's own detail route (`/finance/<path>/<id>/`)
 * for those fields, and only for a draft that could have been.
 */

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope } from "./api-types";

export const approvalRequestApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDocumentApprovalRequest: builder.query<
      ApiEnvelope<{ workflow_instance_id?: string | number | null; approval_state?: string; approval_returned?: boolean }>,
      { path: string; id: number; entity: string }
    >({
      query: ({ path, id, entity }) => ({ url: `/finance/${path}/${id}/${generateQueryString({ entity })}` }),
    }),
  }),
});

export const { useGetDocumentApprovalRequestQuery } = approvalRequestApi;
