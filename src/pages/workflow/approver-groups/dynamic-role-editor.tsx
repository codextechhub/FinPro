import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Lock, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CustomInput } from "@/components/custom/custom-input";
import { SearchSelect, type SearchSelectOption } from "@/components/custom/search-select";
import { MoneyInput } from "@/components/finance-ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { apiErrorMessage, apiFieldError } from "@/utils/api-errors";
import { useBranches, useDirectory, useRoles } from "@xvs/finance/host";
import {
  useCreateDynamicRoleMutation,
  useGetApproverGroupsQuery,
  useGetDynamicRoleFieldsQuery,
  useUpdateDynamicRoleMutation,
} from "@/redux/services/dashboard/workflow-api";
import type {
  ConditionArea,
  ConditionFieldSpec,
  DynamicRole,
  DynamicRoleTargetKind,
} from "@/redux/services/dashboard/workflow-types";
import { operatorLabel } from "@/pages/protected/workflow/components/dynamic-role-format";
import { BAND_SURFACE } from "../templates/components/template-builder-bits";
import {
  type ConditionDraft,
  type DynamicRoleDraft,
  type RuleDraft,
  type TargetDraft,
  LIST_OPS,
  draftFromDynamicRole,
  draftPayload,
  draftProblem,
  emptyCondition,
  emptyDraft,
  emptyRule,
  emptyTarget,
  resetForField,
  slugify,
  valueForOp,
} from "./dynamic-role-form";

/** Ask for the whole catalogue. A stable reference, so the query is cached once. */
const EVERY_DOCUMENT: string[] = [];

const TARGET_OPTIONS: SearchSelectOption[] = [
  { value: "ROLE", label: "A role" },
  { value: "USER", label: "A named person" },
  { value: "GROUP", label: "An approver group" },
];

/** The pick-lists a rule draws on, loaded once for the whole editor. */
interface Choices {
  approverRoles: SearchSelectOption[];
  anyRoles: SearchSelectOption[];
  people: SearchSelectOption[];
  branches: SearchSelectOption[];
  groups: SearchSelectOption[];
}

