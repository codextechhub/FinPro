export interface BatchAdjustmentLine {
  target: string;
  amount: number;
  available: number;
}

export const MAX_BATCH_ADJUSTMENT_LINES = 100;

export function batchAdjustmentLinesAreValid(lines: BatchAdjustmentLine[]): boolean {
  if (lines.length === 0 || lines.length > MAX_BATCH_ADJUSTMENT_LINES) return false;
  const targets = new Set<string>();
  for (const line of lines) {
    const target = line.target.trim();
    if (!target || targets.has(target) || line.amount <= 0 || line.amount > line.available) {
      return false;
    }
    targets.add(target);
  }
  return true;
}

/**
 * The branches a refund batch's picked lines belong to, each named once, in
 * the order first picked.
 *
 * A batch pays one branch's refunds from one of that branch's accounts, so a
 * batch whose lines span two branches is refused by the server and has no
 * account that could pay it. The drawer reads this to say so before the
 * reader picks a bank account. A row not yet given a branch counts as its own
 * branch (`null`), since it matches no named one. Unpicked lines are skipped.
 */
export function refundBatchBranches<R extends { branch_id: number | null; branch_name: string | null }>(
  rows: (R | null | undefined)[],
): { id: number | null; name: string | null }[] {
  const seen = new Map<number | null, string | null>();
  for (const row of rows) {
    if (!row) continue;
    const id = row.branch_id ?? null;
    if (!seen.has(id)) seen.set(id, row.branch_name ?? null);
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}
