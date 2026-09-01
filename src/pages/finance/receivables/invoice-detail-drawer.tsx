// Invoice detail drawer - design topology: header (no · customer · status), four
// stat cards (Total / Paid / Balance / Aging), tabbed body (Lines · Payments · GL
// postings · Reminders · Activity, each with an icon) and a footer (Print PDF · Email
// invoice · Send reminder · Record payment · Write off).
import { useState } from "react";
import { toast } from "sonner";
import { skipToken } from "@reduxjs/toolkit/query";
import { List, CreditCard, BookOpen, BellRing, Activity, Printer, Check, Globe } from "lucide-react";
import { DetailDrawer, DocumentEmailAction, Money, StatusPill, ConfirmActionModal } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { LoadingState, ErrorState, EmptyState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { P } from "@/permissions";
import { useGetInvoiceDetailQuery, useRemindInvoiceMutation } from "@/redux/services/finance/ar-api";
import { openInvoiceDocument } from "@/utils/finance-documents";
import { RecordPaymentModal } from "./record-payment-modal";
import { RequestPaymentModal } from "./request-payment-modal";
import { DocumentVoidAction } from "./document-void-action";
import { todayISO } from "@/utils/posting-window";

const TABS = [
  { key: "lines", label: "Lines", icon: List },
  { key: "settlements", label: "Settlements", icon: CreditCard },
  { key: "gl", label: "GL postings", icon: BookOpen },
  { key: "reminders", label: "Reminders", icon: BellRing },
  { key: "activity", label: "Activity", icon: Activity },
] as const;

const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const td = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

// Settlement / GL source-document type → short label + pill colour.
const SETTLEMENT_META: Record<string, { label: string; cls: string }> = {
  PAYMENT: { label: "Payment", cls: "bg-green-01/10 text-green-01" },
  CREDIT_NOTE: { label: "Credit note", cls: "bg-blue-50 text-blue-700" },
  CONCESSION: { label: "Concession", cls: "bg-violet-50 text-violet-700" },
  WRITE_OFF: { label: "Write-off", cls: "bg-amber-50 text-amber-700" },
  INVOICE: { label: "Invoice", cls: "bg-gray-03/60 text-gray-05" },
};
function TypeBadge({ type }: { type: string }) {
  const m = SETTLEMENT_META[type] ?? { label: type, cls: "bg-gray-03/60 text-gray-05" };
  return <span className={cn("inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium", m.cls)}>{m.label}</span>;
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-white p-3 ring-1 ring-white-02">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <div className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{children}</div>
    </div>
  );
}

