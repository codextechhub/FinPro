// RTK Query endpoints for the CX-staff organogram (vs_user app).
// Mounted backend-side at .../v1/user/organogram/* and .../v1/user/platform-staff-profiles/*.

import { generateQueryString } from "@/utils/helpers";
import { baseApi } from "@/redux/services/base-api";
import type {
  OrgNode,
  OrgNodeWritePayload,
  OrgNodesResponse,
  DataEnvelope,
  Position,
  PositionWritePayload,
  PositionsResponse,
  OrganogramNode,
  PositionAssignment,
  CurrentOrganogramAssignment,
  AssignmentCreatePayload,
  AssignmentsResponse,
  MatrixReport,
  MatrixReportWritePayload,
  MatrixReportsResponse,
  StaffProfile,
  StaffProfileDetail,
  StaffProfileWritePayload,
  StaffProfilesResponse,
} from "./organogram-types";

// Boolean filters (is_active, current, roots) are passed as "true"/"1" strings -
// generateQueryString only serialises string | number, matching the backend parser.
type QueryParams = Record<string, string | number>;

export const organogramApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ── Org nodes (Division → Department → Team) ─────────────────────────────
    getOrgNodes: builder.query<OrgNodesResponse, QueryParams | void>({
      query: (params) => ({ url: `/user/organogram/nodes/${generateQueryString(params ?? {})}`, method: "GET" }),
      providesTags: ["OrgNodes"],
    }),
    getOrgNode: builder.query<DataEnvelope<OrgNode>, number | string>({
      query: (id) => ({ url: `/user/organogram/nodes/${id}/`, method: "GET" }),
      providesTags: ["OrgNodes"],
    }),
    createOrgNode: builder.mutation<DataEnvelope<OrgNode>, OrgNodeWritePayload>({
      query: (body) => ({ url: `/user/organogram/nodes/`, method: "POST", body }),
      invalidatesTags: ["OrgNodes", "OrgPositionTree"],
    }),
    updateOrgNode: builder.mutation<DataEnvelope<OrgNode>, { id: number | string; body: OrgNodeWritePayload }>({
      query: ({ id, body }) => ({ url: `/user/organogram/nodes/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["OrgNodes", "OrgPositionTree"],
    }),
    deleteOrgNode: builder.mutation<void, number | string>({
      query: (id) => ({ url: `/user/organogram/nodes/${id}/`, method: "DELETE" }),
      invalidatesTags: ["OrgNodes", "OrgPositionTree"],
    }),

    // ── Positions ────────────────────────────────────────────────────────────
    getPositions: builder.query<PositionsResponse, QueryParams | void>({
      query: (params) => ({ url: `/user/organogram/positions/${generateQueryString(params ?? {})}`, method: "GET" }),
      providesTags: ["OrgPositions"],
    }),
    getPosition: builder.query<DataEnvelope<Position>, number | string>({
      query: (id) => ({ url: `/user/organogram/positions/${id}/`, method: "GET" }),
      providesTags: ["OrgPositions"],
    }),
    // Full nested reporting tree (solid lines). Optional `root` builds a subtree.
    getPositionTree: builder.query<DataEnvelope<OrganogramNode[]>, { root?: number | string } | void>({
      query: (params) => ({ url: `/user/organogram/positions/tree/${generateQueryString(params ?? {})}`, method: "GET" }),
      providesTags: ["OrgPositionTree"],
    }),
    getVacancies: builder.query<DataEnvelope<Position[]>, void>({
      query: () => ({ url: `/user/organogram/positions/vacancies/`, method: "GET" }),
      providesTags: ["OrgPositions"],
    }),
    createPosition: builder.mutation<DataEnvelope<Position>, PositionWritePayload>({
      query: (body) => ({ url: `/user/organogram/positions/`, method: "POST", body }),
      invalidatesTags: ["OrgPositions", "OrgPositionTree"],
    }),
    updatePosition: builder.mutation<DataEnvelope<Position>, { id: number | string; body: PositionWritePayload }>({
      query: ({ id, body }) => ({ url: `/user/organogram/positions/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["OrgPositions", "OrgPositionTree"],
    }),
    deletePosition: builder.mutation<void, number | string>({
      query: (id) => ({ url: `/user/organogram/positions/${id}/`, method: "DELETE" }),
      invalidatesTags: ["OrgPositions", "OrgPositionTree"],
    }),

    // ── Assignments (effective-dated, full history) ──────────────────────────
    getAssignments: builder.query<AssignmentsResponse, QueryParams | void>({
      query: (params) => ({ url: `/user/organogram/assignments/${generateQueryString(params ?? {})}`, method: "GET" }),
      providesTags: ["OrgAssignments"],
    }),
    getMyAssignments: builder.query<AssignmentsResponse, void>({
      query: () => ({ url: `/user/organogram/assignments/mine/?page_size=50`, method: "GET" }),
      providesTags: ["OrgAssignments"],
    }),
    getCurrentOrganogramAssignments: builder.query<DataEnvelope<CurrentOrganogramAssignment[]>, void>({
      query: () => ({ url: `/user/organogram/assignments/current/`, method: "GET" }),
      providesTags: ["OrgAssignments"],
    }),
    // Routes through OrganogramService server-side (primary-seat handling + sync).
    createAssignment: builder.mutation<DataEnvelope<PositionAssignment>, AssignmentCreatePayload>({
      query: (body) => ({ url: `/user/organogram/assignments/`, method: "POST", body }),
      invalidatesTags: ["OrgAssignments", "OrgPositions", "OrgPositionTree", "StaffProfiles"],
    }),
    // Ends an open tenure (sets end_date); body may carry an explicit end_date.
    closeAssignment: builder.mutation<DataEnvelope<PositionAssignment>, { id: number | string; end_date?: string }>({
      query: ({ id, end_date }) => ({ url: `/user/organogram/assignments/${id}/close/`, method: "POST", body: end_date ? { end_date } : {} }),
      invalidatesTags: ["OrgAssignments", "OrgPositions", "OrgPositionTree", "StaffProfiles"],
    }),

    // ── Matrix (dotted) reports ──────────────────────────────────────────────
    getMatrixReports: builder.query<MatrixReportsResponse, QueryParams | void>({
      query: (params) => ({ url: `/user/organogram/matrix-reports/${generateQueryString(params ?? {})}`, method: "GET" }),
      providesTags: ["OrgMatrixReports"],
    }),
    createMatrixReport: builder.mutation<DataEnvelope<MatrixReport>, MatrixReportWritePayload>({
      query: (body) => ({ url: `/user/organogram/matrix-reports/`, method: "POST", body }),
      invalidatesTags: ["OrgMatrixReports"],
    }),
    deleteMatrixReport: builder.mutation<void, number | string>({
      query: (id) => ({ url: `/user/organogram/matrix-reports/${id}/`, method: "DELETE" }),
      invalidatesTags: ["OrgMatrixReports"],
    }),

    // ── Platform staff profiles ──────────────────────────────────────────────
    getStaffProfiles: builder.query<StaffProfilesResponse, QueryParams | void>({
      query: (params) => ({ url: `/user/platform-staff-profiles/${generateQueryString(params ?? {})}`, method: "GET" }),
      providesTags: ["StaffProfiles"],
    }),
    getStaffProfile: builder.query<DataEnvelope<StaffProfileDetail>, number | string>({
      query: (id) => ({ url: `/user/platform-staff-profiles/${id}/`, method: "GET" }),
      providesTags: ["StaffProfiles"],
    }),
    getMyStaffProfile: builder.query<DataEnvelope<StaffProfile>, void>({
      query: () => ({ url: `/user/platform-staff-profiles/me/`, method: "GET" }),
      providesTags: ["StaffProfiles"],
    }),
    createStaffProfile: builder.mutation<DataEnvelope<StaffProfile>, StaffProfileWritePayload>({
      query: (body) => ({ url: `/user/platform-staff-profiles/`, method: "POST", body }),
      invalidatesTags: ["StaffProfiles"],
    }),
    updateStaffProfile: builder.mutation<DataEnvelope<StaffProfile>, { id: number | string; body: StaffProfileWritePayload }>({
      query: ({ id, body }) => ({ url: `/user/platform-staff-profiles/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["StaffProfiles"],
    }),
    updateMyStaffProfile: builder.mutation<DataEnvelope<StaffProfile>, StaffProfileWritePayload>({
      query: (body) => ({ url: `/user/platform-staff-profiles/me/`, method: "PATCH", body }),
      invalidatesTags: ["StaffProfiles"],
    }),
    uploadStaffProfilePhoto: builder.mutation<DataEnvelope<StaffProfile>, { id: number | string | "me"; file: File }>({
      queryFn: async ({ id, file }, _api, _extra, baseQuery) => {
        const body = new FormData();
        body.append("profile_photo", file);
        const result = await baseQuery({ url: `/user/platform-staff-profiles/${id}/`, method: "PATCH", body });
        // baseQuery types its data as `unknown`; the endpoint returns the same
        // DataEnvelope<StaffProfile> the PATCH endpoints do, so narrow it here.
        if (result.error) return { error: result.error };
        return { data: result.data as DataEnvelope<StaffProfile> };
      },
      // Invalidating the shared photo map refreshes every avatar on the platform
      // (header, org chart, audit, RBAC, …) the moment a photo changes.
      invalidatesTags: ["StaffProfiles", "StaffPhotos"],
    }),
  }),
});

export const {
  useGetOrgNodesQuery,
  useGetOrgNodeQuery,
  useCreateOrgNodeMutation,
  useUpdateOrgNodeMutation,
  useDeleteOrgNodeMutation,
  useGetPositionsQuery,
  useGetPositionQuery,
  useGetPositionTreeQuery,
  useGetVacanciesQuery,
  useCreatePositionMutation,
  useUpdatePositionMutation,
  useDeletePositionMutation,
  useGetAssignmentsQuery,
  useGetMyAssignmentsQuery,
  useGetCurrentOrganogramAssignmentsQuery,
  useCreateAssignmentMutation,
  useCloseAssignmentMutation,
  useGetMatrixReportsQuery,
  useCreateMatrixReportMutation,
  useDeleteMatrixReportMutation,
  useGetStaffProfilesQuery,
  useGetStaffProfileQuery,
  useGetMyStaffProfileQuery,
  useCreateStaffProfileMutation,
  useUpdateStaffProfileMutation,
  useUpdateMyStaffProfileMutation,
  useUploadStaffProfilePhotoMutation,
} = organogramApi;
