/**
 * New journal (Direct Entry, §6.2) - the ONLY screen that submits raw debit/credit
 * lines (capital, opening balances, loans, adjustments). A right-side drawer in the
 * prototype style: sectioned header fields, a posting editor with type-to-search
 * account pickers, and a live balance check (Σdebit = Σcredit) before POST. Amounts
 * edited in naira, submitted in kobo.
 *
 * The entry is a journal, so the school's journal approval route decides what
 * saving it does. With no route it posts. With a route that has steps it waits
 * for approval, and the backend's message says so; the toast repeats that
 * message rather than claiming a posting, and the no-approver prompt opens when
 * nobody can approve it. With an empty route the host asks the reader to
 * confirm posting without approval before anything is written.
 *
 * Given a saved draft entry (`existing`), the same drawer corrects it: it opens
 * with the entry's own fields and lines, keeps the branch it was raised for, and
 * sends only what changed to the journal's own route (direct-entry-edit.ts). A
 * correction posts nothing; an entry an approver returned is resumed from its
 * drawer afterwards.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, BookCheck } from "lucide-react";
import { DetailDrawer, MoneyInput, Money, AccountPicker, CostCenterPicker, toArray, PostingDateField, RaisingBranchChoiceField, useRaisingBranchChoice,} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { P } from "../../../permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePostDirectEntryMutation, useUpdateJournalMutation } from "@/redux/services/finance/gl-api";
import type { JournalDetail } from "@/redux/services/finance/gl-types";
import { directEntryChanges, directEntryForm, directEntryLines, type DirectEntryRow } from "./direct-entry-edit";
import { useGetDimensionsQuery } from "@/redux/services/finance/setup-api";
import type { Dimension } from "@/redux/services/finance/setup-types";

type Row = DirectEntryRow;
const emptyRow = (): Row => ({ account: "", amountKobo: 0, side: "debit", costCenter: "", dimensions: {} });
const fieldLabel = "font-mont text-xs text-gray-05";

export function DirectEntryDrawer({ open, onClose, entity, currency, existing }: {
  open: boolean; onClose: () => void; entity: string; currency?: string | null; existing?: JournalDetail;
}) {
  const saved = existing ? directEntryForm(existing) : null;
  const [date, setDate] = useState(saved?.date ?? "");
  const [narration, setNarration] = useState(saved?.narration ?? "");
  const [reference, setReference] = useState(saved?.reference ?? "");
  const [rows, setRows] = useState<Row[]>(saved?.rows.length ? saved.rows : [emptyRow(), emptyRow()]);
  const [post, { isLoading: posting }] = usePostDirectEntryMutation();
  const [update, { isLoading: updating }] = useUpdateJournalMutation();
  const isLoading = posting || updating;
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "journal entry" });
  // A saved entry keeps the branch it was raised for.
  const branch = useRaisingBranchChoice({ unless: !!existing });
  // Analytical dimensions are optional: a product that does not use them grants
  // nobody finance.dimension.view, and asking anyway answered 403 on every
  // visit to this screen - a red toast for a field the caller was never going
  // to be offered. No key, no request, and the dimension columns simply are not
  // there.
  const { can } = useCan();
  const canDimensions = can(P.FIN_VIEW_DIMENSIONS);
  const { data: dimsData } = useGetDimensionsQuery({ entity }, { skip: !canDimensions });
  const dims = toArray<Dimension>(dimsData?.data).filter((d) => d.is_active);

  const totalDebit = rows.reduce((s, r) => s + (r.side === "debit" ? r.amountKobo : 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (r.side === "credit" ? r.amountKobo : 0), 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;
  const hasBlankAccount = rows.some((r) => r.amountKobo > 0 && !r.account.trim());

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const reset = () => { setDate(""); setNarration(""); setReference(""); setRows([emptyRow(), emptyRow()]); branch.reset(); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    try {
      if (existing) {
        const changes = directEntryChanges(existing, { date, narration, reference, rows });
        // Nothing changed: nothing to send.
        if (!Object.keys(changes).length) { onClose(); return; }
        const res = await update({ id: existing.id, entity, ...changes }).unwrap();
        toast.success(res.message || "Journal entry corrected.");
        onClose();
        return;
      }
      const lines = directEntryLines(rows);
      const res = await post({ entity, date: date || undefined, narration, reference, lines, ...branch.body() }).unwrap();
      const waiting = res.data?.status === "PENDING_APPROVAL";
      toast.success(res.message || (waiting ? "Journal entry sent for approval." : "Direct entry posted."));
      close();
      promptIfParked(res.data?.approval);
    } catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={(o) => (o ? undefined : close())}
        title={existing ? `Correct ${existing.document_number}` : "New journal entry"}
        description={existing ? "Your changes reach the approver when you resume the request. Must balance." : "Raw debit/credit postings for capital, opening balances, loans or adjustments. Must balance."}
        widthClass="sm:max-w-2xl"
        footer={
          <>
            <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
            <Button data-guide="finance-journal.post" disabled={isLoading || !balanced || hasBlankAccount || !branch.ready} onClick={submit} className="gap-1.5">
              <BookCheck className="size-4" />{existing ? (isLoading ? "Saving…" : "Save changes") : isLoading ? "Posting…" : "Post entry"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* header fields */}
          <div data-guide="finance-journal.header-fields" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
              <label className="block space-y-1">
                <span className={fieldLabel}>Reference</span>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className="bg-white" />
              </label>
            </div>
            <label className="block space-y-1">
              <span className={fieldLabel}>Narration</span>
              <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="What is this entry for?" className="bg-white" />
            </label>
            <RaisingBranchChoiceField choice={branch} hint="The branch whose books this entry belongs to." />
          </div>

          {/* postings */}
          <div data-guide="finance-journal.postings" className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mont text-sm font-semibold text-black-01">Postings</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, emptyRow()])} className="h-7 gap-1 px-2 text-xs"><Plus className="size-3.5" /> Add line</Button>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="space-y-2 rounded-md border border-white-02 bg-white p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <AccountPicker entity={entity} value={r.account} onChange={(v) => setRow(i, { account: v })} postableOnly placeholder="Type an account…" />
                  </div>
                  <button type="button" onClick={() => setRows((rs) => (rs.length > 2 ? rs.filter((_, idx) => idx !== i) : rs))}
                    disabled={rows.length <= 2} className="mt-2 text-gray-05 hover:text-destructive disabled:opacity-30" aria-label="Remove line">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex overflow-hidden rounded-md border border-white-02">
                    {(["debit", "credit"] as const).map((s) => (
                      <button key={s} type="button" onClick={() => setRow(i, { side: s })}
                        className={cn("px-3 py-2 font-mont text-xs capitalize", r.side === s ? "bg-primary text-white" : "bg-white text-gray-05")}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <MoneyInput valueKobo={r.amountKobo} onChangeKobo={(k) => setRow(i, { amountKobo: k })} currency={currency} className="flex-1" />
                </div>
                <CostCenterPicker entity={entity} value={r.costCenter} onChange={(v) => setRow(i, { costCenter: v })} placeholder="Cost centre - optional" />
                {dims.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {dims.map((dim) => (
                      <select key={dim.code} aria-label={dim.name}
                        value={r.dimensions[dim.code] ?? ""}
                        onChange={(e) => setRow(i, { dimensions: { ...r.dimensions, [dim.code]: e.target.value } })}
                        className="h-9 rounded-md border border-white-02 bg-white px-2 font-mont text-xs text-black-01 focus:border-primary focus:outline-none">
                        <option value="">{dim.name} - none</option>
                        {dim.allowed_values.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* balance check */}
          <div data-guide="finance-journal.balance" className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-3 font-mont text-sm">
            <span className={cn("font-semibold", balanced ? "text-green-01" : "text-destructive")}>
              {balanced ? "Balanced" : "Must balance"}
            </span>
            <div className="flex gap-6">
              <span className="text-gray-05">Dr <Money kobo={totalDebit} currency={currency} className="ml-1 font-semibold text-black-01" /></span>
              <span className="text-gray-05">Cr <Money kobo={totalCredit} currency={currency} className="ml-1 font-semibold text-black-01" /></span>
            </div>
          </div>
        </div>
      </DetailDrawer>
      {noApproverDialog}
    </>
  );
}
