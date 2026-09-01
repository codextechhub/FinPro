// Operations → Petty Cash, rebuilt to the Vision prototype in the house theme:
// a fund-centric float register. Fund selector → KPIs (ceiling / current / spent
// this week / to replenish) → tabs (Movement register · Vouchers) with
// Establish float, Replenish and New voucher.
//
// Honest adaptations: a fund selector (the prototype shows one fund; we can hold
// several). The movement register is the petty-cash GL ledger, and "Category" is
// derived from each journal's counter line (we don't store a category field).

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Coins, ArrowDownToLine, RefreshCw, FileText, ListChecks, Ban, Send } from "lucide-react";
import {
  DataTable, Money, MoneyInput, DetailDrawer, FormField, ConfirmActionModal,
  AccountPicker, TaxCodePicker, BankAccountPicker, StatusPill, toArray, type Column,
  PostingDateField,} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { EmptyState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import {
  useGetPettyCashFundsQuery, useGetPettyCashFundQuery, useCreatePettyCashFundMutation,
  useEstablishPettyCashMutation, useReplenishPettyCashMutation, useGetPettyCashVouchersQuery,
  useCreatePettyCashVoucherMutation, usePostPettyCashVoucherMutation, useVoidPettyCashVoucherMutation,
} from "@/redux/services/finance/ops-api";
import type { PettyCashFund, PettyCashVoucher, PettyCashMovement } from "@/redux/services/finance/ops-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const fmtDate = (s: string) => new Date(s).toLocaleDateString();

function Initials({ name }: { name: string }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pry-01 font-mont text-xs font-semibold text-primary">{init || "-"}</span>;
}
function Kpi({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="font-mont text-xs text-gray-05">{label}</p>
      <p className={cn("mt-1 font-mont text-xl font-semibold tabular-nums", danger ? "text-destructive" : "text-black-01")}>{value}</p>
      {hint && <p className="mt-0.5 font-mont text-[11px] text-gray-05">{hint}</p>}
    </div>
  );
}

export function PettyCashTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { data: listData, isLoading } = useGetPettyCashFundsQuery({ entity });
  const funds = useMemo(() => toArray(listData?.data), [listData]);
  const [fundId, setFundId] = useState<number | null>(null);
  const [establishing, setEstablishing] = useState(false);
  const fund = useMemo<PettyCashFund | undefined>(
    () => (fundId != null ? funds.find((f) => f.id === fundId) : funds.find((f) => f.is_active) ?? funds[0]),
    [funds, fundId]);

  const establishDrawer = (
    <EstablishFloatDrawer open={establishing} onClose={() => setEstablishing(false)} entity={entity}
      currency={currency} onCreated={(id) => setFundId(id)} />
  );

  if (isLoading) return <div className="py-10 text-center font-mont text-sm text-gray-05">Loading…</div>;
  if (funds.length === 0) {
    return (
      <div data-guide="finance-petty-cash.empty">
        <EmptyState title="No petty-cash floats" message="Establish a float - set it up and fund it in one step." />
        <div className="mt-3 flex justify-center">
          <Can permission={P.FIN_ESTABLISH_PETTY_CASH}><Button onClick={() => setEstablishing(true)} className="gap-1.5"><ArrowDownToLine className="size-4" /> Establish float</Button></Can>
        </div>
        {establishDrawer}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-guide="finance-petty-cash.workbench">
      <div className="flex flex-wrap items-center gap-2">
        <select value={fund?.id ?? ""} onChange={(e) => setFundId(Number(e.target.value))}
          className="h-9 rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01">
          {funds.map((f) => <option key={f.id} value={f.id}>{f.name}{f.custodian_label ? ` · ${f.custodian_label}` : ""}</option>)}
        </select>
      </div>
      {fund ? <FundWorkbench fund={fund} entity={entity} currency={currency} onEstablish={() => setEstablishing(true)} /> : null}
      {establishDrawer}
    </div>
  );
}

const TABS = [{ key: "register", label: "Movement register", icon: ListChecks }, { key: "vouchers", label: "Vouchers", icon: FileText }] as const;

function FundWorkbench({ fund, entity, currency, onEstablish }: { fund: PettyCashFund; entity: string; currency?: string | null; onEstablish: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("register");
  const [drawer, setDrawer] = useState<null | "voucher" | "replenish">(null);
  const { data: detailData } = useGetPettyCashFundQuery({ id: fund.id, entity });
  const detail = detailData?.data;
  const register = useMemo(() => detail?.register ?? [], [detail]);
  const vouchersQ = useGetPettyCashVouchersQuery({ entity, fund: fund.id, page_size: 100 });
  const vouchers = useMemo(() => toArray(vouchersQ.data?.data), [vouchersQ.data]);

  const registerCols: Column<PettyCashMovement>[] = [
    { header: "Date", cell: (m) => <span className="tabular-nums text-gray-05">{fmtDate(m.date)}</span> },
    { header: "Description", cell: (m) => m.description },
    { header: "Category", cell: (m) => <span className={cn(PILL, m.in ? "bg-green-01/10 text-green-01" : "bg-gray-03/60 text-gray-05")}>{m.category}</span> },
    { header: "In", align: "right", cell: (m) => m.in ? <span className="tabular-nums text-green-01">{formatMoney(m.in, currency)}</span> : <span className="text-gray-05">-</span> },
    { header: "Out", align: "right", cell: (m) => m.out ? <span className="tabular-nums text-destructive">{formatMoney(m.out, currency)}</span> : <span className="text-gray-05">-</span> },
    { header: "Balance", align: "right", cell: (m) => <span className="font-medium tabular-nums">{formatMoney(m.balance, currency)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Initials name={fund.custodian_label || fund.name} />
          <div className="leading-tight">
            <p className="font-mont text-sm font-semibold text-black-01">{fund.custodian_label || "No custodian set"}</p>
            <p className="font-mont text-[11px] text-gray-05">Custodian · {fund.gl_account} float register</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Can permission={P.FIN_ESTABLISH_PETTY_CASH}>
            <Button variant="outline" onClick={onEstablish} className="gap-1.5"><ArrowDownToLine className="size-4" /> Establish float</Button>
          </Can>
          <Can permission={P.FIN_REPLENISH_PETTY_CASH}>
            <Button variant="outline" onClick={() => setDrawer("replenish")} className="gap-1.5"><RefreshCw className="size-4" /> Replenish</Button>
          </Can>
          <Can permission={P.FIN_CREATE_PETTY_CASH_VOUCHER}>
            <Button onClick={() => setDrawer("voucher")} className="gap-1.5"><Plus className="size-4" /> New voucher</Button>
          </Can>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-petty-cash.summary">
        <Kpi label="Float ceiling" value={formatMoney(fund.float_amount, currency)} />
        <Kpi label="Current balance" value={formatMoney(fund.current_balance, currency)} hint="Cash on hand" />
        <Kpi label="Spent (this week)" value={formatMoney(detail?.spent_this_week ?? 0, currency)} />
        <Kpi label="To replenish" value={formatMoney(fund.shortfall, currency)} danger={fund.shortfall > 0} hint="Restores the float" />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-white-02">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 font-mont text-xs font-semibold",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-gray-05 hover:text-gray-01")}>
            <t.icon className="size-3.5" /> {t.label}{t.key === "vouchers" && vouchers.length ? ` · ${vouchers.length}` : ""}
          </button>
        ))}
      </div>

      {tab === "register" ? (
        <DataTable columns={registerCols} rows={register} rowKey={(m) => m.id}
          emptyTitle="No movements yet" emptyMessage="Establish cash or record a voucher to see the register." />
      ) : (
        <VouchersList vouchers={vouchers} entity={entity} currency={currency} loading={vouchersQ.isFetching} />
      )}

      {drawer === "voucher" ? <NewVoucherDrawer fund={fund} entity={entity} currency={currency} onClose={() => setDrawer(null)} /> : null}
      {drawer === "replenish" ? <ReplenishDrawer fund={fund} entity={entity} currency={currency} onClose={() => setDrawer(null)} /> : null}
    </div>
  );
}

function VouchersList({ vouchers, entity, currency, loading }: { vouchers: PettyCashVoucher[]; entity: string; currency?: string | null; loading: boolean }) {
  const { can } = useCan();
  const [post, { isLoading: posting }] = usePostPettyCashVoucherMutation();
  const [voidVoucher, { isLoading: voiding }] = useVoidPettyCashVoucherMutation();
  const [postTarget, setPostTarget] = useState<PettyCashVoucher | null>(null);
  const [voidTarget, setVoidTarget] = useState<PettyCashVoucher | null>(null);
  const canManage = can(P.FIN_POST_PETTY_CASH_VOUCHER);
  const draftCount = vouchers.filter((voucher) => voucher.status === "DRAFT").length;
  const doPost = async () => {
    if (!postTarget) return;
    try {
      const r = await post({ id: postTarget.id, entity }).unwrap();
      toast.success(r.message || "Voucher posted.");
      setPostTarget(null);
    } catch { /* central */ }
  };
  const doVoid = async () => {
    if (!voidTarget) return;
    try { const r = await voidVoucher({ id: voidTarget.id, entity }).unwrap(); toast.success(r.message || "Voucher voided."); setVoidTarget(null); } catch { /* central */ }
  };
  const cols: Column<PettyCashVoucher>[] = [
    { header: "Voucher no.", cell: (v) => <span className="font-semibold tabular-nums">{v.document_number}</span> },
    { header: "Expense account", cell: (v) => <span className="tabular-nums text-gray-05">{v.expense_account || "-"}</span> },
    { header: "Note", cell: (v) => v.narration || "-" },
    { header: "Date", cell: (v) => <span className="tabular-nums text-gray-05">{fmtDate(v.voucher_date)}</span> },
    { header: "Amount", align: "right", cell: (v) => <Money kobo={v.total} currency={currency} align="right" /> },
    { header: "Status", cell: (v) => <StatusPill status={v.status} /> },
    { header: "Action", align: "right", cell: (v) => !canManage ? null
      : v.status === "DRAFT"
        ? (
          <Button type="button" size="sm" onClick={() => setPostTarget(v)} className="gap-1.5">
            <Send className="size-3.5" /> Post voucher
          </Button>
        )
        : v.status === "POSTED"
          ? (
            <Button type="button" size="xs" variant="ghost" onClick={() => setVoidTarget(v)} className="text-destructive hover:text-destructive">
              <Ban className="size-3" /> Void
            </Button>
          )
          : null },
  ];
  return (
    <>
      {canManage && draftCount > 0 ? (
        <div className="mb-3 flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 px-3.5 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Send className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-mont text-sm font-semibold text-black-01">
              {draftCount} draft {draftCount === 1 ? "voucher is" : "vouchers are"} ready to post
            </p>
            <p className="mt-0.5 font-mont text-xs text-gray-05">
              Use the Post voucher action below to book the expense and reduce the petty-cash balance.
            </p>
          </div>
        </div>
      ) : null}
      <DataTable columns={cols} rows={vouchers} rowKey={(v) => v.id} loading={loading}
        emptyTitle="No vouchers" emptyMessage="Record a voucher with New voucher." />
      <ConfirmActionModal
        open={!!postTarget}
        onOpenChange={(o) => !o && setPostTarget(null)}
        title={postTarget ? `Post ${postTarget.document_number}?` : "Post voucher?"}
        description={postTarget
          ? `This will book ${formatMoney(postTarget.total, currency)} as an expense and reduce the petty-cash balance.`
          : undefined}
        confirmText="Post voucher"
        loading={posting}
        onConfirm={doPost}
      />
      <ConfirmActionModal
        open={!!voidTarget}
        onOpenChange={(o) => !o && setVoidTarget(null)}
        title={voidTarget ? `Void ${voidTarget.document_number}?` : "Void voucher?"}
        description="Reverses the voucher's posting journal and returns the cash to the tin, then cancels the voucher. Use this to undo a voucher posted in error."
        confirmText="Void voucher"
        destructive
        loading={voiding}
        onConfirm={doVoid}
      />
    </>
  );
}

function NewVoucherDrawer({ fund, entity, currency, onClose }: { fund: PettyCashFund; entity: string; currency?: string | null; onClose: () => void }) {
  const [date, setDate] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState(0);
  const [tax, setTax] = useState("");
  const [narration, setNarration] = useState("");
  const { can } = useCan();
  const canPost = can(P.FIN_POST_PETTY_CASH_VOUCHER);
  const [create, { isLoading }] = useCreatePettyCashVoucherMutation();
  const [post, { isLoading: posting }] = usePostPettyCashVoucherMutation();

  const submit = async (thenPost: boolean) => {
    try {
      const res = await create({
        entity, fund: fund.id, voucher_date: date,
        lines: [{ description: narration.trim() || "Petty cash spend", expense_account: account, quantity: 1, unit_price: amount, tax_code: tax || undefined }],
      }).unwrap();
      if (thenPost && res.data) await post({ id: res.data.id, entity }).unwrap();
      toast.success(thenPost ? "Voucher posted." : "Voucher saved.");
      onClose();
    } catch { /* central */ }
  };

  const canSubmit = account !== "" && amount > 0;
  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="New voucher" description={`${fund.name} · spends the float`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading || posting} onClick={() => submit(false)}>Save draft</Button>
        {canPost && (
          <Button disabled={!canSubmit || isLoading || posting} onClick={() => submit(true)} className="gap-1.5"><Coins className="size-4" />{posting ? "Posting…" : "Save & post"}</Button>
        )}
      </>}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          Posting a voucher spends the tin - Dr expense (+ recoverable VAT), Cr petty cash - lowering the balance by the gross total.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Expense account" required><AccountPicker entity={entity} value={account} onChange={setAccount} accountType="EXPENSE" postableOnly placeholder="5xxx" /></FormField>
          <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" /></FormField>
          <FormField label="Tax"><TaxCodePicker entity={entity} value={tax} onChange={setTax} usage="purchase" /></FormField>
        </div>
        <FormField label="Note"><Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="What it was for" className="h-9 bg-white" /></FormField>
      </div>
    </DetailDrawer>
  );
}