function valueOptions(field: ConditionFieldSpec, choices: Choices): SearchSelectOption[] {
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
 * Builds or edits one named Dynamic Role, all of its rules at once.
 *
 * Each condition starts with the area it asks about - this document, the person
 * who raised it, the child it is for - then offers that area's fields, only the
 * comparisons the field can make, and an input of the field's own kind: naira
 * for an amount, the list itself for a choice, a picker for a branch, a person
 * or a role. The areas, the fields and the approving roles all come from the
 * server, so nothing offered here is something saving would refuse.
 *
 * A Dynamic Role names no document type: it is picked on a stage, and that
 * stage's document is what decides which rules it can run. So the whole
 * catalogue is offered, and a field only some documents carry says so.
 *
 * The Otherwise row is its own card at the bottom. It cannot be removed, moved
 * or given a condition, so a document always reaches somebody.
 *
 * Mounted fresh each time it opens, so a draft never outlives the sheet.
 */
export function DynamicRoleEditor({
  role,
  onClose,
  onSaved,
}: {
  role: DynamicRole | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const creating = role == null;
  const [draft, setDraft] = useState<DynamicRoleDraft>(() =>
    role ? draftFromDynamicRole(role) : emptyDraft(),
  );
  const [problem, setProblem] = useState("");

  // The whole catalogue: a Dynamic Role names no document type, so every area
  // and every field is offered here, and the stage that picks the role is where
  // a document that cannot answer a rule is refused.
  const { data: fieldsData, isFetching: fieldsLoading } =
    useGetDynamicRoleFieldsQuery(EVERY_DOCUMENT);
  const fields = useMemo(() => fieldsData?.fields ?? [], [fieldsData]);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const areas = useMemo(() => fieldsData?.areas ?? [], [fieldsData]);
  const typeLabels = useMemo(
    () => new Map((fieldsData?.document_types ?? []).map((t) => [t.value, t.label])),
    [fieldsData],
  );

  const { data: people } = useDirectory();
  const { data: branches } = useBranches();
  const { data: roles } = useRoles();
  const { data: groups } = useGetApproverGroupsQuery({ page: 1, page_size: 100 });

  const choices = useMemo<Choices>(() => ({
    approverRoles: (fieldsData?.approver_roles ?? []).map((r) => ({ value: r.key, label: r.name })),
    anyRoles: (roles ?? [])
      .filter((r) => r.status === "ACTIVE")
      .map((r) => ({ value: r.key, label: r.name })),
    people: (people ?? [])
      .filter((p) => p.status === "ACTIVE")
      .map((p) => ({ value: String(p.id), label: p.full_name || p.email })),
    branches: (branches ?? []).map((b) => ({ value: String(b.id), label: b.name })),
    groups: (groups?.data ?? [])
      .filter((g) => g.is_active)
      .map((g) => ({ value: g.code, label: g.name })),
  }), [fieldsData, roles, people, branches, groups]);

  const [createRole, { isLoading: isCreating }] = useCreateDynamicRoleMutation();
  const [updateRole, { isLoading: isUpdating }] = useUpdateDynamicRoleMutation();
  const busy = isCreating || isUpdating;

  const patch = (next: Partial<DynamicRoleDraft>) => {
    setDraft((d) => ({ ...d, ...next }));
    setProblem("");
  };
  const patchRule = (index: number, next: Partial<RuleDraft>) =>
    patch({ rules: draft.rules.map((r, i) => (i === index ? { ...r, ...next } : r)) });
  const moveRule = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= draft.rules.length) return;
    const rules = [...draft.rules];
    [rules[index], rules[to]] = [rules[to], rules[index]];
    patch({ rules });
  };
  const save = () => {
    const found = draftProblem(draft, fieldMap);
    if (found) {
      setProblem(found);
      return;
    }
    const body = draftPayload(draft, { creating });
    const request = creating ? createRole(body) : updateRole({ id: role.id, body });
    request
      .unwrap()
      .then((saved) => {
        toast.success(creating ? "Dynamic Role created." : "Dynamic Role saved.");
        onSaved(saved.id);
      })
      .catch((err) => {
        setProblem(
          apiFieldError(err, "rules") ??
            apiFieldError(err, "name") ??
            apiFieldError(err, "code") ??
            apiErrorMessage(err, "This Dynamic Role could not be saved."),
        );
      });
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-white-02 px-6 pb-4 pt-6">
          <SheetTitle className="text-base font-semibold text-black-01">
            {creating ? "New Dynamic Role" : `Edit ${role.name}`}
          </SheetTitle>
          <SheetDescription className="text-xs text-gray-01">
            Rules are read top to bottom and the first one whose conditions all hold
            decides who approves. Anything no rule catches goes to Otherwise. You pick
            this on a template stage, and that stage's own document decides which of
            these rules it can run.
            {!creating && role.used_by.length > 0 && (
              <> Saving changes the {role.used_by.length === 1 ? "stage" : `${role.used_by.length} stages`} using
              it from their next request.</>
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-6 py-5">
            <section className="space-y-4">
              <CustomInput
                id="dr-name"
                label="Name"
                isRequired
                placeholder="e.g. Spend approver"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
              <p className="-mt-2 text-xs text-gray-01">
                {creating && !slugify(draft.name) ? (
                  "Stages pick it by a code made from its name, fixed once it is created."
                ) : (
                  <>
                    Stages pick it by{" "}
                    <span className="font-mono">{creating ? slugify(draft.name) : draft.code}</span>
                    {creating ? ", which is fixed once it is created." : "."}
                  </>
                )}
              </p>
              <div className="space-y-1.5">
                <label htmlFor="dr-description" className="text-xs font-medium text-black-01">
                  Description
                </label>
                <Textarea
                  id="dr-description"
                  rows={2}
                  maxLength={500}
                  placeholder="What it decides, and for whom."
                  value={draft.description}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-black-01">
                  Rules <span className="font-normal text-gray-01">first match wins</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => patch({ rules: [...draft.rules, emptyRule()] })}
                >
                  <Plus className="size-3.5" /> Add rule
                </Button>
              </div>

              {draft.rules.map((rule, i) => (
                <RuleCard
                  key={rule.key}
                  index={i}
                  count={draft.rules.length}
                  rule={rule}
                  areas={areas}
                  fields={fields}
                  fieldMap={fieldMap}
                  fieldsLoading={fieldsLoading}
                  typeLabels={typeLabels}
                  choices={choices}
                  onChange={(next) => patchRule(i, next)}
                  onMove={(by) => moveRule(i, by)}
                  onRemove={() => patch({ rules: draft.rules.filter((_, j) => j !== i) })}
                />
              ))}

              <div className={cn("space-y-3 rounded-md border border-white-02 p-3", BAND_SURFACE)}>
                <p className="flex items-center gap-2 text-xs font-semibold text-black-01">
                  <Lock className="size-3.5 text-gray-01" /> Otherwise, send it to
                </p>
                <TargetPicker
                  idPrefix="dr-otherwise"
                  target={draft.otherwise}
                  choices={choices}
                  onChange={(otherwise) => patch({ otherwise })}
                />
                <p className="text-xs text-gray-01">
                  Always last, so a document no rule catches still reaches somebody.
                </p>
              </div>
            </section>

            {problem && (
              <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-error-text">
                {problem}
              </p>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex flex-row justify-end gap-3 border-t border-white-02 px-6 py-4">
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="lg" onClick={save} disabled={busy}>
            {busy ? "Saving…" : creating ? "Create Dynamic Role" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** One ordered rule: its conditions, joined by "and", and who it sends to. */
function RuleCard({
  index,
  count,
  rule,
  areas,
  fields,
  fieldMap,
  fieldsLoading,
  typeLabels,
  choices,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  rule: RuleDraft;
  areas: ConditionArea[];
  fields: ConditionFieldSpec[];
  fieldMap: Map<string, ConditionFieldSpec>;
  fieldsLoading: boolean;
  typeLabels: Map<string, string>;
  choices: Choices;
  onChange: (next: Partial<RuleDraft>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const setCondition = (i: number, next: ConditionDraft) =>
    onChange({ conditions: rule.conditions.map((c, j) => (j === i ? next : c)) });

  return (
    <div className="space-y-3 rounded-md border border-white-02 bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-content-center rounded bg-pry-01 text-xs font-semibold text-primary tabular-nums">
          {index + 1}
        </span>
        <span className="text-xs font-semibold text-black-01">When</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="text-gray-01 hover:text-black-01 disabled:opacity-30"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move rule ${index + 1} up`}
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            className="text-gray-01 hover:text-black-01 disabled:opacity-30"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move rule ${index + 1} down`}
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            type="button"
            className="text-gray-01 hover:text-destructive"
            onClick={onRemove}
            aria-label={`Remove rule ${index + 1}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {rule.conditions.map((condition, i) => (
        <div key={condition.key} className="space-y-2">
          {i > 0 && <p className="text-[11px] font-semibold uppercase text-gray-01">and</p>}
          <ConditionRow
            idPrefix={`dr-r${index}-c${i}`}
            condition={condition}
            areas={areas}
            fields={fields}
            fieldMap={fieldMap}
            fieldsLoading={fieldsLoading}
            typeLabels={typeLabels}
            choices={choices}
            removable={rule.conditions.length > 1}
            onChange={(next) => setCondition(i, next)}
            onRemove={() =>
              onChange({ conditions: rule.conditions.filter((_, j) => j !== i) })
            }
          />
        </div>
      ))}
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        onClick={() => onChange({ conditions: [...rule.conditions, emptyCondition()] })}
      >
        <Plus className="size-3.5" /> And another condition
      </button>

      <div className="space-y-2 border-t border-white-02 pt-3">
        <p className="text-xs font-semibold text-black-01">Then send it to</p>
        <TargetPicker
          idPrefix={`dr-r${index}-target`}
          target={rule.target}
          choices={choices}
          onChange={(target) => onChange({ target })}
        />
        <CustomInput
          id={`dr-r${index}-label`}
          label="Note (optional)"
          placeholder="e.g. Above the bursar's desk limit"
          value={rule.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </div>
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
 * being hidden - the stage that runs the rule is where that is settled.
 */
function ConditionRow({
  idPrefix,
  condition,
  areas,
  fields,
  fieldMap,
  fieldsLoading,
  typeLabels,
  choices,
  removable,
  onChange,
  onRemove,
}: {
  idPrefix: string;
  condition: ConditionDraft;
  areas: ConditionArea[];
  fields: ConditionFieldSpec[];
  fieldMap: Map<string, ConditionFieldSpec>;
  fieldsLoading: boolean;
  typeLabels: Map<string, string>;
  choices: Choices;
  removable: boolean;
  onChange: (next: ConditionDraft) => void;
  onRemove: () => void;
}) {
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
        loading={fieldsLoading}
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
        loading={fieldsLoading}
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
          {onlyOn}, so a stage for any other document will not take this rule.
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
  choices: Choices;
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

/** Who a rule sends to: a role, a named person, or an approver group. */
function TargetPicker({
  idPrefix,
  target,
  choices,
  onChange,
}: {
  idPrefix: string;
  target: TargetDraft;
  choices: Choices;
  onChange: (target: TargetDraft) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <SearchSelect
        id={`${idPrefix}-kind`}
        label="Send to"
        size="sm"
        clearable={false}
        options={TARGET_OPTIONS}
        value={target.kind}
        onChange={(e) => onChange(emptyTarget(e.target.value as DynamicRoleTargetKind))}
      />
      {target.kind === "ROLE" && (
        <SearchSelect
          id={`${idPrefix}-role`}
          label="Role"
          size="sm"
          options={choices.approverRoles}
          value={target.roleKey}
          placeholder="Choose an approving role"
          onChange={(e) => onChange({ ...target, roleKey: e.target.value })}
        />
      )}
      {target.kind === "USER" && (
        <SearchSelect
          id={`${idPrefix}-user`}
          label="Person"
          size="sm"
          options={choices.people}
          value={target.userId}
          placeholder="Choose a person"
          onChange={(e) => onChange({ ...target, userId: e.target.value })}
        />
      )}
      {target.kind === "GROUP" && (
        <SearchSelect
          id={`${idPrefix}-group`}
          label="Approver group"
          size="sm"
          options={choices.groups}
          value={target.groupCode}
          placeholder="Choose a group"
          onChange={(e) => onChange({ ...target, groupCode: e.target.value })}
        />
      )}
    </div>
  );
}
