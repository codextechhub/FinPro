/**
 * The checks behind the receivables settings form, apart from React.
 *
 * Provision bands are edited as rows of "over N days, provide R%". The server
 * keeps them in ascending order of age and refuses a ladder whose rate falls as
 * a debt ages (a two-year-old debt provided for less than a one-year-old one),
 * two bands starting at the same age, a rate above 100% and more than ten
 * bands. Checking the same rules here lets the form say what is wrong before
 * the reader saves.
 */

import type { ProvisionBand } from "@/redux/services/finance/fees-types";

/** The most bands the server keeps. */
export const MAX_PROVISION_BANDS = 10;

/** A band as typed: days and a percentage, both as text. */
export interface BandDraft {
  days: string;
  percent: string;
}

export const bandDrafts = (bands: ProvisionBand[]): BandDraft[] =>
  bands.map((b) => ({ days: String(b.over_days), percent: String(Number((b.rate_bps / 100).toFixed(2))) }));

/** The typed bands as the server takes them, sorted by age, or the first problem with them. */
export function parseBands(drafts: BandDraft[]): { bands: ProvisionBand[]; problem: string | null } {
  if (!drafts.length) return { bands: [], problem: "Keep at least one band." };
  if (drafts.length > MAX_PROVISION_BANDS) return { bands: [], problem: `Use at most ${MAX_PROVISION_BANDS} bands.` };
  const bands: ProvisionBand[] = [];
  for (const draft of drafts) {
    const days = Number(draft.days);
    const percent = Number(draft.percent);
    if (draft.days.trim() === "" || !Number.isInteger(days) || days < 0 || days > 36_500) {
      return { bands: [], problem: "Each band starts at a whole number of days, from 0." };
    }
    if (draft.percent.trim() === "" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { bands: [], problem: "Each band's rate is a percentage from 0 to 100." };
    }
    bands.push({ over_days: days, rate_bps: Math.round(percent * 100) });
  }
  bands.sort((a, b) => a.over_days - b.over_days);
  for (let i = 1; i < bands.length; i += 1) {
    if (bands[i].over_days === bands[i - 1].over_days) return { bands: [], problem: "Two bands cannot start at the same age." };
    if (bands[i].rate_bps < bands[i - 1].rate_bps) {
      return { bands: [], problem: "An older band's rate cannot be lower than a younger band's." };
    }
  }
  return { bands, problem: null };
}

/** Whether two ladders are the same. */
export function sameBands(a: ProvisionBand[], b: ProvisionBand[]): boolean {
  return a.length === b.length && a.every((band, i) => band.over_days === b[i].over_days && band.rate_bps === b[i].rate_bps);
}
