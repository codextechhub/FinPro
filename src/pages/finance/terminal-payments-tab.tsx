/**
 * Terminal Payments: money paid at a branch terminal, and whose it is.
 *
 * Opens on the payments still waiting for a customer, with a switch to the
 * matched ones and to all of them. Each row gives the amount, when it was
 * paid, the payer's email and the sender's name, the branch (only at a school
 * with several), and why a waiting payment did not match by itself. Opening one
 * shows up to five suggested customers, each with the reason it was suggested
 * and a Match button, and a picker for anybody else; the picker asks the server
 * for the customers of the payment's own branch (and those every branch
 * shares), so a long list is narrowed before its first page, and drops any other
 * that arrives, because the server refuses it and says why, in words shown
 * beside the picker. A matched payment shows who matched it and when, and can be
 * unmatched, which voids the receipt that applied it.
 *
 * Keys: `payments.terminal_payment.view` to read, `.match` to match,
 * `.reverse` to unmatch. The payer, sender, matched customer and suggestions
 * are Field Access switches on `payments.terminal_payment`; a column or section
 * the role may not read is absent, with its header.
 */

import { useMemo, useState } from "react";
import { Link2, Undo2, UserCheck } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmActionModal, DataTable, DetailDrawer, FormField, Money, Segmented, toArray, useFieldAccess,
  type Column,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { SearchSelect } from "@/components/custom/search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { useGetCustomersQuery } from "@/redux/services/finance/ar-api";
import {
  useGetTerminalPaymentsQuery,
  useMatchTerminalPaymentMutation,
  useUnmatchTerminalPaymentMutation,
} from "@/redux/services/payments/payments-api";
import type { TerminalPayment, TerminalPaymentFilter } from "@/redux/services/payments/payments-types";
import { P } from "../../permissions";
import { refusalSentence } from "../../lib/api-errors";
import { useDates } from "../../lib/display-prefs";
import { ListBranchSelect, useListBranch } from "@/components/finance-ui/list-branch";
import {
  TERMINAL_FILTERS,
  customersForBranch,
  isUnmatched,
  matchedLine,
  senderLine,
  suggestionWords,
  terminalBranchArg,
  terminalBranchView,
  unmatchedReason,
} from "./terminal-payment-model";

const RESOURCE = "payments.terminal_payment";
const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";

