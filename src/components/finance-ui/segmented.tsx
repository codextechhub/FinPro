// <Segmented> - a segmented toggle that reads as a control at first glance: a grey
// track with a raised white "thumb" on the active option. Used across the finance
// drawers (note type, refund action, payment-plan frequency…) for one consistent
// look. Renders its own label with comfortable spacing (don't wrap in FormField).
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({ value, onChange, options, label, isDisabled, className }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
  label?: string;
  isDisabled?: (v: T) => boolean;
  className?: string;
}) {
  return (
    <div>
      {label ? <p className="mb-2 font-mont text-xs text-gray-05">{label}</p> : null}
      <div className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-[#ECECEC] p-1", className)}>
        {options.map(([v, lbl]) => {
          const dis = isDisabled?.(v) ?? false;
          return (
            <button
              key={v} type="button" aria-pressed={value === v} disabled={dis}
              onClick={() => !dis && onChange(v)}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 font-mont text-sm transition-colors",
                dis && "cursor-not-allowed opacity-40",
                value === v
                  ? "bg-white font-semibold text-black-01 shadow-sm ring-1 ring-black/5"
                  : "font-medium text-gray-05 hover:text-gray-01",
              )}
            >
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}
