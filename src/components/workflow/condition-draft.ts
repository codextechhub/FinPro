/**
 * One condition while somebody is writing it, and its round trip to the API.
 *
 * A condition is stored as one comparison - `{op, field, value}` - or several
 * joined under `all`. A screen holds them as a flat list instead, because "and"
 * is the only way this product joins conditions and a list is what the person
 * is actually editing: add a row, remove a row.
 *
 * Two screens write conditions, and they share this: a Dynamic Role's rules
 * ("when the amount is over ₦2m, the proprietor approves") and a stage's own
 * condition ("only run this step when..."). Values are held the way the API
 * wants them: money in whole kobo, ids and keys as strings, and a list for
 * "is one of".
 */
import type {
  ConditionFieldSpec,
  WorkflowCondition,
} from "@/redux/services/dashboard/workflow-types";

export type ConditionValue = string | number | string[] | null;

/** One comparison: a field, how it is compared, and what with. */
export interface ConditionDraft {
  key: string;
  /**
   * The area the picker is showing: `document`, `requester`, or one an app
   * owns, such as `student`. Never sent - a field's own key says which area it
   * belongs to - but held so the field list can be narrowed before one is
   * picked.
   */
  area: string;
  field: string;
  op: string;
  value: ConditionValue;
}

/** Operators whose value is a list rather than one value. */
export const LIST_OPS = new Set(["in", "not_in"]);

let seq = 0;
/** A stable key for a React list. Never sent. */
export const nextKey = (prefix: string) => `${prefix}-${++seq}`;

export const emptyCondition = (area = "document"): ConditionDraft => ({
  key: nextKey("cond"),
  area,
  field: "",
  op: "",
  value: null,
});

/**
 * The area a field belongs to: what the catalogue says, or what its key shows.
 *
 * The key falls back for a condition read while the catalogue is still loading,
 * or one saved before its area was declared - `student.class_name` is the
 * student's either way, and a key with no area in it is the document's own.
 */
export function areaOf(key: string, fields?: Map<string, ConditionFieldSpec>): string {
  const field = fields?.get(key);
  if (field) return field.area;
  return key.includes(".") ? key.split(".")[0] : "document";
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

/** The comparisons in a stored condition: one on its own, or those joined under `all`. */
export function leavesOf(
  condition: WorkflowCondition,
): { op: string; field: string; value: unknown }[] {
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

/** A stored condition as editable rows. */
export function draftsFromCondition(
  condition: WorkflowCondition,
  fields?: Map<string, ConditionFieldSpec>,
): ConditionDraft[] {
  return leavesOf(condition).map((leaf) => ({
    key: nextKey("cond"),
    area: areaOf(leaf.field, fields),
    field: leaf.field,
    op: leaf.op,
    value: normaliseValue(leaf.value),
  }));
}

/** Rows as the API stores them: one comparison on its own, several joined by "and". */
export function conditionFromDrafts(conditions: ConditionDraft[]): WorkflowCondition {
  const leaves = conditions.map((c) => ({ op: c.op, field: c.field, value: c.value }));
  if (leaves.length === 0) return null;
  return leaves.length === 1 ? leaves[0] : { all: leaves };
}

function isBlank(value: ConditionValue): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

/**
 * What saving would refuse about these rows, or null when they are complete.
 *
 * The server checks the same things and has the last word; this catches the
 * gaps a half-finished form always has, so the reason appears beside the row
 * rather than as a 400 after a save. *where* prefixes the message, because the
 * same rows are edited inside a numbered rule and on a single stage.
 */
export function conditionProblem(
  conditions: ConditionDraft[],
  fields: Map<string, ConditionFieldSpec>,
  where: string,
): string | null {
  for (const condition of conditions) {
    const field = fields.get(condition.field);
    if (!field) return `${where}: choose what the condition tests.`;
    if (!field.operators.includes(condition.op)) {
      return `${where}: choose how ${field.label} is compared.`;
    }
    if (isBlank(condition.value)) return `${where}: give a value for ${field.label}.`;
  }
  return null;
}
