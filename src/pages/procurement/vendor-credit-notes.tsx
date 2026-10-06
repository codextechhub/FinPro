/**
 * Vendor credit notes (VC-): correcting a posted supplier bill that has been paid
 * or credited, or crediting part of one.
 *
 * A note is raised against one posted bill and credits it one of three ways: the
 * whole of what the bill has left, a gross amount spread across it as a price
 * allowance, or named bill lines by quantity or value. It takes the bill's vendor
 * and branch, goes through its own approval route (a manager, and a senior
 * approver from N500,000 by default), and posts once approved.
 *
 * Posting settles what the bill still owes. What it no longer owes, because it was
 * paid, stays as that branch's credit with the vendor until applied to the
 * vendor's later bills of the same branch: Mrs Bello credits N50,000 on Ikeja's
 * paid stationery bill, and the N50,000 waits as Ikeja's credit for the next one.
 *
 * The list sits beside the bills on Vendor Invoices (`?view=credit-notes`), and a
 * bill's own notes show in its drawer, both opening the same detail drawer here.
 */

import { useMemo, useState } from "react";
import { Ban, Coins, FilePenLine, Send } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmActionModal, DataTable, DetailDrawer, ErrorState, FormField, LoadingState,
  MoneyInput, PostingDateField, Segmented, StatusPill, TabStrip, toArray,
  useReaderBranchLens, type Column, type TabStripItem,
} from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatMoney } from "@/utils/money";
import { formatQuantity } from "@/utils/quantity";
import { P } from "../../permissions";
import { isForbidden } from "../../lib/api-errors";
import { useDates } from "../../lib/display-prefs";
import { useSourceDocumentParam } from "@/lib/source-document-route";
import { useGetVendorInvoicesQuery } from "@/redux/services/procurement/procurement-api";
import {
  useAllocateVendorCreditNoteMutation, useCreateVendorCreditNoteMutation,
  useGetVendorCreditNoteQuery, useGetVendorCreditNotesQuery, usePostVendorCreditNoteMutation,
  useSubmitVendorCreditNoteMutation, useUpdateVendorCreditNoteMutation,
  useVoidVendorCreditNoteMutation,
} from "@/redux/services/procurement/payables-corrections-api";
import type {
  VendorCreditInstruction, VendorCreditNote, VendorInvoice,
} from "@/redux/services/procurement/procurement-types";
import { useGetWorkflowInstanceQuery } from "@/redux/services/dashboard/workflow-api";
import {
  creditInstruction, creditNoteHeaderChanges, creditNoteStage, type CreditMode, type LineCredit,
} from "./vendor-credit-note-model";
import { VENDOR_CREDIT_NOTE_TABS, approvalStateWord, vendorCreditNoteWord } from "./document-status";
import { sentBackPill, statusFilterArgs } from "@/components/finance-ui/returned-correction";
import { ResumeButton, ReturnedNote, useReturnedStanding } from "@/components/finance-ui/returned-note";

const STATUS_TABS: TabStripItem<string>[] = VENDOR_CREDIT_NOTE_TABS.map((tab) => ({ ...tab }));

const MODES = [["full", "Whole bill"], ["amount", "By amount"], ["lines", "By line"]] as const;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="font-mont text-[11px] text-gray-05">{label}</dt><dd className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{value || "-"}</dd></div>;
}

