// Small helpers shared by the batch-detail page and its tabs.
import { toast } from "sonner";

import { P, type PermissionCode } from "@/permissions";
import { getAccessToken } from "@/utils/access-token";

// RTK responses are sometimes wrapped in a { data } envelope; this normalises.
export const unwrap = <T,>(res: { data: T } | T | undefined): T | undefined => {
  if (!res) return undefined;
  return (res as { data: T }).data ?? (res as T);
};

/**
 * Download a file from a bearer-authenticated import endpoint and save it.
 *
 * The access token lives in the host's memory, never in a cookie or storage,
 * so a plain link or a new tab reaches the endpoint with no credentials and is
 * refused. The file is fetched with the token instead, the same way the
 * finance report exports and printable documents are, and handed to the
 * browser as a blob. A failed download says so rather than opening a tab onto
 * the refusal.
 */
export async function triggerBlobDownload(url: string, filename: string) {
  try {
    const token = getAccessToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    toast.error("Download failed. Please try again.");
  }
}

/**
 * Whether this reader may roll back a job of a batch of `dataset`.
 *
 * The engine's rollback key covers every batch. The bank-statement import key
 * also covers a bank-statement batch and no other, because a bulk-imported
 * statement is corrected by rolling it back and importing it again. The server
 * applies the same rule (`_DATASET_EXTRA_ENGINE_KEYS`), and the school app's
 * import wizard spells it as `canRollBackImport`.
 */
export function canRollBackBatch(
  dataset: string | undefined,
  hasPermission: (code: PermissionCode) => boolean,
): boolean {
  if (hasPermission(P.RUN_IMPORT_ROLLBACK)) return true;
  return dataset === "bank_statements" && hasPermission(P.FIN_IMPORT_BANK);
}
