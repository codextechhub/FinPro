import { baseApi } from "@/redux/services/base-api";
import type { ApiEnvelope } from "../finance/api-types";

export type PublicRfqLine = {
  id: number;
  line_no: number;
  description: string;
  quantity: string;
};

export type PublicQuoteLine = {
  id: number;
  rfq_line_id: number;
  description: string;
  quantity: string;
  unit_price: number;
  response_type: "QUOTED" | "ALTERNATIVE" | "NO_BID";
  net_amount: number;
  tax_amount: number;
};

export type PublicRfqForm = {
  issuer: { name: string; tag: string; address: string; email: string; phone: string; website: string; logo_url: string };
  vendor: { name: string; code: string };
  rfq: {
    number: string;
    title: string;
    notes: string;
    version: number;
    deadline: string | null;
    deadline_display: string;
    currency: string;
    lines: PublicRfqLine[];
    amendments: Array<{ version: number; summary: string; response_required: boolean; published_at: string }>;
  };
  invitation: {
    status: string;
    expired: boolean;
    can_edit: boolean;
    can_revise: boolean;
    decline_reason: string;
    acknowledged_version: number;
    requires_acknowledgement: boolean;
  };
  quotation: null | {
    id: number;
    document_number: string;
    quotation_status: string;
    reference: string;
    notes: string;
    valid_until: string | null;
    lead_time_days: number | null;
    subtotal: number;
    tax_total: number;
    total: number;
    lines: PublicQuoteLine[];
  };
  latest_submission: Record<string, unknown> | null;
  submission_revision: number;
  attachments: Array<{ id: number; name: string; content_type: string; size: number; revision: number }>;
};

export type PublicRfqPreview = {
  issuer_name: string;
  logo_url: string;
  vendor_name: string;
  rfq_number: string;
  deadline: string | null;
  deadline_display: string;
  expired: boolean;
  has_submission: boolean;
  status: string;
};

type Token = { token: string };
type Verified = Token & { session: string };
const auth = (session: string) => ({ "X-RFQ-Session": session });

export const vendorQuotationApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPublicRfqPreview: builder.query<ApiEnvelope<PublicRfqPreview>, Token>({
      query: ({ token }) => ({ url: `/procurement/public/rfqs/${token}/`, method: "GET" }),
    }),
    requestPublicRfqCode: builder.mutation<ApiEnvelope<null>, Token & { email: string }>({
      query: ({ token, email }) => ({
        url: `/procurement/public/rfqs/${token}/request-code/`, method: "POST", body: { email },
      }),
    }),
    verifyPublicRfqCode: builder.mutation<
      ApiEnvelope<{ session_token: string; form: PublicRfqForm }>,
      Token & { email: string; code: string }
    >({
      query: ({ token, ...body }) => ({
        url: `/procurement/public/rfqs/${token}/verify-code/`, method: "POST", body,
      }),
    }),
    getPublicRfqForm: builder.query<ApiEnvelope<PublicRfqForm>, Verified>({
      query: ({ token, session }) => ({
        url: `/procurement/public/rfqs/${token}/form/`, method: "GET", headers: auth(session),
      }),
      providesTags: ["ProcQuotations"],
    }),
    savePublicRfqDraft: builder.mutation<ApiEnvelope<PublicRfqForm>, Verified & { body: Record<string, unknown> }>({
      query: ({ token, session, body }) => ({
        url: `/procurement/public/rfqs/${token}/form/`, method: "PATCH", headers: auth(session), body,
      }),
      invalidatesTags: ["ProcQuotations"],
    }),
    submitPublicRfq: builder.mutation<ApiEnvelope<PublicRfqForm>, Verified>({
      query: ({ token, session }) => ({
        url: `/procurement/public/rfqs/${token}/submit/`, method: "POST", headers: auth(session),
      }),
      invalidatesTags: ["ProcQuotations", "ProcRfqs"],
    }),
    revisePublicRfq: builder.mutation<ApiEnvelope<PublicRfqForm>, Verified>({
      query: ({ token, session }) => ({
        url: `/procurement/public/rfqs/${token}/revise/`, method: "POST", headers: auth(session),
      }),
      invalidatesTags: ["ProcQuotations", "ProcRfqs"],
    }),
    acknowledgePublicRfqAmendment: builder.mutation<ApiEnvelope<PublicRfqForm>, Verified>({
      query: ({ token, session }) => ({
        url: `/procurement/public/rfqs/${token}/acknowledge/`, method: "POST", headers: auth(session),
      }),
      invalidatesTags: ["ProcQuotations"],
    }),
    declinePublicRfq: builder.mutation<ApiEnvelope<PublicRfqForm>, Verified & { reason?: string }>({
      query: ({ token, session, reason }) => ({
        url: `/procurement/public/rfqs/${token}/decline/`, method: "POST", headers: auth(session), body: { reason },
      }),
      invalidatesTags: ["ProcRfqs"],
    }),
    uploadPublicRfqAttachment: builder.mutation<ApiEnvelope<PublicRfqForm>, Verified & { file: File }>({
      query: ({ token, session, file }) => {
        const body = new FormData();
        body.append("file", file);
        return { url: `/procurement/public/rfqs/${token}/attachments/`, method: "POST", headers: auth(session), body };
      },
      invalidatesTags: ["ProcQuotations"],
    }),
  }),
});

export const {
  useGetPublicRfqPreviewQuery,
  useRequestPublicRfqCodeMutation,
  useVerifyPublicRfqCodeMutation,
  useGetPublicRfqFormQuery,
  useSavePublicRfqDraftMutation,
  useSubmitPublicRfqMutation,
  useRevisePublicRfqMutation,
  useAcknowledgePublicRfqAmendmentMutation,
  useDeclinePublicRfqMutation,
  useUploadPublicRfqAttachmentMutation,
} = vendorQuotationApi;
