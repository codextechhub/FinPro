/**
 * Journal detail drawer - design topology: header (no · date · period · source),
 * four stat cards (Status / Total Dr / Total Cr / Difference), the Dr/Cr lines
 * table with cost centres + totals, a teaching note, and a footer with the author
 * + the safe reversal/void action for this journal's source + Print. A journal
 * whose document is corrected elsewhere (a goods return, received again on a
 * new receipt) says how, and links to where.
 *
 * A direct entry an approver sent back offers its sender Edit (the direct entry
 * drawer, correcting it) and Resume, with who sent it back and why. Anybody
 * else is told only its sender may act on it. A journal another document
 * raised is corrected through that document, so it offers Resume alone.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Check, FilePenLine, Printer, Send } from "lucide-react";
import { DetailDrawer, Money, StatusPill, ConfirmActionModal, InfoHint } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { RETURNED_HINT, sentBackPill } from "@/components/finance-ui/returned-correction";
import { ResumeButton, ReturnedNote, useFinanceReturned } from "@/components/finance-ui/returned-note";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { P } from "../../../permissions";
import { useGetJournalQuery, useReverseJournalMutation, useSubmitJournalMutation } from "@/redux/services/finance/gl-api";
import { DocumentVoidAction } from "../receivables/document-void-action";
import { isVoidableDocument } from "../receivables/document-void-config";
import { DocumentCorrectionAction, SourceDocumentGuidanceLink } from "./document-correction-action";
import { isCorrectableDocument, sourceDocumentGuidance } from "./document-correction";
import { useDates } from "../../../lib/display-prefs";
import { DirectEntryDrawer } from "./direct-entry-drawer";

const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const td = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-white p-3 ring-1 ring-white-02">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <div className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{children}</div>
    </div>
  );
}

export function JournalDetailDrawer({ journalId, entity, currency, onClose }: {
  journalId: number | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const dates = useDates();
  const open = journalId != null;
  const { data, isLoading, isError, refetch } = useGetJournalQuery({ id: journalId!, entity }, { skip: !open });
  const [submitJournal, { isLoading: submitting }] = useSubmitJournalMutation();
  const [reverse, { isLoading: reversing }] = useReverseJournalMutation();
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmReverse, setConfirmReverse] = useState(false);
  const j = data?.data;
  const { standing, request, workflowId, requestNamed } = useFinanceReturned(j);
  const [editing, setEditing] = useState(false);
  // Only a direct entry has an edit route; another document's journal is corrected through it.
  const directEntry = j?.source === "MANUAL" || j?.source === "OPENING";
  const diff = j ? j.total_debit - j.total_credit : 0;
  const reversalAction = j?.reversal_action;
  const guidance = sourceDocumentGuidance(reversalAction);

  const doReverse = async () => {
    try {
      const res = await reverse({ id: journalId!, entity }).unwrap();
      toast.success(res.message || "Journal reversed.");
      setConfirmReverse(false);
      onClose();
    } catch { /* handled centrally */ }
  };

  const doSubmit = async () => {
    try {
      const res = await submitJournal({ id: journalId!, entity }).unwrap();
      toast.success(res.message || "Journal submitted for approval.");
      setConfirmSubmit(false);
      onClose();
    } catch { /* handled centrally */ }
  };

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title={j ? j.document_number : "Journal"}
        description={j ? `${dates.day(j.date)}${j.period ? ` · ${j.period}` : ""} · ${cap(j.source)} journal` : undefined}
        widthClass="sm:max-w-3xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <span className="font-mont text-xs text-gray-05">
              Created by {j?.created_by ?? "-"}{j?.posted_at ? ` · Posted ${dates.day(j.posted_at)}` : ""}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {standing === "sender" && directEntry && (
                <Can permission={P.FIN_POST_DIRECT_ENTRY}>
                  <Button variant="outline" onClick={() => setEditing(true)} className="gap-1.5"><FilePenLine className="size-4" /> Edit</Button>
                </Can>
              )}
              {standing === "sender" && <ResumeButton workflowId={workflowId} tags={["FinanceJournals"]} />}
              {j?.status === "DRAFT" && !standing && (
                <Can permission={P.FIN_SUBMIT_JOURNAL}>
                  <Button onClick={() => setConfirmSubmit(true)} className="gap-1.5"><Send className="size-4" /> Submit</Button>
                </Can>
              )}
              {j?.status === "POSTED" && reversalAction?.kind === "REVERSE_JOURNAL" && (
                <Can permission={P.FIN_REVERSE_JOURNAL}>
                  <Button variant="outline" onClick={() => setConfirmReverse(true)} className="border-destructive/40 text-destructive hover:bg-destructive/5">Reverse</Button>
                </Can>
              )}
              {j?.status === "POSTED" && reversalAction?.kind === "VOID_DOCUMENT" && isCorrectableDocument(reversalAction.document_type) && (
                <DocumentCorrectionAction
                  documentType={reversalAction.document_type}
                  documentId={reversalAction.document_id}
                  documentNumber={reversalAction.document_number}
                  entity={entity}
                  onDone={onClose}
                />
              )}
              {j?.status === "POSTED" && reversalAction?.kind === "VOID_DOCUMENT" && isVoidableDocument(reversalAction.document_type) && (
                <DocumentVoidAction
                  documentType={reversalAction.document_type}
                  documentId={reversalAction.document_id}
                  documentNumber={reversalAction.document_number}
                  entity={entity}
                  onVoided={onClose}
                />
              )}
              {guidance && <SourceDocumentGuidanceLink guidance={guidance} onDone={onClose} />}
              <Button variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer className="size-4" /> Print</Button>
            </div>
          </div>
        }
      >
        {isLoading ? <LoadingState rows={5} /> : isError || !j ? <ErrorState onRetry={refetch} /> : (
          <div className="space-y-4">
            <ReturnedNote standing={standing} request={request} requestNamed={requestNamed} senderHint={directEntry ? undefined : RETURNED_HINT.resumeOnly} />
            {/* stat cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Status"><StatusPill {...sentBackPill(j, j.status, undefined, true)} /></Stat>
              <Stat label="Total Dr"><Money kobo={j.total_debit} currency={currency} /></Stat>
              <Stat label="Total Cr"><Money kobo={j.total_credit} currency={currency} /></Stat>
              <Stat label="Difference">
                {diff === 0
                  ? <span className="inline-flex items-center gap-1 text-green-01"><Check className="size-4" /> Balanced</span>
                  : <span className="text-destructive"><Money kobo={diff} currency={currency} /></span>}
              </Stat>
            </div>

            {j.reverses_id && <p className="font-mont text-xs text-gray-05">Reverses journal #{j.reverses_id}</p>}

            {guidance && <p data-testid="journal-correction-guidance" className="rounded-md bg-gray-02/50 px-3 py-2 font-mont text-xs leading-5 text-gray-01">{guidance.message}</p>}

            {/* lines */}
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <p className="font-mont text-sm font-semibold text-gray-01">Lines</p>
                <InfoHint ariaLabel="About journal lines">Each line targets one GL account; the cost centre tags the spending department. Manual journals can be reversed with a mirror entry. Journals created by invoices, receipts and other documents must be voided with their source document so the sub-ledger and GL stay together.</InfoHint>
              </div>
              <div className="overflow-x-auto rounded-md border border-white-02">
                <table className="w-full border-collapse">
                  <thead><tr>
                    <th className={th}>Account</th><th className={th}>Description</th><th className={th}>Cost centre</th><th className={th}>Dimensions</th>
                    <th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Credit</th>
                  </tr></thead>
                  <tbody>
                    {j.lines.map((l) => {
                      const dims = Object.entries(l.dimensions || {});
                      return (
                      <tr key={l.id}>
                        <td className={td}><span className="font-semibold tabular-nums">{l.account_code}</span><span className="ml-2 text-gray-01">{l.account_name}</span></td>
                        <td className={cn(td, "max-w-xs truncate text-gray-05")}>{l.description || "-"}</td>
                        <td className={cn(td, "text-gray-05")}>{l.cost_center || "-"}</td>
                        <td className={td}>{dims.length ? <span className="flex flex-wrap gap-1">{dims.map(([k, v]) => <span key={k} className="rounded bg-gray-02/70 px-1.5 py-0.5 font-mont text-[10px] text-gray-01">{k}: {v}</span>)}</span> : <span className="text-gray-05">-</span>}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{l.debit ? <Money kobo={l.debit} currency={currency} align="right" /> : "-"}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{l.credit ? <Money kobo={l.credit} currency={currency} align="right" /> : "-"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-white-02 font-semibold">
                      <td className={cn(td, "border-t-0")} colSpan={4}>Totals</td>
                      <td className={cn(td, "border-t-0 text-right tabular-nums")}><Money kobo={j.total_debit} currency={currency} align="right" /></td>
                      <td className={cn(td, "border-t-0 text-right tabular-nums")}><Money kobo={j.total_credit} currency={currency} align="right" /></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

          </div>
        )}
      </DetailDrawer>

      {editing && j ? <DirectEntryDrawer open existing={j} entity={entity} currency={currency} onClose={() => setEditing(false)} /> : null}

      <ConfirmActionModal
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submit this journal for approval?"
        description={`Moves ${j?.document_number} into the shared approval workflow. It will post only after final approval.`}
        confirmText="Submit for approval"
        loading={submitting}
        onConfirm={doSubmit}
      />

      <ConfirmActionModal
        open={confirmReverse}
        onOpenChange={setConfirmReverse}
        title="Reverse this journal?"
        description={`A contra entry will be posted to reverse ${j?.document_number}. This cannot be undone.`}
        confirmText="Reverse journal"
        destructive
        loading={reversing}
        onConfirm={doReverse}
      />
    </>
  );
}
