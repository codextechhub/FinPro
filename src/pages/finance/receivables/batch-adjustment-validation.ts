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
