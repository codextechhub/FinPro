/**
 * Customer / payer detail drawer - three stat cards (Current balance / Lifetime
 * paid / Open invoices) and tabs: Transactions · Statement · Contact. The Customer
 * Statement is a printable statement-of-account document (entity letterhead,
 * customer + period, a debit/credit ledger with opening + closing balance) with
 * Print and Send-to-customer actions. Footer: Run reminders · Record payment.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { skipToken } from "@reduxjs/toolkit/query";
import { ArrowLeftRight, ScrollText, User, BellRing, CreditCard, Printer, Receipt } from "lucide-react";
import { DetailDrawer, DocumentEmailAction, Money, ConfirmActionModal, FormField, TabStrip, useActiveEntity, type TabStripItem } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { LoadingState, ErrorState, EmptyState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import {
  useGetCustomerDetailQuery, useUpdateCustomerMutation, useRemindCustomerMutation,
} from "@/redux/services/finance/ar-api";
import type { Customer, CustomerDetail } from "@/redux/services/finance/ar-types";
import { CustomerReceiptModal } from "./customer-receipt-modal";
import { todayISO } from "@/utils/posting-window";

const TABS = [
  { key: "open", label: "Open items", icon: Receipt },
  { key: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { key: "statement", label: "Statement", icon: ScrollText },
  { key: "contact", label: "Contact", icon: User },
] as const;

const ACCOUNT_PILL: Record<string, string> = {
  ACTIVE: "bg-green-01/10 text-green-01", OVERDUE: "bg-destructive/10 text-destructive",
  CREDIT: "bg-blue-50 text-blue-700",
};
const ACCOUNT_LABEL: Record<string, string> = { ACTIVE: "Active", OVERDUE: "Overdue", CREDIT: "In credit" };
const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const td = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";
// Statement transaction type → badge. DEBIT notes are supplementary AR charges (debit
// side), distinct from an invoice.
const TXN_META: Record<string, { label: string; cls: string }> = {
  PAYMENT: { label: "Receipt", cls: "bg-green-01/10 text-green-01" },
  INVOICE: { label: "Invoice", cls: "bg-blue-50 text-blue-700" },
  DEBIT_NOTE: { label: "Debit note", cls: "bg-indigo-50 text-indigo-700" },
  CREDIT_NOTE: { label: "Credit note", cls: "bg-emerald-50 text-emerald-700" },
  REFUND: { label: "Refund", cls: "bg-amber-50 text-amber-700" },
  ADJUSTMENT: { label: "Adjustment", cls: "bg-violet-50 text-violet-700" },
};

function Pill({ status }: { status: string }) {
  return <span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium", ACCOUNT_PILL[status] ?? "bg-gray-03/60 text-gray-05")}>{ACCOUNT_LABEL[status] ?? status}</span>;
}

function signed(kobo: number, currency?: string | null) {
  return kobo < 0 ? `${formatMoney(-kobo, currency)} cr` : formatMoney(kobo, currency);
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-white p-3 ring-1 ring-white-02">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <div className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{children}</div>
    </div>
  );
}

export function CustomerDetailDrawer({ id, entity, currency, onClose }: {
  id: number | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const { entity: activeEntity } = useActiveEntity();
  const { data, isLoading, isError, refetch } = useGetCustomerDetailQuery(id ? { entity, id } : skipToken);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("statement");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [remind, { isLoading: reminding }] = useRemindCustomerMutation();
  const d = data?.data;
  const c = d?.customer;
  const s = d?.summary;
  const owes = (s?.current_balance.kobo ?? 0) > 0;   // footer actions only when owed

  const sendReminder = async () => {
    if (!c) return;
    try {
      const res = await remind({ entity, customer: c.id }).unwrap();
      toast.success(res.message || "Reminders run.");
      setRemindOpen(false);
    } catch { /* central */ }
  };

  // Tabs that stand for a list carry its size; Contact has nothing to count.
  const tabItems = useMemo<TabStripItem<(typeof TABS)[number]["key"]>[]>(() => {
    const count = (k: string) =>
      k === "open" ? (d ? d.open_invoices.length + d.open_debit_notes.length : undefined)
        : k === "transactions" ? d?.transactions.length : k === "statement" ? d?.statement.length : undefined;
    return TABS.map((t) => ({
      value: t.key,
      label: <><t.icon className="size-3.5" />{t.label}{count(t.key) ? ` (${count(t.key)})` : ""}</>,
    }));
  }, [d]);

  return (
    <DetailDrawer
      open={id != null}
      onOpenChange={(o) => !o && onClose()}
      title={c ? c.name : "Customer"}
      description={c ? `${c.code}${c.billing_email ? ` · ${c.billing_email}` : ""}` : undefined}
      widthClass="sm:max-w-3xl"
      footer={c && owes ? (
        <div className="flex w-full items-center justify-end gap-2">
          <Can permission={P.FIN_SEND_DUNNING}>
            <Button variant="outline" onClick={() => setRemindOpen(true)} className="gap-1.5"><BellRing className="size-4" /> Run reminders</Button>
          </Can>
          <Can permission={P.FIN_RECORD_PAYMENT}>
            <Button onClick={() => setReceiptOpen(true)} className="gap-1.5"><CreditCard className="size-4" /> Record payment</Button>
          </Can>
        </div>
      ) : undefined}
    >
      {isLoading ? <LoadingState rows={6} /> : isError || !d || !c || !s ? <ErrorState onRetry={refetch} /> : (
        <div className="space-y-4">
          <div><Pill status={s.account_status} /></div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Current balance">{signed(s.current_balance.kobo, currency)}</Stat>
            <Stat label="Lifetime paid"><Money kobo={s.lifetime_paid.kobo} currency={currency} /></Stat>
            <Stat label="Open invoices">{s.open_invoice_count}</Stat>
          </div>

          <TabStrip
            items={tabItems}
            value={tab}
            onChange={setTab}
            variant="underline"
            ariaLabel="Customer sections"
            className="w-full gap-1"
            buttonClassName="inline-flex items-center gap-1.5 px-3 py-2 font-semibold"
          />

          {tab === "open" && <OpenItemsTab d={d} currency={currency} />}

          {tab === "transactions" && (
            d.transactions.length === 0 ? <EmptyState title="No transactions" /> : (
              <div className="overflow-x-auto rounded-md border border-white-02">
                <table className="w-full border-collapse">
                  <thead><tr>
                    <th className={th}>Date</th><th className={th}>Type</th><th className={th}>Reference</th><th className={cn(th, "text-right")}>Amount</th>
                  </tr></thead>
                  <tbody>
                    {d.transactions.map((t, i) => (
                      <tr key={`${t.reference}-${i}`}>
                        <td className={cn(td, "tabular-nums text-gray-05")}>{t.date}</td>
                        <td className={td}><span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium", TXN_META[t.type]?.cls ?? "bg-blue-50 text-blue-700")}>{TXN_META[t.type]?.label ?? t.type}</span></td>
                        <td className={cn(td, "font-semibold")}>{t.reference}</td>
                        <td className={cn(td, "text-right tabular-nums")}><Money kobo={t.amount.kobo} currency={currency} align="right" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === "statement" && (
            <StatementTab d={d} entity={entity} entityName={activeEntity?.name ?? entity} currency={currency} />
          )}

          {tab === "contact" && <ContactPanel key={c.id} entity={entity} customer={c} currency={currency} />}
        </div>
      )}

      {c && (
        <>
          <CustomerReceiptModal
            key={`rcpt-${receiptOpen}`}
            open={receiptOpen}
            onOpenChange={setReceiptOpen}
            entity={entity}
            customerId={c.id}
            customerName={c.name}
            owedKobo={s?.current_balance.kobo ?? 0}
          />
          <ConfirmActionModal
            open={remindOpen}
            onOpenChange={setRemindOpen}
            title={`Run reminders for ${c.name}?`}
            description={`Advances each of ${c.name}'s overdue invoices by one reminder level, following the entity's dunning policy. Running again the same day makes no change.`}
            confirmText="Run reminders"
            loading={reminding}
            onConfirm={sendReminder}
          />
        </>
      )}
    </DetailDrawer>
  );
}

/** Outstanding AR items - open invoices and open DEBIT notes (both settleable). */
function OpenItemsTab({ d, currency }: { d: CustomerDetail; currency?: string | null }) {
  const rows = [
    ...d.open_invoices.map((i) => ({ kind: "INVOICE" as const, reference: i.document_number, date: i.due_date, total: i.total.kobo, balance: i.balance.kobo, status: i.status })),
    ...d.open_debit_notes.map((n) => ({ kind: "DEBIT_NOTE" as const, reference: n.document_number, date: n.note_date, total: n.total.kobo, balance: n.balance.kobo, status: n.status })),
  ];
  if (rows.length === 0) return <EmptyState title="No open items" message="Outstanding invoices and debit notes will appear here." />;
  return (
    <div className="overflow-x-auto rounded-md border border-white-02">
      <table className="w-full border-collapse">
        <thead><tr>
          <th className={th}>Type</th><th className={th}>Reference</th><th className={th}>Due</th>
          <th className={cn(th, "text-right")}>Total</th><th className={cn(th, "text-right")}>Balance</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.reference}-${i}`}>
              <td className={td}><span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium", TXN_META[r.kind]?.cls)}>{TXN_META[r.kind]?.label}</span></td>
              <td className={cn(td, "font-semibold")}>{r.reference}</td>
              <td className={cn(td, "tabular-nums text-gray-05")}>{r.date ?? "-"}</td>
              <td className={cn(td, "text-right tabular-nums")}><Money kobo={r.total} currency={currency} align="right" /></td>
              <td className={cn(td, "text-right font-medium tabular-nums")}><Money kobo={r.balance} currency={currency} align="right" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A printable statement-of-account document for the active date range. */
function StatementTab({ d, entity, entityName, currency }: { d: CustomerDetail; entity: string; entityName: string; currency?: string | null }) {
  const c = d.customer;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayISO());

  const { opening, rows, closing } = useMemo(() => {
    const inRange = (e: CustomerDetail["statement"][number]) =>
      e.date !== null && (!from || e.date >= from) && (!to || e.date <= to);
    let open = 0;
    for (const e of d.statement) {
      if (inRange(e)) break;
      open = e.balance.kobo;                 // null-date opening + anything before `from`
    }
    const rng = d.statement.filter(inRange);
    return { opening: open, rows: rng, closing: rng.length ? rng[rng.length - 1].balance.kobo : open };
  }, [d.statement, from, to]);

  const period = from ? `${from} - ${to}` : `Up to ${to}`;

  return (
    <div className="space-y-3">
      {/* controls */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-end gap-2">
          <label className="space-y-1"><span className="font-mont text-[11px] text-gray-05">From</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 bg-white" /></label>
          <label className="space-y-1"><span className="font-mont text-[11px] text-gray-05">To</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 bg-white" /></label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer className="size-4" /> Print</Button>
          {/* The dates above bound what is printed, so they bound what is sent too -
              a customer must receive the statement the sender was looking at. */}
          <DocumentEmailAction
            kind="customers"
            id={d.customer.id}
            entity={entity}
            permission={P.FIN_EMAIL_STATEMENT}
            label="Send to customer"
            title="Email this statement to the customer?"
            period={{ start: from || undefined, end: to || undefined }}
            buttonVariant="default"
          />
        </div>
      </div>

      {/* statement document */}
      <div className="rounded-md border border-white-02 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mont text-base font-semibold text-black-01">{entityName}</p>
            <p className="font-mont text-xs text-gray-05">Statement of Account</p>
          </div>
          <div className="text-right font-mont text-xs">
            <p className="font-semibold text-black-01">{c.name}</p>
            <p className="text-gray-05">{c.code}{c.billing_email ? ` · ${c.billing_email}` : ""}</p>
            <p className="text-gray-05">{period}</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto border-t border-white-02">
          <table className="w-full border-collapse">
            <thead><tr>
              <th className={th}>Date</th><th className={th}>Description</th>
              <th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Credit</th><th className={cn(th, "text-right")}>Balance</th>
            </tr></thead>
            <tbody>
              <tr>
                <td className={cn(td, "tabular-nums text-gray-05")}>{from || "-"}</td>
                <td className={td}>Opening balance</td>
                <td className={cn(td, "text-right text-gray-05")}>-</td>
                <td className={cn(td, "text-right text-gray-05")}>-</td>
                <td className={cn(td, "text-right tabular-nums")}>{signed(opening, currency)}</td>
              </tr>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className={cn(td, "tabular-nums text-gray-05")}>{r.date}</td>
                  <td className={td}>{r.description}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{r.debit.kobo ? <Money kobo={r.debit.kobo} currency={currency} align="right" /> : "-"}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{r.credit.kobo ? <Money kobo={r.credit.kobo} currency={currency} align="right" /> : "-"}</td>
                  <td className={cn(td, "text-right font-medium tabular-nums")}>{signed(r.balance.kobo, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-end justify-between border-t border-white-02 pt-3">
          <div>
            <p className="font-mont text-[11px] text-gray-05">Closing balance due</p>
            <p className="font-mont text-lg font-semibold tabular-nums text-black-01">{signed(closing, currency)}</p>
          </div>
          <p className="max-w-xs text-right font-mont text-[11px] text-gray-05">Please settle the closing balance at your earliest convenience. Thank you.</p>
        </div>
      </div>
    </div>
  );
}

function ContactPanel({ entity, customer, currency }: { entity: string; customer: Customer; currency?: string | null }) {
  const [update, { isLoading }] = useUpdateCustomerMutation();
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.billing_email);
  const [phone, setPhone] = useState(customer.billing_phone);
  const [address, setAddress] = useState(customer.billing_address);
  const [active, setActive] = useState(customer.is_active);
  const dirty = name !== customer.name || email !== customer.billing_email || phone !== customer.billing_phone || address !== customer.billing_address || active !== customer.is_active;

  const save = async () => {
    try {
      const res = await update({ entity, id: customer.id, name: name.trim(), billing_email: email, billing_phone: phone, billing_address: address, is_active: active }).unwrap();
      toast.success(res.message || "Customer updated.");
    } catch { /* central */ }
  };

  return (
    <Can permission={P.FIN_UPDATE_CUSTOMER} fallback={
      <div className="space-y-2 font-mont text-sm">
        <p><span className="text-gray-05">Email:</span> {customer.billing_email || "-"}</p>
        <p><span className="text-gray-05">Phone:</span> {customer.billing_phone || "-"}</p>
        <p><span className="text-gray-05">Address:</span> {customer.billing_address || "-"}</p>
        <p><span className="text-gray-05">Receivable a/c:</span> {customer.receivable_account_code ?? "-"} {customer.receivable_account_name}</p>
      </div>
    }>
      <div className="space-y-3">
        <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Billing email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-white" /></FormField>
          <FormField label="Billing phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-white" /></FormField>
        </div>
        <FormField label="Billing address"><Input value={address} onChange={(e) => setAddress(e.target.value)} className="bg-white" /></FormField>
        <p className="font-mont text-xs text-gray-05">Receivable a/c: <span className="font-medium text-gray-01">{customer.receivable_account_code ?? "-"} {customer.receivable_account_name}</span> · Opening balance {formatMoney(customer.opening_balance, currency)}</p>
        <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active</label>
        <Button onClick={save} disabled={!dirty || isLoading} className="font-mont text-xs font-semibold">{isLoading ? "Saving…" : "Save changes"}</Button>
      </div>
    </Can>
  );
}
