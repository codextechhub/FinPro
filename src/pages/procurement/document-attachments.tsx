// Supplier evidence on a vendor bill or a vendor payment: their invoice PDF, or the
// receipt they issued. One panel serves both documents, because the rules are the
// same on either side of the chain and two copies would drift.
//
// Deliberately usable on a POSTED document. The formal invoice usually follows the
// booked charge and the receipt always follows the payment, so a panel that hid
// itself once the document was posted would collect nothing worth keeping.
//
// The gate is the document's own `attach` permission, never `update`: filing the
// counterparty's paper is not the same authority as rewriting the bill's amounts,
// and `update` is refused on a posted document anyway.

import { useRef, useState } from "react";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Can } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PermissionCode } from "../../permissions";
import type { DocumentAttachment } from "@/redux/services/procurement/procurement-types";
import { openAttachment } from "@/utils/attachment-download";

/** Mirrors core.uploads on the backend. The server stays authoritative; this only
 *  saves the user a round trip to be told what we already know. */
const ACCEPTED = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const MAX_BYTES = 5 * 1024 * 1024;

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(parsed);
}

/** Reject locally what the server would reject anyway, and say why. */
function localRejection(file: File): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
  if (!ACCEPTED.includes(ext)) return "Attach a PDF, PNG, JPG, JPEG or WebP file.";
  if (file.size > MAX_BYTES) return "Each file must be 5MB or smaller.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

export function DocumentAttachments({
  attachments, attachPermission, uploading, deleting, onUpload, onDelete, emptyMessage,
}: {
  attachments: DocumentAttachment[];
  attachPermission: PermissionCode;
  uploading: boolean;
  deleting: boolean;
  onUpload: (file: File, caption: string) => Promise<void>;
  onDelete: (attachmentId: number) => Promise<void>;
  emptyMessage: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const rejection = localRejection(file);
    if (rejection) { toast.error(rejection); return; }
    await onUpload(file, caption.trim());
    setCaption("");
    // Clear the input so re-picking the same file still fires a change event.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <Can permission={attachPermission}>
        <div className="rounded-md border border-dashed border-white-02 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="font-mont text-[11px] text-gray-05" htmlFor="attachment-caption">
                Description (optional)
              </label>
              <Input
                id="attachment-caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="e.g. Supplier invoice, March"
                className="mt-1"
                maxLength={255}
              />
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="hidden"
              onChange={(event) => void pick(event.target.files?.[0])}
            />
            <Button variant="outline" loading={uploading} onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" /> Attach File
            </Button>
          </div>
          <p className="mt-2 font-mont text-[11px] text-gray-05">
            PDF or image, up to 5MB. Up to 10 files on this document.
          </p>
        </div>
      </Can>

      {attachments.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">
          {emptyMessage}
        </div>
      ) : (
        <ul className="space-y-2">
          {attachments.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-white-02 p-3"
            >
              <Paperclip className="size-4 shrink-0 text-gray-05" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mont text-sm font-semibold text-black-01">{row.name}</p>
                <p className="mt-0.5 font-mont text-[11px] text-gray-05">
                  {row.caption ? `${row.caption} · ` : ""}
                  {humanSize(row.size)} · {row.uploaded_by_name} · {shortDateTime(row.uploaded_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  // Not an <a href>: the media endpoint needs the Bearer token, so a
                  // plain navigation would 401. See utils/attachment-download.
                  openAttachment(row.url, row.name).catch((error: Error) =>
                    toast.error(error.message));
                }}
                className="inline-flex items-center gap-1.5 font-mont text-xs font-medium text-primary"
              >
                <Download className="size-3.5" /> Open
              </button>
              <Can permission={attachPermission}>
                <Button
                  size="sm"
                  variant="outline-dest"
                  disabled={deleting}
                  onClick={() => void onDelete(row.id)}
                >
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              </Can>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