export function InvoiceDetailDrawer({ id, entity, currency, onClose, onWriteOff }: {
  id: number | null; entity: string; currency?: string | null; onClose: () => void; onWriteOff: () => void;
}) {
  const { data, isLoading, isError, refetch } = useGetInvoiceDetailQuery(id ? { entity, id } : skipToken);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("lines");
  const [payOpen, setPayOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [remind, { isLoading: reminding }] = useRemindInvoiceMutation();
  const d = data?.data;
  const inv = d?.invoice;
  const s = d?.summary;
  const overdue = !!(s?.due_date && s.due_date < todayISO() && (s?.balance.kobo ?? 0) > 0);
  const canAct = !!inv && inv.status === "POSTED" && inv.balance_due > 0;

  const openPdf = async () => {
    if (!inv) return;
    try {
      await openInvoiceDocument(inv.id, entity);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the invoice PDF.");
    }
  };

  const sendReminder = async () => {
    if (!inv) return;
    try {
      const res = await remind({ id: inv.id, entity }).unwrap();
      toast.success(res.message || "Reminder sent.");
      setRemindOpen(false);
    } catch { /* central */ }
  };

  const count = (key: string) =>
    key === "lines" ? d?.lines.length : key === "settlements" ? d?.settlements.length : key === "gl" ? d?.gl_journals.length : key === "reminders" ? d?.reminders.length : undefined;

  return (
    <DetailDrawer
      open={id != null}
      onOpenChange={(o) => !o && onClose()}
      title={inv ? inv.document_number : "Invoice"}
      description={inv ? `${inv.customer_name} · ${inv.customer_code}` : undefined}
      widthClass="sm:max-w-3xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={openPdf} disabled={!inv} className="gap-1.5"><Printer className="size-4" /> Print PDF</Button>
            {/* Labelled "invoice", not "receipt": this drawer is an invoice, and a
                receipt has its own send on the Receipts screen. */}
            {inv ? (
              <DocumentEmailAction
                kind="invoices"
                id={inv.id}
                entity={entity}
                permission={P.FIN_EMAIL_INVOICE}
                label="Email invoice"
                title="Email this invoice to the customer?"
              />
            ) : null}
            {inv?.status === "POSTED" ? (
              <DocumentVoidAction
                documentType="INVOICE"
                documentId={inv.id}
                documentNumber={inv.document_number}
                entity={entity}
                onVoided={onClose}
              />
            ) : null}
          </div>
          {canAct && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Send reminder lives with the Reminders tab; Record payment with Payments. */}
              {tab === "reminders" && (
                <Can permission={P.FIN_SEND_DUNNING}>
                  <Button variant="outline" onClick={() => setRemindOpen(true)} className="gap-1.5"><BellRing className="size-4" /> Send reminder</Button>
                </Can>
              )}
              <Can permission={P.FIN_WRITE_OFF_INVOICE}>
                <Button variant="outline" onClick={onWriteOff} className="border-destructive/40 text-destructive hover:bg-destructive/5">Write off</Button>
              </Can>
              {tab === "settlements" && (
                <Can permission={P.PAY_CREATE_COLLECTION}>
                  <Button variant="outline" onClick={() => setRequestOpen(true)} className="gap-1.5"><Globe className="size-4" /> Request payment</Button>
                </Can>
              )}
              {tab === "settlements" && (
                <Can permission={P.FIN_RECORD_PAYMENT}>
                  <Button onClick={() => setPayOpen(true)} className="gap-1.5"><CreditCard className="size-4" /> Record payment</Button>
                </Can>
              )}
            </div>
          )}
        </div>
      }
    >
      {isLoading ? <LoadingState rows={6} /> : isError || !d || !inv || !s ? <ErrorState onRetry={refetch} /> : (
        <div className="space-y-4">
          <div><StatusPill status={inv.status} /> <span className="ml-1"><StatusPill status={inv.payment_status} /></span></div>

          {/* stat cards - Paid (cash) and Credited (notes/concessions/write-offs) are
              distinct legs of Settled; Balance is the real outstanding. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Total"><Money kobo={s.total.kobo} currency={currency} /></Stat>
            <Stat label="Paid (cash)"><Money kobo={s.paid.kobo} currency={currency} /></Stat>
            <Stat label="Credited"><Money kobo={s.credited.kobo} currency={currency} /></Stat>
            <Stat label="Settled"><Money kobo={s.settled.kobo} currency={currency} /></Stat>
            <Stat label="Balance due"><Money kobo={s.balance.kobo} currency={currency} /></Stat>
            <Stat label="Aging">
              {s.due_date ? <span className={cn(overdue && "text-destructive")}>{overdue ? "Overdue · " : "Due "}{s.due_date}</span> : "-"}
            </Stat>
          </div>

          {/* tabs */}
          <div className="flex flex-wrap gap-1 border-b border-white-02">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 font-mont text-xs font-semibold",
                  tab === t.key ? "border-primary text-primary" : "border-transparent text-gray-05 hover:text-gray-01")}>
                <t.icon className="size-3.5" />{t.label}{count(t.key) ? ` (${count(t.key)})` : ""}
              </button>
            ))}
          </div>

          {tab === "lines" && (
            d.lines.length === 0 ? <EmptyState title="No lines" /> : (
              <div className="overflow-x-auto rounded-md border border-white-02">
                <table className="w-full border-collapse">
                  <thead><tr>
                    <th className={th}>Description</th><th className={th}>GL account</th>
                    <th className={cn(th, "text-right")}>Qty</th><th className={cn(th, "text-right")}>Unit price</th>
                    <th className={cn(th, "text-right")}>Tax</th><th className={cn(th, "text-right")}>Line total</th>
                  </tr></thead>
                  <tbody>
                    {d.lines.map((l, i) => (
                      <tr key={i}>
                        <td className={td}>{l.description}</td>
                        <td className={cn(td, "text-gray-05")}><span className="font-semibold tabular-nums text-gray-01">{l.account_code}</span> {l.account_name}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{Number(l.quantity)}</td>
                        <td className={cn(td, "text-right tabular-nums")}><Money kobo={l.unit_price.kobo} currency={currency} align="right" /></td>
                        <td className={cn(td, "text-right tabular-nums")}>{l.tax_amount.kobo ? <Money kobo={l.tax_amount.kobo} currency={currency} align="right" /> : "-"}</td>
                        <td className={cn(td, "text-right font-medium tabular-nums")}><Money kobo={l.line_total.kobo} currency={currency} align="right" /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="font-mont text-xs">
                    <tr><td className={cn(td, "border-t-2")} colSpan={5}>Subtotal</td><td className={cn(td, "border-t-2 text-right tabular-nums")}><Money kobo={s.subtotal.kobo} currency={currency} align="right" /></td></tr>
                    <tr><td className={cn(td, "border-t-0")} colSpan={5}>Tax</td><td className={cn(td, "border-t-0 text-right tabular-nums")}><Money kobo={s.tax.kobo} currency={currency} align="right" /></td></tr>
                    <tr className="font-semibold"><td className={cn(td, "border-t-0")} colSpan={5}>Grand total</td><td className={cn(td, "border-t-0 text-right tabular-nums")}><Money kobo={s.total.kobo} currency={currency} align="right" /></td></tr>
                  </tfoot>
                </table>
              </div>
            )
          )}

          {tab === "settlements" && (
            d.settlements.length === 0 ? <EmptyState title="No settlements" message="Cash receipts, credit notes, concessions and write-offs applied to this invoice appear here." /> : (
              <SimpleTable head={["Date", "Type", "Reference", "Method", "Amount"]} rows={d.settlements.map((st) => [
                st.date,
                <TypeBadge key="t" type={st.type} />,
                st.reference,
                st.method || "-",
                <Money key="a" kobo={st.amount.kobo} currency={currency} align="right" />,
              ])} rightCols={[4]} />
            )
          )}

          {tab === "gl" && (
            d.gl_journals.length === 0 ? <EmptyState title="No GL postings" message="The AR journal posts when the invoice is posted." /> : (
              <div className="space-y-3">
                {d.gl_journals.map((j, i) => (
                  <div key={i} className="overflow-hidden rounded-md border border-white-02">
                    <div className="flex items-center justify-between gap-2 bg-[#F1F1F1] px-3 py-2">
                      <span className="flex items-center gap-2"><TypeBadge type={j.document_type} /><span className="font-mont text-xs font-semibold text-gray-01">{j.reference}</span></span>
                      <span className="font-mont text-[11px] tabular-nums text-gray-05">{j.date}</span>
                    </div>
                    <table className="w-full border-collapse">
                      <thead><tr>
                        <th className={th}>Account</th><th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Credit</th>
                      </tr></thead>
                      <tbody>
                        {j.lines.map((g, k) => (
                          <tr key={k}>
                            <td className={td}><span className="font-semibold tabular-nums">{g.account_code}</span> {g.account_name}</td>
                            <td className={cn(td, "text-right tabular-nums")}>{g.debit.kobo ? <Money kobo={g.debit.kobo} currency={currency} align="right" /> : "-"}</td>
                            <td className={cn(td, "text-right tabular-nums")}>{g.credit.kobo ? <Money kobo={g.credit.kobo} currency={currency} align="right" /> : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "reminders" && (
            d.reminders.length === 0 ? <EmptyState title="No reminders" message="Dunning reminders for this invoice will appear here." /> : (
              <SimpleTable head={["Date", "Level", "Channel", "Status"]} rows={d.reminders.map((r) => [
                r.date, r.level ?? "-", r.channel || "-", <StatusPill key="s" status={r.status} />,
              ])} />
            )
          )}

          {tab === "activity" && (
            <ol className="space-y-2">
              {d.activity.map((a, i) => (
                <li key={i} className="flex items-start gap-2 font-mont text-xs">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-green-01 text-white"><Check className="size-3" /></span>
                  <span><span className="tabular-nums text-gray-05">{a.date}</span> - <span className="text-gray-01">{a.label}</span></span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {inv && (
        <>
          <RecordPaymentModal
            key={`pay-${payOpen}`}
            open={payOpen}
            onOpenChange={setPayOpen}
            entity={entity}
            invoiceId={inv.id}
            docNumber={inv.document_number}
            balanceKobo={s?.balance.kobo ?? inv.balance_due}
          />
          <RequestPaymentModal
            key={`req-${requestOpen}`}
            open={requestOpen}
            onOpenChange={setRequestOpen}
            entity={entity}
            invoiceId={inv.id}
            docNumber={inv.document_number}
            balanceKobo={s?.balance.kobo ?? inv.balance_due}
            currency={currency}
          />
          <ConfirmActionModal
            open={remindOpen}
            onOpenChange={setRemindOpen}
            title={`Send a reminder for ${inv.document_number}?`}
            description={`Sends a single dunning reminder to ${inv.customer_name} for this invoice, at its current overdue level.`}
            confirmText="Send reminder"
            loading={reminding}
            onConfirm={sendReminder}
          />
        </>
      )}
    </DetailDrawer>
  );
}

function SimpleTable({ head, rows, rightCols = [] }: { head: string[]; rows: React.ReactNode[][]; rightCols?: number[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-white-02">
      <table className="w-full border-collapse">
        <thead><tr>{head.map((h, i) => <th key={i} className={cn(th, rightCols.includes(i) && "text-right")}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={cn(td, rightCols.includes(j) && "text-right tabular-nums")}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
