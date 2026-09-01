// Shared presentational components for the Procurement Analytics report screens.
// Kept separate from helpers.ts (pure) so this file only exports components.

import { Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatMoney } from "@/utils/money";

export type PillTone = "green" | "amber" | "red" | "gray";

const PILL_TONES: Record<PillTone, string> = {
  green: "bg-green-01/10 text-green-01",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-destructive/10 text-destructive",
  gray: "bg-gray-05/10 text-gray-05",
};

const DOT_TONES: Record<PillTone, string> = {
  green: "bg-green-01",
  amber: "bg-amber-500",
  red: "bg-destructive",
  gray: "bg-gray-05",
};

/** Small derived-status pill (house pill style: rounded, 11px, medium). */
export function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-block rounded px-2 py-0.5 font-mont text-[11px] font-medium whitespace-nowrap", PILL_TONES[tone])}>
      {children}
    </span>
  );
}

/** Status pill with a leading tone dot - the prototype's table status chips. */
export function StatusDotPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mont text-[11px] font-medium whitespace-nowrap", PILL_TONES[tone])}>
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT_TONES[tone])} />
      {children}
    </span>
  );
}

/** A labelled proportion meter - a small rounded bar plus its percentage. */
export function Meter({ ratio, color = "var(--color-primary, #2563eb)" }: {
  ratio: number;
  color?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(ratio, 1)) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-gray-03/50">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mont text-xs tabular-nums text-gray-05">{pct}%</span>
    </div>
  );
}

const GRADE_BADGE_TONES: Record<string, string> = {
  A: "bg-green-01/10 text-green-01",
  B: "bg-indigo-100 text-indigo-700",
  C: "bg-amber-100 text-amber-700",
};

/** A circular letter-grade badge (A green · B indigo · C amber). */
export function GradeBadge({ grade }: { grade: string }) {
  return (
    <span className={cn(
      "inline-flex size-6 items-center justify-center rounded-full font-mont text-xs font-semibold",
      GRADE_BADGE_TONES[grade] ?? "bg-gray-05/10 text-gray-05",
    )}>
      {grade}
    </span>
  );
}

/** Page header: title + subtitle on the left, filter controls (children) right. */
export function SectionHeader({ title, subtitle, children }: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-mont text-lg font-semibold text-gray-01">{title}</h1>
        <p className="mt-0.5 font-mont text-xs text-gray-05">{subtitle}</p>
      </div>
      {children && <div className="flex flex-wrap items-end gap-3">{children}</div>}
    </header>
  );
}

/** A labelled native date input for the as-of / range filters. */
export function DateFilter({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mont text-[11px] font-medium text-gray-05">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-sm text-black-01 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
    </label>
  );
}

/** White surface card with a title/subtitle header (matches the dashboard). */
export function Card({ title, subtitle, children, className }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md p-5", className)}>
      <div className="mb-4 min-w-0">
        <h2 className="font-mont text-sm font-semibold text-gray-01">{title}</h2>
        {subtitle && <p className="mt-0.5 font-mont text-xs text-gray-05">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * A quiet line beneath a KPI strip saying what the reader is NOT seeing: a figure the
 * backend withheld, or documents its branch scope excludes. Renders nothing for empty
 * children, so a screen can hand it a null note without guarding at every call site.
 */
export function ScopeNote({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className={cn(INFORMATION_CARD_SURFACE, "flex min-w-0 items-start gap-2 rounded-md px-4 py-3 font-mont text-xs leading-5 text-gray-05")}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Dashed placeholder for an empty chart / section. */
export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">
      {children}
    </div>
  );
}

/** Horizontal labelled money bars - used for spend-by-vendor. */
export function HBars({ items, currency }: {
  items: { label: string; value: number }[];
  currency?: string | null;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 font-mont">
            <span className="min-w-0 flex-1 truncate text-xs text-gray-01">{it.label}</span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-black-01">{formatMoney(it.value, currency)}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-03/40">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A tiny inline proportion meter (0..1) for table cells. */
export function InlineMeter({ ratio, color = "var(--color-primary, #2563eb)" }: {
  ratio: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(ratio, 1)) * 100;
  return (
    <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-gray-03/50">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** A letter-grade pill (A green / B amber / C red). */
export function GradePill({ grade }: { grade: string }) {
  const tone: PillTone = grade === "A" ? "green" : grade === "B" ? "amber" : "red";
  return <Pill tone={tone}>Grade {grade}</Pill>;
}

/** A 0–100 criterion input: slider + number, kept in sync, with the weight noted. */
export function ScoreInput({ label, weight, value, onChange }: {
  label: string;
  weight: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
  return (
    <div>
      <div className="flex items-baseline justify-between font-mont">
        <span className="text-xs text-gray-05">{label} <span className="text-gray-04">· {Math.round(weight * 100)}%</span></span>
        <span className="text-sm font-semibold tabular-nums text-black-01">{value}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <input
          type="range" min={0} max={100} value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="h-1.5 flex-1 cursor-pointer accent-primary"
        />
        <input
          type="number" min={0} max={100} value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="h-9 w-16 rounded-md border border-white-02 bg-white px-2 text-center font-mont text-sm tabular-nums text-black-01 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>
    </div>
  );
}