export function TerminalPaymentsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const access = useFieldAccess(RESOURCE);
  const list = useListBranch();
  const view = useMemo(() => terminalBranchView(list.view), [list.view]);
  const [filter, setFilter] = useState<TerminalPaymentFilter>("UNMATCHED");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TerminalPayment | null>(null);

  const params = useMemo(
    () => ({ entity, page, status: filter, ...terminalBranchArg(view), ...(search ? { search } : {}) }),
    [entity, page, filter, view, search],
  );
  const { data, isLoading, isFetching, isError, refetch } = useGetTerminalPaymentsQuery(params);
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pagination = data?.pagination;

  /** A column the role may not read is absent from every row; with no rows the switches answer. */
  const shows = (key: keyof TerminalPayment) =>
    !access.isHidden(key as string) && (rows.length === 0 || rows.some((r) => r[key] !== undefined));

  const columns: Column<TerminalPayment>[] = [
    ...(shows("paid_at") ? [{ header: "Paid", cell: (p: TerminalPayment) => <span className="tabular-nums text-gray-05">{dates.dateTime(p.paid_at ?? p.created_at ?? "", p.branch ?? undefined)}</span> }] : []),
    ...(shows("amount") ? [{ header: "Amount", align: "right" as const, cell: (p: TerminalPayment) => <Money kobo={p.amount ?? 0} currency={currency} align="right" /> }] : []),
    ...(shows("payer_email") || shows("sender_name") ? [{ header: "Payer", cell: (p: TerminalPayment) => (
      <span className="min-w-0">
        {p.payer_email ? <span className="block truncate">{p.payer_email}</span> : null}
        {senderLine(p) ? <span className="block truncate font-mont text-[11px] text-gray-05">{senderLine(p)}</span> : null}
        {!p.payer_email && !senderLine(p) ? <span className="text-gray-05">-</span> : null}
      </span>
    ) }] : []),
    ...(view.showBranch ? [{ header: "Branch", cell: (p: TerminalPayment) => <span className="text-gray-05">{p.branch_name || "-"}</span> }] : []),
    { header: filter === "UNMATCHED" ? "Why it is waiting" : "Match", cell: (p: TerminalPayment) => (
      isUnmatched(p)
        ? <span className="block max-w-[320px] text-gray-01">{unmatchedReason(p)}</span>
        : <span className="block max-w-[320px] text-gray-01">{matchedLine(p)}</span>
    ) },
  ];

  const unmatchedLabel = filter === "UNMATCHED" && pagination?.totalItems != null ? `Unmatched (${pagination.totalItems})` : "Unmatched";

  return (
    <div className="space-y-4" data-guide="finance-terminal-payments.workbench">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={filter}
            onChange={(value) => { setFilter(value); setPage(1); }}
            options={TERMINAL_FILTERS.map(([value, label]) => [value, value === "UNMATCHED" ? unmatchedLabel : label] as const)}
          />
          <ListBranchSelect view={view} onChange={(next) => { setPage(1); list.choose(next); }} />
          {access.isHidden("reference") ? null : (
            <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
              placeholder="Search by payment reference" aria-label="Search by payment reference" className="h-9 w-full bg-white font-mont sm:w-64" />
          )}
        </div>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={(p) => p.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setSelected}
        page={pagination?.currentPage} totalPages={pagination?.totalPages} onPageChange={setPage}
        emptyTitle={filter === "UNMATCHED" ? "Nothing is waiting" : "No terminal payments"}
        emptyMessage={filter === "UNMATCHED"
          ? "Every payment made at a branch terminal has been matched to a customer."
          : "Payments made at a branch terminal appear here."}
      />

      {selected ? (
        <TerminalPaymentDrawer
          key={selected.id} payment={selected} entity={entity} currency={currency}
          showBranch={view.applies} onChange={setSelected} onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <div className="mt-1 break-words font-mont text-sm font-semibold text-black-01">{children}</div>
    </div>
  );
}

/**
 * One payment, with what can be done about it. `onChange` receives the payment
 * as the server returns it after a match or an unmatch, so the drawer shows the
 * new state without the list having to hold the row.
 */
export function TerminalPaymentDrawer({ payment, entity, currency, showBranch, onChange, onClose }: {
  payment: TerminalPayment;
  entity: string;
  currency?: string | null;
  showBranch: boolean;
  onChange: (next: TerminalPayment) => void;
  onClose: () => void;
}) {
  const dates = useDates();
  const { can } = useCan();
  const access = useFieldAccess(RESOURCE, payment);
  const customerAccess = useFieldAccess("finance.customer");
  const [match, { isLoading: matching }] = useMatchTerminalPaymentMutation();
  const [unmatch, { isLoading: unmatching }] = useUnmatchTerminalPaymentMutation();
  const [pickedCode, setPickedCode] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmUnmatch, setConfirmUnmatch] = useState(false);

  const waiting = isUnmatched(payment);
  const mayMatch = can(P.PAY_MATCH_TERMINAL_PAYMENT);
  const mayReverse = can(P.PAY_REVERSE_TERMINAL_PAYMENT);
  const term = useDebounce(customerSearch.trim(), 300);
  const customersQ = useGetCustomersQuery(
    { entity, page_size: 50, ...(payment.branch != null ? { branch: payment.branch } : {}), ...(term ? { search: term } : {}), ...(!customerAccess.isHidden("is_active") ? { is_active: "true" } : {}) },
    { skip: !waiting || !mayMatch },
  );
  const choices = useMemo(
    () => customersForBranch(toArray(customersQ.data?.data), payment.branch),
    [customersQ.data, payment.branch],
  );
  const present = (key: keyof TerminalPayment) => !access.isHidden(key as string) && payment[key] !== undefined;
  const suggestions = payment.suggestions;

  const doMatch = async (customer: string | number) => {
    setNotice(null);
    try {
      const res = await match({ id: payment.id, entity, customer }).unwrap();
      toast.success(res.message || "Payment matched.");
      onChange(res.data);
    } catch (error) {
      setNotice(refusalSentence(error));
    }
  };
  const doUnmatch = async () => {
    setNotice(null);
    try {
      const res = await unmatch({ id: payment.id, entity }).unwrap();
      toast.success(res.message || "Payment unmatched.");
      setConfirmUnmatch(false);
      onChange(res.data);
    } catch (error) {
      setNotice(refusalSentence(error));
      setConfirmUnmatch(false);
    }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title={present("amount") ? formatMoney(payment.amount ?? 0, currency) : "Terminal payment"}
      description={[present("reference") ? payment.reference : null, showBranch ? payment.branch_name : null].filter(Boolean).join(" · ") || undefined}
      widthClass="sm:max-w-xl"
      footer={!waiting && mayReverse ? (
        <Button variant="outline" onClick={() => setConfirmUnmatch(true)} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5">
          <Undo2 className="size-4" /> Unmatch
        </Button>
      ) : undefined}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {present("amount") ? <Fact label="Amount"><Money kobo={payment.amount ?? 0} currency={currency} /></Fact> : null}
          {present("paid_at") ? <Fact label="Paid">{dates.dateTime(payment.paid_at ?? payment.created_at ?? "", payment.branch ?? undefined)}</Fact> : null}
          {present("payer_email") ? <Fact label="Payer's email">{payment.payer_email || "-"}</Fact> : null}
          {present("sender_name") ? <Fact label="Sender">{senderLine(payment) || "-"}</Fact> : null}
          {present("terminal_name") ? <Fact label="Terminal">{payment.terminal_name}</Fact> : null}
          {present("provider_reference") && payment.provider_reference ? <Fact label="Provider reference">{payment.provider_reference}</Fact> : null}
        </div>

        {waiting ? (
          <>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-900">
              {unmatchedReason(payment)}
            </p>

            {suggestions !== undefined ? (
              <div className="space-y-2">
                <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Likely customers</p>
                {suggestions.length === 0 ? (
                  <p className="font-mont text-xs text-gray-05">No likely customer found. Choose one below.</p>
                ) : (
                  <ul className="divide-y divide-white-02 rounded-md border border-white-02" data-testid="suggestions">
                    {suggestions.slice(0, 5).map((s) => (
                      <li key={s.customer} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block font-mont text-sm font-semibold text-black-01">{s.name} <span className="font-normal text-gray-05">{s.code}</span></span>
                          <span className="block font-mont text-[11px] text-gray-05">
                            {suggestionWords(s.reasons)}{s.open_balance > 0 ? ` · owes ${formatMoney(s.open_balance, currency)}` : ""}
                          </span>
                        </span>
                        {mayMatch ? (
                          <Button size="sm" disabled={matching} onClick={() => doMatch(s.customer)} className="shrink-0 gap-1.5" aria-label={`Match to ${s.name}`}>
                            <UserCheck className="size-3.5" /> Match
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {mayMatch ? (
              <div className="space-y-2">
                <FormField label="Or choose another customer">
                  <SearchSelect
                    options={choices.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))}
                    value={pickedCode}
                    onChange={(e) => { setPickedCode(e.target.value); setNotice(null); }}
                    onSearchChange={setCustomerSearch}
                    loading={customersQ.isFetching}
                    placeholder={showBranch ? `Customers of ${payment.branch_name || "this branch"}` : "Search customers"}
                    revealOnSearch
                  />
                </FormField>
                <p className="font-mont text-[11px] text-gray-05">
                  {showBranch ? "Only customers of this payment's branch, and those every branch shares, can be chosen. " : ""}
                  A payment that differs from the bill is a part payment, applied to the oldest bills first.
                </p>
                <Button disabled={matching || !pickedCode} onClick={() => doMatch(pickedCode)} className="gap-1.5">
                  <Link2 className="size-4" />{matching ? "Matching…" : "Match to this customer"}
                </Button>
              </div>
            ) : (
              <p className="font-mont text-xs text-gray-05">You can read this payment but not match it.</p>
            )}
          </>
        ) : (
          <div className="space-y-2 rounded-md border border-white-02 bg-white p-4">
            <span className={cn(PILL, "bg-green-01/10 text-green-01")}>Matched</span>
            <p className="font-mont text-sm text-black-01">{matchedLine(payment)}</p>
            {present("matched_at") && payment.matched_at ? <p className="font-mont text-xs text-gray-05">{dates.dateTime(payment.matched_at, payment.branch ?? undefined)}</p> : null}
            {payment.receipt_id ? <p className="font-mont text-xs text-gray-05">Receipt #{payment.receipt_id}</p> : null}
            {!mayReverse ? <p className="font-mont text-xs text-gray-05">You can read this match but not undo it.</p> : null}
          </div>
        )}

        {notice ? <p role="alert" data-testid="terminal-payment-notice" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mont text-xs leading-5 text-destructive">{notice}</p> : null}
      </div>

      <ConfirmActionModal
        open={confirmUnmatch}
        onOpenChange={setConfirmUnmatch}
        title="Unmatch this payment?"
        description="The receipt that applied it to the customer is voided, so their bills are open again, and the payment goes back to the waiting list."
        confirmText="Unmatch"
        destructive
        loading={unmatching}
        onConfirm={doUnmatch}
      />
    </DetailDrawer>
  );
}
