// The draft shape for one workflow stage in the template builder, shared by the
// builder form and the live approver-preview component.
import type {
  DynamicRulePayload,
  WorkflowStage,
  StageKind,
  ApproverSource,
  ApproverScope,
  OrganogramTarget,
  StageAdvanceRule,
  StageOnRejection,
  WorkflowCondition,
} from "@/redux/services/dashboard/workflow-types";

/**
 * One dynamic-role rule while it is being edited.
 *
 * Most rules are a single comparison, so those are held as three plain fields
 * the form can bind to directly. Anything the engine accepts but this form
 * cannot express (`all`/`any`/`not`/`fn`) is kept verbatim in `raw` and edited
 * as JSON, so opening a template in the builder can never quietly simplify a
 * condition somebody wrote deliberately.
 */
export interface RuleForm {
  /** Stable key for React lists; never sent. */
  key: string;
  field: string;
  op: string;
  value: string;
  role_key: string;
  label: string;
  /** No condition - always matches, so the backend requires it to be last. */
  is_fallback: boolean;
  /** Set when the condition is not a simple comparison; edited as JSON. */
  raw: WorkflowCondition | null;
  raw_text: string;
}

export interface StageForm {
  code: string;
  label: string;
  kind: StageKind;
  approver_source: ApproverSource;
  approver_scope: ApproverScope;
  approver_role_key: string;
  approver_group_code: string;
  dynamic_rules: RuleForm[];
  /** Sample document JSON for the dynamic-rule tester. Never published. */
  sample_document_text: string;
  organogram_target: OrganogramTarget | "";
  organogram_levels: string;
  organogram_position_code: string;
  advance_rule: StageAdvanceRule;
  quorum_count: string;
  on_rejection: StageOnRejection;
  skip_if_no_approvers: boolean;
  inclusion_condition_text: string;
}

let ruleSeq = 0;
export const newRuleKey = () => `rule-${++ruleSeq}`;

export const emptyRule = (): RuleForm => ({
  key: newRuleKey(),
  field: "",
  op: "lte",
  value: "",
  role_key: "",
  label: "",
  is_fallback: false,
  raw: null,
  raw_text: "",
});

export const emptyStage = (): StageForm => ({
  code: "",
  label: "",
  kind: "APPROVAL",
  approver_source: "ROLE",
  approver_scope: "SCHOOL",
  approver_role_key: "",
  approver_group_code: "",
  dynamic_rules: [emptyRule()],
  sample_document_text: "",
  organogram_target: "",
  organogram_levels: "1",
  organogram_position_code: "",
  advance_rule: "ANY",
  quorum_count: "0",
  on_rejection: "TERMINAL",
  skip_if_no_approvers: true,
  inclusion_condition_text: "",
});

/** JSON numbers and booleans must survive the round-trip through a text input. */
export function coerceValue(text: string): unknown {
  const t = text.trim();
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  // A comma-separated list is what `in` / `not_in` need.
  if (t.startsWith("[")) {
    try {
      return JSON.parse(t);
    } catch {
      return t;
    }
  }
  const n = Number(t);
  return Number.isFinite(n) && t !== "" ? n : t;
}

/** Turn one edited rule into the condition JSON the engine evaluates. */
export function ruleCondition(r: RuleForm): WorkflowCondition {
  if (r.is_fallback) return null;
  if (r.raw !== null) return r.raw;
  return { op: r.op, field: r.field.trim(), value: coerceValue(r.value) };
}

/** Load a stored condition back into the form, keeping anything it cannot express. */
export function conditionToRuleFields(
  condition: WorkflowCondition,
): Pick<RuleForm, "field" | "op" | "value" | "is_fallback" | "raw" | "raw_text"> {
  if (condition == null) {
    return { field: "", op: "lte", value: "", is_fallback: true, raw: null, raw_text: "" };
  }
  if ("op" in condition && "field" in condition) {
    const v = condition.value;
    return {
      field: condition.field,
      op: condition.op,
      value: typeof v === "string" ? v : JSON.stringify(v),
      is_fallback: false,
      raw: null,
      raw_text: "",
    };
  }
  return {
    field: "",
    op: "lte",
    value: "",
    is_fallback: false,
    raw: condition,
    raw_text: JSON.stringify(condition, null, 2),
  };
}

// The operator vocabulary the engine's evaluator accepts, phrased for reading.
export const OP_OPTIONS = [
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is at most" },
  { value: "gt", label: "is more than" },
  { value: "gte", label: "is at least" },
  { value: "eq", label: "is" },
  { value: "ne", label: "is not" },
  { value: "in", label: "is one of" },
  { value: "not_in", label: "is not one of" },
  { value: "contains", label: "contains" },
];

/** The rules a DYNAMIC_ROLE stage publishes, in evaluation order. */
export function rulesPayload(rules: RuleForm[]): DynamicRulePayload[] {
  return rules.map((r, i) => ({
    order: i,
    condition: ruleCondition(r),
    role_key: r.role_key.trim(),
    label: r.label.trim(),
  }));
}

/** Stored rules as editable rows, in evaluation order (one blank row if none). */
export function rulesToForm(stage: Pick<WorkflowStage, "dynamic_role_rules">): RuleForm[] {
  const stored = [...(stage.dynamic_role_rules ?? [])].sort((a, b) => a.order - b.order);
  if (!stored.length) return [emptyRule()];
  return stored.map((r) => ({
    key: newRuleKey(),
    role_key: r.role_key,
    label: r.label ?? "",
    ...conditionToRuleFields(r.condition),
  }));
}

/**
 * The checks the publish endpoint makes, made in the form instead.
 *
 * Returns null when the ladder is publishable, otherwise the reason - phrased to
 * read after a caller's own prefix ("Stage 2: ..."), because the same ladder can
 * be edited from the builder (where the stage number matters) and from the
 * Dynamic Role tab (where there is only one).
 */
export function validateRules(rules: RuleForm[]): string | null {
  if (!rules.length) return "a document-driven stage needs at least one rule.";
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!r.role_key) return `rule ${i + 1}: pick a role.`;
    if (!r.is_fallback && r.raw === null && !r.field.trim())
      return `rule ${i + 1}: name the field to test.`;
    if (!r.is_fallback && r.raw === null && !r.value.trim())
      return `rule ${i + 1}: give the value to compare against.`;
    if (r.is_fallback && i !== rules.length - 1)
      return 'the "Otherwise" rule must be last - rules after it can never fire.';
  }
  return null;
}