/** The credit notes list, beside the bills on Vendor Invoices. */
export function CreditNotesView({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const { applies: multiBranch } = useReaderBranchLens();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useSourceDocumentParam(setSelectedId);
  const { currentData: data, isLoading, isFetching, isError, error, refetch } = useGetVendorCreditNotesQuery(
    { entity, page, ...statusFilterArgs(status) },
  );
  const rows = toArray(data?.data);
  const money = (value: number) => formatMoney(value, currency);
  const columns: Column<VendorCreditNote>[] = [
    { header: "Credit note #", cell: (note) => <div className="min-w-32"><p className="font-mont text-sm font-semibold text-primary">{note.document_number || "Draft"}</p><p className="mt-1 text-[11px] text-gray-05">{note.vendor_reference || "No vendor reference"}</p></div> },
    { header: "Vendor", cell: (note) => <div className="min-w-32"><p className="font-semibold">{note.vendor_name || note.vendor_code}</p><p className="mt-0.5 text-[11px] text-gray-05">{note.vendor_code}</p></div> },
    { header: "Bill", cell: (note) => note.vendor_invoice_number },
    ...(multiBranch ? [{ header: "Branch", cell: (note: VendorCreditNote) => note.branch_name || "-" }] : []),
    { header: "Date", cell: (note) => dates.day(note.note_date) },
    { header: "Total", align: "right", cell: (note) => <span className="tabular-nums">{money(note.total)}</span> },
    { header: "Credit left", align: "right", cell: (note) => <span className="tabular-nums">{note.status === "POSTED" && note.advance_remaining > 0 ? money(note.advance_remaining) : "-"}</span> },
    { header: "Status", cell: (note) => <div className="flex flex-wrap gap-1"><StatusPill status={note.status} label={vendorCreditNoteWord(note.status)} />{note.status === "DRAFT" && <StatusPill {...sentBackPill(note, note.approval_state, approvalStateWord(note.approval_state))} />}</div> },
  ];
  return <>
    <section className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
        <TabStrip items={STATUS_TABS} value={status} onChange={(next) => { setStatus(next); setPage(1); }} variant="underline" ariaLabel="Credit note status" className="gap-5 self-center border-b-0" buttonClassName="px-0 py-3" />
        <p className="py-2 font-mont text-[11px] text-gray-05">Raise a credit note from a posted bill.</p>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(note) => note.id} loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch} onRowClick={(note) => setSelectedId(note.id)} page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage} emptyTitle="No credit notes" emptyMessage="Open a posted bill and choose Credit note to correct it." />
    </section>
    <CreditNoteDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
  </>;
}

