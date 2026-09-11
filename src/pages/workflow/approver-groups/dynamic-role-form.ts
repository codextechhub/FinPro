/**
 * The draft a Dynamic Role editor holds, and its round trip to the API.
 *
 * The API stores a rule's condition as one comparison, or several under
 * `all`, and the Otherwise row as a rule with no condition that must come last.
 * The draft keeps the Otherwise row apart from the ordered rules instead, so
 * the form cannot delete it, move it or give it a condition, and joins the two
 * back together only when it builds a payload.
 *
 * Values are held the way the API wants them: money in whole kobo, ids and
 * keys as strings, and a list for "is one of".
 */
import type {
  ConditionFieldSpec,
  DynamicRole,
  DynamicRoleRule,
  DynamicRoleRulePayload,
  DynamicRoleTargetKind,
  DynamicRoleWritePayload,
  WorkflowCondition,
} from "@/redux/services/dashboard/workflow-types";

export type ConditionValue = string | number | string[] | null;

/** Which question a condition answers, which decides the fields the form offers. */
export type ConditionSubject = "document" | "requester";

/** One comparison in a rule: a field, how it is compared, and what with. */
export interface ConditionDraft {
  key: string;
  /** The form's choice before a field is picked. Never sent: the field says it. */
  subject: ConditionSubject;
  field: string;
  op: string;
  value: ConditionValue;
}

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
  documentTypes: string[];
  rules: RuleDraft[];
  /** Where a document goes when no rule matches. Always last, never conditional. */
  otherwise: TargetDraft;
}

/** Operators whose value is a list rather than one value. */
export const LIST_OPS = new Set(["in", "not_in"]);

let seq = 0;
const nextKey = (prefix: string) => `${prefix}-${++seq}`;

export const emptyTarget = (kind: DynamicRoleTargetKind = "ROLE"): TargetDraft => ({
  kind,
  roleKey: "",
  userId: "",
  groupCode: "",
});

export const emptyCondition = (subject: ConditionSubject = "document"): ConditionDraft => ({
  key: nextKey("cond"),
  subject,
  field: "",
  op: "",
  value: null,
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
  documentTypes: [],
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

/** A condition pointed at a newly chosen field: its first operator, and no value yet. */
export function resetForField(
  condition: ConditionDraft,
  field: ConditionFieldSpec | undefined,
): ConditionDraft {
  return { ...condition, field: field?.key ?? "", op: field?.operators[0] ?? "", value: null };
}

/** The value reshaped for an operator: a list for "is one of", a single value otherwise. */
export function valueForOp(op: string, previous: ConditionValue): ConditionValue {
  if (LIST_OPS.has(op)) {
    if (Array.isArray(previous)) return previous;
    return previous == null || previous === "" ? [] : [String(previous)];
  }
  return Array.isArray(previous) ? (previous[0] ?? null) : previous;
}

function leavesOf(condition: WorkflowCondition): { op: string; field: string; value: unknown }[] {
  if (condition == null) return [];
  if ("all" in condition) return condition.all.flatMap(leavesOf);
  if ("op" in condition) return [condition];
  return [];
}

function normaliseValue(value: unknown): ConditionValue {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "number") return value;
  if (value == null) return null;
  return String(value);
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
export function draftFromDynamicRole(role: DynamicRole): DynamicRoleDraft {
  const ordered = [...role.rules].sort((a, b) => a.order - b.order);
  const otherwise = ordered.find((rule) => rule.is_fallback);
  return {
    code: role.code,
    name: role.name,
    description: role.description ?? "",
    documentTypes: [...role.document_types],
    rules: ordered
      .filter((rule) => !rule.is_fallback)
      .map((rule) => ({
        key: nextKey("rule"),
        conditions: leavesOf(rule.condition).map((leaf) => ({
          key: nextKey("cond"),
          subject: leaf.field.startsWith("requester.") ? "requester" : "document",
          field: leaf.field,
          op: leaf.op,
          value: normaliseValue(leaf.value),
        })),
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
  const rules: DynamicRoleRulePayload[] = draft.rules.map((rule) => {
    const leaves = rule.conditions.map((c) => ({ op: c.op, field: c.field, value: c.value }));
    return {
      condition: leaves.length === 1 ? leaves[0] : { all: leaves },
      ...targetPayload(rule.target),
      label: rule.label.trim(),
    };
  });
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
    document_types: draft.documentTypes,
    rules: rulesPayload(draft),
  };
}

function isBlank(value: ConditionValue): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
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
 * left blank, a condition on a field the chosen document types no longer
 * offer - so the reason appears at once, numbered the way the server numbers
 * rules. Returns null when the draft is complete.
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
    for (const condition of rule.conditions) {
      const field = fields.get(condition.field);
      if (!field) return `${where}: choose what the condition tests.`;
      if (!field.operators.includes(condition.op)) {
        return `${where}: choose how ${field.label} is compared.`;
      }
      if (isBlank(condition.value)) return `${where}: give a value for ${field.label}.`;
    }
    const problem = targetProblem(rule.target);
    if (problem) return `${where}: ${problem}`;
  }
  const problem = targetProblem(draft.otherwise);
  return problem ? `Otherwise: ${problem}` : null;
}
