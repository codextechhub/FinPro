/**
 * Reading a refused payroll write, so a form can say what was refused beside
 * the field it concerns.
 *
 * The request interceptor already toasts a 400's first message, so a screen
 * never toasts it again. Some refusals are worth keeping in view after the
 * toast has gone, because they tell the reader what to do next: adding
 * somebody already paid by another branch ("change the branch on their
 * existing salary record instead"), or correcting earlier pay while a draft
 * run still holds the person ("void it and raise it again"). Those are shown
 * on the form from here.
 */

/** Each field's first message from a 400 refusal, or an empty map for any other error. */
export function fieldRefusals(error: unknown): Record<string, string> {
  if (!error || typeof error !== "object") return {};
  const outer = error as { status?: unknown; data?: unknown };
  if (outer.status !== 400) return {};
  const envelope = outer.data as { error?: { detail?: unknown } } | undefined;
  const detail = envelope?.error?.detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(detail as Record<string, unknown>)) {
    const message = Array.isArray(value) ? value.find((v) => typeof v === "string") : value;
    if (typeof message === "string" && message) out[name] = message;
  }
  return out;
}
