// Pure (non-component) helpers shared across the four Procurement Analytics
// report screens. Kept out of the component files so Fast Refresh stays clean.

import { CHART_COLORS, headCls, cellCls } from "@/components/finance-ui";
import type { ReportMoney } from "@/redux/services/finance/reports-types";

export interface SectionProps {
  entity: string;
  currency?: string | null;
}

/**
 * ── Report table typography. These raw <th>/<td> tables reuse the house
 *    DataTable chrome (headCls/cellCls) so Analytics matches the other menus.
 *    Raw cells must also replicate the padding/height that shadcn TableHead
 *    (h-10 px-2) and TableCell (p-2) supply in DataTable - otherwise the rows
 *    collapse to the text height. So: TH gets h-10, TD gets py-2. ───────────
 */
export const TH = `${headCls} h-10 px-3 text-left`;
export const THR = `${TH} text-right`;
export const TD = `${cellCls} px-3 py-2`;
export const TDR = `${TD} text-right tabular-nums`;
// Totals row: house cell sizing, but a stronger top rule + tint + heavier weight.
export const TFOOT =
  "border-t-2 border-white-02 bg-gray-50 px-3 py-2.5 font-mont text-sm font-semibold text-black-01";
export const TFOOTR = `${TFOOT} text-right tabular-nums`;

/** Read `.kobo` off a `{kobo, naira}` pair, tolerating a missing bucket. */
export const kobo = (m?: ReportMoney | null): number => m?.kobo ?? 0;

/**
 * The advisory line for documents a branch-bound reader's report leaves out.
 *
 * The backend sends `unassigned_excluded_count` only when the caller is narrowed to a
 * branch, so `undefined` means the reader is seeing everything and gets no line at all.
 * Zero means narrowed with nothing left out, which is equally the whole story, so it
 * also gets no line. A bare "3 excluded" would tell a bursar nothing, so the sentence
 * names what those documents are and why they are not in the totals beside it. It stays
 * a count: the backend withholds the amount so one branch cannot read another's spend.
 */
export function excludedScopeNote(
  count: number | undefined,
  noun: string,
  plural = `${noun}s`,
): string | null {
  if (!count || count < 0) return null;
  const subject = count === 1 ? `1 ${noun}` : `${count} ${plural}`;
  return count === 1
    ? `${subject} sits at entity level rather than in a branch, so it is outside your branch view and not included in these figures.`
    : `${subject} sit at entity level rather than in a branch, so they are outside your branch view and not included in these figures.`;
}

/** Human labels for the standard aging buckets. */
export const BUCKET_LABEL: Record<string, string> = {
  current: "Current",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

// Aging bucket colours: green → lime → amber → orange → red as they age.
const AGE_COLORS: Record<string, string> = {
  current: CHART_COLORS.green,
  "1-30": "#65a30d", // lime-600
  "31-60": CHART_COLORS.amber,
  "61-90": "#ea580c", // orange-600
  "90+": CHART_COLORS.red,
};
export const ageColor = (bucket: string): string => AGE_COLORS[bucket] ?? CHART_COLORS.slate;

// Donut palette (mirrors the dashboard's spend-by-category gradient).
export const DONUT_COLORS = [
  CHART_COLORS.primary, "#5b5ce2", "#7587f0", "#94a7f8", "#b7c5fb", "#d8e0fd",
  CHART_COLORS.teal, CHART_COLORS.violet,
];

/** Today as an ISO date string (YYYY-MM-DD) for the as-of/date controls. */
export const todayISO = (): string => new Date().toISOString().slice(0, 10);

// Score-band colour for a performance meter (0..1): strong green → fair lime → weak amber.
export function meterScoreColor(ratio: number): string {
  if (ratio >= 0.9) return CHART_COLORS.green;
  if (ratio >= 0.75) return "#65a30d"; // lime-600
  return CHART_COLORS.amber;
}

/** Mean of the non-null values, or null when there are none. */
export function meanOrNull(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

// Vendor-assessment scorecard weights (mirror the backend VENDOR_ASSESSMENT_WEIGHTS).
export const ASSESSMENT_WEIGHTS = {
  on_time_delivery: 0.35,
  quality_acceptance: 0.30,
  invoice_accuracy: 0.20,
  responsiveness: 0.15,
} as const;

export const ASSESSMENT_CRITERIA: { key: keyof typeof ASSESSMENT_WEIGHTS; label: string }[] = [
  { key: "on_time_delivery", label: "On-Time Delivery" },
  { key: "quality_acceptance", label: "Quality Acceptance" },
  { key: "invoice_accuracy", label: "Invoice Accuracy" },
  { key: "responsiveness", label: "Responsiveness" },
];

/** Weighted overall score (0–100), rounded - matches the backend computation. */
export function computeOverall(scores: Record<keyof typeof ASSESSMENT_WEIGHTS, number>): number {
  const total = ASSESSMENT_CRITERIA.reduce((sum, { key }) => sum + scores[key] * ASSESSMENT_WEIGHTS[key], 0);
  return Math.round(total);
}

/** Letter grade band: A ≥ 90, B ≥ 76, otherwise C. */
export function gradeFor(score: number): "A" | "B" | "C" {
  if (score >= 90) return "A";
  if (score >= 76) return "B";
  return "C";
}

export type GradeTone = "green" | "amber" | "red";
export const gradeTone = (grade: string): GradeTone =>
  grade === "A" ? "green" : grade === "B" ? "amber" : "red";
