// <DocumentEmailAction /> - send a finance document to its customer, with the
// recipients shown before it goes and the history of what has already gone.
//
// One component for all three documents (invoice, receipt, statement) because they
// differ only in the URL and the label. Three copies of a confirm-then-send flow is
// how the three screens would drift apart, and the send is the part that must not:
// it reaches a paying customer, so it always confirms, always names the address, and
// never fires straight off a row click.
//
// History includes the automatic copy sent when the document posted, so "has this
// customer been told" is answered here rather than guessed. Failed attempts carry the
// provider's reason and a Retry, which raises a fresh attempt and leaves the failed
// one visible - the record of a failure is not something a retry should erase.

import { useState } from "react";
import { toast } from "sonner";
import { Mail, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Can } from "@/components/finance-ui/can";
import { ConfirmActionModal } from "@/components/finance-ui/confirm-action-modal";
import { FormField } from "@/components/finance-ui/form-modal";
import {
  useGetDocumentEmailQuery,
  useRetryDocumentEmailMutation,
  useSendDocumentEmailMutation,
} from "@/redux/services/finance/ar-api";
import type { PermissionCode } from "../../permissions";
import type { DocumentDelivery } from "@/redux/services/finance/ar-types";

const MAX_NOTE = 1000;
const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";

const STATUS_META: Record<DocumentDelivery["status"], { label: string; cls: string }> = {
  SENT: { label: "Sent", cls: "bg-green-01/10 text-green-01" },
  PENDING: { label: "Sending", cls: "bg-amber-50 text-amber-700" },
  FAILED: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
};

function shortDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export interface DocumentEmailActionProps {
  /** Which endpoint family to talk to. `customers` sends a statement of account. */
  kind: "invoices" | "payments" | "customers";
  id: number | string;
  entity: string;
  /** The RBAC key for this document's send, from `P`. */
  permission: PermissionCode;
  /** Button text, e.g. "Email invoice". */
  label: string;
  /** Confirmation heading, e.g. "Email this invoice to the customer?". */
  title: string;
  /** Statement period. Ignored for invoices and receipts. */
  period?: { start?: string; end?: string };
  buttonVariant?: "default" | "outline";
  className?: string;
}

export function DocumentEmailAction({
  kind, id, entity, permission, label, title, period, buttonVariant = "outline", className,
}: DocumentEmailActionProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [retrying, setRetrying] = useState<DocumentDelivery | null>(null);

  // Only asked for once the panel is open: nobody needs a recipient list for a
  // document they are only reading.
  const { data, isFetching, isError } = useGetDocumentEmailQuery(
    { kind, id, entity } as Parameters<typeof useGetDocumentEmailQuery>[0],
    { skip: !open },
  );
  const [send, { isLoading: sending }] = useSendDocumentEmailMutation();
  const [retry, { isLoading: retryingNow }] = useRetryDocumentEmailMutation();

  const preview = data?.data;
  const deliveries = preview?.deliveries ?? [];
  const blocked = !!preview && !preview.can_send;

  const close = () => {
    setOpen(false);
    setNote("");
    setRetrying(null);
  };

  const doSend = async () => {
    try {
      if (retrying) {
        await retry({ id: retrying.id, entity, note: note.trim() }).unwrap();
        toast.success("Retrying delivery.");
      } else {
        await send({
          kind, id, entity, note: note.trim(),
          ...(kind === "customers" ? { start: period?.start, end: period?.end } : {}),
        }).unwrap();
        toast.success(`${label} sent.`);
      }
      close();
    } catch { /* the API layer raises the toast */ }
  };

  return (
    <>
      <Can permission={permission}>
        <Button variant={buttonVariant} onClick={() => setOpen(true)} className={cn("gap-1.5", className)} data-guide="finance-email.action">
          <Mail className="size-4" /> {label}
        </Button>
      </Can>

      <ConfirmActionModal
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={retrying ? "Retry this delivery?" : title}
        description="A PDF copy is attached. The customer receives it at the address below."
        confirmText={retrying ? "Retry" : "Send"}
        onConfirm={doSend}
        loading={sending || retryingNow}
        confirmDisabled={isFetching || isError || blocked}
      >
        <div className="space-y-3">
          <div className="rounded-md border border-white-02 bg-gray-50 p-3 font-mont text-xs" data-guide="finance-email.preview">
            {isFetching ? (
              <p className="text-gray-05">Loading recipients…</p>
            ) : isError || !preview ? (
              <p className="text-destructive">Recipient details could not be loaded.</p>
            ) : (
              <div className="space-y-2">
                <p><span className="text-gray-05">Subject:</span> <span className="font-semibold">{preview.subject}</span></p>
                <p><span className="text-gray-05">To:</span> <span className="font-semibold break-all">{preview.recipients.join(", ") || "No recipient"}</span></p>
                <p><span className="text-gray-05">BCC:</span> <span className="font-semibold break-all">{preview.bcc.join(", ") || "None"}</span></p>
              </div>
            )}
          </div>

          {/* The backend already explains why a send is unavailable; repeating it in
              our own words is how the two drift apart. */}
          {blocked && preview?.blocked_reason ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 font-mont text-xs text-amber-800">
              {preview.blocked_reason}
            </p>
          ) : null}

          <FormField label="Optional note to the customer">
            <Textarea
              value={note}
              maxLength={MAX_NOTE}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add a short covering note."
              className="min-h-20 bg-white"
            />
          </FormField>
          <p className="text-right font-mont text-[11px] text-gray-05">{note.length}/{MAX_NOTE.toLocaleString()}</p>

          {deliveries.length > 0 && (
            <div>
              <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Previously sent</p>
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {deliveries.map((delivery) => {
                  const meta = STATUS_META[delivery.status];
                  return (
                    <div key={delivery.id} className="rounded-md border border-white-02 p-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mont text-xs font-semibold text-black-01">{delivery.source_display}</p>
                          <p className="mt-0.5 font-mont text-[11px] text-gray-05">
                            {delivery.requested_by_name} · {shortDateTime(delivery.sent_at ?? delivery.created_at)}
                          </p>
                        </div>
                        <span className={cn(PILL, meta.cls)}>{meta.label}</span>
                      </div>
                      <p className="mt-1.5 font-mont text-[11px] break-all text-gray-05">
                        {delivery.recipients.join(", ")}
                      </p>
                      {delivery.failure_reason ? (
                        <p className="mt-1.5 rounded border border-destructive/20 bg-destructive/5 p-1.5 font-mont text-[11px] text-destructive">
                          {delivery.failure_reason}
                        </p>
                      ) : null}
                      {delivery.can_retry ? (
                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => { setRetrying(delivery); setNote(delivery.note || ""); }}
                          >
                            <RefreshCw className="size-3.5" /> Retry
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {retrying ? (
            <p className="flex items-center gap-1.5 font-mont text-[11px] text-gray-05">
              <Send className="size-3" /> Retrying the attempt from {shortDateTime(retrying.created_at)}.
            </p>
          ) : null}
        </div>
      </ConfirmActionModal>
    </>
  );
}