/** A bill's own credit notes, inside the bill's drawer. */
export function BillCreditNotes({ bill, entity, currency }: { bill: VendorInvoice; entity: string; currency?: string | null }) {
  const dates = useDates();
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading } = useGetVendorCreditNotesQuery({ entity, vendor_invoice: bill.id, page_size: 50 });
  const notes = toArray(data?.data);
  if (isLoading) return <LoadingState rows={2} />;
  return <div className="space-y-2">
    {notes.length ? notes.map((note) => <button key={note.id} type="button" onClick={() => setOpenId(note.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-white-02 p-3 text-left hover:border-primary/40">
      <div className="min-w-0"><p className="font-mont text-sm font-semibold text-primary">{note.document_number || "Draft credit note"}</p><p className="mt-1 truncate font-mont text-xs text-gray-05">{dates.day(note.note_date)} · {note.reason}</p></div>
      <div className="text-right"><p className="font-mont text-sm font-semibold tabular-nums">{formatMoney(note.total, currency)}</p><div className="mt-1 flex justify-end gap-1"><StatusPill status={note.status} label={vendorCreditNoteWord(note.status)} />{note.status === "DRAFT" && <StatusPill {...sentBackPill(note, note.approval_state, approvalStateWord(note.approval_state))} />}</div></div>
    </button>) : <p className="rounded-md border border-dashed border-white-02 px-4 py-6 text-center font-mont text-xs text-gray-05">No credit notes have been raised on this bill.</p>}
    <CreditNoteDrawer key={openId ?? "closed"} id={openId} entity={entity} currency={currency} onClose={() => setOpenId(null)} />
  </div>;
}

/** One credit note, with the action its stage allows. */
export function CreditNoteDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const dates = useDates();
  const { applies: multiBranch } = useReaderBranchLens();
  const { data, isLoading, isError, refetch } = useGetVendorCreditNoteQuery({ id: id!, entity }, { skip: id == null });
  const note = data?.data;
  const workflowId = note?.workflow_instance_id ?? "";
  const { data: workflow } = useGetWorkflowInstanceQuery(workflowId, { skip: !workflowId });
  const standing = useReturnedStanding(note, workflow);
  const [editing, setEditing] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [submit, { isLoading: submitting }] = useSubmitVendorCreditNoteMutation();
  const [post, { isLoading: posting }] = usePostVendorCreditNoteMutation();
  const [voidNote, { isLoading: voidBusy }] = useVoidVendorCreditNoteMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "vendor credit note" });
  const stage = note ? creditNoteStage(note) : null;
  const money = (value: number) => formatMoney(value, currency);

  const run = async (action: "submit" | "post") => {
    if (!note) return;
    try {
      if (action === "submit") {
        const response = await submit({ id: note.id, entity }).unwrap();
        toast.success(response.message || "Credit note submitted for approval.");
        promptIfParked(response.data?.approval);
      } else {
        const response = await post({ id: note.id, entity }).unwrap();
        toast.success(response.message || "Credit note posted.");
      }
    } catch { /* central */ }
  };
  const doVoid = async () => {
    if (!note) return;
    try {
      const response = await voidNote({ id: note.id, entity }).unwrap();
      toast.success(response.message || "Credit note voided.");
      setVoiding(false);
    } catch { /* central */ }
  };

  return <>
    <DetailDrawer open={id != null} onOpenChange={(open) => !open && onClose()} title={note?.document_number || "Vendor credit note"} description={note ? `${note.vendor_name || note.vendor_code} · bill ${note.vendor_invoice_number}${multiBranch && note.branch_name ? ` · ${note.branch_name}` : ""}` : "Loading credit note"} widthClass="sm:max-w-[680px]" footer={note && <>
      {(stage === "editable" || standing === "sender") && <Can permission={P.PROC_UPDATE_VENDOR_CREDIT_NOTE}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button></Can>}
      {standing === "sender" && <ResumeButton workflowId={workflowId} onResumed={refetch} />}
      {stage === "editable" && <Can permission={P.PROC_SUBMIT_VENDOR_CREDIT_NOTE}><Button loading={submitting} onClick={() => run("submit")}><Send className="size-4" /> Submit for approval</Button></Can>}
      {stage === "approved" && <Can permission={P.PROC_POST_VENDOR_CREDIT_NOTE}><Button loading={posting} onClick={() => run("post")}><Send className="size-4" /> Post credit note</Button></Can>}
      {stage === "posted" && note.advance_remaining > 0 && <Can permission={P.PROC_ALLOCATE_VENDOR_CREDIT_NOTE}><Button variant="outline" onClick={() => setAllocating(true)}><Coins className="size-4" /> Apply credit</Button></Can>}
      {stage === "posted" && <Can permission={P.PROC_REVERSE_VENDOR_CREDIT_NOTE}><Button variant="outline-dest" onClick={() => setVoiding(true)}><Ban className="size-4" /> Void</Button></Can>}
    </>}>
      {isLoading ? <LoadingState rows={6} /> : isError || !note ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1.5"><StatusPill status={note.status} label={vendorCreditNoteWord(note.status)} />{note.status === "DRAFT" && <StatusPill {...sentBackPill(note, note.approval_state, approvalStateWord(note.approval_state))} />}</div><p className="font-mont text-lg font-semibold tabular-nums">{money(note.total)}</p></div>
        <ReturnedNote standing={standing} request={workflow} requestNamed={!!workflowId} />
        {standing === "with-approvers" && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs text-amber-900">With the approver. Nobody can change it until they decide or send it back; it posts once approved.</p>}
        <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">
          <Field label="Bill" value={note.vendor_invoice_number} />
          <Field label="Vendor" value={note.vendor_name || note.vendor_code} />
          <Field label="Credit note date" value={dates.day(note.note_date)} />
          <Field label="Vendor reference" value={note.vendor_reference} />
          <Field label="Subtotal" value={money(note.subtotal)} />
          <Field label="Tax" value={money(note.tax_total)} />
          {note.status === "POSTED" && <Field label="Settled on bills" value={money(note.allocated_amount)} />}
          {note.status === "POSTED" && <Field label="Credit left for later bills" value={money(note.advance_remaining)} />}
          <div className="sm:col-span-2"><Field label="Reason" value={note.reason} /></div>
        </dl>
        {!!note.lines?.length && <div className="overflow-x-auto rounded-md border border-white-02"><table className="w-full min-w-[480px]"><thead><tr>{["Bill line", "Qty", "Net", "Tax"].map((label) => <th key={label} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{label}</th>)}</tr></thead><tbody>{note.lines.map((line) => <tr key={line.id}><td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold">{line.description}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{line.quantity && Number(line.quantity) ? formatQuantity(line.quantity) : "Value only"}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{money(line.net_amount)}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{money(line.tax_amount)}</td></tr>)}</tbody></table></div>}
        {!!note.allocations?.length && <div><p className="mb-2 font-mont text-xs font-semibold text-gray-05">Where the credit went</p><div className="space-y-2">{note.allocations.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-white-02 px-3 py-2"><div><p className="font-mont text-xs font-semibold">{row.document_number}</p><p className="font-mont text-[11px] text-gray-05">{dates.day(row.effective_date)}</p></div><p className="font-mont text-xs font-semibold tabular-nums">{money(row.amount)}</p></div>)}</div></div>}
      </div>}
      {noApproverDialog}
    </DetailDrawer>
    {note && editing && <CreditNoteForm entity={entity} currency={currency} note={note} returned={standing === "sender"} onClose={() => setEditing(false)} />}
    {note && allocating && <ApplyCreditDrawer note={note} entity={entity} currency={currency} onClose={() => setAllocating(false)} />}
    <ConfirmActionModal open={voiding} onOpenChange={setVoiding} title={`Void ${note?.document_number}?`} description="Reverses the credit note and every bill it was applied to. The bills owe again what it settled." confirmText="Void credit note" destructive loading={voidBusy} onConfirm={doVoid} />
  </>;
}

/**
 * Raise a credit note on `bill`, rewrite a draft `note`, or correct one an
 * approver sent back (`returned`). A rewrite that names no way of crediting
 * leaves the draft's lines as they are, and only the changed header fields are
 * sent. A correction stays with its request, which the drawer's Resume sends
 * back to the approver.
 */
export function CreditNoteForm({ entity, currency, bill, note, returned = false, onClose, onCreated }: {
  entity: string;
  currency?: string | null;
  bill?: VendorInvoice;
  note?: VendorCreditNote;
  returned?: boolean;
  onClose: () => void;
  onCreated?: (note: VendorCreditNote) => void;
}) {
  const dates = useDates();
  const [mode, setMode] = useState<CreditMode | "keep">(note ? "keep" : "full");
  const [noteDate, setNoteDate] = useState(note?.note_date || dates.today(bill?.branch_id ?? undefined));
  const [reason, setReason] = useState(note?.reason || "");
  const [vendorReference, setVendorReference] = useState(note?.vendor_reference || "");
  const [amount, setAmount] = useState(0);
  const [lineCredits, setLineCredits] = useState<Record<number, LineCredit>>({});
  const [create, { isLoading: creating }] = useCreateVendorCreditNoteMutation();
  const [update, { isLoading: updating }] = useUpdateVendorCreditNoteMutation();
  const saving = creating || updating;
  const billLines = bill?.lines ?? [];
  const instruction: VendorCreditInstruction | null = mode === "keep" ? null : creditInstruction(mode, amount, lineCredits);
  const canSave = !!noteDate && !!reason.trim() && (mode === "keep" || !!instruction);
  const save = async () => {
    if (!canSave) return;
    const header = { note_date: noteDate, reason: reason.trim(), vendor_reference: vendorReference.trim() || undefined };
    try {
      if (note) {
        const changes = { ...creditNoteHeaderChanges(note, { noteDate, reason, vendorReference }), ...(instruction ?? {}) };
        // Nothing changed: nothing to send.
        if (!Object.keys(changes).length) { onClose(); return; }
        await update({ id: note.id, entity, ...changes }).unwrap();
        toast.success(returned ? "Changes saved. Resume it to send it back to the approver." : "Credit note draft updated.");
      } else if (bill && instruction) {
        const response = await create({ entity, vendor_invoice: bill.id, ...header, ...instruction }).unwrap();
        toast.success(`Credit note saved as a draft. Submit it for approval to post it.`);
        onCreated?.(response.data);
      }
      onClose();
    } catch { /* central */ }
  };
  const modeOptions = note ? [["keep", "Keep lines"] as const, ...MODES] : MODES;
  return <DetailDrawer open onOpenChange={(open) => !saving && !open && onClose()} title={note ? `${returned ? "Correct" : "Edit"} ${note.document_number || "credit note"}` : "Credit note"} description={bill ? `Against bill ${bill.document_number} · ${formatMoney(bill.balance_due, currency)} still owed of ${formatMoney(bill.total, currency)}` : note ? `Against bill ${note.vendor_invoice_number}` : undefined} widthClass="sm:max-w-[680px]" footer={<><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={!canSave} loading={saving} onClick={save}>{note ? "Save changes" : "Save draft"}</Button></>}>
    <div className="space-y-5">
      <p className="rounded-md border border-white-02 bg-gray-50 px-3 py-2 font-mont text-[11px] leading-5 text-gray-05">The credit note takes the bill&rsquo;s vendor and branch. Once approved and posted it lowers what the bill owes; on a bill already paid, the credit stays with the vendor for the branch&rsquo;s later bills.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PostingDateField label="Credit note date" entity={entity} value={noteDate} onChange={setNoteDate} notBefore={bill?.invoice_date} notBeforeLabel={bill ? `bill ${bill.document_number}` : undefined} />
        <FormField label="Vendor reference"><Input value={vendorReference} onChange={(event) => setVendorReference(event.target.value)} maxLength={64} placeholder="The supplier's credit note number" className="bg-white" /></FormField>
      </div>
      <FormField label="Reason" required><Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={255} placeholder="e.g. 10 reams returned damaged" className="min-h-16 bg-white" /></FormField>
      <Segmented label="What to credit" value={mode} onChange={(next) => setMode(next as CreditMode | "keep")} options={modeOptions} isDisabled={(value) => value === "lines" && !billLines.length} />
      {mode === "full" && <p className="font-mont text-xs text-gray-05">Credits everything the bill has left, quantities included. Use it for a bill keyed in error or sent twice.</p>}
      {mode === "amount" && <FormField label="Amount to credit (tax included)" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} /><span className="mt-1 block font-mont text-[11px] text-gray-05">Spread across the bill as a price allowance; the goods stay received.</span></FormField>}
      {mode === "lines" && <div className="space-y-2">
        <p className="font-mont text-xs text-gray-05">Credit a quantity (valued at the bill&rsquo;s price, and taken off the order&rsquo;s billed quantity) or a net amount on each line.</p>
        {billLines.map((line) => {
          const credit = lineCredits[line.id] ?? { quantity: "", net: 0 };
          const set = (patch: Partial<LineCredit>) => setLineCredits((rows) => ({ ...rows, [line.id]: { ...credit, ...patch } }));
          return <div key={line.id} className="grid grid-cols-1 gap-3 rounded-md border border-white-02 p-3 sm:grid-cols-[minmax(0,1fr)_110px_150px]">
            <div className="min-w-0"><p className="font-mont text-sm font-semibold">{line.description}</p><p className="mt-1 font-mont text-[11px] text-gray-05">Billed {formatQuantity(line.quantity)} at {formatMoney(line.unit_price, currency)} · net {formatMoney(line.net_amount, currency)}</p></div>
            <Input type="number" min="0" step="0.0001" value={credit.quantity} onChange={(event) => set({ quantity: event.target.value })} placeholder="Qty" aria-label={`${line.description} quantity to credit`} className="bg-white text-right tabular-nums" />
            <MoneyInput valueKobo={credit.net} onChangeKobo={(net) => set({ net })} currency={currency} placeholder="Net (optional)" />
          </div>;
        })}
      </div>}
      {note && mode === "keep" && <p className="font-mont text-xs text-gray-05">The lines stay as drafted: {formatMoney(note.total, currency)}.</p>}
    </div>
  </DetailDrawer>;
}

/** Apply a posted note's leftover credit to the vendor's later bills of the same branch. */
function ApplyCreditDrawer({ note, entity, currency, onClose }: { note: VendorCreditNote; entity: string; currency?: string | null; onClose: () => void }) {
  const dates = useDates();
  const [mode, setMode] = useState<"auto" | "pick">("auto");
  const [amounts, setAmounts] = useState<Record<number, number>>({});
  const [allocate, { isLoading }] = useAllocateVendorCreditNoteMutation();
  const { data, isLoading: loadingBills } = useGetVendorInvoicesQuery({ entity, vendor: note.vendor_code, status: "POSTED", page_size: 100 });
  const bills = useMemo(() => toArray(data?.data).filter((bill) => bill.balance_due > 0 && (bill.branch_id ?? null) === (note.branch_id ?? null)), [data, note.branch_id]);
  const picked = Object.entries(amounts).filter(([, amount]) => amount > 0).map(([id, amount]) => ({ vendor_invoice: Number(id), amount }));
  const total = picked.reduce((sum, row) => sum + row.amount, 0);
  const canApply = mode === "auto" || (picked.length > 0 && total <= note.advance_remaining);
  const apply = async () => {
    try {
      const response = await allocate({ id: note.id, entity, ...(mode === "auto" ? { auto_allocate: true } : { allocations: picked }) }).unwrap();
      toast.success(response.message || "Credit applied.");
      onClose();
    } catch { /* central */ }
  };
  return <DetailDrawer open onOpenChange={(open) => !isLoading && !open && onClose()} title={`Apply ${note.document_number}`} description={`${formatMoney(note.advance_remaining, currency)} of credit left with ${note.vendor_name || note.vendor_code}`} widthClass="sm:max-w-[600px]" footer={<><Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button><Button disabled={!canApply} loading={isLoading} onClick={apply}><Coins className="size-4" /> Apply credit</Button></>}>
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[["auto", "Oldest bills first"], ["pick", "Choose bills"]] as const} />
      {mode === "auto" ? <p className="font-mont text-xs text-gray-05">The credit goes on this vendor&rsquo;s open bills of the same branch, the one due first first, until it runs out.</p>
        : loadingBills ? <LoadingState rows={3} />
          : bills.length ? <div className="space-y-2">{bills.map((bill) => <div key={bill.id} className="grid grid-cols-1 gap-2 rounded-md border border-white-02 p-3 sm:grid-cols-[minmax(0,1fr)_160px]"><div className="min-w-0"><p className="font-mont text-sm font-semibold text-primary">{bill.document_number}</p><p className="mt-1 font-mont text-[11px] text-gray-05">Due {dates.day(bill.due_date)} · owes {formatMoney(bill.balance_due, currency)}</p></div><MoneyInput valueKobo={amounts[bill.id] || 0} onChangeKobo={(amount) => setAmounts((rows) => ({ ...rows, [bill.id]: Math.min(amount, bill.balance_due) }))} currency={currency} /></div>)}{total > note.advance_remaining && <p role="alert" className="font-mont text-[11px] text-destructive">That is more than the {formatMoney(note.advance_remaining, currency)} of credit left.</p>}</div>
            : <p className="rounded-md border border-dashed border-white-02 px-4 py-6 text-center font-mont text-xs text-gray-05">This vendor has no open bill at this branch yet. The credit waits until one is posted.</p>}
    </div>
  </DetailDrawer>;
}
