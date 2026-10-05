/**
 * How a recharged cost splits between branches, the same way the server splits
 * it (vs_finance.inter_branch.split_by_weight), so the form previews each
 * branch's share exactly before anything is posted.
 *
 * Ikeja paid the N600,000 internet bill for Ikeja and Lekki. Weighted 1 each,
 * Ikeja keeps N300,000 of the expense and Lekki takes N300,000, which Lekki then
 * owes Ikeja. By fixed percentages 60 and 40, Lekki's share is N240,000.
 */

import type { RechargeBasis, RechargeWeight } from "@/redux/services/finance/interbranch-types";

/**
 * Split `amount` kobo by `weights` exactly: each branch gets the whole kobo of
 * its share, and the kobo left over go one each to the largest fractions, ties
 * to the lower branch id. Empty when the weights add up to nothing.
 */
export function splitByWeight(amount: number, weights: Record<number, number>): Record<number, number> {
  // BigInt: a large bill times a weight in basis points passes 2^53.
  const ids = Object.keys(weights).map(Number);
  const total = ids.reduce((sum, id) => sum + BigInt(weights[id]), 0n);
  if (total <= 0n || amount <= 0) return {};
  const whole = BigInt(amount);
  const base: Record<number, bigint> = {};
  const rest: Record<number, bigint> = {};
  for (const id of ids) {
    base[id] = (whole * BigInt(weights[id])) / total;
    rest[id] = (whole * BigInt(weights[id])) % total;
  }
  let left = whole - ids.reduce((sum, id) => sum + base[id], 0n);
  const order = [...ids].sort((a, b) => (rest[b] > rest[a] ? 1 : rest[b] < rest[a] ? -1 : a - b));
  for (const id of order) {
    if (left <= 0n) break;
    base[id] += 1n;
    left -= 1n;
  }
  return Object.fromEntries(ids.map((id) => [id, Number(base[id])]));
}

/** A percentage typed on the form as basis points, or null when it is not a
 *  number with at most two decimal places. */
export function percentToBps(text: string): number | null {
  const value = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

/** A count typed on the form, or null when it is not a whole number. */
export function parseCount(text: string): number | null {
  const value = text.trim();
  return /^\d+$/.test(value) ? Number(value) : null;
}

/**
 * The weights the form has filled in, as basis points or counts by branch.
 * Blank rows are left out; `problem` says what the server would refuse.
 */
export function readWeights(basis: RechargeBasis, inputs: Record<number, string>): {
  weights: Record<number, number>;
  problem: string | null;
} {
  const weights: Record<number, number> = {};
  for (const [id, text] of Object.entries(inputs)) {
    if (!text.trim()) continue;
    const value = basis === "PERCENTAGES" ? percentToBps(text) : parseCount(text);
    if (value === null) {
      return { weights, problem: basis === "PERCENTAGES" ? "Percentages go to two decimal places at most." : "Each count is a whole number, zero or more." };
    }
    weights[Number(id)] = value;
  }
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (!Object.keys(weights).length || total <= 0) return { weights, problem: "Give a weight for each branch sharing the cost." };
  if (basis === "PERCENTAGES" && total !== 10000) return { weights, problem: "Fixed percentages must total 100." };
  return { weights, problem: null };
}

/** The request's `weights` list. */
export function weightsBody(basis: RechargeBasis, weights: Record<number, number>): RechargeWeight[] {
  return Object.entries(weights).map(([id, w]) => (
    basis === "PERCENTAGES" ? { branch: Number(id), percent: w / 100 } : { branch: Number(id), count: w }
  ));
}

/** Whether the split leaves anything for a branch other than the payer. */
export function sharesSomething(shares: Record<number, number>, payer: number | undefined): boolean {
  return Object.entries(shares).some(([id, amount]) => Number(id) !== payer && amount > 0);
}