function ReplenishDrawer({ fund, entity, currency, onClose }: { fund: PettyCashFund; entity: string; currency?: string | null; onClose: () => void }) {
  const [bank, setBank] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState(fund.shortfall);
  const [replenish, { isLoading }] = useReplenishPettyCashMutation();

  const submit = async () => {
    try {
      const res = await replenish({ id: fund.id, entity, bank_account: bank || undefined, amount: amount || undefined, date }).unwrap();
      toast.success(res.message || "Float replenished.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Replenish float" description={fund.name}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || amount <= 0} onClick={submit} className="gap-1.5"><RefreshCw className="size-4" />{isLoading ? "Saving…" : `Move ${formatMoney(amount, currency)}`}</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          Tops the tin back up to its {formatMoney(fund.float_amount, currency)} ceiling (Dr petty cash, Cr bank).
        </p>
        <FormField label="Bank account"><BankAccountPicker entity={entity} value={bank} onChange={setBank} placeholder="Default cash/bank" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" /></FormField>
          <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
        </div>
      </div>
    </DetailDrawer>
  );
}

// Establish = set up the float (its GL account, custodian, ceiling) AND move the
// initial cash from the bank into the tin - both in one step, like the prototype.
function EstablishFloatDrawer({ open, onClose, entity, currency, onCreated }: {
  open: boolean; onClose: () => void; entity: string; currency?: string | null; onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [glAccount, setGlAccount] = useState("");
  const [custodian, setCustodian] = useState("");
  const [ceiling, setCeiling] = useState(0);
  const [opening, setOpening] = useState(0);
  const [bank, setBank] = useState("");
  const [date, setDate] = useState("");
  const [create, { isLoading: creating }] = useCreatePettyCashFundMutation();
  const [establish, { isLoading: funding }] = useEstablishPettyCashMutation();
  const isLoading = creating || funding;

  // The opening cash defaults to the ceiling (establish the full float) until the
  // user diverges it.
  const onCeiling = (v: number) => { setCeiling(v); setOpening((o) => (o === 0 || o === ceiling ? v : o)); };

  const reset = () => { setName(""); setGlAccount(""); setCustodian(""); setCeiling(0); setOpening(0); setBank(""); setDate(""); };
  const close = () => { reset(); onClose(); };
  const canSubmit = name.trim() !== "" && glAccount !== "" && ceiling > 0 && opening > 0;

  const submit = async () => {
    try {
      const res = await create({ entity, name: name.trim(), gl_account: glAccount, custodian_name: custodian.trim() || undefined, float_amount: ceiling }).unwrap();
      const fund = res.data;
      if (fund) {
        await establish({ id: fund.id, entity, bank_account: bank || undefined, amount: opening, date }).unwrap();
        onCreated(fund.id);
      }
      toast.success("Float established.");
      close();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="Establish float" description="Set up a petty-cash float and move the opening cash into it."
      widthClass="sm:max-w-2xl"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5"><ArrowDownToLine className="size-4" />{isLoading ? "Establishing…" : `Establish ${formatMoney(opening, currency)}`}</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          Creates the float (mapped 1:1 to its petty-cash GL account) at its <span className="font-medium">ceiling</span> - the imprest level Replenish restores it to - and moves the opening cash from the bank into the tin (Dr petty cash, Cr bank).
        </p>
        <FormField label="Float name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front-desk float" className="h-9 bg-white" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Petty-cash GL account" required><AccountPicker entity={entity} value={glAccount} onChange={setGlAccount} accountType="ASSET" postableOnly placeholder="Petty cash account" /></FormField>
          <FormField label="Custodian"><Input value={custodian} onChange={(e) => setCustodian(e.target.value)} placeholder="Who holds the tin" className="h-9 bg-white" /></FormField>
        </div>
        <p className="-mb-1 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Opening cash</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Float ceiling" required><MoneyInput valueKobo={ceiling} onChangeKobo={onCeiling} currency={currency} className="[&_input]:h-9" /></FormField>
          <FormField label="Opening cash" required><MoneyInput valueKobo={opening} onChangeKobo={setOpening} currency={currency} className="[&_input]:h-9" /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="From bank"><BankAccountPicker entity={entity} value={bank} onChange={setBank} placeholder="Default cash/bank" /></FormField>
          <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
        </div>
      </div>
    </DetailDrawer>
  );
}
