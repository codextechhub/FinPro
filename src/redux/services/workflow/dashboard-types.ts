import type { PaginatedResponse, ResponseMessage } from "./envelope-types";

export interface TeamMembersRes extends PaginatedResponse {
  data: TeamMember[]
}
export interface TeamMember {
  id: string
  email: string
  full_name: string
  first_name?: string
  last_name?: string
  phone?: string
  gender?: string
  /**
   * PLATFORM or SCHOOL. The CX / School split has always really been a tenant
   * kind, and this says per row what the tab could only say per page. `role` is
   * the human answer beside it - two accounts both reading "Staff" were a
   * principal and a Year 4 teacher, which a reviewer cannot act on.
   */
  tenant_kind: string
  role: string
  status: string
  school_id?: string
  school_name?: string
  branch_id?: string
  branch_name?: string
  position_id?: number | null
  position_title?: string | null
  invited_by_id?: string
  invited_by_name?: string
  password_changed_at?: string
  last_login_at?: string
  created_at: string
  updated_at?: string
  invitation_email_status?: string
  invitation_expires_at?: string
}

export interface AllRolesRes extends PaginatedResponse {
  data: Role[]
}
export interface Role {
  id: string
  /** Per-tenant role key - the value user-create sends as `role`. */
  key: string
  name: string
  status: string
  is_system_role: boolean
  is_locked: boolean
  version: number
  assigned_users_count: number
  permissions_count: number
  created_by?: string
  created_at: string
  updated_at: string
}

export interface TeamMemberRes extends ResponseMessage {
  data: TeamMember
}
