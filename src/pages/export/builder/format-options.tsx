/**
 * Format options, read from the dataset's own schema rather than hardcoded.
 *
 * The catalogue publishes `format_options` as an object keyed BY FORMAT - a
 * discriminated shape, not a flat bag of nullable fields - so switching from
 * Excel to CSV genuinely swaps the option set instead of greying half of it
 * out. Anything the backend adds later appears here without a frontend change.
 */

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CustomNativeSelect } from "@/components/custom/custom-native-select";
import type { FormatOptionSchema } from "@/redux/services/dashboard/exports-types";

/** Human labels for the options the backend ships today. Unknown keys fall back
 *  to a humanised version of the key, so a new option is usable immediately. */
const LABELS: Record<string, { label: string; help?: string }> = {
  sheet_name: { label: "Sheet name", help: "Shown on the tab inside the workbook" },
  freeze_header: { label: "Freeze the header row", help: "Column names stay visible while scrolling" },
  filters_sheet: {
    label: "Add a second sheet listing the filters used",
    help: "Recommended when the file leaves the team that produced it",
  },
  auto_width: { label: "Fit column widths to the content" },
  delimiter: { label: "Delimiter", help: "Comma suits most systems; semicolon suits European Excel" },
  encoding: { label: "Encoding", help: "UTF-8 with BOM opens cleanly in Excel on Windows" },
  header_row: { label: "Include a header row" },
  quote_all: { label: "Quote every value", help: "Safer for systems that split on commas naively" },
  line_ending: { label: "Line ending" },
};

/** Printable names for values that are otherwise invisible characters. */
const VALUE_LABELS: Record<string, string> = {
  ",": "Comma  ,",
  ";": "Semicolon  ;",
  "\t": "Tab",
  "|": "Pipe  |",
  "\r\n": "Windows (CRLF)",
  "\n": "Unix (LF)",
  "utf-8": "UTF-8",
  "utf-8-sig": "UTF-8 with BOM",
  "latin-1": "Latin-1",
};

function humanise(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function FormatOptions({
  schema,
  value,
  onChange,
}: {
  schema: Record<string, FormatOptionSchema>;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const keys = Object.keys(schema ?? {});
  if (!keys.length) {
    return <p className="font-mont text-xs text-gray-05">This format has no options to set.</p>;
  }

  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next });

  return (
    <div className="divide-y divide-white-02 rounded-md border border-white-02 bg-white px-3.5">
      {keys.map((key) => {
        const option = schema[key];
        const meta = LABELS[key] ?? { label: humanise(key) };
        const current = value[key] ?? option.default;

        return (
          <div key={key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-mont text-sm font-medium text-black-01">{meta.label}</p>
              {meta.help && <p className="mt-0.5 font-mont text-[11px] text-gray-05">{meta.help}</p>}
            </div>

            <div className="shrink-0">
              {option.type === "boolean" ? (
                <Switch
                  checked={current === true}
                  onCheckedChange={(checked) => set(key, checked)}
                  aria-label={meta.label}
                />
              ) : option.type === "choice" ? (
                <CustomNativeSelect
                  id={`fmt-${key}`}
                  aria-label={meta.label}
                  containerClass="w-44"
                  placeholder={VALUE_LABELS[String(option.default)] ?? String(option.default)}
                  options={(option.values ?? []).map((v) => ({
                    value: v,
                    label: VALUE_LABELS[v] ?? v,
                  }))}
                  value={typeof current === "string" ? current : ""}
                  onChange={(e) => set(key, e.target.value)}
                />
              ) : (
                <Input
                  value={typeof current === "string" ? current : ""}
                  maxLength={option.max_length}
                  onChange={(e) => set(key, e.target.value)}
                  aria-label={meta.label}
                  className="h-9 w-44 bg-white font-geist-mono text-sm"
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
