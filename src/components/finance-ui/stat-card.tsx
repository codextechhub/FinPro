// Shared KPI stat card (spec §4). One card for every procurement console strip:
// the approved Dashboard `Kpi` look (tinted icon chip top-right, big tabular number,
// muted sub-line) PLUS the prototype's left tone accent bar. Renders a focusable
// <button> when `onClick` is set (clickable KPI), else a static <div>.

import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { kpiValueClass } from "./money";

export type StatTone = "primary" | "amber" | "red" | "green" | "indigo" | "gray";

// Tone drives BOTH the left accent bar and the icon chip (bg + text).
const STAT_TONES: Record<StatTone, { bar: string; icon: string }> = {
  primary: { bar: "bg-primary", icon: "bg-primary/10 text-primary" },
  amber: { bar: "bg-amber-500", icon: "bg-amber-100 text-amber-700" },
  red: { bar: "bg-destructive", icon: "bg-red-100 text-destructive" },
  green: { bar: "bg-green-01", icon: "bg-green-01/10 text-green-01" },
  indigo: { bar: "bg-indigo-500", icon: "bg-indigo-100 text-indigo-700" },
  gray: { bar: "bg-gray-03", icon: "bg-gray-100 text-gray-05" },
};

export function StatCard({ label, value, sub, icon: Icon, tone = "primary", onClick, ariaLabel }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const t = STAT_TONES[tone];
  // pl-5 leaves a small gap past the w-1 accent bar so the label never touches it.
  const base = cn(
    INFORMATION_CARD_SURFACE,
    "relative flex min-w-0 items-start justify-between gap-3 overflow-hidden rounded-md p-4 pl-5 text-left",
  );
  const body = (
    <>
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1 rounded-l-md", t.bar)} />
      <div className="min-w-0">
        <p className="font-mont text-xs font-medium text-gray-05">{label}</p>
        {/* Money sizing steps down for long formatted amounts; counts stay text-xl. */}
        <p className={cn("mt-2 font-mont font-semibold tabular-nums text-black-01", typeof value === "string" ? kpiValueClass(value) : "text-xl")}>{value}</p>
        <div className="mt-2 min-h-4 font-mont text-[11px] text-gray-05">{sub}</div>
      </div>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", t.icon)}>
        <Icon className="size-4" />
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel}
        className={cn(base, "transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40")}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
