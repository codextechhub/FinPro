/**
 * Petty cash returns: every float reduction and closure, with its fund, its
 * branch where several are on screen, the cash banked, any count difference and
 * its status, and the detail behind each one.
 *
 * Void undoes a return. A posted one is reversed: the cash comes back on the
 * fund's books, the float is restored and a closed fund reopens. A draft left by
 * a rejected approval is cancelled. The server refuses a void while the bank line
 * is matched on a reconciliation, after a later return of the same fund, or once
 * the float has changed since; the dialog names the refusal it can already see
 * and lists the rest, and the central handler words any refusal that comes back.
 *
 * The list reads up to the latest 100 returns in the reader's reach, asking the
 * server for the branch shown (`?branch=`) and the fund picked. Each row names
 * its branch and its people as the server sent them.
 *
 * A link to one return (a journal's "Open return", `?document=<id>`) opens it
 * in `LinkedReturnDrawer`, whichever fund the page is on.
 */

import { useMemo, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { Ban } from "lucide-react";

import { DataTable, DetailDrawer, StatusPill, toArray, type Column } from "@/components/finance-ui";
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
import { branchQueryArg, inBranch, rowBranchName, type PettyCashBranch } from "./petty-cash-branch";
import { returnVoidable, voidBlocker } from "./petty-cash-returns";

/** The page size the list asks for: the server's ceiling. */
const RETURNS_PAGE = 100;

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
  const [fundFilter, setFundFilter] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading, isError, refetch } = useGetPettyCashReturnsQuery({
    entity, page_size: RETURNS_PAGE, ...branchQueryArg(view), ...(fundFilter ? { fund: Number(fundFilter) } : {}),
  });
  const all = useMemo(() => toArray(data?.data), [data]);
  const total = data?.pagination?.totalItems ?? all.length;
  const fundOptions = useMemo(() => inBranch(funds, view), [funds, view]);
  const open = openId != null ? all.find((r) => r.id === openId) : undefined;

  const cols: Column<PettyCashReturn>[] = [
    { header: "Return no.", cell: (r) => <span className="font-semibold tabular-nums">{r.document_number}</span> },
    { header: "Fund", cell: (r) => r.fund_name },
    ...(view.showBranch ? [{ header: "Branch", cell: (r: PettyCashReturn) => rowBranchName(view, r) }] : []),
    { header: "Kind", cell: (r) => returnKindLabel(r) },
    { header: "Date", cell: (r) => <span className="tabular-nums text-gray-05">{dates.day(r.return_date)}</span> },
    { header: "Banked", align: "right", cell: (r) => <span className="tabular-nums">{formatMoney(r.amount, currency)}</span> },
    { header: "Difference", align: "right", cell: (r) => <Difference ret={r} currency={currency} /> },
    { header: "Status", cell: (r) => <StatusPill status={r.status} /> },
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
        {total > all.length ? <span className="font-mont text-[11px] text-gray-05">Showing the latest {all.length} of {total}.</span> : null}
      </div>
      <DataTable
        columns={cols} rows={all} rowKey={(r) => r.id} loading={isLoading} error={isError} onRetry={refetch}
        onRowClick={(r) => setOpenId(r.id)}
        emptyTitle="No returns yet" emptyMessage="Reduce a float or close a fund to bank its cash."
      />
      {open ? (
        <ReturnDetailDrawer
          ret={open} entity={entity} currency={currency} view={view}
          fund={funds.find((f) => f.id === open.fund_id)} returns={all}
          onClose={() => setOpenId(null)}
        />
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
 * A return opened from a link, read on its own so it opens whichever fund or
 * branch the page shows. Its fund's other returns are read beside it, so Void
 * names a later return of the same fund before the server would refuse it.
 */
export function LinkedReturnDrawer({ id, entity, currency, view, funds, onClose }: {
  id: number; entity: string; currency?: string | null; view: PettyCashBranch;
  funds: PettyCashFund[]; onClose: () => void;
}) {
  const { data } = useGetPettyCashReturnQuery({ id, entity });
  const ret = data?.data;
  const siblings = useGetPettyCashReturnsQuery(ret ? { entity, fund: ret.fund_id, page_size: RETURNS_PAGE } : skipToken);
  if (!ret) return null;
  return (
    <ReturnDetailDrawer
      ret={ret} entity={entity} currency={currency} view={view}
      fund={funds.find((f) => f.id === ret.fund_id)} returns={toArray(siblings.data?.data)}
      onClose={onClose}
    />
  );
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
  const [confirming, setConfirming] = useState(false);
  const [voidReturn, { isLoading }] = useVoidPettyCashReturnMutation();
  const money = (kobo: number) => formatMoney(kobo, currency);
  const blocker = voidBlocker(ret, { returns, fund, currency });
  const canVoid = can(P.FIN_REVERSE_PETTY_CASH) && returnVoidable(ret);

  const doVoid = async () => {
    try {
      const res = await voidReturn({ id: ret.id, entity }).unwrap();
      toast.success(res.message || "Return voided.");
      setConfirming(false);
      onClose();
    } catch { /* central */ }
  };

  const facts: [string, React.ReactNode][] = [
    ["Kind", returnKindLabel(ret)],
    ["Fund", ret.fund_name],
    ...(view.applies ? [["Branch", rowBranchName(view, ret)] as [string, React.ReactNode]] : []),
    ["Date", dates.day(ret.return_date)],
    ["Counted", money(ret.counted_amount)],
    ["Books said", money(ret.book_balance)],
    ["Difference", <Difference key="d" ret={ret} currency={currency} />],
    ...(ret.difference_reason ? [["Why it differs", ret.difference_reason] as [string, React.ReactNode]] : []),
    ["Banked", money(ret.amount)],
    ["Into", ret.bank_account_name || "-"],
    ["Tin kept", money(ret.cash_left)],
    ["Float", `${money(ret.previous_float_amount)} to ${money(ret.new_float_amount)}`],
    ["Counted by", <Person key="counted" name={ret.counted_by_name} exited={ret.counted_by_is_exited} />],
    ["Raised by", <Person key="raised" name={ret.created_by_name} exited={ret.created_by_is_exited} />],
    ...(ret.reference ? [["Reference", ret.reference] as [string, React.ReactNode]] : []),
    ...(ret.narration ? [["Note", ret.narration] as [string, React.ReactNode]] : []),
  ];

  return (
    <>
      <DetailDrawer
        open onOpenChange={(o) => (o ? undefined : onClose())}
        title={ret.document_number} description={`${returnKindLabel(ret)} · ${ret.fund_name}`}
        widthClass="sm:max-w-lg"
        footer={canVoid ? (
          <Button variant="outline" onClick={() => setConfirming(true)} className="gap-1.5 text-destructive hover:text-destructive">
            <Ban className="size-4" /> {ret.status === "DRAFT" ? "Cancel return" : "Void"}
          </Button>
        ) : undefined}
      >
        <div className="space-y-4">
          <StatusPill status={ret.status} />
          {ret.status === "PENDING_APPROVAL" ? (
            <p className="font-mont text-xs text-gray-05">Waiting for a second person under the school's approval route. It reaches the books once approved.</p>
          ) : null}
          <dl className="divide-y divide-white-02 rounded-md bg-white font-mont text-sm ring-1 ring-white-02">
            {facts.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 px-3 py-2">
                <dt className="shrink-0 text-xs text-gray-05">{label}</dt>
                <dd className="min-w-0 text-right tabular-nums text-black-01">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </DetailDrawer>
      {confirming ? (
        <VoidReturnDialog ret={ret} blocker={blocker} loading={isLoading} onClose={() => setConfirming(false)} onVoid={doVoid} />
      ) : null}
    </>
  );
}
