/**
 * The draft shape for one workflow stage in the template builder, shared by the
 * builder form and the live approver preview.
 */
import type { ConditionDraft } from "@/pages/protected/workflow/components/condition-draft";
import type {
  ApproverScope,
  ApproverSource,
  DynamicRulePayload,
  OrganogramTarget,
  StageAdvanceRule,
  StageKind,
  StageOnRejection,
} from "@/redux/services/dashboard/workflow-types";

export interface StageForm {
  code: string;
  label: string;
  kind: StageKind;
  approver_source: ApproverSource;
  approver_scope: ApproverScope;
  approver_role_key: string;
  approver_group_code: string;
  /** DYNAMIC_ROLE: the named Dynamic Role that decides who approves, by code. */
  dynamic_role_code: string;
  /**
   * DYNAMIC_ROLE: rules the stage carries itself, written before Dynamic Roles
   * had names. They are shown read-only and published back as they are until a
   * Dynamic Role is picked in their place, so opening an old template and
   * saving it never drops them.
   */
  legacy_rules: DynamicRulePayload[];
  /** Whole kobo, for trying the stage in the preview. Never published. */
  sample_amount: number | null;
  organogram_target: OrganogramTarget | "";
  organogram_levels: string;
  organogram_position_code: string;
  advance_rule: StageAdvanceRule;
  quorum_count: string;
  on_rejection: StageOnRejection;
  skip_if_no_approvers: boolean;
  /**
   * When this step runs at all, as rows joined by "and". Empty means every
   * time, which is what most steps are. The same rows a Dynamic Role's rule
   * holds, so a school writes "the amount is over ₦2m" once and recognises it
   * wherever it appears.
   */
  inclusion: ConditionDraft[];
}

export const emptyStage = (): StageForm => ({
  code: "",
  label: "",
  kind: "APPROVAL",
  approver_source: "ROLE",
  approver_scope: "SCHOOL",
  approver_role_key: "",
  approver_group_code: "",
  dynamic_role_code: "",
  legacy_rules: [],
  sample_amount: null,
  organogram_target: "",
  organogram_levels: "1",
  organogram_position_code: "",
  advance_rule: "ANY",
  quorum_count: "0",
  on_rejection: "TERMINAL",
  skip_if_no_approvers: true,
  inclusion: [],
});
