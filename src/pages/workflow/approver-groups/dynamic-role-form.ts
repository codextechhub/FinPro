/**
 * The draft a Dynamic Role editor holds, and its round trip to the API.
 *
 * The API stores a rule's condition as one comparison, or several under
 * `all`, and the Otherwise row as a rule with no condition that must come last.
 * The draft keeps the Otherwise row apart from the ordered rules instead, so
 * the form cannot delete it, move it or give it a condition, and joins the two
 * back together only when it builds a payload.
 *
 * The conditions themselves belong to the shared condition model, because the
 * same rows are written on a template stage ("only run this step when..."); it
 * is re-exported here so a screen that holds a rule reaches for one module.
 */
import type {
  ConditionFieldSpec,
  DynamicRole,
  DynamicRoleRule,
  DynamicRoleRulePayload,
  DynamicRoleTargetKind,
  DynamicRoleWritePayload,
} from "@/redux/services/dashboard/workflow-types";
import {
  type ConditionDraft,
  type ConditionValue,
  conditionFromDrafts,
  conditionProblem,
  draftsFromCondition,
  emptyCondition,
  nextKey,
} from "@/pages/protected/workflow/components/condition-draft";

export type { ConditionDraft, ConditionValue };
export {
  LIST_OPS,
  areaOf,
  emptyCondition,
  resetForField,
  valueForOp,
} from "@/pages/protected/workflow/components/condition-draft";

/** Who a rule sends to. Only the field matching `kind` is read. */
export interface TargetDraft {
  kind: DynamicRoleTargetKind;
  roleKey: string;
  userId: string;
  groupCode: string;
}

/** One ordered rule: every condition must hold, and then it sends to `target`. */
export interface RuleDraft {
  key: string;
  conditions: ConditionDraft[];
  target: TargetDraft;
  label: string;
}

export interface DynamicRoleDraft {
  code: string;
  name: string;
  description: string;
  rules: RuleDraft[];
  /** Where a document goes when no rule matches. Always last, never conditional. */
  otherwise: TargetDraft;
}

export const emptyTarget = (kind: DynamicRoleTargetKind = "ROLE"): TargetDraft => ({
  kind,
  roleKey: "",
  userId: "",
  groupCode: "",
});

export const emptyRule = (): RuleDraft => ({
  key: nextKey("rule"),
  conditions: [emptyCondition()],
  target: emptyTarget(),
  label: "",
});

export const emptyDraft = (): DynamicRoleDraft => ({
  code: "",
  name: "",
  description: "",
  rules: [emptyRule()],
  otherwise: emptyTarget(),
});

/** A code is the handle a stage publishes against, so it is slugged and fixed once saved. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function targetFrom(rule: DynamicRoleRule): TargetDraft {
  return {
    kind: rule.target_kind,
    roleKey: rule.role_key ?? "",
    userId: rule.user != null ? String(rule.user) : "",
    groupCode: rule.group_code ?? "",
  };
}

/** A saved Dynamic Role as an editable draft. */
export function draftFromDynamicRole(
  role: DynamicRole,
  fields?: Map<string, ConditionFieldSpec>,
): DynamicRoleDraft {
  const ordered = [...role.rules].sort((a, b) => a.order - b.order);
  const otherwise = ordered.find((rule) => rule.is_fallback);
  return {
    code: role.code,
    name: role.name,
    description: role.description ?? "",
    rules: ordered
      .filter((rule) => !rule.is_fallback)
      .map((rule) => ({
        key: nextKey("rule"),
        conditions: draftsFromCondition(rule.condition, fields),
        target: targetFrom(rule),
        label: rule.label ?? "",
      })),
    otherwise: otherwise ? targetFrom(otherwise) : emptyTarget(),
  };
}

function targetPayload(
  target: TargetDraft,
): Pick<DynamicRoleRulePayload, "target_kind" | "role_key" | "user" | "group_code"> {
  if (target.kind === "USER") return { target_kind: "USER", user: target.userId };
  if (target.kind === "GROUP") return { target_kind: "GROUP", group_code: target.groupCode };
  return { target_kind: "ROLE", role_key: target.roleKey };
}

/** The rules as the API stores them: the ordered rules, then the Otherwise row, last. */
export function rulesPayload(draft: DynamicRoleDraft): DynamicRoleRulePayload[] {
  const rules: DynamicRoleRulePayload[] = draft.rules.map((rule) => ({
    condition: conditionFromDrafts(rule.conditions),
    ...targetPayload(rule.target),
    label: rule.label.trim(),
  }));
  return [...rules, { condition: null, ...targetPayload(draft.otherwise) }];
}

/** Everything the editor saves. The code is sent only when creating, since it cannot change. */
export function draftPayload(
  draft: DynamicRoleDraft,
  { creating }: { creating: boolean },
): DynamicRoleWritePayload {
  return {
    ...(creating ? { code: draft.code || slugify(draft.name) } : {}),
    name: draft.name.trim(),
    description: draft.description.trim(),
    rules: rulesPayload(draft),
  };
}

function targetProblem(target: TargetDraft): string | null {
  if (target.kind === "ROLE" && !target.roleKey) return "choose the role that approves.";
  if (target.kind === "USER" && !target.userId) return "choose the person who approves.";
  if (target.kind === "GROUP" && !target.groupCode) return "choose the approver group.";
  return null;
}

/**
 * What saving would refuse, found before the request.
 *
 * The server checks the same things and has the last word. This catches the
 * gaps a half-finished form always has - a rule with no role picked, an amount
 * left blank, a condition on a field nothing can answer - so the reason appears
 * at once, numbered the way the server numbers rules. Returns null when the
 * draft is complete.
 */
export function draftProblem(
  draft: DynamicRoleDraft,
  fields: Map<string, ConditionFieldSpec>,
): string | null {
  if (!draft.name.trim()) return "Give the Dynamic Role a name.";
  for (let i = 0; i < draft.rules.length; i++) {
    const where = `Rule ${i + 1}`;
    const rule = draft.rules[i];
    if (!rule.conditions.length) return `${where}: add a condition, or remove the rule.`;
    const conditionIssue = conditionProblem(rule.conditions, fields, where);
    if (conditionIssue) return conditionIssue;
    const problem = targetProblem(rule.target);
    if (problem) return `${where}: ${problem}`;
  }
  const problem = targetProblem(draft.otherwise);
  return problem ? `Otherwise: ${problem}` : null;
}
