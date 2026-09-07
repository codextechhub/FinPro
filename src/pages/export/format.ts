/**
 * Date and duration formatting shared by the Export Centre screens. Kept out of
 * the component files so fast refresh keeps working (a module that exports both
 * components and helpers loses it).
 *
 * formatBytes used to live here and is now `@/utils/format-bytes` - it is not
 * re-exported, deliberately: leaving a second import path for the same function
 * is what let four copies of it drift apart in the first place.
 */

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("en-GB");
}

/** Whole days from now until `iso`, floored at 0. */
export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isNaN(ms) ? 0 : Math.max(0, Math.ceil(ms / 86_400_000));
}

export function formatDuration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return "-";
  const s = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000;
  if (Number.isNaN(s)) return "-";
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
