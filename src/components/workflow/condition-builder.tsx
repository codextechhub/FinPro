import { Plus, X } from "lucide-react";
import { CustomInput } from "@/components/custom/custom-input";
import { SearchSelect, type SearchSelectOption } from "@/components/custom/search-select";
import { MoneyInput } from "@/components/finance-ui";
import type {
  ConditionArea,
  ConditionFieldSpec,
} from "@/redux/services/dashboard/workflow-types";
import { operatorLabel } from "./dynamic-role-format";
import {
  type ConditionDraft,
  LIST_OPS,
  emptyCondition,
  resetForField,
  valueForOp,
} from "./condition-draft";

/** The pick-lists a condition's value may come from, loaded once by the screen. */
export interface ConditionChoices {
  anyRoles: SearchSelectOption[];
  people: SearchSelectOption[];
  branches: SearchSelectOption[];
}

/** Everything the rows need to offer, which every screen loads the same way. */
export interface ConditionCatalogue {
  areas: ConditionArea[];
  fields: ConditionFieldSpec[];
  fieldMap: Map<string, ConditionFieldSpec>;
  /** Document type labels, for saying which documents carry a narrow field. */
  typeLabels: Map<string, string>;
  loading: boolean;
}

function valueOptions(field: ConditionFieldSpec, choices: ConditionChoices): SearchSelectOption[] {
  switch (field.type) {
    case "CHOICE":
      return field.choices;
    case "BRANCH":
      return choices.branches;
    case "PERSON":
      return choices.people;
    case "ROLE":
      return choices.anyRoles;
    default:
      return [];
  }
}

/**
 * Conditions joined by "and", with the row the person is building.
 *
 * Used wherever this product asks "when?": a Dynamic Role's rule, and a stage
 * that should not always run. One widget, so the two read and behave the same
 * and neither drifts into JSON again.
 */
