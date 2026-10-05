/**
 * Editing a national PAYE table: what the form holds and what it sends.
 *
 * The server keeps money as annual kobo and rates as basis points; the form
 * shows naira and percent, the way the law states them. Bands are contiguous
 * from nothing upwards and only the top one is open-ended, so the form edits
 * each band's upper bound and rate, and every band starts where the one before
 * it ended. The server checks the same rule; the form answers it first.
 *
 * A new tax year starts from the latest table: its bands, reliefs and
 * thresholds copied into a draft for the next year, because a year's change is
 * usually a few figures rather than a new structure.
 */

import { toKobo, toNaira } from "../../../utils/money";
import type {
  PayeReliefBasis,
  PayeReliefKind,
  PayeTaxTable,
  PayeTaxTableBody,
} from "@/redux/services/finance/statutory-types";

export interface BandRow {
  /** Annual naira where the band ends; blank on the open-ended top band. */
  upper: string;
  /** Percent. */
  rate: string;
}

export interface ReliefRow {
  code: string;
  name: string;
  kind: PayeReliefKind;
  basis: PayeReliefBasis;
  rate: string;
  /** Annual naira; blank for no cap. */
  cap: string;
  floor: string;
}

export interface TaxTableForm {
  name: string;
  source_reference: string;
  notes: string;
  minimum_rate: string;
  exempt_threshold: string;
  is_active: boolean;
  bands: BandRow[];
  reliefs: ReliefRow[];
}

export const RELIEF_KINDS: { value: PayeReliefKind; label: string }[] = [
  { value: "CONTRIBUTION", label: "Contribution actually made" },
  { value: "PERCENT_CAPPED", label: "Percentage of a basis, floored and capped" },
  { value: "FIXED", label: "Fixed amount a year" },
];

export const RELIEF_BASES: { value: PayeReliefBasis; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "PENSION", label: "Employee pension" },
  { value: "NHF", label: "National Housing Fund" },
  { value: "ANNUAL_RENT", label: "Annual rent" },
  { value: "ANNUAL_GROSS", label: "Annual gross income" },
];

/** Basis points as the percent a reader types: 700 is "7", 75 is "0.75". */
export function bpsToPercent(bps: number): string {
  return String(Number((bps / 100).toFixed(2)));
}

/** A typed percent as basis points, or null when it is not a percent from 0 to 100. */
export function percentToBps(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const bps = Math.round(Number(text) * 100);
  return bps <= 10000 ? bps : null;
}

const naira = (kobo: number | null | undefined) => (kobo === null || kobo === undefined ? "" : String(toNaira(kobo)));

function nairaToKobo(raw: string): number | null {
  const text = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return toKobo(text);
}

/** The form for an existing table, or a blank one. */
export function formFromTable(table: PayeTaxTable | null): TaxTableForm {
  if (!table) {
    return {
      name: "", source_reference: "", notes: "", minimum_rate: "0", exempt_threshold: "0", is_active: true,
      bands: [{ upper: "", rate: "" }], reliefs: [],
    };
  }
  return {
    name: table.name,
    source_reference: table.source_reference,
    notes: table.notes,
    minimum_rate: bpsToPercent(table.minimum_tax_rate_bps),
    exempt_threshold: naira(table.exempt_income_threshold),
    is_active: table.is_active,
    bands: [...table.bands]
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((b) => ({ upper: naira(b.upper), rate: bpsToPercent(b.rate_bps) })),
    reliefs: [...table.reliefs]
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((r) => ({
        code: r.code, name: r.name, kind: r.kind, basis: r.basis,
        rate: bpsToPercent(r.rate_bps), cap: naira(r.cap_amount), floor: naira(r.floor_amount),
      })),
  };
}

/** The year after the newest table, and that table's rules copied as its draft. */
export function nextYearDraft(tables: readonly PayeTaxTable[], thisYear: number): { year: number; form: TaxTableForm } {
  const latest = [...tables].sort((a, b) => b.tax_year - a.tax_year)[0] ?? null;
  const year = latest ? latest.tax_year + 1 : thisYear;
  const form = formFromTable(latest);
  return { year, form: { ...form, name: "", is_active: true } };
}

/** Where each band starts, read from the band before it. */
export function bandStarts(bands: readonly BandRow[]): string[] {
  return bands.map((_, i) => (i === 0 ? "0" : bands[i - 1].upper || "?"));
}

/**
 * The request body for the form, or the first thing wrong with it, worded for
 * the reader. Money goes as kobo and rates as basis points.
 */
export function tableBody(form: TaxTableForm): { body: PayeTaxTableBody; error: null } | { body: null; error: string } {
  const fail = (error: string) => ({ body: null, error });
  if (!form.bands.length) return fail("Add at least one band.");
  const bands: NonNullable<PayeTaxTableBody["bands"]> = [];
  let lower = 0;
  for (const [i, row] of form.bands.entries()) {
    const top = i === form.bands.length - 1;
    const rate = percentToBps(row.rate);
    if (rate === null) return fail(`Band ${i + 1}: enter a rate from 0 to 100%.`);
    if (top) {
      if (row.upper.trim()) return fail("The top band has no upper limit. Clear it, or add another band above it.");
      bands.push({ lower, upper: null, rate_bps: rate });
      break;
    }
    const upper = nairaToKobo(row.upper);
    if (upper === null) return fail(`Band ${i + 1}: enter where it ends, in naira a year.`);
    if (upper <= lower) return fail(`Band ${i + 1} must end above where it starts.`);
    bands.push({ lower, upper, rate_bps: rate });
    lower = upper;
  }
  const reliefs: NonNullable<PayeTaxTableBody["reliefs"]> = [];
  for (const [i, row] of form.reliefs.entries()) {
    if (!row.code.trim() || !row.name.trim()) return fail(`Relief ${i + 1} needs a code and a name.`);
    const rate = percentToBps(row.rate || "0");
    if (rate === null) return fail(`Relief ${i + 1}: enter a rate from 0 to 100%.`);
    const cap = row.cap.trim() ? nairaToKobo(row.cap) : null;
    if (row.cap.trim() && cap === null) return fail(`Relief ${i + 1}: enter the cap in naira, or leave it blank.`);
    const floor = nairaToKobo(row.floor || "0");
    if (floor === null) return fail(`Relief ${i + 1}: enter the floor in naira.`);
    reliefs.push({
      code: row.code.trim().slice(0, 24), name: row.name.trim().slice(0, 120), kind: row.kind, basis: row.basis,
      rate_bps: rate, cap_amount: cap, floor_amount: floor,
    });
  }
  const minimum = percentToBps(form.minimum_rate || "0");
  if (minimum === null) return fail("Enter the minimum tax rate as a percent from 0 to 100.");
  const exempt = nairaToKobo(form.exempt_threshold || "0");
  if (exempt === null) return fail("Enter the exempt income threshold in naira.");
  return {
    body: {
      ...(form.name.trim() ? { name: form.name.trim() } : {}),
      source_reference: form.source_reference.trim(),
      notes: form.notes.trim(),
      minimum_tax_rate_bps: minimum,
      exempt_income_threshold: exempt,
      is_active: form.is_active,
      bands,
      reliefs,
    },
    error: null,
  };
}
