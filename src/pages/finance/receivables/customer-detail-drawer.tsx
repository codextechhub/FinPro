/**
 * Customer / payer detail drawer - three stat cards (Current balance / Lifetime
 * paid / Open invoices) and tabs: Transactions · Statement · Contact. The Customer
 * Statement is a printable statement-of-account document (entity letterhead,
 * customer + period, a debit/credit ledger with opening + closing balance) with
 * Print and Send-to-customer actions. Footer: Run reminders · Record payment,
 * and Move to another branch for a whole-school reader at a school with several
 * branches (the customer's whole open balance; see move-balance-drawer.tsx).
 *
 * Field Access (`finance.customer`): the code and name carry no switch. Every
 * other value is shown only when the response carries it, because the server
 * leaves a field out for a role that may not read it: a stat card, a tab or a
 * statement column whose data is absent is left out with its heading, and the
 * Contact tab offers each editable field only while the role may read and write
 * it. When the balance is hidden the account's running figures leave the open
 * items and the statement together, the footer actions stay (they do not depend
 * on the figure), and the Record payment form starts empty rather than prefilled.
 * The Statement's closing balance and the opening row go with the balance.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { skipToken } from "@reduxjs/toolkit/query";
import { ArrowLeftRight, ScrollText, User, BellRing, CreditCard, Printer, Receipt, Users, Link2, QrCode } from "lucide-react";
import { AccessField, DetailDrawer, DocumentEmailAction, Money, ConfirmActionModal, FormField, TabStrip, fieldWriteErrors, useActiveEntity, useFieldAccess, type FieldErrors, type TabStripItem } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { LoadingState, ErrorState, EmptyState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import {
  useGetCustomerDetailQuery, useUpdateCustomerMutation, useRemindCustomerMutation,
} from "@/redux/services/finance/ar-api";
import type { Customer, CustomerDetail } from "@/redux/services/finance/ar-types";
import { CustomerReceiptModal } from "./customer-receipt-modal";
import { MoveBalanceDrawer } from "../inter-branch/move-balance-drawer";
import { useInterBranchReader } from "../inter-branch/use-inter-branch";
import { PayerLinksPanel, payerLinksReadable } from "./payer-links-panel";
import { DeskCollectionDialog } from "../collections/desk-collection-dialog";
import { useDates } from "../../../lib/display-prefs";

const CUSTOMER = "finance.customer";

const TABS = [
  { key: "open", label: "Open items", icon: Receipt },
  { key: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { key: "statement", label: "Statement", icon: ScrollText },
  { key: "contact", label: "Contact", icon: User },
  { key: "payers", label: "Payers", icon: Link2 },
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

const STAT_COLUMNS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

/**
 * The sections of the record a response carries, in tab order. Open items need
 * either list of open bills; Contact is offered to anyone who can change the
 * customer or read one of its contact values; Payers follows its own switches.
 */
export function customerSections(
  d: Pick<CustomerDetail, "open_invoices" | "open_debit_notes" | "transactions" | "statement">,
  { showPayers, showContact }: { showPayers: boolean; showContact: boolean },
): (typeof TABS)[number]["key"][] {
  const present: Record<(typeof TABS)[number]["key"], boolean> = {
    open: d.open_invoices !== undefined || d.open_debit_notes !== undefined,
    transactions: d.transactions !== undefined,
    statement: d.statement !== undefined,
    contact: showContact,
    payers: showPayers,
  };
  return TABS.filter((t) => present[t.key]).map((t) => t.key);
}

