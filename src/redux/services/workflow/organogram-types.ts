/**
 * Types for the CX-staff organogram (vs_user app: OrgNode / Position /
 * PositionAssignment / MatrixReport) and the platform staff profile.
 *
 * Mirrors the DRF serializers in backend/apps/vs_user/serializers.py. Read
 * representations nest inline objects; writes take *_id fields.
 *
 * Org structure is tiered: DIVISION → DEPARTMENT → TEAM (OrgNode.kind). A
 * Position belongs to one org node (any tier); a person's department/division
 * are derived by walking up from their seat's node.
 */

import type { PaginatedResponse } from "./envelope-types";

// ── Enums (mirror model TextChoices) ─────────────────────────────────────────

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";

export type EmploymentStatus = "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "EXITED";

export type MaritalStatus = "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED";

export type OrgNodeKind = "DIVISION" | "DEPARTMENT" | "TEAM";

// ── Inline (nested) representations ──────────────────────────────────────────

export interface UserInline {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
}

export interface OrgNodeInline {
  id: number;
  name: string;
  code: string;
  kind: OrgNodeKind;
}

export interface PositionInline {
  id: number;
  title: string;
  code: string;
  org_node: OrgNodeInline | null;
}

// ── Full read models ─────────────────────────────────────────────────────────

export interface OrgNode {
  id: number;
  name: string;
  code: string;
  kind: OrgNodeKind;
  parent: OrgNodeInline | null;
  head_position: PositionInline | null;
  head: UserInline | null;
  description: string;
  is_active: boolean;
  children_count: number;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: number;
  title: string;
  code: string;
  org_node: OrgNodeInline;
  reports_to: PositionInline | null;
  default_role: number | null;
  headcount: number;
  is_active: boolean;
  current_holders: UserInline[];
  is_vacant: boolean;
  open_seats: number;
  created_at: string;
  updated_at: string;
}

export interface PositionAssignment {
  id: number;
  user: UserInline;
  position: PositionInline;
  is_primary: boolean;
  is_acting: boolean;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

// Deliberately small shape returned by the employee-facing organogram. Full
// assignment history remains on the RBAC-gated assignments endpoint.
export interface CurrentOrganogramAssignment {
  user: UserInline;
  position: PositionInline;
  is_acting: boolean;
}

export interface MatrixReport {
  id: number;
  position: PositionInline;
  reports_to: PositionInline;
  relationship_label: string;
  created_at: string;
  updated_at: string;
}

// Recursive node returned by GET /organogram/positions/tree/.
export interface OrganogramNode {
  id: number;
  title: string;
  code: string;
  org_node: OrgNodeInline | null;
  holders: UserInline[];
  is_vacant: boolean;
  direct_reports: OrganogramNode[];
}

// ── Platform staff profile ───────────────────────────────────────────────────

// Slim list representation - never carries payroll fields.
export interface StaffProfileListItem {
  id: number;
  user: UserInline;
  employee_id: string | null;
  job_title: string;
  position: PositionInline | null;
  // org_node = the exact seat's node; department = its DEPARTMENT-tier ancestor.
  org_node: OrgNodeInline | null;
  department: OrgNodeInline | null;
  division: OrgNodeInline | null;
  employment_type: EmploymentType | "";
  employment_status: EmploymentStatus;
  is_active_employee: boolean;
  created_at: string;
  updated_at: string;
}

/** Work-only profile returned to an ordinary colleague in the same tenant. */
export interface StaffProfileBrief {
  profile_view: "brief";
  id: number;
  user: UserInline;
  profile_photo: string | null;
  employee_id: string | null;
  job_title: string;
  position: PositionInline | null;
  org_node: OrgNodeInline | null;
  department: OrgNodeInline | null;
  division: OrgNodeInline | null;
  current_line_manager: UserInline | null;
  employment_type: EmploymentType | "";
  employment_status: EmploymentStatus;
  is_active_employee: boolean;
}

/**
 * Full profile. Payroll fields (bank_name / account_name / account_number) are
 * FLS-gated: when the caller lacks platform.staff_payroll.view (and is not the
 * owner), the backend OMITS those keys entirely and lists them in
 * `_stripped_fields` - they are absent, not masked. Treat their absence as
 * "restricted", and use `_stripped_fields` to render the restricted notice.
 */
export interface StaffProfile {
  profile_view: "full";
  id: number;
  user: UserInline;
  date_of_birth: string | null;
  marital_status: MaritalStatus | "";
  nationality: string;
  state_of_origin: string;
  profile_photo: string | null;
  bio: string;
  personal_email: string;
  alternate_phone: string;
  residential_address: string;
  city: string;
  state: string;
  nok_name: string;
  nok_relationship: string;
  nok_phone: string;
  nok_address: string;
  employee_id: string | null;
  job_title: string;
  position: PositionInline | null;
  // Derived from the primary position's org node (read-only).
  org_node: OrgNodeInline | null;
  department: OrgNodeInline | null;
  division: OrgNodeInline | null;
  current_line_manager: UserInline | null;
  employment_type: EmploymentType | "";
  employment_status: EmploymentStatus;
  date_joined: string | null;
  date_exited: string | null;
  is_active_employee: boolean;
  // FLS-gated payroll - present only when authorised.
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  _stripped_fields?: string[];
  created_at: string;
  updated_at: string;
}

export type StaffProfileDetail = StaffProfile | StaffProfileBrief;

// ── Write payloads ───────────────────────────────────────────────────────────

export interface OrgNodeWritePayload {
  name?: string;
  code?: string;
  kind?: OrgNodeKind;
  parent_id?: number | null;
  head_position_id?: number | null;
  description?: string;
  is_active?: boolean;
}

export interface PositionWritePayload {
  title?: string;
  code?: string;
  org_node_id?: number;
  reports_to_id?: number | null;
  default_role?: number | null;
  headcount?: number;
  is_active?: boolean;
}

export interface AssignmentCreatePayload {
  user_id: string;
  position_id: number;
  is_primary?: boolean;
  is_acting?: boolean;
  start_date?: string;
}

export interface MatrixReportWritePayload {
  position_id: number;
  reports_to_id: number;
  relationship_label?: string;
}

export interface StaffProfileWritePayload {
  user_id?: string;
  position_id?: number | null;
  date_of_birth?: string | null;
  marital_status?: MaritalStatus | "";
  nationality?: string;
  state_of_origin?: string;
  bio?: string;
  personal_email?: string;
  alternate_phone?: string;
  residential_address?: string;
  city?: string;
  state?: string;
  nok_name?: string;
  nok_relationship?: string;
  nok_phone?: string;
  nok_address?: string;
  employee_id?: string | null;
  job_title?: string;
  employment_type?: EmploymentType | "";
  employment_status?: EmploymentStatus;
  date_joined?: string | null;
  date_exited?: string | null;
  // Owner (or payroll-manage holders) may also send these.
  bank_name?: string;
  account_name?: string;
  account_number?: string;
}

// ── Response envelopes ───────────────────────────────────────────────────────

export type OrgNodesResponse = PaginatedResponse<OrgNode>;
export type PositionsResponse = PaginatedResponse<Position>;
export type AssignmentsResponse = PaginatedResponse<PositionAssignment>;
export type MatrixReportsResponse = PaginatedResponse<MatrixReport>;
export type StaffProfilesResponse = PaginatedResponse<StaffProfileListItem>;

export interface DataEnvelope<T> {
  message?: string;
  data: T;
}
