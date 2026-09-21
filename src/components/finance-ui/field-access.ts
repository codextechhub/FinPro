/**
 * Field Access: which fields of a record the signed-in user may see and change.
 *
 * An administrator turns Read and Write on or off per role, per field. The
 * backend applies those switches on every response and every save; this module
 * is how a screen follows them, so the two never disagree.
 *
 * Two sources answer the question, and they cover different moments:
 *
 *   - the `field_access` map the host reads from the login response and
 *     `/user/auth/me/`, keyed by `module.resource` (for example
 *     `"finance.bankaccount"`), each entry listing `hidden`, `read_only` and
 *     `open_on_create` names. An absent resource or an absent name means full
 *     access. It serves create forms and table columns, where no record exists
 *     yet;
 *   - an existing record itself. A field the user cannot read is simply absent
 *     from it, and a detail response lists `_read_only_fields`: names present in
 *     the payload that the user may not change. The record wins over the map,
 *     because it carries rules the map cannot know, such as a person always
 *     editing their own details.
 *
 * `open_on_create` names are read-only on an existing record but may be set
 * freely while the record is being created.
 *
 * What a screen does with the answer is fixed. A hidden field is not there at
 * all: no label, no lock, no placeholder, no empty column, and a section whose
 * fields are all hidden disappears with them. A read-only field is shown greyed
 * and disabled, and never sent. The backend refuses anything else with 403
 * `field_write_denied`; {@link fieldWriteErrors} turns that refusal into
 * per-field messages for the form to show beside each field.
 */

import { useMemo } from "react";
import { usePermissions } from "@/hooks/use-permissions";

/** One resource's restrictions, as the backend sends them. */
export interface ResourceFieldAccess {
  hidden?: readonly string[];
  read_only?: readonly string[];
  open_on_create?: readonly string[];
}

/** The signed-in user's restrictions, keyed by `module.resource`. */
export type FieldAccessMap = Readonly<Record<string, ResourceFieldAccess | undefined>>;

/** A record as the backend sends it: detail responses carry `_read_only_fields`. */
export interface FieldAccessRecord {
  _read_only_fields?: readonly string[];
}

/** Per-field messages from a `field_write_denied` refusal, keyed by field name. */
export type FieldErrors = Readonly<Record<string, string>>;

export interface ReadOnlyOptions {
  /** True on an Add form, where `open_on_create` names stay editable.
   *  Defaults to true when no record was given, false when one was. */
  creating?: boolean;
}

/** The answers one screen needs about one resource. */
export interface FieldAccess {
  /** The user may not read this field, so it is not rendered at all. */
  isHidden(name: string): boolean;
  /** The user may see this field but not change it: greyed, disabled, never sent. */
  isReadOnly(name: string, options?: ReadOnlyOptions): boolean;
  /** True when at least one of these fields is visible, for a section heading. */
  anyVisible(...names: string[]): boolean;
  /** The body without the fields this user may not write, so a form never sends one. */
  writableOnly<T extends object>(body: T, options?: ReadOnlyOptions): T;
}

const NO_NAMES: readonly string[] = [];

/**
 * The pure form of {@link useFieldAccess}, for code that already holds the map.
 *
 * With a record, a field present in it is visible whatever the map says, and
 * the record's own `_read_only_fields` decides what may change. A list row
 * carries no `_read_only_fields`, so for a row the map decides.
 */
export function resolveFieldAccess(
  map: FieldAccessMap | null | undefined,
  resource: string,
  record?: object | null,
): FieldAccess {
  const entry = map?.[resource];
  const hidden = entry?.hidden ?? NO_NAMES;
  const readOnly = entry?.read_only ?? NO_NAMES;
  const openOnCreate = entry?.open_on_create ?? NO_NAMES;
  const recordReadOnly = record ? (record as FieldAccessRecord)._read_only_fields : undefined;

  const isHidden = (name: string) => {
    if (record && name in record) return false;
    return hidden.includes(name);
  };

  const isReadOnly = (name: string, options?: ReadOnlyOptions) => {
    if (isHidden(name)) return true;
    const creating = options?.creating ?? !record;
    if (!creating && Array.isArray(recordReadOnly)) return recordReadOnly.includes(name);
    if (!readOnly.includes(name)) return false;
    return !(creating && openOnCreate.includes(name));
  };

  return {
    isHidden,
    isReadOnly,
    anyVisible: (...names) => names.some((name) => !isHidden(name)),
    writableOnly: (body, options) => Object.fromEntries(
      Object.entries(body).filter(([name]) => !isReadOnly(name, options)),
    ) as typeof body,
  };
}

/**
 * Field Access for one resource, optionally against one existing record.
 *
 * `resource` is the backend's `module.resource` key, for example
 * `"procurement.vendor"`. Pass the record on an edit form or a detail view; pass
 * nothing on an Add form or when deciding a table's columns.
 *
 * The map comes from the host's `usePermissions()`, beside the permission keys
 * it already serves, so the package never fetches `/me` itself.
 */
export function useFieldAccess(resource: string, record?: object | null): FieldAccess {
  const { fieldAccess } = usePermissions();
  return useMemo(
    () => resolveFieldAccess(fieldAccess, resource, record),
    [fieldAccess, resource, record],
  );
}

/**
 * The per-field messages of a 403 `field_write_denied` refusal, or null for any
 * other error.
 *
 * The backend names every refused field in `error.detail`, one list of messages
 * per field. A normal screen never triggers this, because it neither offers nor
 * sends a field the user cannot write; when it happens anyway the form shows
 * each message on its field rather than a toast nobody can place.
 */
export function fieldWriteErrors(error: unknown): FieldErrors | null {
  const outer = asRecord(error);
  if (!outer || outer.status !== 403) return null;
  const envelope = asRecord(outer.data);
  const body = asRecord(envelope?.error);
  if (body?.code !== "field_write_denied") return null;
  const detail = asRecord(body.detail) ?? {};
  const errors: Record<string, string> = {};
  for (const [name, value] of Object.entries(detail)) {
    const message = Array.isArray(value) ? value.find((v) => typeof v === "string") : value;
    if (typeof message === "string" && message) errors[name] = message;
  }
  return errors;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
