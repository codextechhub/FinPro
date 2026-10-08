/** Why a reader cannot open a filing that covers only some branches. */
export const STATUTORY_PACK_REACH_MESSAGE =
  "The statutory pack covers the whole school, so it is available only to readers whose access covers every branch.";

/** The server's own refusal sentence, when it provides one. */
export function statutoryPackRefusal(error: unknown): string {
  const data = (error as { data?: { message?: unknown; detail?: unknown; error?: { detail?: unknown } } } | null)?.data;
  for (const candidate of [data?.message, data?.detail, data?.error?.detail]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return STATUTORY_PACK_REACH_MESSAGE;
}
