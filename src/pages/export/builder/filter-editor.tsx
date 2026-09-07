/**
 * Filters, driven entirely by the dataset's own declarations.
 *
 * The control for each filter comes from its `type`, and the value keys are the
 * backend's, not ours: date_range → {start, end}, choice → {values},
 * text/boolean → {value}, number_range → {min, max}. Getting a key wrong does
 * not fail loudly - the filter is simply ignored when the queryset is compiled,
 * and the export quietly returns the wrong rows. So the mapping lives in one
 * place, here.
 *
 * A required filter cannot be removed; it renders with a REQUIRED flag and,
 * unset, blocks the save on the review step.
 */

import { Plus, X } from "lucide-react";
import { CustomNativeSelect } from "@/components/custom/custom-native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DatasetFilter, FilterSpec } from "@/redux/services/dashboard/exports-types";
import { filterIsSet } from "./helpers";

export function FilterEditor({
  filters,
  value,
  onChange,
  maxDateSpanDays,
}: {
  filters: DatasetFilter[];
  value: FilterSpec[];
  onChange: (next: FilterSpec[]) => void;
  maxDateSpanDays?: number | null;
}) {
  const specById = new Map(value.map((f) => [f.id, f]));
  const unused = filters.filter((f) => !specById.has(f.id));

  const patch = (id: string, next: Partial<FilterSpec>) =>
    onChange(value.map((f) => (f.id === id ? { ...f, ...next } : f)));

  const add = (id: string) => {
    if (!id || specById.has(id)) return;
    onChange([...value, { id }]);
  };

  const remove = (id: string) => onChange(value.filter((f) => f.id !== id));

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-02 px-3.5 py-6 text-center font-mont text-xs text-gray-05">
          No filters yet. Without one this export covers everything the dataset holds for this scope.
        </p>
      )}

      {value.map((spec) => {
        const def = filters.find((f) => f.id === spec.id);
        // A filter the dataset has withdrawn is named, not hidden: it is the
        // reason a saved export would fail, and the user has to remove it.
        if (!def) {
          return (
            <div
              key={spec.id}
              className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3"
            >
              <p className="font-mont text-xs text-error-text">
                “{spec.id}” is no longer a filter on this dataset. Remove it to save this export.
              </p>
              <button
                type="button"
                aria-label={`Remove ${spec.id}`}
                onClick={() => remove(spec.id)}
                className="shrink-0 text-gray-05 hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        }

        const unset = !filterIsSet(def, spec);
        return (
          <div
            key={spec.id}
            className={cn(
              "rounded-md border bg-white px-3.5 py-3",
              def.required && unset ? "border-destructive/40" : "border-white-02",
            )}
          >
            <div className="mb-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mont text-sm font-medium text-black-01">{def.label}</p>
                  {def.required && (
                    <span className="rounded border border-gray-02 px-1 py-px font-geist-mono text-[9px] font-semibold uppercase tracking-wide text-gray-06-text">
                      Required
                    </span>
                  )}
                </div>
                {def.description && (
                  <p className="mt-0.5 font-mont text-[11px] text-gray-05">{def.description}</p>
                )}
              </div>
              {!def.required && (
                <button
                  type="button"
                  aria-label={`Remove ${def.label}`}
                  onClick={() => remove(spec.id)}
                  className="shrink-0 text-gray-05 hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <FilterControl def={def} spec={spec} onPatch={(next) => patch(spec.id, next)} />

            {/* Guidance about cost, not a limit: a wider range runs, and the
                estimate warns before it does. The row cap is the real ceiling. */}
            {def.is_primary_date && maxDateSpanDays ? (
              <p className="mt-2 font-mont text-[11px] text-gray-05">
                Tuned for about {maxDateSpanDays} days at a time. A wider range still runs - it just
                takes longer and produces a larger file.
              </p>
            ) : null}

            {def.required && unset && (
              <p className="mt-2 font-mont text-[11px] text-error-text">
                {def.label} must be set before this export can run.
              </p>
            )}
          </div>
        );
      })}

      {unused.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Plus className="size-3.5 text-gray-05" />
          <CustomNativeSelect
            id="add-filter"
            aria-label="Add a filter"
            placeholder="Add a filter…"
            containerClass="w-full sm:w-64"
            options={unused.map((f) => ({ value: f.id, label: f.label }))}
            value=""
            onChange={(e) => add(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function FilterControl({
  def,
  spec,
  onPatch,
}: {
  def: DatasetFilter;
  spec: FilterSpec;
  onPatch: (next: Partial<FilterSpec>) => void;
}) {
  if (def.type === "date_range") {
    return (
      <div className="grid gap-2.5 sm:grid-cols-2">
        {/* Explicit aria-labels: type="date" renders the house DatePickerInput,
            whose trigger is a button that takes its accessible name from
            aria-label - a wrapping <label> alone leaves it unnamed. */}
        <div>
          <span className="mb-1 block font-mont text-[11px] text-gray-05">From</span>
          <Input
            type="date"
            aria-label={`${def.label} from`}
            value={spec.start ?? ""}
            onChange={(e) => onPatch({ start: e.target.value })}
            className="h-9 bg-white"
          />
        </div>
        <div>
          <span className="mb-1 block font-mont text-[11px] text-gray-05">To</span>
          <Input
            type="date"
            aria-label={`${def.label} to`}
            value={spec.end ?? ""}
            onChange={(e) => onPatch({ end: e.target.value })}
            className="h-9 bg-white"
          />
        </div>
      </div>
    );
  }

  if (def.type === "choice") {
    const chosen = spec.values ?? [];
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {def.choices.map((c) => {
          const on = chosen.includes(c.value);
          return (
            <label key={c.value} className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={on}
                onCheckedChange={() =>
                  onPatch({
                    values: on ? chosen.filter((v) => v !== c.value) : [...chosen, c.value],
                  })
                }
              />
              <span className="font-mont text-sm text-black-01">{c.label}</span>
            </label>
          );
        })}
        {def.choices.length === 0 && (
          <p className="font-mont text-xs text-gray-05">This filter has no values to choose from.</p>
        )}
      </div>
    );
  }

  if (def.type === "boolean") {
    return (
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox
          checked={spec.value === true}
          onCheckedChange={(checked) => onPatch({ value: checked === true })}
        />
        <span className="font-mont text-sm text-black-01">{def.label} is yes</span>
      </label>
    );
  }

  if (def.type === "number_range") {
    return (
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-mont text-[11px] text-gray-05">At least</span>
          <Input
            type="number"
            value={spec.min ?? ""}
            onChange={(e) => onPatch({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
            className="h-9 bg-white"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mont text-[11px] text-gray-05">At most</span>
          <Input
            type="number"
            value={spec.max ?? ""}
            onChange={(e) => onPatch({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
            className="h-9 bg-white"
          />
        </label>
      </div>
    );
  }

  return (
    <Input
      value={typeof spec.value === "string" ? spec.value : ""}
      onChange={(e) => onPatch({ value: e.target.value })}
      placeholder={`Contains…`}
      aria-label={def.label}
      className="h-9 bg-white"
    />
  );
}
