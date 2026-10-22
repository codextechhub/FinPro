/**
 * The claimant's controls on the expense claims screen: the name as a claim
 * shows it, and the New claim form's picker. What they decide is in
 * `./claimant`.
 */

import { useMemo } from "react";
import { SearchSelect } from "@/components/custom/search-select";
import { Input } from "@/components/ui/input";
import { AccessField, Segmented, type FieldAccess, type FieldErrors } from "@/components/finance-ui";
import { cn } from "@/lib/utils";
import { useUserDirectory } from "../../../components/workflow/use-user-directory";
import type { ExpenseClaim } from "@/redux/services/finance/ops-types";
import { NO_CLAIMANT, TYPED_CLAIMANT, claimantShown, type ClaimantChoice } from "./claimant";

/**
 * A claimant's name with, for a typed one, a small "Typed name" tag.
 * Renders nothing when the reader may not read the claimant.
 */
export function ClaimantName({ claim, className }: { claim: Pick<ExpenseClaim, "claimant_id" | "claimant_name">; className?: string }) {
  const shown = claimantShown(claim);
  if (!shown) return null;
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      <span className="min-w-0 truncate">{shown.name}</span>
      {shown.typed && shown.name !== "-" ? (
        <span className="shrink-0 rounded bg-gray-03 px-1.5 py-px font-mont text-[10px] font-medium text-gray-05" title="Typed in, not linked to anybody on the staff list">
          {TYPED_CLAIMANT}
        </span>
      ) : null}
    </span>
  );
}

const MODES = [["staff", "From the staff list"], ["typed", "Not on the staff list"]] as const;

/**
 * The Claimant control of the New claim form: a searchable staff picker, and a
 * "Not on the staff list" choice that swaps it for a name box. Switching keeps
 * nothing from the other side, so a claim never carries a person and a typed
 * name at once. Absent when the reader may not read the claimant, greyed when
 * they may not change it.
 */
export function ClaimantField({ access, value, onChange, errors }: {
  access: FieldAccess;
  value: ClaimantChoice;
  onChange: (next: ClaimantChoice) => void;
  errors?: FieldErrors | null;
}) {
  const { byId, isLoading } = useUserDirectory();
  const options = useMemo(() => Array.from(byId.values())
    .map((person) => ({
      value: String(person.id),
      label: person.role ? `${person.full_name || person.email} (${person.role})` : person.full_name || person.email,
    }))
    .sort((a, b) => a.label.localeCompare(b.label)), [byId]);
  const beside = errors?.claimant && !errors.claimant_name ? { ...errors, claimant_name: errors.claimant } : errors;

  return (
    <AccessField access={access} name="claimant_name" creating errors={beside}>
      {({ readOnly }) => (
        <div className="space-y-1.5">
          {/* Not a <label>: a click on it would press the first choice. */}
          <p className="font-mont text-xs text-gray-05">Claimant *</p>
          <Segmented
            value={value.kind}
            onChange={(kind) => onChange(kind === "staff" ? NO_CLAIMANT : { kind: "typed", name: "" })}
            options={MODES}
            isDisabled={() => readOnly}
            className="max-w-full overflow-x-auto"
          />
          {value.kind === "staff" ? (
            <SearchSelect
              id="expense-claimant"
              placeholder="Search the staff list"
              options={options}
              value={value.id}
              loading={isLoading}
              disabled={readOnly}
              onChange={(e) => onChange({ kind: "staff", id: e.target.value })}
            />
          ) : (
            <Input
              aria-label="Claimant's name"
              value={value.name}
              disabled={readOnly}
              onChange={(e) => onChange({ kind: "typed", name: e.target.value })}
              placeholder="e.g. Mrs Okafor (PTA volunteer)"
              className="bg-white"
            />
          )}
        </div>
      )}
    </AccessField>
  );
}
