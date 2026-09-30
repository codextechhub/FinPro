/**
 * Read a protected file without leaving the current record.
 *
 * Callers supply their own authorised fetch because vendor sessions, stored
 * media, and export files use different credentials and audit rules. The viewer
 * owns preview object URLs only while a file is selected. Download uses the
 * original bytes and may use a separate request when the server records views
 * and downloads as different actions.
 */

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export interface PreviewFile {
  id: string | number;
  name: string;
  contentType?: string | null;
  size?: number | null;
  loadPreview?: (signal: AbortSignal) => Promise<Blob>;
  loadDownload: () => Promise<Blob>;
  recordView?: () => Promise<void>;
}

function kindOf(file: PreviewFile): "image" | "pdf" | "details" {
  const type = file.contentType?.toLowerCase() || "";
  const name = file.name.toLowerCase();
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(name)) return "image";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "details";
}

function sizeLabel(bytes: number | null | undefined): string {
  if (bytes == null) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function FilePreviewDialog({ files, index, onIndexChange, onClose }: {
  files: PreviewFile[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const file = index == null ? undefined : files[index];
  const kind = file ? kindOf(file) : "details";
  const [preview, setPreview] = useState<{ id: PreviewFile["id"]; url: string; blob: Blob } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    let objectUrl = "";
    setPreview(null);
    setError("");
    if (kind === "details") {
      if (file.recordView) {
        void file.recordView().catch(() => {
          if (!controller.signal.aborted) setError("This file is no longer available.");
        });
      }
    } else if (file.loadPreview) {
      setLoading(true);
      void file.loadPreview(controller.signal).then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ id: file.id, url: objectUrl, blob });
      }).catch(() => {
        if (!controller.signal.aborted) setError("This file could not be shown.");
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    } else {
      setError("This file could not be shown.");
    }
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, kind]);

  useEffect(() => {
    if (index == null || files.length < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      onIndexChange((index + (event.key === "ArrowRight" ? 1 : -1) + files.length) % files.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [files.length, index, onIndexChange]);

  const download = async () => {
    if (!file) return;
    setDownloading(true);
    try {
      const blob = file.loadDownload === file.loadPreview && preview?.id === file.id
        ? preview.blob : await file.loadDownload();
      saveBlob(blob, file.name);
    } catch {
      setError("This file could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  };

  return <Dialog open={file != null} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="flex h-[min(90dvh,900px)] w-[calc(100vw-2rem)] max-w-none flex-col gap-3 overflow-hidden p-4 sm:max-w-5xl sm:p-6">
      <div className="flex min-w-0 items-start gap-3 pr-9">
        <div className="min-w-0 flex-1">
          <DialogTitle className="break-words text-sm sm:text-base">{file?.name || "File"}</DialogTitle>
          <DialogDescription>{file && `${sizeLabel(file.size)}${files.length > 1 ? ` · ${index! + 1} of ${files.length}` : ""}`}</DialogDescription>
        </div>
        <Button size="icon" variant="outline" disabled={!file || downloading} onClick={() => void download()} aria-label="Download file" title="Download file">
          {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </Button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-[#f4f7fb]">
        {error ? <p role="alert" className="p-5 text-center text-sm text-gray-05">{error}</p>
          : loading ? <Loader2 className="size-6 animate-spin text-gray-05" aria-label="Loading file" />
          : file && kind === "image" && preview?.id === file.id ? <img src={preview.url} alt={file.name} className="max-h-full max-w-full object-contain" />
          : file && kind === "pdf" && preview?.id === file.id ? <iframe src={preview.url} title={file.name} className="h-full w-full border-0" />
          : file && kind === "details" ? <div className="max-w-md p-6 text-center"><FileText className="mx-auto size-10 text-gray-05" /><p className="mt-3 break-words font-medium">{file.name}</p><p className="mt-1 text-sm text-gray-05">{sizeLabel(file.size)} · {file.contentType || "File"}</p><p className="mt-3 text-sm text-gray-05">Download this file to open it in its own application.</p></div>
          : null}
      </div>
      {files.length > 1 && index != null && <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={() => onIndexChange((index - 1 + files.length) % files.length)}><ChevronLeft className="size-4" />Previous</Button>
        <span className="text-xs text-gray-05">{index + 1} / {files.length}</span>
        <Button variant="outline" onClick={() => onIndexChange((index + 1) % files.length)}>Next<ChevronRight className="size-4" /></Button>
      </div>}
    </DialogContent>
  </Dialog>;
}

type PreviewListener = (file: PreviewFile) => void;
const previewListeners = new Set<PreviewListener>();

/** Open a fetched file from a download helper without coupling that helper to a page. */
export function showFilePreview(file: PreviewFile) {
  previewListeners.forEach((listener) => listener(file));
}

/** Keep one viewer mounted across navigation and direct file actions. */
export function FilePreviewHost() {
  const [file, setFile] = useState<PreviewFile | null>(null);
  useEffect(() => {
    const listener: PreviewListener = (next) => setFile(next);
    previewListeners.add(listener);
    return () => { previewListeners.delete(listener); };
  }, []);
  return <FilePreviewDialog files={file ? [file] : []} index={file ? 0 : null} onIndexChange={() => undefined} onClose={() => setFile(null)} />;
}

export function showBlobPreview(name: string, blob: Blob) {
  const load = async () => blob;
  showFilePreview({ id: `${name}:${Date.now()}`, name, contentType: blob.type, size: blob.size, loadPreview: load, loadDownload: load });
}
