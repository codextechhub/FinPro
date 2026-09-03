/**
 * Lightweight SVG charts in the app's theme (no chart lib). Ported in spirit
 * from the Crestfield design's BarChart/Donut/StatStrip, restyled to our
 * palette/typography. Used on dashboards for real data (aging buckets, income
 * vs expense, spend) - not fabricated trend series.
 */

import { useState } from "react";

import { cn } from "@/lib/utils";

// House chart palette (maps to our tokens; falls back to hex for SVG fills).
export const CHART_COLORS = {
  primary: "var(--color-primary, #2563eb)",
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
  violet: "#7c3aed",
  slate: "#64748b",
  teal: "#0d9488",
} as const;

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

/** Vertical bars from {label, value}. `format` renders the hover/tooltip value. */
export function BarChart({
  data,
  height = 180,
  color = CHART_COLORS.primary,
  format = (v: number) => String(v),
  showValues = false,
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  format?: (v: number) => string;
  showValues?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-3 overflow-x-auto pt-2" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex min-w-12 flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-1 items-end justify-center">
            <div className="flex h-full flex-col items-center justify-end gap-1.5">
              {showValues && (
                <span className="font-mont text-xs font-semibold tabular-nums text-black-01">
                  {format(d.value)}
                </span>
              )}
              {d.value > 0 && (
                <div
                  className="w-7 rounded-t-sm transition-[height]"
                  style={{ height: `${(d.value / max) * (height - (showValues ? 62 : 40))}px`, background: d.color ?? color }}
                  title={`${d.label}: ${format(d.value)}`}
                />
              )}
            </div>
          </div>
          <span className="font-mont text-[10.5px] text-gray-05">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

/** Donut with optional center label. */
export function Donut({
  data,
  size = 132,
  thickness = 18,
  center,
  formatValue,
}: {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  center?: { main: string; sub?: string };
  formatValue?: (value: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  // Precompute each segment's length + cumulative offset without mutating a
  // captured variable during render (keeps the React-compiler lint happy).
  const lens = data.map((d) => (d.value / total) * circ);
  const offsets = lens.map((_, i) => lens.slice(0, i).reduce((s, l) => s + l, 0));
  return (
    <div className="grid min-w-0 grid-cols-1 items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#eef0f3" strokeWidth={thickness} />
        {data.map((d, i) => (
          <circle
            key={d.label}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={thickness}
            strokeDasharray={`${lens[i]} ${circ - lens[i]}`}
            strokeDashoffset={-offsets[i]}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        ))}
        {center && (
          <>
            <text x={cx} y={cx - 2} textAnchor="middle" className="fill-black-01 font-mont" style={{ fontSize: 14, fontWeight: 600 }}>{center.main}</text>
            {center.sub && <text x={cx} y={cx + 14} textAnchor="middle" className="fill-gray-05 font-mont" style={{ fontSize: 11 }}>{center.sub}</text>}
          </>
        )}
      </svg>
      <div className="min-w-0 space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex min-w-0 items-center gap-2 font-mont text-xs text-gray-01">
            <span className="inline-block size-2.5 rounded-full" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            {formatValue && <span className="font-semibold tabular-nums text-black-01">{formatValue(d.value)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A compact label/value/sub strip - for summary rows above a table. */
export function StatStrip({ items }: { items: { label: string; value: React.ReactNode; sub?: string }[] }) {
  return (
    <div className="flex flex-wrap divide-x divide-white-02 rounded-md border border-white-02 bg-white">
      {items.map((it, i) => (
        <div key={i} className="min-w-36 flex-1 px-4 py-3">
          <p className="font-mont text-xs text-gray-05">{it.label}</p>
          <p className="mt-1 font-mont text-lg font-semibold text-black-01 tabular-nums">{it.value}</p>
          {it.sub && <p className="font-mont text-[11px] text-gray-05">{it.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/** Tiny inline sparkline (line + soft area) for KPI cards. */
export function Sparkline({
  data,
  width = 96,
  height = 30,
  color = CHART_COLORS.primary,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const dx = width / (data.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const pts = data.map((v, i) => `${(i * dx).toFixed(1)},${y(v).toFixed(1)}`);
  const id = `sl-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Horizontal "% of plan" bar with actual/plan caption (Revenue vs Budget). */
export function BudgetBar({
  label,
  pct,
  valueText,
  planText,
  color = CHART_COLORS.green,
}: {
  label: string;
  pct: number | null;
  valueText: string;
  planText: string;
  color?: string;
}) {
  const filled = Math.max(0, Math.min(pct ?? 0, 100));
  return (
    <div>
      <div className="flex items-baseline justify-between font-mont">
        <span className="text-sm font-medium text-gray-01">{label}</span>
        <span className="text-xs text-gray-05">{pct == null ? "-" : `${pct}% of plan`}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-03/50">
        <div className="h-full rounded-full" style={{ width: `${filled}%`, background: color }} />
      </div>
      <div className="mt-1 flex items-baseline justify-between font-mont text-xs">
        <span className="font-semibold text-black-01 tabular-nums">{valueText}</span>
        <span className="text-gray-05">of {planText}</span>
      </div>
    </div>
  );
}

export interface AgingDatum { key: string; label: string; pct: number; amount: React.ReactNode; color: string; }

/** Segmented stacked bar + legend rows - AR/AP aging. */
export function AgingStack({ buckets }: { buckets: AgingDatum[] }) {
  const total = buckets.reduce((s, b) => s + b.pct, 0) || 100;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {buckets.map((b) => (
          <div key={b.key} style={{ width: `${(b.pct / total) * 100}%`, background: b.color }}
            title={`${b.label}: ${b.pct}%`} />
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {buckets.map((b) => (
          <div key={b.key} className="flex items-center gap-2 font-mont text-xs">
            <span className="inline-block size-2.5 rounded-full" style={{ background: b.color }} />
            <span className="text-gray-01">{b.label}</span>
            <span className="ml-auto text-gray-05 tabular-nums">{b.pct}%</span>
            <span className="w-24 text-right font-medium text-black-01 tabular-nums">{b.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dual-series area chart over labels (Receivables vs Collections). */
export function TrendArea({
  labels,
  series,
  height = 220,
  format = (v: number) => String(v),
  showLegend = true,
}: {
  labels: string[];
  series: { name: string; data: number[]; color: string }[];
  height?: number;
  format?: (v: number) => string;
  showLegend?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const W = 760;
  const H = Math.max(height - 24, 80);
  const padL = 8;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const n = labels.length;
  const dx = n > 1 ? (W - padL) / (n - 1) : 0;
  const y = (v: number) => H - (v / max) * (H - 8);
  const ticks = 4;
  const activeX = activeIndex == null ? 0 : padL + activeIndex * dx;
  const activeLeft = `${(activeX / W) * 100}%`;
  const tooltipTransform = activeIndex === 0 ? "translateX(0)"
    : activeIndex === n - 1 ? "translateX(-100%)" : "translateX(-50%)";
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 520 }} onMouseLeave={() => setActiveIndex(null)}>
        <div className="relative" style={{ height: H }}>
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const gy = (H / ticks) * i;
            return <line key={i} x1={0} y1={gy} x2={W} y2={gy} stroke="#eef0f3" strokeWidth={1} />;
          })}
          {series.map((s) => {
            const pts = s.data.map((v, i) => `${(padL + i * dx).toFixed(1)},${y(v).toFixed(1)}`);
            const gid = `ta-${s.color.replace(/[^a-z0-9]/gi, "")}`;
            return (
              <g key={s.name}>
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <polygon points={`${padL},${H} ${pts.join(" ")} ${padL + (n - 1) * dx},${H}`} fill={`url(#${gid})`} />
                <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              </g>
            );
          })}
          {labels.map((label, index) => {
            const left = index === 0 ? 0 : padL + index * dx - dx / 2;
            const width = index === 0 || index === labels.length - 1 ? dx / 2 + padL : dx;
            return <rect key={`hit-${label}-${index}`} x={left} y={0} width={Math.max(width, 1)} height={H}
              fill="transparent" onMouseEnter={() => setActiveIndex(index)} />;
          })}
          {activeIndex != null && (
            <line pointerEvents="none" x1={activeX} y1={4} x2={activeX} y2={H}
              stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" />
          )}
          </svg>
          {series.flatMap((s) => s.data.map((value, index) => (
            <span key={`${s.name}-${index}`} aria-hidden="true"
              className={cn(
                "pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white transition-transform duration-150",
                activeIndex === index && "scale-150",
              )}
              style={{ left: `${((padL + index * dx) / W) * 100}%`, top: `${(y(value) / H) * 100}%`, background: s.color }} />
          )))}
          {activeIndex != null && (
            <div className="pointer-events-none absolute top-2 z-10 min-w-28 rounded-md bg-gray-950/95 px-2.5 py-2 font-mont text-[11px] text-white shadow-lg"
              style={{ left: activeLeft, transform: tooltipTransform }}>
              <p className="font-semibold">{labels[activeIndex]}</p>
              {series.map((s) => (
                <p key={s.name} className="mt-1 whitespace-nowrap tabular-nums">
                  {s.name}: {format(s.data[activeIndex] ?? 0)}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="relative mt-1 h-4">
          {labels.map((label, index) => (
            <span key={`${label}-${index}`} className="absolute whitespace-nowrap font-mont text-[11px] font-medium text-gray-01"
              style={{
                left: `${((padL + index * dx) / W) * 100}%`,
                transform: index === 0 ? "translateX(0)" : index === n - 1 ? "translateX(-100%)" : "translateX(-50%)",
              }}>
              {n <= 12 || index % 2 === 0 ? label : ""}
            </span>
          ))}
        </div>
      </div>
      {showLegend && (
        <div className="mt-1 flex items-center gap-4">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 font-mont text-xs text-gray-01">
              <span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} />{s.name}
            </span>
          ))}
          <span className="ml-auto font-mont text-[11px] text-gray-05">max {format(max)}</span>
        </div>
      )}
    </div>
  );
}

/** P2P-style step strip: states done | current | rejected | todo. */
export function WorkflowStrip({ steps }: { steps: { label: string; state: "done" | "current" | "rejected" | "todo" }[] }) {
  const styles: Record<string, string> = {
    done: "bg-green-01/10 text-green-01",
    current: "bg-blue-50 text-blue-700",
    rejected: "bg-destructive/10 text-destructive",
    todo: "bg-gray-05/10 text-gray-05",
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mont text-xs font-medium", styles[s.state])}>
            <span className="size-1.5 rounded-full bg-current opacity-70" />
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-gray-03">›</span>}
        </span>
      ))}
    </div>
  );
}
