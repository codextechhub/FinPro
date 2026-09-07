/**
 * The two-pane field picker: Available (grouped, searchable) and Selected
 * (ordered, numbered). One of the three genuinely new pieces of UI here.
 *
 * The handoff calls this the highest accessibility risk in the product, so it is
 * fully operable without a pointer: Space or Enter toggles a field, Alt+↑/↓
 * reorders the selection, and every move is announced through a live region
 * ("Customer moved to position 2 of 6"). There is deliberately no drag-only
 * affordance - the arrow buttons ARE the interface, and a mouse user gets the
 * same one.
 *
 * Two field flags come from the catalogue and are never inferred:
 *   locked    - always exported, cannot be deselected (the row's identity)
 *   sensitive - needs exports.sensitive_field.export; called out again at review
 */

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DatasetField } from "@/redux/services/dashboard/exports-types";

const MONO = "font-geist-mono tabular-nums";

function Flag({ tone, children }: { tone: "locked" | "sensitive"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1 py-px font-geist-mono text-[9px] font-semibold uppercase tracking-wide",
        tone === "locked"
          ? "border-gray-02 text-gray-06-text"
          : "border-yellow-01/40 bg-yellow-01/10 text-yellow-01-text",
      )}
    >
      {children}
    </span>
  );
}

export function FieldPicker({
  fields,
  selected,
  onChange,
  /** Columns the dataset no longer offers but the saved export still names. */
  withdrawn = [],
}: {
  fields: DatasetField[];
  selected: string[];
  onChange: (next: string[]) => void;
  withdrawn?: string[];
}) {
  const [search, setSearch] = useState("");
  // Announcements are read by a screen reader; they are not shown on screen.
  const [announcement, setAnnouncement] = useState("");
  const byId = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return fields;
    return fields.filter(
      (f) => f.label.toLowerCase().includes(term) || f.group.toLowerCase().includes(term),
    );
  }, [fields, search]);

  // Group headers are rendered inline so the list scrolls as one column.
  const grouped = useMemo(() => {
    const out: { group: string; items: DatasetField[] }[] = [];
    for (const f of matches) {
      const last = out[out.length - 1];
      if (last && last.group === f.group) last.items.push(f);
      else out.push({ group: f.group, items: [f] });
    }
    return out;
  }, [matches]);

  const toggle = (field: DatasetField) => {
    if (field.locked) return;
    const on = selected.includes(field.id);
    onChange(on ? selected.filter((id) => id !== field.id) : [...selected, field.id]);
    setAnnouncement(`${field.label} ${on ? "removed" : "added"}`);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selected.length) return;
    const next = selected.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    const label = byId.get(next[target])?.label ?? next[target];
    setAnnouncement(`${label} moved to position ${target + 1} of ${next.length}`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Available ─────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col rounded-md border border-white-02 bg-white">
        <div className="border-b border-white-02 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-mont text-xs font-semibold text-black-01">Available fields</p>
            <p className={cn(MONO, "text-[11px] text-gray-05")}>
              {matches.length} of {fields.length}
            </p>
          </div>
          <div className="relative mt-2.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fields…"
              aria-label="Search fields"
              className="h-9 bg-white pl-8"
            />
          </div>
        </div>

        <div ref={listRef} className="max-h-[420px] min-h-[220px] overflow-y-auto">
          {grouped.length === 0 ? (
            <p className="px-3.5 py-10 text-center font-mont text-xs text-gray-05">
              No field matches “{search}”. Try a shorter word, or clear the search.
            </p>
          ) : (
            grouped.map(({ group, items }, gi) => (
              <div key={`${group}-${gi}`}>
                <p className="border-b border-white-02 bg-gray-04 px-3.5 py-2 font-geist-mono text-[10px] font-semibold uppercase tracking-widest text-gray-05">
                  {group}
                </p>
                {items.map((f) => {
                  const on = selected.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggle(f)}
                      disabled={f.locked}
                      aria-pressed={on}
                      title={f.description || undefined}
                      className={cn(
                        "flex w-full items-center gap-2.5 border-b border-white-02 px-3.5 py-2.5 text-left last:border-0",
                        f.locked ? "cursor-default" : "cursor-pointer hover:bg-primary/5",
                      )}
                    >
                      {/* A presentational box, not the real Checkbox: the row
                          itself is the button, and Radix's Checkbox renders a
                          <button> too - nesting them is invalid HTML and breaks
                          the accessibility tree. The row carries aria-pressed. */}
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-4 shrink-0 place-content-center rounded-[4px] border",
                          on || f.locked
                            ? "border-primary bg-primary text-white"
                            : "border-gray-02 bg-white",
                          f.locked && "opacity-60",
                        )}
                      >
                        {(on || f.locked) && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mont text-sm text-black-01">
                        {f.label}
                      </span>
                      {f.locked && <Flag tone="locked">Always</Flag>}
                      {f.sensitive && <Flag tone="sensitive">Sensitive</Flag>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Selected ──────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col rounded-md border border-white-02 bg-white">
        <div className="flex items-baseline justify-between gap-2 border-b border-white-02 px-3.5 py-3">
          <p className="font-mont text-xs font-semibold text-black-01">Selected · file order</p>
          <p className={cn(MONO, "text-[11px] text-gray-05")}>{selected.length}</p>
        </div>

        <div className="max-h-[420px] min-h-[220px] space-y-2 overflow-y-auto p-3">
          {selected.length === 0 ? (
            <p className="px-2 py-10 text-center font-mont text-xs text-gray-05">
              No columns chosen yet. Pick fields on the left - the order here is the column order in
              the file.
            </p>
          ) : (
            selected.map((id, index) => {
              const field = byId.get(id);
              const isWithdrawn = !field || withdrawn.includes(id);
              return (
                <div
                  key={id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-2",
                    isWithdrawn ? "border-destructive/30 bg-destructive/5" : "border-white-02 bg-gray-04",
                  )}
                >
                  <span className={cn(MONO, "w-4 shrink-0 text-[11px] text-gray-05")}>{index + 1}</span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-mont text-sm",
                      isWithdrawn ? "text-error-text line-through" : "text-black-01",
                    )}
                  >
                    {field?.label ?? id}
                  </span>
                  {field?.sensitive && <Flag tone="sensitive">Sensitive</Flag>}

                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      label={`Move ${field?.label ?? id} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ChevronUp className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label={`Move ${field?.label ?? id} down`}
                      disabled={index === selected.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronDown className="size-3.5" />
                    </IconButton>
                    {!field?.locked && (
                      <IconButton
                        label={`Remove ${field?.label ?? id}`}
                        onClick={() => {
                          onChange(selected.filter((s) => s !== id));
                          setAnnouncement(`${field?.label ?? id} removed`);
                        }}
                      >
                        <X className="size-3.5" />
                      </IconButton>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* A field the dataset has withdrawn is struck through and explained,
            never quietly dropped - the saved export genuinely names it. */}
        {withdrawn.length > 0 && (
          <p className="border-t border-white-02 px-3.5 py-2.5 font-mont text-[11px] leading-relaxed text-error-text">
            {withdrawn.length === 1 ? "One column is" : `${withdrawn.length} columns are`} no longer
            available on this dataset. Remove {withdrawn.length === 1 ? "it" : "them"} before saving.
          </p>
        )}
      </div>

      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-6 place-content-center rounded border border-white-02 text-gray-05 transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
