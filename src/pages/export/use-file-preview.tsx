/**
 * Export files keep a separate view trail from saved copies. The preview route
 * applies the same server permission and frozen run scope as download, while
 * the existing download mutation keeps its counter and refusal messages.
 */

import { useMemo, useState } from "react";

import { FilePreviewDialog, showFilePreview, type PreviewFile } from "../../components/finance-ui/file-preview-dialog";
import { useDownloadExportFileMutation } from "@/redux/services/dashboard/exports-api";
import type { ExportFile } from "@/redux/services/dashboard/exports-types";
import { getAccessToken } from "@/utils/access-token";
import { appendTenantQuery } from "@/utils/tenant-context";

const backendUrl = String(import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

async function previewRequest(id: number, signal?: AbortSignal, details = false): Promise<Blob> {
  const token = getAccessToken();
  const path = `${backendUrl}/exports/files/${id}/preview/${details ? "?details=1" : ""}`;
  const response = await fetch(appendTenantQuery(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || body?.detail || "This export is unavailable.");
  }
  return details ? new Blob() : response.blob();
}

/** Open a quick export in the application-level viewer after its drawer closes. */
export function openExportFilePreview(file: Pick<ExportFile, "id" | "name" | "format" | "size_bytes">) {
  showFilePreview({
    id: file.id,
    name: file.name,
    contentType: file.format.toLowerCase() === "pdf" ? "application/pdf" : undefined,
    size: file.size_bytes,
    loadPreview: (signal) => previewRequest(file.id, signal),
    recordView: () => previewRequest(file.id, undefined, true).then(() => undefined),
    loadDownload: async () => {
      const token = getAccessToken();
      const response = await fetch(appendTenantQuery(`${backendUrl}/exports/files/${file.id}/download/`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("This export could not be downloaded.");
      return response.blob();
    },
  });
}

export function useFilePreview() {
  const [selected, setSelected] = useState<{ file: Pick<ExportFile, "id" | "name" | "format" | "size_bytes">; runId?: number } | null>(null);
  const [download] = useDownloadExportFileMutation();
  const files = useMemo<PreviewFile[]>(() => {
    if (!selected) return [];
    const { file, runId } = selected;
    return [{
      id: file.id,
      name: file.name,
      contentType: file.format.toLowerCase() === "pdf" ? "application/pdf" : undefined,
      size: file.size_bytes,
      loadPreview: (signal) => previewRequest(file.id, signal),
      recordView: () => previewRequest(file.id, undefined, true).then(() => undefined),
      loadDownload: async () => {
        const url = await download({ fileId: file.id, runId }).unwrap();
        try {
          return await (await fetch(url)).blob();
        } finally {
          URL.revokeObjectURL(url);
        }
      },
    }];
  }, [download, selected]);

  return {
    open: (file: Pick<ExportFile, "id" | "name" | "format" | "size_bytes">, runId?: number) => setSelected({ file, runId }),
    viewer: <FilePreviewDialog files={files} index={selected ? 0 : null} onIndexChange={() => undefined} onClose={() => setSelected(null)} />,
  };
}
