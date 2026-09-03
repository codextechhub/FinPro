/**
 * Receipt allocation drawer - apply a receipt to the customer's open invoices.
 * "Auto-allocate oldest first" fills the open invoices in age order; uncheck to
 * type an explicit split. The allocation summary tracks Receipt / Allocated /
 * Remainder, and an Allocation-posting recap shows the receipt's GL effect
 * (Dr bank - already debited on the receipt · Cr AR), which balances.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { skipToken } from "@reduxjs/toolkit/query";
import { CheckCircle2 } from "lucide-react";
import { DetailDrawer, DocumentEmailAction, Money, StatusPill } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { LoadingState, ErrorState, EmptyState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney, toKobo } from "@/utils/money";
import { P } from "../../../permissions";
import { useGetPaymentDetailQuery, useAllocatePaymentMutation } from "@/redux/services/finance/ar-api";
import { DocumentVoidAction } from "./document-void-action";

const STATUS_PILL: Record<string, string> = {
  ALLOCATED: "bg-green-01/10 text-green-01", PARTIAL: "bg-blue-50 text-blue-700",
  UNALLOCATED: "bg-amber-50 text-amber-700",
};
const STATUS_LABEL: Record<string, string> = { ALLOCATED: "Allocated", PARTIAL: "Partial", UNALLOCATED: "Unallocated" };
const td = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";
const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";

// A settleable open AR item - an invoice or a posted DEBIT note.
type AllocTarget = { key: string; kind: "invoice" | "debit_note"; id: number; document_number: string; date: string | null; balanceKobo: number };

export function PaymentAllocationDrawer({ id, entity, currency, onClose }: {
  id: number | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useGetPaymentDetailQuery(id ? { entity, id } : skipToken);
  const [auto, setAuto] = useState(true);
  const [strategy, setStrategy] = useState<"oldest" | "largest">("oldest");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [allocate, { isLoading: saving }] = useAllocatePaymentMutation();
  const d = data?.data;
  const p = d?.payment;
  // Open AR items settleable by this receipt: invoices AND posted DEBIT notes (both
  // debit AR). Keyed with a kind-prefixed key so ids can't collide across the two.
  const open = useMemo<AllocTarget[]>(() => [
    ...(d?.open_invoices ?? []).map((i) => ({ key: `inv-${i.id}`, kind: "invoice" as const, id: i.id, document_number: i.document_number, date: i.due_date, balanceKobo: i.balance.kobo })),
    ...(d?.open_debit_notes ?? []).map((n) => ({ key: `dn-${n.id}`, kind: "debit_note" as const, id: n.id, document_number: n.document_number, date: n.note_date, balanceKobo: n.balance.kobo })),
  ], [d]);
  const unallocated = p?.unallocated_amount ?? 0;

  // Suggested fill of the remaining cash across open items, in the chosen order
  // (oldest-first as returned, or largest-balance first) - mirrors the server strategy.
  const suggestion = useMemo(() => {
    const m: Record<string, number> = {};
    let remaining = unallocated;
    const ordered = strategy === "largest" ? [...open].sort((a, b) => b.balanceKobo - a.balanceKobo) : open;
    for (const t of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(t.balanceKobo, remaining);
      if (take > 0) { m[t.key] = take; remaining -= take; }
    }
    return m;
  }, [open, unallocated, strategy]);

  const lineKobo = (key: string) => (auto ? suggestion[key] ?? 0 : toKobo(amounts[key] ?? ""));
  const allocatedNow = open.reduce((s, t) => s + lineKobo(t.key), 0);
  const remainder = unallocated - allocatedNow;
  const overBalance = open.some((t) => lineKobo(t.key) > t.balanceKobo);
  const canApply = unallocated > 0 && open.length > 0 && allocatedNow > 0 && remainder >= 0 && !overBalance;

  const toggleAuto = (checked: boolean) => {
    setAuto(checked);
    if (!checked) {
      // Seed the editable inputs from the suggestion so the user can tweak.
      const seed: Record<string, string> = {};
      for (const t of open) if (suggestion[t.key]) seed[t.key] = (suggestion[t.key] / 100).toFixed(2);
      setAmounts(seed);
    }
  };

  const apply = async () => {
    if (!p) return;
    try {
      const body = auto
        ? { entity, id: p.id, auto_allocate: true, allocation_strategy: strategy }
        : { entity, id: p.id, allocations: open.filter((t) => lineKobo(t.key) > 0).map((t) => (
            t.kind === "invoice"
              ? { invoice: t.id, amount: lineKobo(t.key) }
              : { debit_note: t.id, amount: lineKobo(t.key) })) };
      const res = await allocate(body).unwrap();
      toast.success(res.message || "Receipt allocated.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={id != null}
      onOpenChange={(o) => !o && onClose()}
      title={p ? p.document_number : "Receipt"}
      description={p ? `${p.customer_name} · ${formatMoney(p.amount, currency)} received` : undefined}
      widthClass="sm:max-w-3xl"
      footer={p ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="font-mont text-xs text-gray-05">Unallocated remainder: <span className={cn("font-semibold", remainder === 0 ? "text-green-01" : "text-black-01")}>{formatMoney(Math.max(remainder, 0), currency)}</span></span>
          <div className="flex flex-wrap items-center gap-2">
            {p.status === "POSTED" ? (
              <DocumentEmailAction
                kind="payments"
                id={p.id}
                entity={entity}
                permission={P.FIN_EMAIL_RECEIPT}
                label="Email receipt"
                title="Email this receipt to the customer?"
              />
            ) : null}
            {p.status === "POSTED" ? (
              <DocumentVoidAction
                documentType="PAYMENT"
                documentId={p.id}
                documentNumber={p.document_number}
                entity={entity}
                onVoided={onClose}
              />
            ) : null}
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Can permission={P.FIN_ALLOCATE_PAYMENT}>
              <Button onClick={apply} disabled={!canApply || saving}>{saving ? "Applying…" : "Apply allocation"}</Button>
            </Can>
          </div>
        </div>
      ) : undefined}
    >
      {isLoading ? <LoadingState rows={6} /> : isError || !d || !p ? <ErrorState onRetry={refetch} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5" data-guide="finance-receipts.allocation">
            <StatusPill status={p.status} />
            <span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium", STATUS_PILL[p.allocation_status])}>{STATUS_LABEL[p.allocation_status]}</span>
          </div>

          {unallocated <= 0 ? (
            <div className="flex items-center gap-2 rounded-md bg-green-01/10 px-3 py-2.5 font-mont text-xs text-green-01">
              <CheckCircle2 className="size-4" /> This receipt is fully allocated.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
              {/* apply to open invoices */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mont text-sm font-semibold text-black-01">Apply to open items</span>
                  <div className="flex items-center gap-2 font-mont text-xs text-gray-01">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} className="accent-primary" /> Auto-allocate
                    </label>
                    {auto && (
                      <select value={strategy} onChange={(e) => setStrategy(e.target.value as "oldest" | "largest")}
                        aria-label="Allocation strategy"
                        className="h-7 rounded-md border border-white-02 bg-white px-1.5 font-mont text-[11px] focus:border-primary focus:outline-none">
                        <option value="oldest">oldest first</option>
                        <option value="largest">largest first</option>
                      </select>
                    )}
                  </div>
                </div>
                {open.length === 0 ? <EmptyState title="No open items" message="Nothing to allocate to - the cash stays as customer credit." /> : (
                  <div className="overflow-hidden rounded-md border border-white-02">
                    {open.map((t) => (
                      <div key={t.key} className="flex items-center gap-3 border-t border-white-02 px-3 py-2 first:border-t-0">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate font-mont text-xs font-semibold text-black-01">
                            {t.document_number}
                            {t.kind === "debit_note" ? <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mont text-[10px] font-medium text-indigo-700">Debit note</span> : null}
                          </p>
                          <p className="font-mont text-[11px] text-gray-05">{t.kind === "debit_note" ? "Dated" : "Due"} {t.date ?? "-"} · bal <Money kobo={t.balanceKobo} currency={currency} /></p>
                        </div>
                        <Input type="number" min="0" step="0.01" aria-label={`Allocate to ${t.document_number}`}
                          value={auto ? (suggestion[t.key] ? (suggestion[t.key] / 100).toFixed(2) : "") : (amounts[t.key] ?? "")}
                          disabled={auto}
                          onChange={(e) => setAmounts((m) => ({ ...m, [t.key]: e.target.value }))}
                          className={cn("h-9 w-32 bg-white text-right tabular-nums", lineKobo(t.key) > t.balanceKobo && "border-destructive")} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* allocation summary */}
              <div className="space-y-2 rounded-md bg-gray-50 p-3 font-mont text-xs">
                <p className="font-semibold text-black-01">Allocation summary</p>
                <div className="flex justify-between"><span className="text-gray-05">Receipt amount</span><span className="font-semibold tabular-nums">{formatMoney(p.amount, currency)}</span></div>
                <div className="flex justify-between"><span className="text-gray-05">Allocated</span><span className="font-semibold tabular-nums">{formatMoney(allocatedNow, currency)}</span></div>
                <div className="flex justify-between border-t border-white-02 pt-2"><span className="text-gray-05">Remainder</span><span className={cn("font-semibold tabular-nums", remainder === 0 ? "text-green-01" : remainder < 0 ? "text-destructive" : "text-black-01")}>{formatMoney(remainder, currency)}</span></div>
                {remainder === 0 && <p className="flex items-center gap-1 text-green-01"><CheckCircle2 className="size-3.5" /> Fully allocated.</p>}
                {remainder < 0 && <p className="text-destructive">Over-allocated - reduce the amounts.</p>}
              </div>
            </div>
          )}

          {/* allocation posting recap (the receipt's own journal) */}
          {d.gl_postings.length > 0 && (
            <div>
              <p className="mb-1 font-mont text-sm font-semibold text-black-01">Allocation posting</p>
              <div className="overflow-x-auto rounded-md border border-white-02">
                <table className="w-full border-collapse">
                  <thead><tr><th className={th}>Account</th><th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Credit</th></tr></thead>
                  <tbody>
                    {d.gl_postings.map((g, i) => (
                      <tr key={i}>
                        <td className={td}>
                          <span className="font-semibold tabular-nums">{g.account_code}</span> {g.account_name}
                          {g.debit.kobo > 0 && <span className="ml-1 text-[11px] text-gray-05">- already debited on the receipt</span>}
                        </td>
                        <td className={cn(td, "text-right tabular-nums")}>{g.debit.kobo ? <Money kobo={g.debit.kobo} currency={currency} align="right" /> : "-"}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{g.credit.kobo ? <Money kobo={g.credit.kobo} currency={currency} align="right" /> : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 font-mont text-[11px] text-gray-05">Above is the receipt's own journal (posted when recorded). Applying the remaining credit to invoices reclassifies it from customer credit (2140) back to AR - a new journal posts on apply.</p>
            </div>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}
