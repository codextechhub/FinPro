/**
 * Petty cash returns: every float reduction and closure, with its fund, its
 * branch where several are on screen, the cash banked, any count difference and
 * its status, and the detail behind each one.
 *
 * Void undoes a return. A posted one is reversed: the cash comes back on the
 * fund's books, the float is restored and a closed fund reopens. A draft left by
 * a rejected approval is cancelled; one an approver sent back is resumed by
 * whoever sent it, or withdrawn from the approvals screen, and is never
 * cancelled here while its request is open. The server refuses a void while the bank line
 * is matched on a reconciliation, after a later return of the same fund, or once
 * the float has changed since; the dialog names the refusal it can already see
 * and lists the rest, and the central handler words any refusal that comes back.
 *
 * The list reads up to the latest 100 returns in the reader's reach, asking the
 * server for the branch shown (`?branch=`), the fund picked and the year or
 * dates picked (`list-period`, each return placed by its return date). Each row
 * names its branch and its people as the server sent them. A reader who may not
 * read the return date is offered no Year picker and asks for no period, since
 * the server refuses a period on a date the reader may not read. A return
 * opened from the list is checked for Void against every return of its fund,
 * not only the rows the filters leave on screen.
 *
 * Every column, filter and detail row follows Field Access
 * (`finance.pettycash_return`): a field the reader may not read has no column
 * and no row. The fund a return belongs to is an identifying label, as a bank
 * account's name is, so it always shows and the Fund filter is open to every
 * reader. The Status filter follows the status field, since "Sent back" is a
 * question about where the return stands. A title, a description or a refusal
 * never names a kind or amount that is hidden.
 *
 * A link to one return (a journal's "Open return", `?document=<id>`) opens it
 * in `LinkedReturnDrawer`, whichever fund the page is on.
 */

