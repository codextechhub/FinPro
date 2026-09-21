/**
 * The one form-field wrapper that follows Field Access.
 *
 * A field the user cannot read renders nothing at all: no label, no lock, no
 * placeholder. A field they can read but not change renders greyed, and every
 * control inside it is disabled through the surrounding `<fieldset disabled>`,
 * so a picker built from buttons is covered as surely as a plain input. The
 * wrapper cannot stop a value being sent; the form does that by building its
 * body through `access.writableOnly(...)`.
 *
 * With a `label` the control sits inside a `<label>`, so one control per field.
 * Without one the children render as they are, which suits a block holding
 * several controls, such as a list of contact people.
 *
 * When a save is refused with 403 `field_write_denied`, pass the parsed
 * messages as `errors` and each appears under its own field.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { FieldAccess, FieldErrors } from "./field-access";

export interface AccessFieldProps {
  access: FieldAccess;
  /** The backend field name, as it appears in the payload. */
  name: string;
  label?: string;
  required?: boolean;
  /** True on an Add form; see `FieldAccess.isReadOnly`. */
  creating?: boolean;
  /** Per-field messages from `fieldWriteErrors`. */
  errors?: FieldErrors | null;
  className?: string;
  children: ReactNode | ((state: { readOnly: boolean }) => ReactNode);
}

export function AccessField({
  access, name, label, required, creating, errors, className, children,
}: AccessFieldProps) {
  if (access.isHidden(name)) return null;
  const readOnly = access.isReadOnly(name, creating === undefined ? undefined : { creating });
  const error = errors?.[name];
  const content = typeof children === "function" ? children({ readOnly }) : children;
  return (
    <fieldset
      disabled={readOnly}
      data-field={name}
      data-read-only={readOnly || undefined}
      className={cn("m-0 block min-w-0 border-0 p-0", readOnly && "cursor-not-allowed opacity-60", className)}
    >
      {label ? (
        <label className="block space-y-1">
          <span className="font-mont text-xs text-gray-05">{label}{required ? " *" : ""}</span>
          {content}
        </label>
      ) : content}
      {error ? <p role="alert" className="mt-1 font-mont text-[11px] text-destructive">{error}</p> : null}
    </fieldset>
  );
}
