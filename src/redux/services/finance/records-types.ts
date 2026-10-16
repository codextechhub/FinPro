/**
 * Keeping the books: the fiscal calendar rule, how long records are kept,
 * archived years and the sealed figures. Each shape mirrors a vs_finance view
 * (`views_settings.FinanceCalendarSettingsView` and `views_records`).
 */

import type { ChoiceOption, FinanceAuditLog, SettingConsumer } from "./setup-types";

/** Money as the records endpoints send it: kobo beside the server's naira text. */
export interface RecordsMoney {
  kobo: number;
  naira: string;
}

/**
 * What the daily rollover does once the calendar is within `next_year_lead_days`
 * of its end: open the next year itself, or only warn the people who may open
 * one. The same lead is the window the dashboard warns in.
 */
export type NextYearMode = "AUTO_OPEN" | "WARN_ONLY";

/**
 * The fiscal calendar rules. Each is a `finance.settings` field with its own
 * Read and Write switch: absent when the role may not read it, named in
 * `_read_only_fields` when it may read and not change it.
 */
export interface FinanceCalendarSettingsValues {
  next_year_mode?: NextYearMode;
  next_year_mode_label?: string;
  next_year_mode_options?: ChoiceOption<NextYearMode>[];
  next_year_lead_days?: number;
  /**
   * Months close in date order (on by default): a month closes once every
   * earlier month is closed, and reopens once every later month is open.
   */
  periods_close_in_order?: boolean;
  updated_at: string | null;
  updated_by: string | null;
  _read_only_fields?: string[];
}

export interface FinanceCalendarSettingsPayload {
  settings: FinanceCalendarSettingsValues;
  consumers: Record<string, SettingConsumer>;
  history: FinanceAuditLog[];
}

/**
 * How long the books are kept. `statutory_years` is CodeX's floor and is
 * read-only here; `retention_years` is the school's own choice (null keeps the
 * floor); `effective_retention_years` is the longer of the two, the one in
 * force. `archive_min_age_years` is how long after its end a closed year may be
 * archived.
 *
 * The school's period and the archive age are `finance.settings` fields, each
 * with a Read and a Write switch; the period in force travels with the
 * school's period. The floor is CodeX's and carries no switch.
 */
export interface RecordRetentionSettings {
  statutory_years: number;
  retention_years?: number | null;
  effective_retention_years?: number;
  archive_min_age_years?: number;
  history: FinanceAuditLog[];
  _read_only_fields?: string[];
}

/** One account's balance at one branch that moved after it was sealed. */
export interface SealDifference {
  branch_id: number | null;
  branch_name: string | null;
  account_id: number;
  account_code: string;
  account_name: string;
  sealed: { debit: RecordsMoney; credit: RecordsMoney };
  now: { debit: RecordsMoney; credit: RecordsMoney };
}

/** One closed month or year, recomputed from the ledger and compared. */
export interface SealCheck {
  seal_id?: number;
  label?: string;
  kind?: string;
  fiscal_year?: number;
  period_id?: number | null;
  sealed_at?: string;
  seal_checksum?: string;
  line_count?: number;
  line_count_now?: number;
  ok?: boolean;
  seal_intact?: boolean;
  lines_match?: boolean;
  /** One sentence about what failed; null when the check passed. */
  summary?: string | null;
  differences?: SealDifference[];
}

export interface SealVerification {
  ok?: boolean;
  checked?: number;
  mismatches?: number;
  /** Seals that do not follow the seal written before them, by id. */
  chain_breaks?: number[];
  checks?: SealCheck[];
}
