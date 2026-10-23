/**
 * What the chart remembers about how one viewer left it: whether the system
 * section is open and which groups they opened or closed. It lives in the
 * viewer's browser only, and every read and write is guarded because storage
 * can be unavailable (a private window, blocked site data) or hold something
 * this code did not write. The chart works the same without it.
 */

const PREFIX = "finpro.chart.";

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

/** Whether the viewer left "Managed by the system" open. Closed unless they opened it. */
export function readSystemOpen(): boolean {
  return read("systemOpen") === true;
}

export function writeSystemOpen(open: boolean): void {
  write("systemOpen", open);
}

/** The groups the viewer left open in this ledger, or null when they never toggled one. */
export function readExpanded(entity: string): Set<number> | null {
  const value = read(`expanded.${entity}`);
  if (!Array.isArray(value)) return null;
  return new Set(value.filter((id): id is number => typeof id === "number"));
}

export function writeExpanded(entity: string, ids: ReadonlySet<number>): void {
  write(`expanded.${entity}`, [...ids]);
}
