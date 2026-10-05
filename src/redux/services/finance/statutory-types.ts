/**
 * National payroll tax data (vs_finance payroll statutory tables).
 *
 * These rows carry no tenant: they are the country's PAYE tables, the states
 * PAYE is remitted to and the pension fund administrators. Anybody who works in
 * finance reads them; only platform staff holding `finance.statutory.create` /
 * `.update` change them. Money is integer kobo, rates are basis points.
 */

export type PayeReliefKind = "CONTRIBUTION" | "PERCENT_CAPPED" | "FIXED";
export type PayeReliefBasis = "NONE" | "PENSION" | "NHF" | "ANNUAL_RENT" | "ANNUAL_GROSS";

export interface PayeTaxBand {
  id?: number;
  sequence?: number;
  /** Annual kobo where the band starts; the first band starts at 0. */
  lower: number;
  /** Annual kobo where it ends; null on the open-ended top band. */
  upper: number | null;
  rate_bps: number;
}

export interface PayeTaxRelief {
  id?: number;
  sequence?: number;
  code: string;
  name: string;
  kind: PayeReliefKind;
  basis: PayeReliefBasis;
  rate_bps: number;
  /** Annual kobo; null where the relief has no cap. */
  cap_amount: number | null;
  floor_amount: number;
}

export interface PayeTaxTable {
  id: number;
  country: string;
  tax_year: number;
  name: string;
  source_reference: string;
  notes: string;
  minimum_tax_rate_bps: number;
  exempt_income_threshold: number;
  /** Bumped by every change; lines already priced keep the revision they used. */
  revision: number;
  is_active: boolean;
  bands: PayeTaxBand[];
  reliefs: PayeTaxRelief[];
  updated_at: string;
}

/** The writable part of a table: what the create and change routes accept. */
export interface PayeTaxTableBody {
  name?: string;
  source_reference?: string;
  notes?: string;
  minimum_tax_rate_bps?: number;
  exempt_income_threshold?: number;
  is_active?: boolean;
  bands?: Pick<PayeTaxBand, "lower" | "upper" | "rate_bps">[];
  reliefs?: Omit<PayeTaxRelief, "id" | "sequence">[];
}

export interface PayrollTaxState {
  id: number;
  country: string;
  code: string;
  name: string;
  /** The state's revenue service, which PAYE is remitted to. */
  authority_name: string;
  is_active: boolean;
}

export interface PensionFundAdministrator {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}
