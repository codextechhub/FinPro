/**
 * Field Level Security (FLS) utilities.
 *
 * When the backend strips a field because the user lacks permission, it adds
 * "_stripped_fields": ["field_a", "field_b"] to the response instead of sending
 * the field at all.  This lets the frontend distinguish two different states:
 *
 *   • field absent from response AND listed in _stripped_fields
 *       → user has no permission to see it → hide the element entirely
 *
 *   • field present in response but empty/null
 *       → field exists, just has no value → render "-" (or a placeholder)
 *
 * Usage:
 *
 *   import { isStripped } from "@/utils/fls";
 *
 *   // Hide a row entirely when the field was stripped
 *   {!isStripped(student, "medical_notes") && (
 *     <Row label="Medical Notes" value={student.medical_notes ?? "-"} />
 *   )}
 *
 *   // Pick a display value in one expression
 *   {isStripped(student, "guardian_contacts") ? null : (student.guardian_contacts ?? "-")}
 */

/** Any object that may carry the _stripped_fields array from the backend. */
export type WithFls<T> = T & { _stripped_fields?: string[] };

/**
 * Returns true when the backend stripped `field` due to an FLS permission
 * denial. Returns false when the field simply has no value.
 */
export function isStripped(
  data: WithFls<object> | null | undefined,
  field: string,
): boolean {
  return data?._stripped_fields?.includes(field) ?? false;
}

/**
 * Builds a Set of stripped field names for a single data object - useful
 * when checking multiple fields to avoid repeated .includes() calls.
 *
 *   const stripped = strippedFields(student);
 *   stripped.has("medical_notes")     // O(1)
 *   stripped.has("guardian_contacts") // O(1)
 */
export function strippedFields(
  data: WithFls<object> | null | undefined,
): Set<string> {
  return new Set(data?._stripped_fields ?? []);
}
