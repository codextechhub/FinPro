// Bank Reconciliation (§6.5) - an account-scoped reconciliation workbench, built
// to the Vision prototype in the house theme: KPIs (statement / book / difference
// / match progress), a two-column matcher (unmatched bank statement lines vs
// unmatched book/GL lines - click one of each and Match), in-line adjusting
// entries, a matched-lines table, Auto-match, Complete reconciliation and a
// printable reconciliation report.
//
// Honest adaptations: the prototype's drag-drop is click-both-then-Match (it
// offers this itself); "SUGGESTED / auto-create" AI hints become simple
// equal-amount candidate highlighting; we reconcile the account's whole
// unmatched set rather than a single uploaded statement file.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, RefreshCw, CheckCircle2, Printer, FilePlus2, Unlink, Check, EyeOff, RotateCcw } from "lucide-react";
import { FinanceShell } from "./finance-shell";
import { DetailDrawer, FormField, AccountPicker, InfoHint, PostingDateField, usePostingWindow, useActiveEntity, toArray } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { EmptyState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { bookingDateFor } from "@/utils/posting-window";
import { P } from "@/permissions";
import {
  useGetBankAccountsQuery, useGetBankAccountQuery, useGetStatementLinesQuery,
  useGetBookLinesQuery, useAutoReconcileMutation, useMatchStatementLineMutation,
  useAdjustStatementLineMutation, useUnmatchStatementLineMutation, useCompleteReconciliationMutation,
  useIgnoreStatementLineMutation, useGroupMatchStatementLineMutation, useSplitMatchLineMutation,
} from "@/redux/services/finance/ops-api";
import type { BankAccount, BankStatementLine } from "@/redux/services/finance/ops-types";
import { PageShell } from "@/components/layout/page-shell";

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "-");
const signedCls = (kobo: number) => (kobo < 0 ? "text-destructive" : "text-green-01");

function Kpi({ label, value, danger, children }: { label: string; value: string; danger?: boolean; children?: React.ReactNode }) {
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="font-mont text-xs text-gray-05">{label}</p>
      <p className={cn("mt-1 font-mont text-xl font-semibold tabular-nums", danger ? "text-destructive" : "text-black-01")}>{value}</p>
      {children}
    </div>
  );
}

export default function BankReconciliationPage() {
  const { code: entity, currency } = useActiveEntity();
  const { data: listData } = useGetBankAccountsQuery({ entity: entity! }, { skip: !entity });
  const accounts = useMemo(() => toArray(listData?.data), [listData]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const account = useMemo<BankAccount | undefined>(() => {
    if (accountId != null) return accounts.find((a) => a.id === accountId);
    return accounts.find((a) => a.is_primary) ?? accounts[0];
  }, [accounts, accountId]);

  if (!entity) {
    return <FinanceShell><PageShell><EmptyState title="Select an entity" /></PageShell></FinanceShell>;
  }

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide="finance-bank-reconciliation.workspace">
        <div className="flex flex-wrap items-end justify-between gap-3" data-guide="finance-bank-reconciliation.scope">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">Bank Reconciliation</h1>
              <InfoHint ariaLabel="About bank reconciliation">Reconciliation proves the GL matches reality. Auto-match pairs lines by amount and date; the rest need your eye - bank charges not yet booked, payments in transit. Click an unmatched bank line and a book line, then Match; raise an adjusting entry for charges/interest the books are missing.</InfoHint>
            </div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">Match the bank statement to the ledger, account by account.</p>
          </div>
          {accounts.length > 0 ? (
            <select
              value={account?.id ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}
              className="h-9 rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? " · Primary" : ""}</option>)}
            </select>
          ) : null}
        </div>

        {!account ? (
          <EmptyState title="No bank accounts" message="Add a bank account to reconcile." />
        ) : (
          <Workbench key={account.id} account={account} entity={entity} currency={currency} />
        )}
      </PageShell>
    </FinanceShell>
  );
}

