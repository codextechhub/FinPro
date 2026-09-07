/**
 * Downloading an export file is a server-authorised, audited act, not a link.
 *
 * The endpoint re-checks the DOWNLOADER (not the person who ran the export)
 * against the run's frozen entity and dataset plus the file's expiry, and logs
 * the attempt either way. So it has to go through the API layer with the bearer
 * token attached - an <a href> would arrive unauthenticated and be refused.
 *
 * The refusal message the server sends is the useful one ("this file passed its
 * availability date on 25 Aug - run the export again"), so it is surfaced as-is
 * rather than replaced with a generic failure.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useDownloadExportFileMutation } from "@/redux/services/dashboard/exports-api";
import { apiErrorMessage } from "@/utils/api-errors";
import type { ExportFile } from "@/redux/services/dashboard/exports-types";

export function useFileDownload() {
  const [download] = useDownloadExportFileMutation();
  // Tracked per file id so one row's spinner never appears on another's.
  const [busyId, setBusyId] = useState<number | null>(null);

  const save = async (file: Pick<ExportFile, "id" | "name">, runId?: number) => {
    setBusyId(file.id);
    try {
      // The endpoint hands back an object URL rather than the bytes, so the
      // file never lands in the Redux store. Revoked below once the browser has
      // taken it.
      const url = await download({ fileId: file.id, runId }).unwrap();
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(apiErrorMessage(error, "That file could not be downloaded."));
    } finally {
      setBusyId(null);
    }
  };

  return { save, busyId };
}
