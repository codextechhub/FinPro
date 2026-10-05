/**
 * Operations -> Petty Cash: a fund-centric float register. Branch and fund
 * pickers -> the fund's state and actions -> KPIs (ceiling / current / spent this
 * week / to replenish) -> tabs (Movement register, Vouchers, Returns) -> the
 * approval route for returns.
 *
 * A fund runs, or is closed. A running fund establishes, replenishes and spends
 * its float, and gives cash back to the bank with Reduce float or Close fund
 * (see `petty-cash-return-drawers.tsx`). A closed fund shows when and by whom it
 * was closed and offers only Reopen and a name or custodian edit: the server
 * refuses every voucher, top-up and float change on it.
 *
 * The movement register is the petty-cash GL ledger. "Category" is derived by
 * the server from each journal's counter line: a top-up, a spend's expense
 * account, "Returned to bank", "Count short" or "Count over".
 *
 * Branches follow `petty-cash-branch.ts`: nothing at a one-branch school, a
 * branch picker kept in the page address for a reader who covers several.
 *
 * A link naming one return (`?document=<id>`, a journal's "Open return") opens
 * that return over the page, whichever fund or branch is shown.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Coins, ArrowDownToLine, RefreshCw, FileText, ListChecks, Ban, Send, Landmark, Lock, Pencil, RotateCcw, Undo2, XCircle } from "lucide-react";
import {
  DataTable, Money, MoneyInput, DetailDrawer, FormField, ConfirmActionModal,
  AccountPicker, TaxCodePicker, BankAccountPicker, StatusPill, TabStrip, toArray, type Column,
  type TabStripItem, PostingDateField, RaisingBranchField, useRaisingBranchChoice,} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { EmptyState } from "@/components/finance-ui/states";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import {
  useGetPettyCashFundsQuery, useGetPettyCashFundQuery, useCreatePettyCashFundMutation,
  useEstablishPettyCashMutation, useReplenishPettyCashMutation, useGetPettyCashVouchersQuery,
  useCreatePettyCashVoucherMutation, usePostPettyCashVoucherMutation, useVoidPettyCashVoucherMutation,
  useCancelPettyCashVoucherMutation, useGetPettyCashReturnsQuery,
} from "@/redux/services/finance/ops-api";
import type { PettyCashFund, PettyCashVoucher, PettyCashMovement } from "@/redux/services/finance/ops-types";
import { useDates } from "../../../lib/display-prefs";
import { exitedOutline, exitedTitle } from "@/components/finance-ui/exited-person";
import { useSourceDocumentParam } from "@/lib/source-document-route";
import { branchName, fundOptionLabel, inBranch, pickFund, usePettyCashBranch, type PettyCashBranch } from "./petty-cash-branch";
import { closeBlockers, floatBeforeClosure, registerTone, type RegisterTone } from "./petty-cash-returns";
import { CloseFundDrawer, EditFundDrawer, ReduceFloatDrawer, ReopenFundDialog } from "./petty-cash-return-drawers";
import { LinkedReturnDrawer, PettyCashReturnsList } from "./petty-cash-returns-list";
import { PettyCashApprovalRouteCard } from "./petty-cash-approval-route";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";

const TONE_CLASS: Record<RegisterTone, string> = {
  in: "bg-green-01/10 text-green-01",
  over: "bg-green-01/10 text-green-01",
  out: "bg-gray-03/60 text-gray-05",
  bank: "bg-primary/10 text-primary",
  short: "bg-destructive/10 text-destructive",
};

function Initials({ name, exited }: { name: string; exited?: boolean | null }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span title={exitedTitle(exited)} className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-pry-01 font-mont text-xs font-semibold text-primary", exitedOutline(exited))}>{init || "-"}</span>;
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
  const allFunds = useMemo(() => toArray(listData?.data), [listData]);
  const { view, fundParam, chooseBranch, chooseFund } = usePettyCashBranch();
  const funds = useMemo(() => inBranch(allFunds, view), [allFunds, view]);
  const [establishing, setEstablishing] = useState(false);
  const fund = useMemo(() => pickFund(funds, fundParam), [funds, fundParam]);
  const [linkedReturn, setLinkedReturn] = useState<number | null>(null);
  useSourceDocumentParam(setLinkedReturn);
  const linkedReturnDrawer = linkedReturn != null ? (
    <LinkedReturnDrawer id={linkedReturn} entity={entity} currency={currency} view={view} funds={allFunds} onClose={() => setLinkedReturn(null)} />
  ) : null;

  const establishDrawer = (
    <EstablishFloatDrawer open={establishing} onClose={() => setEstablishing(false)} entity={entity}
      currency={currency} onCreated={(id) => chooseFund(id)} />
  );
  const branchPicker = view.canChoose ? (
    <div className="w-full sm:w-56">
      <NativeSelect value={view.selected === "all" ? "" : String(view.selected)} aria-label="Branch" className="h-9"
        onChange={(e) => chooseBranch(e.target.value ? Number(e.target.value) : "all")}>
        <option value="">All branches</option>
        {view.choices.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
      </NativeSelect>
    </div>
  ) : null;

  if (isLoading) return <div className="py-10 text-center font-mont text-sm text-gray-05">Loading…</div>;
  if (funds.length === 0) {
    return (
      <div className="space-y-4">
        {branchPicker}
        <div data-guide="finance-petty-cash.empty">
          <EmptyState title="No petty-cash floats"
            message={view.applies && view.selected !== "all"
              ? `${branchName(view, view.selected)} has no float yet. Establish one - set it up and fund it in one step.`
              : "Establish a float - set it up and fund it in one step."} />
          <div className="mt-3 flex justify-center">
            <Can permission={P.FIN_ESTABLISH_PETTY_CASH}><Button onClick={() => setEstablishing(true)} className="gap-1.5"><ArrowDownToLine className="size-4" /> Establish float</Button></Can>
          </div>
          {establishDrawer}
        </div>
        <PettyCashApprovalRouteCard entity={entity} currency={currency} />
        {linkedReturnDrawer}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-guide="finance-petty-cash.workbench">
      <div className="flex flex-wrap items-center gap-2">
        {branchPicker}
        <div className="w-full sm:w-80">
          <NativeSelect value={fund ? String(fund.id) : ""} aria-label="Fund" className="h-9" onChange={(e) => chooseFund(Number(e.target.value))}>
            {funds.map((f) => <option key={f.id} value={f.id}>{fundOptionLabel(f, view)}</option>)}
          </NativeSelect>
        </div>
      </div>
      {fund ? <FundWorkbench key={fund.id} fund={fund} funds={allFunds} view={view} entity={entity} currency={currency} onEstablish={() => setEstablishing(true)} /> : null}
      <PettyCashApprovalRouteCard entity={entity} currency={currency} />
      {establishDrawer}
      {linkedReturnDrawer}
    </div>
  );
}

const TABS = [
  { key: "register", label: "Movement register", icon: ListChecks },
  { key: "vouchers", label: "Vouchers", icon: FileText },
  { key: "returns", label: "Returns", icon: Undo2 },
] as const;

type Drawer = null | "voucher" | "replenish" | "reduce" | "close" | "reopen" | "edit";

/** One fund: its state, its actions, its figures and its three lists. */
function FundWorkbench({ fund, funds, view, entity, currency, onEstablish }: {
  fund: PettyCashFund; funds: PettyCashFund[]; view: PettyCashBranch; entity: string; currency?: string | null; onEstablish: () => void;
}) {
  const dates = useDates();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("register");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "petty cash return" });
  const { data: detailData } = useGetPettyCashFundQuery({ id: fund.id, entity });
  const detail = detailData?.data;
  const live = detail ?? fund;
  const register = useMemo(() => detail?.register ?? [], [detail]);
  const vouchersQ = useGetPettyCashVouchersQuery({ entity, fund: fund.id, page_size: 100 });
  const vouchers = useMemo(() => toArray(vouchersQ.data?.data), [vouchersQ.data]);
  const fundReturnsQ = useGetPettyCashReturnsQuery({ entity, fund: fund.id, page_size: 100 });
  const fundReturns = useMemo(() => toArray(fundReturnsQ.data?.data), [fundReturnsQ.data]);
  const closed = live.state === "CLOSED";
  const running = live.is_active && !closed;

  // Voucher tab carries its own count; the strip re-measures when the label grows.
  const tabItems = useMemo<TabStripItem<(typeof TABS)[number]["key"]>[]>(() => TABS.map((t) => ({
    value: t.key,
    label: <><t.icon className="size-3.5" /> {t.label}{t.key === "vouchers" && vouchers.length ? ` · ${vouchers.length}` : ""}</>,
  })), [vouchers.length]);

  const registerCols: Column<PettyCashMovement>[] = [
    { header: "Date", cell: (m) => <span className="tabular-nums text-gray-05">{dates.day(m.date)}</span> },
    { header: "Description", cell: (m) => m.description },
    { header: "Category", cell: (m) => <span className={cn(PILL, TONE_CLASS[registerTone(m.category, m.in)])}>{m.category}</span> },
    { header: "In", align: "right", cell: (m) => m.in ? <span className="tabular-nums text-green-01">{formatMoney(m.in, currency)}</span> : <span className="text-gray-05">-</span> },
    { header: "Out", align: "right", cell: (m) => m.out ? <span className="tabular-nums text-destructive">{formatMoney(m.out, currency)}</span> : <span className="text-gray-05">-</span> },
    { header: "Balance", align: "right", cell: (m) => <span className="font-medium tabular-nums">{formatMoney(m.balance, currency)}</span> },
  ];

  const stateLabel = closed ? "Closed" : live.is_active ? "Active" : "Inactive";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Initials name={live.custodian_label || live.name} exited={live.custodian_is_exited} />
          <div className="min-w-0 leading-tight">
            <p className="flex flex-wrap items-center gap-2 font-mont text-sm font-semibold text-black-01">
              {live.custodian_label || "No custodian set"}
              <StatusPill status={closed ? "CLOSED" : live.is_active ? "ACTIVE" : "INACTIVE"} />
            </p>
            <p className="font-mont text-[11px] text-gray-05">
              Custodian · {live.gl_account} float register{view.applies ? ` · ${branchName(view, live.branch_id)}` : ""}
              <span className="sr-only"> · {stateLabel}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="fund-actions">
          {closed ? (
            <Can permission={P.FIN_REOPEN_PETTY_CASH}>
              <Button onClick={() => setDrawer("reopen")} className="gap-1.5"><RotateCcw className="size-4" /> Reopen</Button>
            </Can>
          ) : (
            <>
              <Can permission={P.FIN_ESTABLISH_PETTY_CASH}>
                <Button variant="outline" onClick={onEstablish} className="gap-1.5"><ArrowDownToLine className="size-4" /> Establish float</Button>
              </Can>
              {running ? (
                <>
                  <Can permission={P.FIN_REPLENISH_PETTY_CASH}>
                    <Button variant="outline" onClick={() => setDrawer("replenish")} className="gap-1.5"><RefreshCw className="size-4" /> Replenish</Button>
                  </Can>
                  <Can permission={P.FIN_RETURN_PETTY_CASH}>
                    <Button variant="outline" onClick={() => setDrawer("reduce")} className="gap-1.5"><Landmark className="size-4" /> Reduce float</Button>
                  </Can>
                  <Can permission={P.FIN_CREATE_PETTY_CASH_VOUCHER}>
                    <Button onClick={() => setDrawer("voucher")} className="gap-1.5"><Plus className="size-4" /> New voucher</Button>
                  </Can>
                </>
              ) : null}
              <Can permission={P.FIN_CLOSE_PETTY_CASH}>
                <Button variant="outline" onClick={() => setDrawer("close")} className="gap-1.5 text-destructive hover:text-destructive"><Lock className="size-4" /> Close fund</Button>
              </Can>
            </>
          )}
          <Can permission={P.FIN_UPDATE_PETTY_CASH}>
            <Button variant="ghost" onClick={() => setDrawer("edit")} className="gap-1.5"><Pencil className="size-4" /> Edit fund</Button>
          </Can>
        </div>
      </div>

      {closed ? (
        <div className="flex items-start gap-3 rounded-md border border-gray-03 bg-gray-03/40 px-3.5 py-3" data-testid="fund-closed">
          <XCircle className="mt-0.5 size-4 shrink-0 text-gray-05" />
          <div className="min-w-0 font-mont text-xs leading-5 text-gray-01">
            <p className="font-semibold text-black-01">
              Closed on {live.closed_on ? dates.day(live.closed_on) : "-"}{live.closed_by_name ? ` by ${live.closed_by_name}${live.closed_by_is_exited ? " (left)" : ""}` : ""}.
            </p>
            <p className="text-gray-05">Its cash was banked. It takes no vouchers, top-ups or float changes until it is reopened.</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-petty-cash.summary">
        <Kpi label="Float ceiling" value={formatMoney(live.float_amount, currency)} />
        <Kpi label="Current balance" value={formatMoney(live.current_balance, currency)} hint="Cash on hand" />
        <Kpi label="Spent (this week)" value={formatMoney(detail?.spent_this_week ?? 0, currency)} />
        <Kpi label="To replenish" value={formatMoney(live.shortfall, currency)} danger={!closed && live.shortfall > 0} hint="Restores the float" />
      </div>

      <TabStrip
        items={tabItems}
        value={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel="Petty cash views"
        className="w-full gap-1"
        buttonClassName="inline-flex items-center gap-1.5 px-3 py-2 font-semibold"
      />

      {tab === "register" ? (
        <DataTable columns={registerCols} rows={register} rowKey={(m) => m.id}
          emptyTitle="No movements yet" emptyMessage="Establish cash or record a voucher to see the register." />
      ) : tab === "vouchers" ? (
        <VouchersList vouchers={vouchers} entity={entity} currency={currency} loading={vouchersQ.isFetching} />
      ) : (
        <PettyCashReturnsList entity={entity} currency={currency} funds={funds} view={view} />
      )}

      {drawer === "voucher" ? <NewVoucherDrawer fund={live} entity={entity} currency={currency} onClose={() => setDrawer(null)} /> : null}
      {drawer === "replenish" ? <ReplenishDrawer fund={live} entity={entity} currency={currency} onClose={() => setDrawer(null)} /> : null}
      {drawer === "reduce" ? <ReduceFloatDrawer fund={live} entity={entity} currency={currency} onClose={() => setDrawer(null)} onRaised={promptIfParked} /> : null}
      {drawer === "close" ? (
        <CloseFundDrawer fund={live} entity={entity} currency={currency} blockers={closeBlockers(fund.id, vouchers, fundReturns)}
          onClose={() => setDrawer(null)} onRaised={promptIfParked} />
      ) : null}
      {drawer === "reopen" ? (
        <ReopenFundDialog fund={live} entity={entity} currency={currency} initialFloat={floatBeforeClosure(fund.id, fundReturns)} onClose={() => setDrawer(null)} />
      ) : null}
      {drawer === "edit" ? <EditFundDrawer fund={live} entity={entity} currency={currency} onClose={() => setDrawer(null)} onSwitch={(next) => setDrawer(next)} /> : null}
      {noApproverDialog}
    </div>
  );
}

/**
 * A fund's vouchers. A draft is posted by a holder of the post key, or
 * cancelled by whoever may raise vouchers (it never touched a ledger); a posted
 * voucher is voided, which reverses its journal.
 */
function VouchersList({ vouchers, entity, currency, loading }: { vouchers: PettyCashVoucher[]; entity: string; currency?: string | null; loading: boolean }) {
  const dates = useDates();
  const { can } = useCan();
  const [post, { isLoading: posting }] = usePostPettyCashVoucherMutation();
  const [voidVoucher, { isLoading: voiding }] = useVoidPettyCashVoucherMutation();
  const [cancelVoucher, { isLoading: cancelling }] = useCancelPettyCashVoucherMutation();
  const [postTarget, setPostTarget] = useState<PettyCashVoucher | null>(null);
  const [voidTarget, setVoidTarget] = useState<PettyCashVoucher | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PettyCashVoucher | null>(null);
  const canManage = can(P.FIN_POST_PETTY_CASH_VOUCHER);
  const canCancel = can(P.FIN_CREATE_PETTY_CASH_VOUCHER);
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
  const doCancel = async () => {
    if (!cancelTarget) return;
    try { const r = await cancelVoucher({ id: cancelTarget.id, entity }).unwrap(); toast.success(r.message || "Voucher cancelled."); setCancelTarget(null); } catch { /* central */ }
  };
  const cols: Column<PettyCashVoucher>[] = [
    { header: "Voucher no.", cell: (v) => <span className="font-semibold tabular-nums">{v.document_number}</span> },
    { header: "Expense account", cell: (v) => <span className="tabular-nums text-gray-05">{v.expense_account || "-"}</span> },
    { header: "Note", cell: (v) => v.narration || "-" },
    { header: "Date", cell: (v) => <span className="tabular-nums text-gray-05">{dates.day(v.voucher_date)}</span> },
    { header: "Amount", align: "right", cell: (v) => <Money kobo={v.total} currency={currency} align="right" /> },
    { header: "Status", cell: (v) => <StatusPill status={v.status} /> },
    { header: "Action", align: "right", cell: (v) => v.status === "DRAFT"
      ? (
        <span className="inline-flex flex-wrap justify-end gap-1.5">
          {canManage ? (
            <Button type="button" size="sm" onClick={() => setPostTarget(v)} className="gap-1.5">
              <Send className="size-3.5" /> Post voucher
            </Button>
          ) : null}
          {canCancel ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setCancelTarget(v)} className="text-destructive hover:text-destructive">
              <XCircle className="size-3.5" /> Cancel
            </Button>
          ) : null}
        </span>
      )
      : v.status === "POSTED" && canManage
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
              Post a draft to book the expense and reduce the petty-cash balance, or cancel one that will never be paid.
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
      <ConfirmActionModal
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title={cancelTarget ? `Cancel ${cancelTarget.document_number}?` : "Cancel voucher?"}
        description="The draft is cancelled and never posted. Nothing reaches the books."
        confirmText="Cancel voucher"
        cancelText="Keep it"
        destructive
        loading={cancelling}
        onConfirm={doCancel}
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
        <FormField label="Bank account"><BankAccountPicker entity={entity} value={bank} onChange={setBank} placeholder="Default cash/bank" documentBranchId={fund.branch_id} /></FormField>
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
  const branch = useRaisingBranchChoice();

  // The opening cash defaults to the ceiling (establish the full float) until the
  // user diverges it.
  const onCeiling = (v: number) => { setCeiling(v); setOpening((o) => (o === 0 || o === ceiling ? v : o)); };

  const reset = () => { setName(""); setGlAccount(""); setCustodian(""); setCeiling(0); setOpening(0); setBank(""); setDate(""); branch.reset(); };
  const close = () => { reset(); onClose(); };
  const canSubmit = name.trim() !== "" && glAccount !== "" && ceiling > 0 && opening > 0 && branch.ready;
  const pickBranch = (next: string) => { branch.setValue(next); setBank(""); };

  const submit = async () => {
    try {
      const res = await create({ entity, name: name.trim(), gl_account: glAccount, custodian_name: custodian.trim() || undefined, float_amount: ceiling, ...branch.body() }).unwrap();
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
        <RaisingBranchField raising={branch.raising} value={branch.value} onChange={pickBranch} hint="The float is this branch's, and is topped up from this branch's accounts." />
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
          <FormField label="From bank"><BankAccountPicker entity={entity} value={bank} onChange={setBank} placeholder="Default cash/bank" documentBranchId={branch.branchId} /></FormField>
          <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
        </div>
      </div>
    </DetailDrawer>
  );
}