import { useMemo, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { Ban } from "lucide-react";

import { DataTable, DetailDrawer, StatusPill, toArray, useFieldAccess, type Column } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/money";
import {
  useGetPettyCashReturnQuery, useGetPettyCashReturnsQuery, useVoidPettyCashReturnMutation,
} from "@/redux/services/finance/ops-api";
import type { PettyCashFund, PettyCashReturn } from "@/redux/services/finance/ops-types";
import { exitedTitle } from "@/components/finance-ui/exited-person";
import { P } from "../../../permissions";
import { useDates } from "../../../lib/display-prefs";
import { VoidReturnDialog } from "./petty-cash-return-drawers";
import { ListPeriodSelect, listPeriodArg, useListPeriod, type ListPeriodView } from "@/components/finance-ui/list-period";
import { branchQueryArg, inBranch, rowBranchName, type PettyCashBranch } from "./petty-cash-branch";
import { PETTY_CASH_RETURN, returnVoidable, voidBlocker } from "./petty-cash-returns";
import { RETURNED_HINT, SENT_BACK_FILTER, SENT_BACK_WORD, sentBackPill, statusFilterArgs } from "@/components/finance-ui/returned-correction";
import { ResumeButton, ReturnedNote, useFinanceReturned } from "@/components/finance-ui/returned-note";

/** The page size the list asks for: the server's ceiling. */
const RETURNS_PAGE = 100;

const ALL_YEARS: ListPeriodView = { kind: "all" };

/** A return's kind, in the words the fund screens use. */
export function returnKindLabel(ret: Pick<PettyCashReturn, "kind">): string {
  return ret.kind === "CLOSE" ? "Fund closed" : "Float reduced";
}

/** The count difference of a return, signed and worded, or a dash. */
function Difference({ ret, currency }: { ret: PettyCashReturn; currency?: string | null }) {
  if (ret.shortage) return <span className="tabular-nums text-destructive">{formatMoney(ret.shortage, currency)} short</span>;
  if (ret.overage) return <span className="tabular-nums text-green-01">{formatMoney(ret.overage, currency)} over</span>;
  return <span className="text-gray-05">-</span>;
}

export function PettyCashReturnsList({ entity, currency, funds, view }: {
  entity: string; currency?: string | null; funds: PettyCashFund[]; view: PettyCashBranch;
}) {
  const dates = useDates();
  const access = useFieldAccess(PETTY_CASH_RETURN);
  const showStatus = !access.isHidden("status");
  const periodReadable = !access.isHidden("return_date");
  const period = useListPeriod();
  const [fundFilter, setFundFilter] = useState("");
  // Returns have no status filter: the one choice is all of them, or those sent back.
  const [approval, setApproval] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading, isError, refetch } = useGetPettyCashReturnsQuery({
    entity, page_size: RETURNS_PAGE,
    ...branchQueryArg(view),
    ...(fundFilter ? { fund: Number(fundFilter) } : {}),
    ...(showStatus ? statusFilterArgs(approval) : {}),
    ...listPeriodArg(periodReadable ? period.view : ALL_YEARS),
  });
  const all = useMemo(() => toArray(data?.data), [data]);
  const total = data?.pagination?.totalItems ?? all.length;
  const fundOptions = useMemo(() => inBranch(funds, view), [funds, view]);
  const open = openId != null ? all.find((r) => r.id === openId) : undefined;

  const shown = (name: string) => !access.isHidden(name);
  const cols: Column<PettyCashReturn>[] = [
    { header: "Return no.", cell: (r: PettyCashReturn) => <span className="font-semibold tabular-nums">{r.document_number}</span> },
    { header: "Fund", cell: (r: PettyCashReturn) => r.fund_name },
    ...(view.showBranch ? [{ header: "Branch", cell: (r: PettyCashReturn) => rowBranchName(view, r) }] : []),
    ...(shown("kind_label") ? [{ header: "Kind", cell: (r: PettyCashReturn) => returnKindLabel(r) }] : []),
    ...(shown("return_date") ? [{ header: "Date", cell: (r: PettyCashReturn) => <span className="tabular-nums text-gray-05">{dates.day(r.return_date)}</span> }] : []),
    ...(shown("amount") ? [{ header: "Banked", align: "right" as const, cell: (r: PettyCashReturn) => <span className="tabular-nums">{formatMoney(r.amount, currency)}</span> }] : []),
    ...(shown("difference") ? [{ header: "Difference", align: "right" as const, cell: (r: PettyCashReturn) => <Difference ret={r} currency={currency} /> }] : []),
    ...(showStatus ? [{ header: "Status", cell: (r: PettyCashReturn) => <StatusPill {...sentBackPill(r, r.status, undefined, true)} /> }] : []),
  ];

  return (
    <div className="space-y-3" data-guide="finance-petty-cash.returns">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <NativeSelect value={fundFilter} onChange={(e) => setFundFilter(e.target.value)} aria-label="Fund" className="h-9">
            <option value="">All funds</option>
            {fundOptions.map((f) => <option key={f.id} value={String(f.id)}>{f.name}</option>)}
          </NativeSelect>
        </div>
        {showStatus ? (
          <div className="w-full sm:w-48">
            <NativeSelect value={approval} onChange={(e) => setApproval(e.target.value)} aria-label="Status" className="h-9">
              <option value="">All statuses</option>
              <option value={SENT_BACK_FILTER}>{SENT_BACK_WORD}</option>
            </NativeSelect>
          </div>
        ) : null}
        {periodReadable ? (
          <ListPeriodSelect entity={entity} view={period.view} onYear={period.chooseYear} onRange={period.chooseRange} />
        ) : null}
        {total > all.length ? <span className="font-mont text-[11px] text-gray-05">Showing the latest {all.length} of {total}.</span> : null}
      </div>
      <DataTable
        columns={cols} rows={all} rowKey={(r) => r.id} loading={isLoading} error={isError} onRetry={refetch}
        onRowClick={(r) => setOpenId(r.id)}
        emptyTitle="No returns yet" emptyMessage="Reduce a float or close a fund to bank its cash."
      />
      {open ? (
        <FundReturnDrawer ret={open} entity={entity} currency={currency} view={view} funds={funds} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
}

/** A person on a return by name, saying so when they have left the school. */
function Person({ name, exited }: { name?: string | null; exited?: boolean | null }) {
  if (!name) return <>-</>;
  return <span title={exitedTitle(exited)}>{name}{exited ? <span className="text-gray-05"> (left)</span> : null}</span>;
}

/**
 * A return in full beside every return of its fund, so Void names a later
 * return of the same fund before the server would refuse it, including one the
 * list's filters leave off screen. A return with no fund is shown alone: its
 * siblings cannot be told apart, and the server refuses to filter by it.
 */
function FundReturnDrawer({ ret, entity, currency, view, funds, onClose }: {
  ret: PettyCashReturn; entity: string; currency?: string | null; view: PettyCashBranch;
  funds: PettyCashFund[]; onClose: () => void;
}) {
  const siblings = useGetPettyCashReturnsQuery(ret.fund_id != null ? { entity, fund: ret.fund_id, page_size: RETURNS_PAGE } : skipToken);
  return (
    <ReturnDetailDrawer
      ret={ret} entity={entity} currency={currency} view={view}
      fund={funds.find((f) => f.id === ret.fund_id)} returns={toArray(siblings.data?.data)}
      onClose={onClose}
    />
  );
}

/**
 * A return opened from a link, read on its own so it opens whichever fund or
 * branch the page shows.
 */
export function LinkedReturnDrawer({ id, entity, currency, view, funds, onClose }: {
  id: number; entity: string; currency?: string | null; view: PettyCashBranch;
  funds: PettyCashFund[]; onClose: () => void;
}) {
  const { data } = useGetPettyCashReturnQuery({ id, entity });
  const ret = data?.data;
  if (!ret) return null;
  return <FundReturnDrawer ret={ret} entity={entity} currency={currency} view={view} funds={funds} onClose={onClose} />;
}

/** One return in full, with Void for a holder of the reverse key. */
export function ReturnDetailDrawer({ ret: row, entity, currency, view, fund, returns, onClose }: {
  ret: PettyCashReturn; entity: string; currency?: string | null; view: PettyCashBranch;
  fund?: PettyCashFund; returns: PettyCashReturn[]; onClose: () => void;
}) {
  const dates = useDates();
  const { can } = useCan();
  const { data } = useGetPettyCashReturnQuery({ id: row.id, entity });
  const ret = data?.data ?? row;
  const access = useFieldAccess(PETTY_CASH_RETURN, ret);
  const shown = (name: string) => !access.isHidden(name);
  // No edit route: a return sent back is resumed as it is, or withdrawn to change it.
  const { standing, request, workflowId, requestNamed } = useFinanceReturned(ret);
  const [confirming, setConfirming] = useState(false);
  const [voidReturn, { isLoading }] = useVoidPettyCashReturnMutation();
  const money = (kobo: number) => formatMoney(kobo, currency);
  const blocker = voidBlocker(ret, { returns, fund, currency });
  // A reader who cannot see the status is offered Void and the server decides.
  const canVoid = can(P.FIN_REVERSE_PETTY_CASH) && (!shown("status") || returnVoidable(ret));

  const doVoid = async () => {
    try {
      const res = await voidReturn({ id: ret.id, entity }).unwrap();
      toast.success(res.message || "Return voided.");
      setConfirming(false);
      onClose();
    } catch { /* central */ }
  };

  const facts: [string, React.ReactNode][] = [];
  const add = (name: string, label: string, value: React.ReactNode) => { if (shown(name)) facts.push([label, value]); };
  add("kind_label", "Kind", returnKindLabel(ret));
  facts.push(["Fund", ret.fund_name]);
  if (view.applies) facts.push(["Branch", rowBranchName(view, ret)]);
  add("return_date", "Date", dates.day(ret.return_date));
  add("counted_amount", "Counted", money(ret.counted_amount));
  add("book_balance", "Books said", money(ret.book_balance));
  add("difference", "Difference", <Difference key="d" ret={ret} currency={currency} />);
  if (ret.difference_reason) add("difference_reason", "Why it differs", ret.difference_reason);
  add("amount", "Banked", money(ret.amount));
  add("bank_account_name", "Into", ret.bank_account_name || "-");
  add("cash_left", "Tin kept", money(ret.cash_left));
  if (shown("previous_float_amount") && shown("new_float_amount")) {
    facts.push(["Float", `${money(ret.previous_float_amount)} to ${money(ret.new_float_amount)}`]);
  } else {
    add("previous_float_amount", "Float before", money(ret.previous_float_amount));
    add("new_float_amount", "Float after", money(ret.new_float_amount));
  }
  add("counted_by_name", "Counted by", <Person key="counted" name={ret.counted_by_name} exited={ret.counted_by_is_exited} />);
  add("created_by_name", "Raised by", <Person key="raised" name={ret.created_by_name} exited={ret.created_by_is_exited} />);
  if (ret.reference) add("reference", "Reference", ret.reference);
  if (ret.narration) add("narration", "Note", ret.narration);
  const description = [
    shown("kind_label") ? returnKindLabel(ret) : null,
    ret.fund_name,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <DetailDrawer
        open onOpenChange={(o) => (o ? undefined : onClose())}
        title={ret.document_number} description={description || undefined}
        widthClass="sm:max-w-lg"
        footer={standing === "sender" ? (
          <ResumeButton workflowId={workflowId} tags={["FinancePettyCash"]} onResumed={onClose} />
        ) : canVoid ? (
          <Button variant="outline" onClick={() => setConfirming(true)} className="gap-1.5 text-destructive hover:text-destructive">
            <Ban className="size-4" /> {shown("status") && ret.status === "DRAFT" ? "Cancel return" : "Void"}
          </Button>
        ) : undefined}
      >
        <div className="space-y-4">
          {shown("status") ? <StatusPill {...sentBackPill(ret, ret.status, undefined, true)} /> : null}
          <ReturnedNote standing={standing} request={request} requestNamed={requestNamed} senderHint={RETURNED_HINT.resumeOrCancel} />
          {ret.status === "PENDING_APPROVAL" ? (
            <p className="font-mont text-xs text-gray-05">Waiting for a second person under the school's approval route. It reaches the books once approved.</p>
          ) : null}
          {facts.length ? (
            <dl className="divide-y divide-white-02 rounded-md bg-white font-mont text-sm ring-1 ring-white-02">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 px-3 py-2">
                  <dt className="shrink-0 text-xs text-gray-05">{label}</dt>
                  <dd className="min-w-0 text-right tabular-nums text-black-01">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </DetailDrawer>
      {confirming ? (
        <VoidReturnDialog ret={ret} blocker={blocker} loading={isLoading} onClose={() => setConfirming(false)} onVoid={doVoid} />
      ) : null}
    </>
  );
}