function Workbench({ account, entity, currency }: { account: BankAccount; entity: string; currency?: string | null }) {
  const { can } = useCan();
  // Both columns are multi-select; the selection shape decides the match kind:
  //   1 bank + 1 book (equal)      → 1:1 match
  //   1 bank + N books (sum)       → group match (many-to-one)
  //   N banks + 1 book (sum)       → split match (one-to-many)
  const [selBanks, setSelBanks] = useState<number[]>([]);
  const [selBooks, setSelBooks] = useState<number[]>([]);
  const [adjusting, setAdjusting] = useState(false);
  const [viewing, setViewing] = useState<BankStatementLine | null>(null);
  const [bookPage, setBookPage] = useState(1);

  const { data: detailData } = useGetBankAccountQuery({ id: account.id, entity });
  const detail = detailData?.data;
  const { data: linesData } = useGetStatementLinesQuery({ id: account.id, entity });
  const { data: bookData } = useGetBookLinesQuery({ id: account.id, entity, page: bookPage });
  const allLines = useMemo(() => toArray(linesData?.data), [linesData]);
  const bookLines = useMemo(() => toArray(bookData?.data), [bookData]);
  const bookPg = bookData?.pagination;
  const unmatched = allLines.filter((l) => l.status === "UNMATCHED");
  const matched = allLines.filter((l) => l.status === "MATCHED");
  const ignored = allLines.filter((l) => l.status === "IGNORED");

  const [match, { isLoading: matching }] = useMatchStatementLineMutation();
  const [autoReconcile, { isLoading: autoing }] = useAutoReconcileMutation();
  const [complete, { isLoading: completing }] = useCompleteReconciliationMutation();
  const [unmatch, { isLoading: unmatching }] = useUnmatchStatementLineMutation();
  const [setIgnored, { isLoading: ignoringBusy }] = useIgnoreStatementLineMutation();
  const [groupMatch, { isLoading: groupMatching }] = useGroupMatchStatementLineMutation();
  const [splitMatch, { isLoading: splitMatching }] = useSplitMatchLineMutation();

  const doUnmatch = async (id: number) => {
    try {
      await unmatch({ id, entity }).unwrap();
      toast.success("Line unmatched.");
      setViewing(null);
    } catch { /* central */ }
  };
  const doIgnore = async (id: number, ignore: boolean) => {
    try {
      await setIgnored({ id, entity, ignored: ignore }).unwrap();
      toast.success(ignore ? "Line ignored." : "Line restored.");
      setSelBanks((s) => s.filter((x) => x !== id));
    } catch { /* central */ }
  };

  const book = detail?.metrics.book_balance ?? account.book_balance;
  const statement = detail?.metrics.statement_balance ?? 0;
  const difference = book - statement;
  const totalLines = matched.length + unmatched.length;
  const progress = totalLines ? Math.round((matched.length / totalLines) * 100) : 0;

  const selBankLines = unmatched.filter((l) => selBanks.includes(l.id));
  const selBookLines = bookLines.filter((b) => selBooks.includes(b.id));
  const bankSum = selBankLines.reduce((s, l) => s + l.amount, 0);
  const bookSum = selBookLines.reduce((s, b) => s + b.amount, 0);
  // A single selected bank line - the target for adjusting-entry / ignore actions.
  const soleBank = selBanks.length === 1 ? selBankLines[0] ?? null : null;
  const toggleBank = (id: number) => setSelBanks((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleBook = (id: number) => setSelBooks((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // The selection shape decides the match kind; all three need the two sides to sum equal.
  const totalsEqual = selBankLines.length >= 1 && selBookLines.length >= 1 && bankSum === bookSum;
  const kind: "match" | "group" | "split" | null =
    !totalsEqual ? null
      : selBanks.length === 1 && selBooks.length === 1 ? "match"
        : selBanks.length === 1 && selBooks.length >= 2 ? "group"
          : selBanks.length >= 2 && selBooks.length === 1 ? "split"
            : null;              // N-banks × N-books is ambiguous - not supported
  const canMatch = kind !== null;
  const matchBusy = matching || groupMatching || splitMatching;
  const mismatch = selBankLines.length >= 1 && selBookLines.length >= 1 && !canMatch;

  const doMatch = async () => {
    if (!canMatch) return;
    try {
      if (kind === "match") {
        await match({ id: selBanks[0], entity, journal_line: selBooks[0] }).unwrap();
        toast.success("Lines matched.");
      } else if (kind === "group") {
        await groupMatch({ id: selBanks[0], entity, journal_lines: selBooks }).unwrap();
        toast.success(`Grouped ${selBooks.length} book lines to the statement line.`);
      } else {
        await splitMatch({ id: account.id, entity, journal_line: selBooks[0], statement_lines: selBanks }).unwrap();
        toast.success(`Split one book line across ${selBanks.length} statement lines.`);
      }
      setSelBanks([]); setSelBooks([]);
    } catch { /* central (e.g. amount mismatch) */ }
  };
  const doAuto = async () => {
    try { const r = await autoReconcile({ id: account.id, entity }).unwrap(); toast.success(r.message || "Auto-match complete."); } catch { /* central */ }
  };
  const doComplete = async () => {
    try { const r = await complete({ id: account.id, entity }).unwrap(); toast.success(r.message || "Reconciliation recorded."); } catch { /* central */ }
  };

  return (
    <div className="space-y-4" data-guide="finance-bank-reconciliation.workbench">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mont text-xs text-gray-05">{account.bank_name || "-"} · {account.gl_account}{detail?.statements?.[0]?.period_label ? ` · ${detail.statements[0].period_label}` : ""}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => printReport({ account, currency, book, statement, difference, matched, unmatched })} className="gap-1.5"><Printer className="size-4" /> Reconciliation report</Button>
          <Can permission={P.FIN_RECONCILE_BANK}>
            <Button onClick={doComplete} disabled={completing} className="gap-1.5"><CheckCircle2 className="size-4" />{completing ? "Saving…" : "Complete reconciliation"}</Button>
          </Can>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-bank-reconciliation.balances">
        <Kpi label="Statement balance" value={formatMoney(statement, currency)} />
        <Kpi label="Book balance" value={formatMoney(book, currency)} />
        <Kpi label="Difference" value={formatMoney(difference, currency)} danger={difference !== 0} />
        <Kpi label="Match progress" value={`${matched.length} / ${totalLines}`}>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-03">
            <div className="h-full rounded-full bg-green-01" style={{ width: `${progress}%` }} />
          </div>
        </Kpi>
      </div>

      {difference !== 0 ? (
        <div className="rounded-md bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
          <p className="font-mont text-xs font-semibold text-amber-900">Unreconciled difference: {formatMoney(difference, currency)}</p>
          <p className="mt-0.5 font-mont text-[11px] text-amber-900/80">Match the remaining lines, or raise adjusting entries for bank charges / interest the books don't yet know about.</p>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2" data-guide="finance-bank-reconciliation.matching">
        {/* Bank statement unmatched */}
        <Column title="Bank statement (unmatched)" count={`${unmatched.length} of ${totalLines}`}>
          {unmatched.length === 0 ? <ColEmpty msg="Every statement line is matched." /> : unmatched.map((l) => {
            const candidate = soleBank == null && selBookLines.length >= 1 && l.amount === bookSum;
            return (
              <LineCard key={l.id} selected={selBanks.includes(l.id)} candidate={candidate}
                onClick={() => toggleBank(l.id)}
                title={l.description || "-"} sub={`${l.txn_date}${l.reference ? ` · ${l.reference}` : ""}`}
                amount={l.amount} currency={currency} />
            );
          })}
        </Column>

        {/* Book entries unmatched (server-paginated) */}
        <Column title="Book entries (unmatched)" count={`${bookLines.length} of ${bookPg?.totalItems ?? bookLines.length}`}
          footer={bookPg && bookPg.totalPages > 1 ? <Pager pg={bookPg} onPage={setBookPage} /> : undefined}>
          {bookLines.length === 0 ? <ColEmpty msg="No unmatched book entries." /> : bookLines.map((b) => {
            const candidate = soleBank != null && b.amount === soleBank.amount;
            return (
              <LineCard key={b.id} selected={selBooks.includes(b.id)} candidate={candidate}
                onClick={() => toggleBook(b.id)}
                title={b.description} sub={`${b.date}${b.reference ? ` · ${b.reference}` : ""}`}
                amount={b.amount} currency={currency} />
            );
          })}
        </Column>
      </div>

      <Can permission={P.FIN_RECONCILE_BANK}>
        <div className="flex flex-wrap items-center gap-2" data-guide="finance-bank-reconciliation.exceptions">
          <Button onClick={doMatch} disabled={!canMatch || matchBusy} className="gap-1.5"><Link2 className="size-4" />{matchBusy ? "Matching…" : selBanks.length >= 2 && selBooks.length === 1 ? `Split match (${selBanks.length})` : selBanks.length === 1 && selBooks.length >= 2 ? `Match group (${selBooks.length})` : "Match selected"}</Button>
          <Button variant="outline" onClick={() => setAdjusting(true)} disabled={soleBank == null} className="gap-1.5"><FilePlus2 className="size-4" /> Add adjusting entry</Button>
          <Button variant="outline" onClick={() => soleBank && doIgnore(soleBank.id, true)} disabled={soleBank == null || ignoringBusy} className="gap-1.5"><EyeOff className="size-4" /> Ignore line</Button>
          <Button variant="outline" onClick={doAuto} disabled={autoing} className="gap-1.5"><RefreshCw className="size-4" />{autoing ? "Matching…" : "Auto-match"}</Button>
          {mismatch ? (
            <span className="font-mont text-[11px] text-destructive">Bank total {formatMoney(bankSum, currency)} vs book total {formatMoney(bookSum, currency)} - match one-to-one, one bank line to several books, or several bank lines to one book, with equal totals.</span>
          ) : selBankLines.length || selBookLines.length ? (
            <span className="font-mont text-[11px] text-gray-05">Selected: {selBanks.length} bank · {selBooks.length} book - totals must be equal to match. Adjusting entry / ignore act on a single selected bank line.</span>
          ) : (
            <span className="font-mont text-[11px] text-gray-05">Select bank + book lines that sum to the same total, then Match. One line each side, or many-to-one either way.</span>
          )}
        </div>
      </Can>

      <div>
        <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Matched lines · {matched.length} pair(s)</p>
        {matched.length === 0 ? <ColEmpty msg="Matched pairs will appear here." /> : (
          <div className="overflow-hidden rounded-md border border-white-02">
            <table className="w-full border-collapse">
              <thead><tr>
                <th className={th}>Date</th><th className={th}>Bank statement</th>
                <th className={cn(th, "text-right")}>Amount</th><th className={th}>Book entry / JE</th>
                <th className={th}>Source</th><th className={cn(th, "text-right")} />
              </tr></thead>
              <tbody>
                {matched.map((l) => (
                  <tr key={l.id} onClick={() => setViewing(l)} className="cursor-pointer hover:bg-gray-03/40">
                    <td className={cn(td, "tabular-nums text-gray-05")}>{l.txn_date}</td>
                    <td className={td}>{l.description || "-"}</td>
                    <td className={cn(td, "text-right tabular-nums", signedCls(l.amount))}>{formatMoney(l.amount, currency)}</td>
                    <td className={cn(td, "tabular-nums text-gray-05")}>{l.matched_reference || (l.adjusting_journal_id ? "Adjusting entry" : "-")}</td>
                    <td className={td}><SourcePill line={l} /></td>
                    <td className={cn(td, "text-right")}>
                      <Can permission={P.FIN_RECONCILE_BANK}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); doUnmatch(l.id); }} disabled={unmatching}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 font-mont text-[11px] text-gray-05 hover:bg-destructive/5 hover:text-destructive disabled:opacity-40">
                          <Unlink className="size-3.5" /> Unmatch
                        </button>
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ignored.length > 0 && (
        <div>
          <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Ignored lines · {ignored.length}</p>
          <div className="overflow-hidden rounded-md border border-white-02">
            <table className="w-full border-collapse">
              <thead><tr>
                <th className={th}>Date</th><th className={th}>Bank statement</th>
                <th className={cn(th, "text-right")}>Amount</th><th className={cn(th, "text-right")} />
              </tr></thead>
              <tbody>
                {ignored.map((l) => (
                  <tr key={l.id}>
                    <td className={cn(td, "tabular-nums text-gray-05")}>{l.txn_date}</td>
                    <td className={td}>{l.description || "-"}</td>
                    <td className={cn(td, "text-right tabular-nums", signedCls(l.amount))}>{formatMoney(l.amount, currency)}</td>
                    <td className={cn(td, "text-right")}>
                      <Can permission={P.FIN_RECONCILE_BANK}>
                        <button type="button" onClick={() => doIgnore(l.id, false)} disabled={ignoringBusy}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 font-mont text-[11px] text-gray-05 hover:bg-primary/5 hover:text-primary disabled:opacity-40">
                          <RotateCcw className="size-3.5" /> Restore
                        </button>
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 font-mont text-[11px] text-gray-05">Ignored lines carry no ledger effect and don't block reconciliation (known duplicates or opening-balance lines).</p>
        </div>
      )}

      {adjusting && soleBank ? (
        <AdjustDrawer line={soleBank} entity={entity} currency={currency} onClose={() => setAdjusting(false)} onDone={() => { setAdjusting(false); setSelBanks([]); }} />
      ) : null}
      <MatchedLineDrawer line={viewing} currency={currency} onClose={() => setViewing(null)}
        onUnmatch={(id) => doUnmatch(id)} canUnmatch={can(P.FIN_RECONCILE_BANK)} unmatching={unmatching} />
    </div>
  );
}

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
function SourcePill({ line }: { line: BankStatementLine }) {
  const cls = line.match_source === "AUTO" ? "bg-blue-50 text-blue-700"
    : line.match_source === "ADJUSTMENT" ? "bg-amber-50 text-amber-700"
    : "bg-gray-03/60 text-gray-05";
  return <span className={cn(PILL, cls)}>{line.match_source_display || "Manual"}</span>;
}

function MatchedLineDrawer({ line, currency, onClose, onUnmatch, canUnmatch, unmatching }: {
  line: BankStatementLine | null; currency?: string | null; onClose: () => void;
  onUnmatch: (id: number) => void; canUnmatch: boolean; unmatching: boolean;
}) {
  if (!line) return null;
  const isAdjustment = line.match_source === "ADJUSTMENT";
  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Matched line" description={line.matched_reference ? `Paired with ${line.matched_reference}` : "Reconciled statement line"}
      widthClass="sm:max-w-lg"
      footer={canUnmatch ? (
        <Button variant="outline" disabled={unmatching} onClick={() => onUnmatch(line.id)} className="gap-1.5">
          <Unlink className="size-4" />{unmatching ? "Unmatching…" : "Unmatch"}
        </Button>
      ) : undefined}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <ReconField label="Statement date">{line.txn_date}</ReconField>
          <ReconField label="Amount"><span className={signedCls(line.amount)}>{formatMoney(line.amount, currency)}</span></ReconField>
          <ReconField label="Description">{line.description || "-"}</ReconField>
          <ReconField label="Reference">{line.reference || "-"}</ReconField>
          <ReconField label="Book entry / JE">{line.matched_reference || (isAdjustment ? "Adjusting entry" : "-")}</ReconField>
          <ReconField label="Matched">{line.match_source_display || "Manual"}{line.reconciled_at ? ` · ${fmtDate(line.reconciled_at)}` : ""}</ReconField>
        </div>
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          {isAdjustment
            ? "This line was booked via an adjusting journal. Unmatching reverses that journal (a mirror entry that nets to zero) and returns the line to unmatched."
            : "Unmatching drops the pairing and returns the line to the unmatched column - no ledger effect."}
        </p>
      </div>
    </DetailDrawer>
  );
}

const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const td = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

function ReconField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="font-mont text-[11px] text-gray-05">{label}</p><p className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{children}</p></div>;
}

function Column({ title, count, children, footer }: { title: string; count: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-white-02 bg-white">
      <div className="flex items-center justify-between border-b border-white-02 bg-[#F7F7F7] px-3.5 py-2.5">
        <p className="font-mont text-xs font-semibold text-gray-01">{title}</p>
        <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 font-mont text-[11px] font-medium text-gray-05 ring-1 ring-white-02">{count}</span>
      </div>
      {/* Fill the viewport but cap it, so a long reconciliation scrolls inside
          the box rather than pushing the whole page down. */}
      <div className="min-h-[280px] max-h-[calc(100dvh-24rem)] divide-y divide-white-02 overflow-y-auto">{children}</div>
      {footer ? <div className="border-t border-white-02 px-3 py-2">{footer}</div> : null}
    </div>
  );
}

/** Compact prev/next pager for a server-paginated matcher column. */
function Pager({ pg, onPage }: { pg: { currentPage: number; totalPages: number }; onPage: (p: number) => void }) {
  const btn = "rounded px-2 py-1 font-mont text-[11px] font-semibold text-gray-05 hover:bg-gray-03/40 disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center justify-between">
      <span className="font-mont text-[11px] text-gray-05">Page {pg.currentPage} of {pg.totalPages}</span>
      <div className="flex gap-1">
        <button type="button" className={btn} disabled={pg.currentPage <= 1} onClick={() => onPage(pg.currentPage - 1)}>Prev</button>
        <button type="button" className={btn} disabled={pg.currentPage >= pg.totalPages} onClick={() => onPage(pg.currentPage + 1)}>Next</button>
      </div>
    </div>
  );
}
function ColEmpty({ msg }: { msg: string }) {
  return <p className="px-3 py-10 text-center font-mont text-[11px] text-gray-05">{msg}</p>;
}
function LineCard({ title, sub, amount, currency, selected, candidate, onClick }: {
  title: string; sub: string; amount: number; currency?: string | null; selected?: boolean; candidate?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn("flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors",
        selected ? "bg-primary/[0.06]" : candidate ? "bg-green-01/[0.06]" : "hover:bg-gray-03/30")}>
      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
        selected ? "border-primary bg-primary text-white" : candidate ? "border-green-01" : "border-gray-05/40")}>
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mont text-sm font-medium text-black-01">{title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 font-mont text-[11px] tabular-nums text-gray-05">
          <span className="truncate">{sub}</span>
          {candidate ? <span className="shrink-0 rounded bg-green-01/10 px-1.5 py-0.5 font-medium text-green-01">same amount</span> : null}
        </p>
      </div>
      <span className={cn("shrink-0 font-mont text-sm font-semibold tabular-nums", signedCls(amount))}>{formatMoney(amount, currency)}</span>
    </button>
  );
}

function AdjustDrawer({ line, entity, currency, onClose, onDone }: {
  line: BankStatementLine; entity: string; currency?: string | null; onClose: () => void; onDone: () => void;
}) {
  const [counter, setCounter] = useState("");
  const [narration, setNarration] = useState(line.description || "");
  // Unlike the import, an adjustment posts - so it needs a date in an open period:
  // the line's own date when that month is still open, else the earliest open day
  // after it, which is the same date the server would choose. Defaulting to the
  // line's date unconditionally would show a date the field then rejects,
  // contradicting the notice that says it will be moved.
  //
  // `chosen` is null until the user picks a date, so the field simply DERIVES the
  // suggestion rather than seeding it from an effect - no cascading render, and
  // nothing to go stale. It stays empty while the posting window is still loading,
  // because the suggestion is not knowable yet. An explicit clear is respected:
  // "" is a choice, and only null falls back.
  const [chosen, setChosen] = useState<string | null>(null);
  const { ranges, isOpen, reasonFor, isLoading: windowLoading } = usePostingWindow(entity);
  const [adjust, { isLoading }] = useAdjustStatementLineMutation();

  const suggested = useMemo(
    () => (line.txn_date ? bookingDateFor(line.txn_date, ranges) : null),
    [line.txn_date, ranges],
  );
  const postingDate = chosen ?? (windowLoading ? "" : suggested ?? "");

  const lineDateClosed = Boolean(line.txn_date) && !windowLoading && !isOpen(line.txn_date);
  const deferred = Boolean(postingDate) && postingDate !== line.txn_date;

  const submit = async () => {
    try {
      await adjust({
        id: line.id, entity, counter_account: counter || undefined,
        narration: narration.trim() || undefined,
        posting_date: postingDate || undefined,
      }).unwrap();
      toast.success("Adjusting entry booked and matched.");
      onDone();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Add adjusting entry" description="Book what the statement reveals, then match this line."
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading} onClick={submit} className="gap-1.5"><FilePlus2 className="size-4" />{isLoading ? "Posting…" : "Post & match"}</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          Raises a journal against this statement line ({formatMoney(line.amount, currency)}, {line.amount < 0 ? "outflow" : "inflow"}) and the bank's GL cash account, then marks the line matched. Use for charges, interest, or errors the books don't have yet.
        </div>
        {lineDateClosed && (
          <p className="rounded-md bg-amber-50 px-3 py-2 font-mont text-[11px] text-amber-900 ring-1 ring-amber-200">
            This line is dated {line.txn_date}. {reasonFor(line.txn_date) ?? "That period is closed."} A closed period
            can’t be rewritten, so the entry books on the first open day after it - {line.txn_date} stays on the journal
            as the bank’s value date.
          </p>
        )}
        <FormField label="Counter account">
          <AccountPicker entity={entity} value={counter} onChange={setCounter} postableOnly placeholder="Defaults to 5500 Bank Charges" />
        </FormField>
        <PostingDateField
          label="Posting date" entity={entity} value={postingDate} onChange={setChosen}
          hint={deferred ? `Books in this period; ${line.txn_date} stays as the bank’s value date.` : undefined}
        />
        <FormField label="Narration">
          <textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={2}
            className="w-full rounded-md border border-white-02 bg-white px-3 py-2 font-mont text-sm" />
        </FormField>
      </div>
    </DetailDrawer>
  );
}

function printReport({ account, currency, book, statement, difference, matched, unmatched }: {
  account: BankAccount; currency?: string | null; book: number; statement: number; difference: number;
  matched: BankStatementLine[]; unmatched: BankStatementLine[];
}) {
  const money = (k: number) => formatMoney(k, currency);
  const row = (l: BankStatementLine) => `<tr><td>${l.txn_date}</td><td>${(l.description || "-")}</td><td style="text-align:right">${money(l.amount)}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bank reconciliation - ${account.name}</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;padding:32px;max-width:760px;margin:auto}
  h1{font-size:18px;margin:0 0 4px} .sub{color:#666;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:12px} th,td{border-bottom:1px solid #eee;padding:6px 8px;text-align:left}
  .cards{display:flex;gap:12px;margin-bottom:20px} .card{flex:1;border:1px solid #eee;border-radius:8px;padding:10px}
  .card .l{color:#666;font-size:11px} .card .v{font-size:16px;font-weight:600} .diff{color:${difference !== 0 ? "#c0392b" : "#1a1a1a"}}
  h3{font-size:13px;margin:16px 0 4px}</style></head><body>
  <h1>Bank reconciliation</h1>
  <div class="sub">${account.name} · ${account.bank_name || ""} · GL ${account.gl_account} · ${new Date().toLocaleDateString()}</div>
  <div class="cards">
    <div class="card"><div class="l">Statement balance</div><div class="v">${money(statement)}</div></div>
    <div class="card"><div class="l">Book balance</div><div class="v">${money(book)}</div></div>
    <div class="card"><div class="l">Difference</div><div class="v diff">${money(difference)}</div></div>
  </div>
  <h3>Matched lines (${matched.length})</h3>
  <table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>${matched.map(row).join("") || '<tr><td colspan="3">None</td></tr>'}</tbody></table>
  <h3>Unmatched lines (${unmatched.length})</h3>
  <table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>${unmatched.map(row).join("") || '<tr><td colspan="3">None</td></tr>'}</tbody></table>
  </body></html>`;
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) { toast.error("Pop-up blocked - allow pop-ups to print the report."); return; }
  w.document.write(html); w.document.close(); w.focus(); w.print();
}
