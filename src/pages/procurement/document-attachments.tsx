/**
 * Supplier evidence on a vendor bill or a vendor payment: their invoice PDF, or the
 * receipt they issued. One panel serves both documents, because the rules are the
 * same on either side of the chain and two copies would drift.
 *
 * Deliberately usable on a POSTED document. The formal invoice usually follows the
 * booked charge and the receipt always follows the payment, so a panel that hid
 * itself once the document was posted would collect nothing worth keeping.
 *
 * The gate is the document's own `attach` permission, never `update`: filing the
 * counterparty's paper is not the same authority as rewriting the bill's amounts,
 * and `update` is refused on a posted document anyway.
 *
 * Removing a file depends on the document. From a draft it is deleted after a
 * plain confirm. Once the document has left draft the file is evidence behind a
 * record the business must keep, so the backend supersedes it instead of deleting
 * it and refuses without a reason: the confirm says so and asks for one. A
 * superseded file stays in the list, greyed, with who removed it, when and why.
 */

import { useMemo, useRef, useState } from "react";
import { Eye, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Can } from "@/components/finance-ui/can";
import { ConfirmActionModal } from "@/components/finance-ui/confirm-action-modal";
import { ReasonField, hasReason } from "@/components/finance-ui/reason-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PermissionCode } from "../../permissions";
import {
  useGetVendorInvoiceAttachmentsQuery,
  useGetVendorPaymentAttachmentsQuery,
} from "@/redux/services/procurement/procurement-api";
import type { DocumentAttachment } from "@/redux/services/procurement/procurement-types";
import { fetchAttachmentBlob } from "@/utils/attachment-download";
import { useDates } from "../../lib/display-prefs";
import { FilePreviewDialog, type PreviewFile } from "../../components/finance-ui/file-preview-dialog";

/** Mirrors core.uploads on the backend. The server stays authoritative; this only
 *  saves the user a round trip to be told what we already know. */
const ACCEPTED = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const MAX_BYTES = 5 * 1024 * 1024;

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

/** The two documents that carry supplier evidence. */
export type AttachmentOwner = "vendor-invoice" | "vendor-payment";

/**
 * The files to list for one document.
 *
 * A draft's detail payload already carries every file it has, since nothing on a
 * draft is ever superseded. A document that has left draft is read from its
 * attachment list with superseded files included, so a removed file stays in
 * sight with its reason; until that read answers, the detail payload's current
 * files stand in. `active` holds the read back until the panel is on screen.
 */
export function useDocumentAttachmentRows(
  owner: AttachmentOwner,
  document: { id: number; status: string; attachments?: DocumentAttachment[] } | undefined,
  entity: string,
  active: boolean,
): DocumentAttachment[] {
  const needsList = !!document && active && document.status !== "DRAFT";
  const args = { id: document?.id ?? 0, entity, include_superseded: true };
  const invoiceList = useGetVendorInvoiceAttachmentsQuery(args, { skip: !needsList || owner !== "vendor-invoice" });
  const paymentList = useGetVendorPaymentAttachmentsQuery(args, { skip: !needsList || owner !== "vendor-payment" });
  const listed = (owner === "vendor-invoice" ? invoiceList : paymentList).data?.data?.attachments;
  if (needsList && Array.isArray(listed)) return listed;
  return document?.attachments ?? [];
}

/** "Superseded: <reason>, by <name>, <date>", leaving out whatever is missing. */
export function supersededLine(row: DocumentAttachment, day: (value: string | null) => string): string {
  const reason = row.superseded_reason?.trim();
  const parts = [
    reason ? `Superseded: ${reason}` : "Superseded",
    row.superseded_by_name ? `by ${row.superseded_by_name}` : null,
    row.superseded_at ? day(row.superseded_at) : null,
  ];
  return parts.filter(Boolean).join(", ");
}

