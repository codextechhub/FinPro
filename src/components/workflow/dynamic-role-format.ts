/**
 * A Dynamic Role's rules in words.
 *
 * A condition is stored as a field path, an operator and a value -
 * `amount gt 200000000` - which reads as code. Every screen that shows a rule
 * says it the way an administrator would instead: "Amount is more than
 * ₦2,000,000". A field's label and kind come from the server's field list, so
 * no screen guesses what `requester.branch` means, and the names of branches,
 * people and roles come from lookups the caller already holds.
 */
import type {
  ConditionFieldSpec,
  ConditionFieldType,
  DynamicRoleRule,
  WorkflowCondition,
} from "@/redux/services/dashboard/workflow-types";
import { formatMoney } from "@/utils/money";

const ORDERED: Record<string, string> = {
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  eq: "is exactly",
  ne: "is not",
};
const ONE_OF: Record<string, string> = {
  eq: "is",
  ne: "is not",
  in: "is one of",
  not_in: "is not one of",
};

/** How each kind of field's operators read. */
export const OPERATOR_LABELS: Record<ConditionFieldType, Record<string, string>> = {
  MONEY: ORDERED,
  NUMBER: ORDERED,
  TEXT: { eq: "is", ne: "is not", contains: "contains" },
  CHOICE: ONE_OF,
  BRANCH: ONE_OF,
  PERSON: ONE_OF,
  ROLE: { contains: "has the role" },
};

/** Any operator in words, for a field whose kind is not known. */
const ANY_OPERATOR: Record<string, string> = { ...ORDERED, ...ONE_OF, contains: "contains" };

export function operatorLabel(field: ConditionFieldSpec | undefined, op: string): string {
  return (field && OPERATOR_LABELS[field.type]?.[op]) || ANY_OPERATOR[op] || "matches";
}

/** Names for the ids a condition may hold, from lists the caller already has. */
export interface NameLookups {
  branch?: (id: string) => string | undefined;
  person?: (id: string) => string | undefined;
  role?: (key: string) => string | undefined;
}

/**
 * One value in words: money as naira, a choice by its label, an id by its name.
 * A choice, branch, person or role nothing names any more reads neutrally,
 * never as its stored code or id.
 */
export function valueLabel(
  field: ConditionFieldSpec | undefined,
  value: unknown,
  names: NameLookups = {},
): string {
  if (Array.isArray(value)) return value.map((v) => valueLabel(field, v, names)).join(", ");
  if (value == null || value === "") return "-";
  const text = String(value);
  switch (field?.type) {
    case "MONEY":
      return typeof value === "number" ? formatMoney(value) : text;
    case "CHOICE":
      return field.choices.find((choice) => choice.value === text)?.label ?? "an option no longer offered";
    case "BRANCH":
      return names.branch?.(text) ?? "a branch no longer on record";
    case "PERSON":
      return names.person?.(text) ?? "a person no longer on record";
    case "ROLE":
      return names.role?.(text) ?? "a role no longer defined";
    default:
      return text;
  }
}

/** The comparisons in a stored condition: one on its own, or those joined under `all`. */
export function conditionLeaves(
  condition: WorkflowCondition,
): { op: string; field: string; value: unknown }[] {
  if (condition == null) return [];
  if ("all" in condition) return condition.all.flatMap(conditionLeaves);
  if ("op" in condition) return [condition];
  return [];
}

/**
 * The amount, for when the field list could not be read - somebody who may view
 * a template but not manage approvers, say. It is the one field worth standing
 * in for, because a sum of kobo read as a plain number is off by a hundred.
 */
const AMOUNT: ConditionFieldSpec = {
  key: "amount", label: "Amount", area: "document", subject: "document", type: "MONEY",
  operators: [], choices: [], document_types: [],
};

/** What a field nothing in the catalogue names reads as; never its path. */
const UNKNOWN_FIELD = "A detail of the document";

/**
 * A condition as one sentence, its comparisons joined by "and".
 *
 * For a rule being written, before the server has worded it. A saved rule
 * carries `condition_description`, the server's sentence, which callers show
 * instead.
 */
export function conditionSentence(
  condition: WorkflowCondition,
  fields: Map<string, ConditionFieldSpec>,
  names: NameLookups = {},
): string {
  return conditionLeaves(condition)
    .map((leaf) => {
      const field = fields.get(leaf.field) ?? (leaf.field === "amount" ? AMOUNT : undefined);
      return `${field?.label ?? UNKNOWN_FIELD} ${operatorLabel(field, leaf.op)} ${valueLabel(field, leaf.value, names)}`;
    })
    .join(" and ");
}

/** Who a stored rule sends to: the role, the person or the group, by name. */
export function targetSentence(
  rule: Pick<DynamicRoleRule,
    "target_kind" | "role_key" | "role_name" | "user_name" | "group_name" | "group_code">,
): string {
  if (rule.target_kind === "USER") return rule.user_name || "a named person";
  if (rule.target_kind === "GROUP") return rule.group_name || "an approver group";
  return rule.role_name || "a role not set up here";
}