export function CustomerDetailDrawer({ id, entity, currency, onClose }: {
  id: number | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const dates = useDates();
  const { can } = useCan();
  const { entity: activeEntity } = useActiveEntity();
  const showPayers = payerLinksReadable(useFieldAccess("finance.payer_link"));
  const { data, isLoading, isError, refetch } = useGetCustomerDetailQuery(id ? { entity, id } : skipToken);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("statement");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const [remind, { isLoading: reminding }] = useRemindCustomerMutation();
  const d = data?.data;
  const c = d?.customer;
  const s = d?.summary;
  const access = useFieldAccess(CUSTOMER, c);
  const balance = s?.current_balance;
  // With the balance hidden, whether the customer owes is unknown, so the actions stay.
  const owes = balance === undefined || balance.kobo > 0;
  const reader = useInterBranchReader();
  const [moving, setMoving] = useState(false);
  // Moving binds two branches' books, so the server keeps it for a whole-school reader.
  const offerMove = reader.applies && reader.reach.wholeSchool && reader.keys.transfer;
  // A parent can pay into the account at the desk whatever it owes: it may be a prepayment.
  const offerDesk = can(P.PAY_CREATE_COLLECTION);

  const sendReminder = async () => {
    if (!c) return;
    try {
      const res = await remind({ entity, customer: c.id }).unwrap();
      toast.success(res.message || "Reminders run.");
      setRemindOpen(false);
    } catch { /* central */ }
  };

  const showContact = can(P.FIN_UPDATE_CUSTOMER) || access.anyVisible("billing_email", "billing_phone", "billing_address", "receivable_account_code");
  const sections = useMemo(() => d ? customerSections(d, { showPayers, showContact }) : [], [d, showPayers, showContact]);
  const activeTab = sections.includes(tab) ? tab : sections[0];

  // Tabs that stand for a list carry its size; Contact has nothing to count.
  const tabItems = useMemo<TabStripItem<(typeof TABS)[number]["key"]>[]>(() => {
    const count = (k: string) =>
      k === "open" ? (d ? (d.open_invoices?.length ?? 0) + (d.open_debit_notes?.length ?? 0) : undefined)
        : k === "transactions" ? d?.transactions?.length : k === "statement" ? d?.statement?.length : undefined;
    return TABS.filter((t) => sections.includes(t.key)).map((t) => ({
      value: t.key,
      label: <><t.icon className="size-3.5" />{t.label}{count(t.key) ? ` (${count(t.key)})` : ""}</>,
    }));
  }, [d, sections]);

  const stats = ([
    s?.current_balance ? { label: "Current balance", value: signed(s.current_balance.kobo, currency) } : null,
    s?.lifetime_paid ? { label: "Lifetime paid", value: <Money kobo={s.lifetime_paid.kobo} currency={currency} /> } : null,
    s?.open_invoice_count !== undefined ? { label: "Open invoices", value: s.open_invoice_count } : null,
  ] as ({ label: string; value: React.ReactNode } | null)[]).filter((stat) => stat !== null);

  return (
    <DetailDrawer
      open={id != null}
      onOpenChange={(o) => !o && onClose()}
      title={c ? c.name : "Customer"}
      description={c ? `${c.code}${c.billing_email ? ` · ${c.billing_email}` : ""}` : undefined}
      widthClass="sm:max-w-3xl"
      footer={c && (owes || offerMove || offerDesk) ? (
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {offerMove ? (
            <Button variant="outline" onClick={() => setMoving(true)} className="gap-1.5"><Users className="size-4" /> Move to another branch</Button>
          ) : null}
          {offerDesk ? (
            <Button variant="outline" onClick={() => setDeskOpen(true)} className="gap-1.5"><QrCode className="size-4" /> Collect at the desk</Button>
          ) : null}
          {owes ? <>
          <Can permission={P.FIN_SEND_DUNNING}>
            <Button variant="outline" onClick={() => setRemindOpen(true)} className="gap-1.5"><BellRing className="size-4" /> Run reminders</Button>
          </Can>
          <Can permission={P.FIN_RECORD_PAYMENT}>
            <Button onClick={() => setReceiptOpen(true)} className="gap-1.5"><CreditCard className="size-4" /> Record payment</Button>
          </Can>
          </> : null}
        </div>
      ) : undefined}
    >
      {isLoading ? <LoadingState rows={6} /> : isError || !d || !c ? <ErrorState onRetry={refetch} /> : (
        <div className="space-y-4">
          {s?.account_status ? <div><Pill status={s.account_status} /></div> : null}

          {stats.length > 0 ? (
            <div className={cn("grid gap-3", STAT_COLUMNS[stats.length])}>
              {stats.map((stat) => <Stat key={stat.label} label={stat.label}>{stat.value}</Stat>)}
            </div>
          ) : null}

          {tabItems.length > 1 ? (
            <TabStrip
              items={tabItems}
              value={activeTab}
              onChange={setTab}
              variant="underline"
              ariaLabel="Customer sections"
              className="w-full gap-1"
              buttonClassName="inline-flex items-center gap-1.5 px-3 py-2 font-semibold"
            />
          ) : null}

          {activeTab === "open" && <OpenItemsTab d={d} currency={currency} />}

          {activeTab === "transactions" && d.transactions && (
            d.transactions.length === 0 ? <EmptyState title="No transactions" /> : (
              <div className="overflow-x-auto rounded-md border border-white-02">
                <table className="w-full border-collapse">
                  <thead><tr>
                    <th className={th}>Date</th><th className={th}>Type</th><th className={th}>Reference</th><th className={cn(th, "text-right")}>Amount</th>
                  </tr></thead>
                  <tbody>
                    {d.transactions.map((t, i) => (
                      <tr key={`${t.reference}-${i}`}>
                        <td className={cn(td, "tabular-nums text-gray-05")}>{dates.day(t.date)}</td>
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

          {activeTab === "statement" && d.statement && (
            <StatementTab d={d} lines={d.statement} showBalance={balance !== undefined} entity={entity} entityName={activeEntity?.name ?? entity} currency={currency} />
          )}

          {activeTab === "contact" && <ContactPanel key={c.id} entity={entity} customer={c} currency={currency} />}

          {activeTab === "payers" && <PayerLinksPanel key={c.id} entity={entity} customer={c} />}
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
            customerBranchId={c.branch_id}
            owedKobo={balance?.kobo ?? 0}
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
          {deskOpen ? (
            <DeskCollectionDialog
              open
              onOpenChange={setDeskOpen}
              entity={entity}
              currency={currency}
              target={{
                customerCode: c.code,
                customerName: c.name,
                customerEmail: c.billing_email || undefined,
                customerBranchId: c.branch_id,
              }}
            />
          ) : null}
          {moving ? (
            <MoveBalanceDrawer entity={entity} currency={currency} reader={reader} customerCode={c.code} onClose={() => setMoving(false)} />
          ) : null}
        </>
      )}
    </DetailDrawer>
  );
}

/**
 * Outstanding AR items - open invoices and open DEBIT notes (both settleable).
 * The Balance column goes with each bill's `balance` when the customer's balance
 * is hidden.
 */
function OpenItemsTab({ d, currency }: { d: CustomerDetail; currency?: string | null }) {
  const dates = useDates();
  const rows = [
    ...(d.open_invoices ?? []).map((i) => ({ kind: "INVOICE" as const, reference: i.document_number, date: i.due_date, total: i.total.kobo, balance: i.balance?.kobo, status: i.status })),
    ...(d.open_debit_notes ?? []).map((n) => ({ kind: "DEBIT_NOTE" as const, reference: n.document_number, date: n.note_date, total: n.total.kobo, balance: n.balance?.kobo, status: n.status })),
  ];
  if (rows.length === 0) return <EmptyState title="No open items" message="Outstanding invoices and debit notes will appear here." />;
  const showBalance = rows.some((r) => r.balance !== undefined);
  return (
    <div className="overflow-x-auto rounded-md border border-white-02">
      <table className="w-full border-collapse">
        <thead><tr>
          <th className={th}>Type</th><th className={th}>Reference</th><th className={th}>Due</th>
          <th className={cn(th, "text-right")}>Total</th>{showBalance ? <th className={cn(th, "text-right")}>Balance</th> : null}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.reference}-${i}`}>
              <td className={td}><span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium", TXN_META[r.kind]?.cls)}>{TXN_META[r.kind]?.label}</span></td>
              <td className={cn(td, "font-semibold")}>{r.reference}</td>
              <td className={cn(td, "tabular-nums text-gray-05")}>{dates.day(r.date)}</td>
              <td className={cn(td, "text-right tabular-nums")}><Money kobo={r.total} currency={currency} align="right" /></td>
              {showBalance ? <td className={cn(td, "text-right font-medium tabular-nums")}><Money kobo={r.balance ?? 0} currency={currency} align="right" /></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The statement's range as its heading reads it, in the school's date format
 * like the rows below it: "1 Sep 2026 - 5 Oct 2026", or "Up to 5 Oct 2026"
 * with no start day.
 */
export function statementPeriodLabel(from: string, to: string, day: (iso: string) => string): string {
  return from ? `${day(from)} - ${day(to)}` : `Up to ${day(to)}`;
}

type StatementLine = NonNullable<CustomerDetail["statement"]>[number];

/**
 * A printable statement-of-account document for the active date range. With the
 * balance hidden, no line carries a running balance, so the opening row, the
 * Balance column and the closing balance are all left out.
 */
function StatementTab({ d, lines, showBalance, entity, entityName, currency }: {
  d: CustomerDetail; lines: StatementLine[]; showBalance: boolean; entity: string; entityName: string; currency?: string | null;
}) {
  const dates = useDates();
  const c = d.customer;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(() => dates.today());

  const { opening, rows, closing } = useMemo(() => {
    const inRange = (e: StatementLine) =>
      e.date !== null && (!from || e.date >= from) && (!to || e.date <= to);
    let open = 0;
    for (const e of lines) {
      if (inRange(e)) break;
      open = e.balance?.kobo ?? 0;           // null-date opening + anything before `from`
    }
    const rng = lines.filter(inRange);
    return { opening: open, rows: rng, closing: rng.length ? (rng[rng.length - 1].balance?.kobo ?? 0) : open };
  }, [lines, from, to]);

  const period = statementPeriodLabel(from, to, dates.day);

  return (
    <div className="space-y-3">
      {/* controls */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-end gap-2">
          <label className="space-y-1"><span className="font-mont text-[11px] text-gray-05">From</span>
            <DatePickerInput value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 bg-white" /></label>
          <label className="space-y-1"><span className="font-mont text-[11px] text-gray-05">To</span>
            <DatePickerInput value={to} onChange={(e) => setTo(e.target.value)} className="h-9 bg-white" /></label>
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
              <th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Credit</th>
              {showBalance ? <th className={cn(th, "text-right")}>Balance</th> : null}
            </tr></thead>
            <tbody>
              {showBalance ? (
                <tr>
                  <td className={cn(td, "tabular-nums text-gray-05")}>{from || "-"}</td>
                  <td className={td}>Opening balance</td>
                  <td className={cn(td, "text-right text-gray-05")}>-</td>
                  <td className={cn(td, "text-right text-gray-05")}>-</td>
                  <td className={cn(td, "text-right tabular-nums")}>{signed(opening, currency)}</td>
                </tr>
              ) : null}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className={cn(td, "tabular-nums text-gray-05")}>{dates.day(r.date)}</td>
                  <td className={td}>{r.description}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{r.debit.kobo ? <Money kobo={r.debit.kobo} currency={currency} align="right" /> : "-"}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{r.credit.kobo ? <Money kobo={r.credit.kobo} currency={currency} align="right" /> : "-"}</td>
                  {showBalance ? <td className={cn(td, "text-right font-medium tabular-nums")}>{signed(r.balance?.kobo ?? 0, currency)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showBalance ? (
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-white-02 pt-3">
            <div>
              <p className="font-mont text-[11px] text-gray-05">Closing balance due</p>
              <p className="font-mont text-lg font-semibold tabular-nums text-black-01">{signed(closing, currency)}</p>
            </div>
            <p className="max-w-xs text-right font-mont text-[11px] text-gray-05">Please settle the closing balance at your earliest convenience. Thank you.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The Contact tab. Each value is its own `finance.customer` field: one the role
 * may not read is not rendered, one it may read but not change is greyed and
 * left out of the saved body, and a save the server refuses on a field shows
 * its reason beside that field. The name carries no switch.
 */
function ContactPanel({ entity, customer, currency }: { entity: string; customer: Customer; currency?: string | null }) {
  const [update, { isLoading }] = useUpdateCustomerMutation();
  const access = useFieldAccess(CUSTOMER, customer);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.billing_email ?? "");
  const [phone, setPhone] = useState(customer.billing_phone ?? "");
  const [address, setAddress] = useState(customer.billing_address ?? "");
  const [active, setActive] = useState(customer.is_active ?? true);
  const draft = { billing_email: email, billing_phone: phone, billing_address: address, is_active: active };
  const stored = { billing_email: customer.billing_email ?? "", billing_phone: customer.billing_phone ?? "", billing_address: customer.billing_address ?? "", is_active: customer.is_active ?? true };
  const writable = access.writableOnly(draft);
  const dirty = name !== customer.name
    || (Object.keys(writable) as (keyof typeof draft)[]).some((key) => draft[key] !== stored[key]);
  const showReceivable = !access.isHidden("receivable_account_code");
  const showOpening = !access.isHidden("opening_balance");
  const showContact = access.anyVisible("billing_email", "billing_phone");

  const save = async () => {
    setDenied(null);
    try {
      const res = await update({ entity, id: customer.id, name: name.trim(), ...writable }).unwrap();
      toast.success(res.message || "Customer updated.");
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  return (
    <Can permission={P.FIN_UPDATE_CUSTOMER} fallback={
      <div className="space-y-2 font-mont text-sm">
        {!access.isHidden("billing_email") ? <p><span className="text-gray-05">Email:</span> {customer.billing_email || "-"}</p> : null}
        {!access.isHidden("billing_phone") ? <p><span className="text-gray-05">Phone:</span> {customer.billing_phone || "-"}</p> : null}
        {!access.isHidden("billing_address") ? <p><span className="text-gray-05">Address:</span> {customer.billing_address || "-"}</p> : null}
        {showReceivable ? <p><span className="text-gray-05">Receivable a/c:</span> {customer.receivable_account_code ?? "-"} {customer.receivable_account_name}</p> : null}
      </div>
    }>
      <div className="space-y-3">
        <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white" /></FormField>
        {showContact ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AccessField access={access} name="billing_email" label="Billing email" errors={denied}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-white" /></AccessField>
            <AccessField access={access} name="billing_phone" label="Billing phone" errors={denied}><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-white" /></AccessField>
          </div>
        ) : null}
        <AccessField access={access} name="billing_address" label="Billing address" errors={denied}><Input value={address} onChange={(e) => setAddress(e.target.value)} className="bg-white" /></AccessField>
        {showReceivable || showOpening ? (
          <p className="font-mont text-xs text-gray-05">
            {showReceivable ? <>Receivable a/c: <span className="font-medium text-gray-01">{customer.receivable_account_code ?? "-"} {customer.receivable_account_name}</span></> : null}
            {showReceivable && showOpening ? " · " : null}
            {showOpening ? <>Opening balance {formatMoney(customer.opening_balance ?? 0, currency)}</> : null}
          </p>
        ) : null}
        <AccessField access={access} name="is_active" errors={denied}>
          <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active</label>
        </AccessField>
        <Button onClick={save} disabled={!dirty || isLoading} className="font-mont text-xs font-semibold">{isLoading ? "Saving…" : "Save changes"}</Button>
      </div>
    </Can>
  );
}