export function DocumentAttachments({
  attachments, documentIsDraft, attachPermission, uploading, deleting, onUpload, onDelete, emptyMessage,
}: {
  attachments: DocumentAttachment[];
  /** Decides whether removing a file deletes it or supersedes it with a reason. */
  documentIsDraft: boolean;
  attachPermission: PermissionCode;
  uploading: boolean;
  deleting: boolean;
  onUpload: (file: File, caption: string) => Promise<void>;
  /** Resolves once the file is gone; rejects when the server refuses. `reason` is
   *  given only for a document that has left draft. */
  onDelete: (attachmentId: number, reason?: string) => Promise<unknown>;
  emptyMessage: string;
}) {
  const dates = useDates();
  const inputRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [removing, setRemoving] = useState<DocumentAttachment | null>(null);
  const [reason, setReason] = useState("");
  const rows = useMemo(
    () => [...attachments.filter((row) => !row.superseded), ...attachments.filter((row) => row.superseded)],
    [attachments],
  );
  const previewFiles = useMemo<PreviewFile[]>(() => rows.map((row) => ({
    id: row.id,
    name: row.name,
    contentType: row.content_type,
    size: row.size,
    loadPreview: (signal) => fetchAttachmentBlob(row.url, signal),
    loadDownload: () => fetchAttachmentBlob(row.url),
  })), [rows]);

  const askToRemove = (row: DocumentAttachment | null) => {
    setRemoving(row);
    setReason("");
  };
  const remove = async () => {
    if (!removing) return;
    try {
      await onDelete(removing.id, documentIsDraft ? undefined : reason.trim());
      toast.success(documentIsDraft ? "Attachment removed." : "Attachment marked superseded.");
      askToRemove(null);
    } catch { /* central */ }
  };

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

      {rows.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">
          {emptyMessage}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              data-superseded={row.superseded ? "true" : undefined}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-md border p-3",
                row.superseded ? "border-dashed border-white-02 bg-gray-02/40 opacity-70" : "border-white-02",
              )}
            >
              <Paperclip className="size-4 shrink-0 text-gray-05" />
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "truncate font-mont text-sm font-semibold",
                  row.superseded ? "text-gray-05 line-through" : "text-black-01",
                )}>{row.name}</p>
                <p className="mt-0.5 font-mont text-[11px] text-gray-05">
                  {row.caption ? `${row.caption} · ` : ""}
                  {humanSize(row.size)} · {row.uploaded_by_name} · {dates.dateTime(row.uploaded_at)}
                </p>
                {row.superseded ? (
                  <p className="mt-0.5 break-words font-mont text-[11px] text-gray-05">
                    {supersededLine(row, (value) => dates.day(value))}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedIndex(rows.findIndex((item) => item.id === row.id))}
                className="inline-flex items-center gap-1.5 font-mont text-xs font-medium text-primary"
              >
                <Eye className="size-3.5" /> View
              </button>
              {row.superseded ? null : (
                <Can permission={attachPermission}>
                  <Button
                    size="sm"
                    variant="outline-dest"
                    disabled={deleting}
                    onClick={() => askToRemove(row)}
                  >
                    <Trash2 className="size-3.5" /> Remove
                  </Button>
                </Can>
              )}
            </li>
          ))}
        </ul>
      )}
      <FilePreviewDialog files={previewFiles} index={selectedIndex} onIndexChange={setSelectedIndex} onClose={() => setSelectedIndex(null)} />
      <ConfirmActionModal
        open={removing != null}
        onOpenChange={(open) => !open && askToRemove(null)}
        title={`Remove ${removing?.name ?? "this file"}?`}
        description={documentIsDraft
          ? "The file is deleted from this draft."
          : "This document has left draft, so the file is kept and marked superseded, not deleted. It stays listed here, greyed out, with your reason."}
        confirmText={documentIsDraft ? "Remove file" : "Mark superseded"}
        destructive={documentIsDraft}
        loading={deleting}
        confirmDisabled={!documentIsDraft && !hasReason(reason)}
        onConfirm={() => void remove()}
      >
        {documentIsDraft ? null : (
          <ReasonField
            value={reason}
            onChange={setReason}
            disabled={deleting}
            placeholder="For example: the supplier sent a corrected invoice"
            hint="Kept on the file and on the audit trail with your name."
          />
        )}
      </ConfirmActionModal>
    </div>
  );
}