export function ConditionList({
  idPrefix,
  conditions,
  catalogue,
  choices,
  addLabel = "And another condition",
  onChange,
}: {
  idPrefix: string;
  conditions: ConditionDraft[];
  catalogue: ConditionCatalogue;
  choices: ConditionChoices;
  addLabel?: string;
  onChange: (next: ConditionDraft[]) => void;
}) {
  return (
    <div className="space-y-2">
      {conditions.map((condition, i) => (
        <div key={condition.key} className="space-y-2">
          {i > 0 && <p className="text-[11px] font-semibold uppercase text-gray-01">and</p>}
          <ConditionRow
            idPrefix={`${idPrefix}-c${i}`}
            condition={condition}
            catalogue={catalogue}
            choices={choices}
            removable={conditions.length > 1}
            onChange={(next) => onChange(conditions.map((c, j) => (j === i ? next : c)))}
            onRemove={() => onChange(conditions.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        onClick={() => onChange([...conditions, emptyCondition()])}
      >
        <Plus className="size-3.5" /> {conditions.length === 0 ? "Add a condition" : addLabel}
      </button>
    </div>
  );
}

/**
 * One comparison: the area it asks about, which of that area's fields, how it
 * is compared, and with what.
 *
 * The area comes first because it is what somebody knows before they know a
 * field name: "the student", then "their class". Every area the system holds is
 * offered, so a field only some documents carry says so underneath rather than
 * being hidden - the document running it is where that is settled.
 */
export function ConditionRow({
  idPrefix,
  condition,
  catalogue,
  choices,
  removable,
  onChange,
  onRemove,
}: {
  idPrefix: string;
  condition: ConditionDraft;
  catalogue: ConditionCatalogue;
  choices: ConditionChoices;
  removable: boolean;
  onChange: (next: ConditionDraft) => void;
  onRemove: () => void;
}) {
  const { areas, fields, fieldMap, typeLabels, loading } = catalogue;
  const field = fieldMap.get(condition.field);
  const fieldOptions = fields
    .filter((f) => f.area === condition.area)
    .map((f) => ({ value: f.key, label: f.label }));
  // Named while the list is short enough to read; counted once it is not, since
  // nine document names in a hint is a wall rather than an answer.
  const carriers = (field?.document_types ?? []).map((t) => typeLabels.get(t) ?? t);
  const onlyOn = carriers.length === 0
    ? ""
    : carriers.length <= 3
      ? `Only ${carriers.join(", ")} carry this`
      : `Only ${carriers.length} document types carry this`;

  return (
    <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
      <SearchSelect
        id={`${idPrefix}-area`}
        label="About"
        size="sm"
        clearable={false}
        loading={loading}
        options={areas.map((a) => ({ value: a.key, label: a.label }))}
        value={condition.area}
        onChange={(e) =>
          onChange({ ...resetForField(condition, undefined), area: e.target.value })
        }
      />
      <SearchSelect
        id={`${idPrefix}-field`}
        label="What"
        size="sm"
        clearable={false}
        loading={loading}
        options={fieldOptions}
        value={condition.field}
        placeholder="Choose what to test"
        onChange={(e) => onChange(resetForField(condition, fieldMap.get(e.target.value)))}
      />
      {field && (
        <>
          <SearchSelect
            id={`${idPrefix}-op`}
            label="Is"
            size="sm"
            clearable={false}
            options={field.operators.map((op) => ({ value: op, label: operatorLabel(field, op) }))}
            value={condition.op}
            onChange={(e) =>
              onChange({ ...condition, op: e.target.value, value: valueForOp(e.target.value, condition.value) })
            }
          />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <ValueInput
                id={`${idPrefix}-value`}
                field={field}
                op={condition.op}
                value={condition.value}
                choices={choices}
                onChange={(value) => onChange({ ...condition, value })}
              />
            </div>
            {removable && (
              <button
                type="button"
                className="mb-2 text-gray-01 hover:text-destructive"
                onClick={onRemove}
                aria-label="Remove this condition"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </>
      )}
      {onlyOn && (
        <p className="text-[11px] text-gray-01 sm:col-span-2" title={carriers.join(", ")}>
          {onlyOn}, so this is never true on any other document.
        </p>
      )}
    </div>
  );
}

/** The value box for a field's own kind, and a list for "is one of". */
function ValueInput({
  id,
  field,
  op,
  value,
  choices,
  onChange,
}: {
  id: string;
  field: ConditionFieldSpec;
  op: string;
  value: ConditionDraft["value"];
  choices: ConditionChoices;
  onChange: (value: ConditionDraft["value"]) => void;
}) {
  if (field.type === "MONEY") {
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="text-xs font-medium text-black-01">Amount</label>
        <MoneyInput
          id={id}
          valueKobo={typeof value === "number" ? value : null}
          onChangeKobo={(kobo) => onChange(kobo)}
        />
      </div>
    );
  }
  if (field.type === "NUMBER") {
    return (
      <CustomInput
        id={id}
        label="Number"
        type="number"
        min={0}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    );
  }
  if (field.type === "TEXT") {
    return (
      <CustomInput
        id={id}
        label="Text"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const options = valueOptions(field, choices);
  if (LIST_OPS.has(op)) {
    const picked = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1.5">
        <SearchSelect
          id={id}
          label="Any of"
          size="sm"
          options={options.filter((o) => !picked.includes(o.value))}
          value=""
          placeholder="Add one"
          onChange={(e) => e.target.value && onChange([...picked, e.target.value])}
        />
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-full border border-white-02 bg-white px-2 py-0.5 text-xs text-black-01"
              >
                {options.find((o) => o.value === v)?.label ?? v}
                <button
                  type="button"
                  aria-label="Remove"
                  className="text-gray-01 hover:text-destructive"
                  onClick={() => onChange(picked.filter((p) => p !== v))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <SearchSelect
      id={id}
      label="Value"
      size="sm"
      options={options}
      value={typeof value === "string" ? value : ""}
      placeholder="Choose"
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}
