/**
 * Settlement - gateway settlement reconciliation (Vision "Settlement Recon"), house theme.
 * Confirmed collections (in) + paid payouts (out) matched against the entity's imported
 * bank statement lines, by reference then exact amount. Four views (To book / Matched /
 * Unsettled / Unmatched bank lines) + KPIs, all on the shared DataTable so the typography
 * matches every other screen. Clicking a row opens a drawer with both sides of the match.
 * "Re-run match" just refetches (recomputed server-side).
 *
 * A confirmed online payment waits in gateway clearing until the provider pays it on to
 * the bank. Booking that bank line as the payments' settlement is the one thing this
 * screen posts (with `payments.settlement.create`): Dr bank, Dr bank charges for the
 * provider's fee, Cr gateway clearing, in the bank account's branch. "To book" lists the
 * server's suggestions; any unmatched inflow can be booked by hand from its drawer. See
 * book-settlement-modal.tsx. Payments the platform held settle through its own run and
 * are never booked here. At a school with several branches every gateway row and bank
 * line names its branch, as the server sends it, and booking a line offers only its
 * branch's payments.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Eye, RefreshCw, ArrowDownLeft, ArrowUpRight, BookCheck } from "lucide-react";
import { DataTable, Money, KpiCard, DetailDrawer, TabStrip, toArray, useReaderBranchLens, type Column } from "@/components/finance-ui";
import { NO_BRANCH_YET } from "../../lib/branch-labels";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PROVIDER_CHOICES, providerInfo } from "./payment-providers";
import { formatMoney } from "@/utils/money";
import { useGetSettlementReconciliationQuery } from "@/redux/services/payments/payments-api";
import { viewReportExport } from "@/utils/finance-export";
import type { SettlementRow, SuggestedSettlement, UnmatchedBankLine } from "@/redux/services/payments/payments-types";
import { useGetBankAccountsQuery } from "@/redux/services/finance/ops-api";
import { useCan } from "@/components/finance-ui/can";
import { P } from "../../permissions";
import { BookSettlementModal, type BookSettlementTarget } from "./book-settlement-modal";
import { waitingPayments } from "./settlement-booking";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { useDates } from "../../lib/display-prefs";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const signed = (kobo: number, currency?: string | null) => `${kobo < 0 ? "−" : ""}${formatMoney(Math.abs(kobo), currency)}`;

function ProviderTag({ provider }: { provider: string }) {
  const p = providerInfo(provider);
  return <span className="inline-flex items-center gap-1.5 font-mont text-sm text-black-01"><span className={cn("size-2 rounded-sm", p.dot)} /> {p.label}</span>;
}
function TypeTag({ kind }: { kind: string }) {
  const inbound = kind === "COLLECTION";
  return (
    <span className={cn("inline-flex items-center gap-1 font-mont text-sm font-medium", inbound ? "text-green-01" : "text-gray-01")}>
      {inbound ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}{inbound ? "Collection" : "Payout"}
    </span>
  );
}
function BasisPill({ basis }: { basis: string }) {
  if (!basis) return <span className="text-gray-05">-</span>;
  const label = basis === "platform_settlement" ? "Paid by the platform" : basis === "settlement" ? "Booked settlement" : `By ${basis}`;
  return <span className={cn(PILL, "bg-blue-50 text-blue-700")}>{label}</span>;
}

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

type Tab = "suggested" | "matched" | "unsettled" | "unmatched";
type Picked = { kind: "gw"; row: SettlementRow } | { kind: "bank"; line: UnmatchedBankLine };

export function SettlementTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const [provider, setProvider] = useState("");
  const [tab, setTab] = useState<Tab>("matched");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [booking, setBooking] = useState<BookSettlementTarget | null>(null);
  const { can } = useCan();
  const canBook = can(P.PAY_CREATE_SETTLEMENT);
  const multiBranch = useReaderBranchLens().applies;
  const branchOf = (row: { branch_id?: number | null; branch_name?: string | null }) =>
    row.branch_id == null ? NO_BRANCH_YET : row.branch_name || "-";
  const { data, isLoading, isFetching, isError, refetch } = useGetSettlementReconciliationQuery({ entity, ...(provider ? { provider } : {}) });
  const recon = data?.data;
  // Bank account names for the lines; a reader without the bank list sees the line alone.
  const banks = useGetBankAccountsQuery({ entity }, { skip: !can(P.FIN_VIEW_BANK_ACCOUNTS) });
  const bankName = useMemo(() => {
    const byId = new Map(toArray(banks.data?.data).map((b) => [b.id, b.name]));
    return (id: number) => byId.get(id) ?? null;
  }, [banks.data]);

  const rows = useMemo(() => recon?.rows ?? [], [recon]);
  const matched = useMemo(() => rows.filter((r) => r.settled), [rows]);
  const unsettled = useMemo(() => rows.filter((r) => !r.settled), [rows]);
  const unmatched = recon?.unmatched_bank_lines ?? [];
  const suggested = useMemo(() => recon?.suggested_settlements ?? [], [recon]);
  const waiting = useMemo(() => waitingPayments(rows), [rows]);
  const s = recon?.summary;
  const lineById = (id: number) => unmatched.find((b) => b.bank_line_id === id) ?? null;
  const bookSuggestion = (suggestion: SuggestedSettlement) => {
    const line = lineById(suggestion.bank_line_id);
    if (line) setBooking({ line, picked: suggestion.collection_ids });
  };

  if (isLoading) return <LoadingState />;
  if (isError || !recon) return <ErrorState onRetry={refetch} />;

  const tabs: { id: Tab; label: string; n: number }[] = [
    ...(suggested.length || canBook ? [{ id: "suggested" as const, label: "To book", n: suggested.length }] : []),
    { id: "matched", label: "Matched", n: s?.settled_count ?? matched.length },
    { id: "unsettled", label: "Unsettled", n: s?.unsettled_count ?? unsettled.length },
    { id: "unmatched", label: "Unmatched bank lines", n: s?.unmatched_bank_count ?? unmatched.length },
  ];

  const gwBase: Column<SettlementRow>[] = [
    { header: "Date", cell: (r) => <span className="tabular-nums text-gray-05">{dates.day(r.confirmed_at)}</span> },
    { header: "Type", cell: (r) => <TypeTag kind={r.kind} /> },
    ...(multiBranch ? [{ header: "Branch", cell: (r: SettlementRow) => <span className="text-gray-01">{branchOf(r)}</span> }] : []),
    { header: "Provider", cell: (r) => <ProviderTag provider={r.provider} /> },
    { header: "Reference", cell: (r) => <span className="tabular-nums text-gray-01">{r.reference}</span> },
    { header: "Gross", align: "right", cell: (r) => <Money kobo={Math.abs(r.amount)} currency={currency} align="right" /> },
  ];
  const matchedCols: Column<SettlementRow>[] = [
    ...gwBase,
    { header: "Fees", align: "right", cell: (r) => <span className="tabular-nums text-destructive">{r.fee_amount ? formatMoney(r.fee_amount, currency) : "-"}</span> },
    { header: "Net settled", align: "right", cell: (r) => <span className="tabular-nums">{formatMoney(Math.abs(r.settled_amount ?? r.amount), currency)}</span> },
    { header: "Settlement ref", cell: (r) => <span className="tabular-nums text-gray-05">{r.settlement_reference || "-"}</span> },
    { header: "Match basis", cell: (r) => <BasisPill basis={r.match_basis} /> },
  ];
  const unsettledCols: Column<SettlementRow>[] = [
    ...gwBase,
    { header: "Status", cell: () => <span className={cn(PILL, "bg-amber-50 text-amber-700")}>Awaiting bank</span> },
  ];
  const suggestedCols: Column<SuggestedSettlement>[] = [
    { header: "Bank date", cell: (g) => <span className="tabular-nums text-gray-05">{dates.day(g.txn_date)}</span> },
    { header: "Bank account", cell: (g) => bankName(g.bank_account_id) ?? <span className="text-gray-05">Account {g.bank_account_id}</span> },
    { header: "Carries", cell: (g) => (
      <span>
        {g.collection_ids.length} payment{g.collection_ids.length === 1 ? "" : "s"}
        <span className="block font-mont text-[11px] text-gray-05">{g.basis === "reference" ? "Named by reference" : `Received ${dates.day(g.confirmed_on)}`}</span>
      </span>
    ) },
    { header: "Payments", align: "right", cell: (g) => <Money kobo={g.gross} currency={currency} align="right" /> },
    { header: "Fees", align: "right", cell: (g) => <span className="tabular-nums text-destructive">{g.fee ? formatMoney(g.fee, currency) : "-"}</span> },
    { header: "Arrived", align: "right", cell: (g) => <Money kobo={g.net} currency={currency} align="right" /> },
    ...(canBook ? [{ header: "", align: "right" as const, cell: (g: SuggestedSettlement) => (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={(e) => { e.stopPropagation(); bookSuggestion(g); }}>
        <BookCheck className="size-3.5" /> Book
      </Button>
    ) }] : []),
  ];
  const unmatchedCols: Column<UnmatchedBankLine>[] = [
    { header: "Date", cell: (b) => <span className="tabular-nums text-gray-05">{dates.day(b.txn_date)}</span> },
    ...(multiBranch ? [{ header: "Branch", cell: (b: UnmatchedBankLine) => <span className="text-gray-01">{branchOf(b)}</span> }] : []),
    { header: "Description", cell: (b) => b.description || "-" },
    { header: "Reference", cell: (b) => <span className="tabular-nums text-gray-05">{b.reference || "-"}</span> },
    { header: "Amount", align: "right", cell: (b) => <span className={cn("tabular-nums font-medium", b.amount < 0 ? "text-destructive" : "text-black-01")}>{signed(b.amount, currency)}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Settled (matched)" value={String(s?.settled_count ?? 0)} foot="Gateway ↔ bank" tone={recon.is_reconciled ? "live" : "default"} />
        <KpiCard label="Unsettled" value={String(s?.unsettled_count ?? 0)} tone={(s?.unsettled_count ?? 0) > 0 ? "warn" : "default"} foot="No bank line yet" />
        <KpiCard label="Unmatched bank lines" value={String(s?.unmatched_bank_count ?? 0)} tone={(s?.unmatched_bank_count ?? 0) > 0 ? "warn" : "default"} foot="No gateway record" />
        <KpiCard label="Unexplained bank total" value={formatMoney(Math.abs(s?.unmatched_bank_total ?? 0), currency)} foot="Bank lines left over" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The count stays grey on the active view so the label keeps one weight. */}
        <TabStrip
          items={tabs.map((t) => ({
            value: t.id,
            label: <>{t.label} <span className="ml-1 tabular-nums text-gray-05">{t.n}</span></>,
          }))}
          value={tab}
          onChange={setTab}
          variant="segmented"
          className="gap-0"
          buttonClassName="text-xs"
          ariaLabel="Settlement view"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={provider} onChange={setProvider} className="w-40">
            <option value="">All providers</option>
            {PROVIDER_CHOICES.map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
          </Select>
          {/* Server-rendered, matching every other finance report - the same
              three views the tabs show, in csv / xlsx / pdf rather than the
              browser-built CSV this replaces. (This screen's old CSV was at
              least complete: the endpoint returns the whole snapshot unpaginated,
              unlike the list screens whose CSVs only held the current page.) */}
          <div className="inline-flex items-center gap-1.5">
            {(["csv", "xlsx", "pdf"] as const).map((f) => (
              <Button
                key={f}
                variant="outline"
                className="gap-1.5"
                onClick={() => viewReportExport(
                  "/payments/reports/settlement-reconciliation/",
                  { entity, view: tab, ...(provider ? { provider } : {}) },
                  f,
                )}
              >
                <Eye className="size-4" /> {f.toUpperCase()}
              </Button>
            ))}
          </div>
          <Button variant="outline" disabled={isFetching} onClick={() => refetch()} className="gap-1.5"><RefreshCw className={cn("size-4", isFetching && "animate-spin")} /> Re-run match</Button>
        </div>
      </div>

      <p className="font-mont text-[11px] text-gray-05">
        Online payments wait in gateway clearing until the provider pays them into the bank. Book that bank line as their settlement to move them to the bank and the provider&rsquo;s fee to bank charges. The book-vs-bank close lives in <span className="font-medium text-gray-01">Bank Reconciliation</span>.
      </p>

      {tab === "suggested" ? (
        <DataTable columns={suggestedCols} rows={suggested} rowKey={(g) => `${g.bank_line_id}`}
          onRowClick={canBook ? bookSuggestion : undefined}
          emptyTitle="Nothing to book" emptyMessage="No bank line matches payments waiting in gateway clearing. Open an unmatched bank line to book it by hand." />
      ) : tab === "unmatched" ? (
        <DataTable columns={unmatchedCols} rows={unmatched} rowKey={(b) => b.bank_line_id} onRowClick={(line) => setPicked({ kind: "bank", line })}
          emptyTitle="Nothing unexplained" emptyMessage="Every bank line maps to a gateway record." />
      ) : (
        <DataTable columns={tab === "matched" ? matchedCols : unsettledCols} rows={tab === "matched" ? matched : unsettled}
          rowKey={(r) => `${r.kind}-${r.gateway_id}`} onRowClick={(row) => setPicked({ kind: "gw", row })}
          emptyTitle={tab === "matched" ? "No matched settlements" : "Nothing awaiting the bank"}
          emptyMessage={tab === "matched" ? "Imported bank lines will match here by reference or amount." : "Every gateway record has settled to the bank."} />
      )}

      <SettlementDrawer picked={picked} currency={currency} branchOf={multiBranch ? branchOf : undefined} onClose={() => setPicked(null)}
        onBook={canBook ? (line) => { setPicked(null); setBooking({ line, picked: [] }); } : undefined} />
      {booking ? (
        <BookSettlementModal target={booking} payments={waiting} bankName={bankName(booking.line.bank_account_id)}
          entity={entity} currency={currency} onClose={() => setBooking(null)} />
      ) : null}
    </div>
  );
}

function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="font-mont text-[11px] text-gray-05">{label}</span>
      <span className={cn("text-right font-mont text-xs font-medium text-black-01", mono && "tabular-nums")}>{children}</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-white-02 bg-white p-4">
      <p className="mb-1.5 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">{title}</p>
      <div className="divide-y divide-gray-02">{children}</div>
    </div>
  );
}

function SettlementDrawer({ picked, currency, branchOf, onClose, onBook }: {
  picked: Picked | null; currency?: string | null; onClose: () => void;
  /** The branch a row or line names, at a school with several branches. */
  branchOf?: (row: { branch_id?: number | null; branch_name?: string | null }) => string;
  /** Present when the reader may book a line as a settlement. */
  onBook?: (line: UnmatchedBankLine) => void;
}) {
  const dates = useDates();
  if (!picked) return null;

  if (picked.kind === "bank") {
    const b = picked.line;
    return (
      <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
        title={b.reference || b.description || "Bank line"} description={`Unexplained · ${signed(b.amount, currency)}`} widthClass="sm:max-w-md"
        footer={<>
          <span className={cn(PILL, "bg-amber-50 text-amber-700")}>No gateway record</span>
          <div className="flex-1" />
          {onBook && b.amount > 0 ? <Button className="gap-1.5" onClick={() => onBook(b)}><BookCheck className="size-4" /> Book as settlement</Button> : null}
        </>}>
    <div className="space-y-4" data-guide="finance-settlement.workbench">
          <Section title="Bank statement line">
            <Field label="Date" mono>{dates.day(b.txn_date)}</Field>
            {branchOf ? <Field label="Branch">{branchOf(b)}</Field> : null}
            <Field label="Description">{b.description || "-"}</Field>
            <Field label="Reference" mono>{b.reference || "-"}</Field>
            <Field label="Amount" mono><span className={b.amount < 0 ? "text-destructive" : ""}>{signed(b.amount, currency)}</span></Field>
          </Section>
          <p className="font-mont text-[11px] leading-relaxed text-gray-05">
            No confirmed collection or paid payout matches this line by reference or amount. If it is the provider paying out online payments, book it as their settlement. Otherwise it may be a fee, a manual transfer, or a movement that belongs in <span className="font-medium text-gray-01">Bank Reconciliation</span>.
          </p>
        </div>
      </DetailDrawer>
    );
  }

  const r = picked.row;
  const inbound = r.kind === "COLLECTION";
  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={r.reference} description={`${inbound ? "Collection in" : "Payout out"} · ${ProvidersLabel(r.provider)} · ${formatMoney(Math.abs(r.amount), currency)}`} widthClass="sm:max-w-md"
      footer={r.settled
        ? <span className={cn(PILL, "bg-green-01/10 text-green-01")}>Settled · by {r.match_basis}</span>
        : <span className={cn(PILL, "bg-amber-50 text-amber-700")}>Awaiting bank</span>}>
      <div className="space-y-4">
        <Section title="Gateway record">
          <Field label="Type"><TypeTag kind={r.kind} /></Field>
          {branchOf ? <Field label="Branch">{branchOf(r)}</Field> : null}
          <Field label="Provider"><ProviderTag provider={r.provider} /></Field>
          <Field label="Reference" mono>{r.reference}</Field>
          {r.provider_reference ? <Field label="Provider ref" mono>{r.provider_reference}</Field> : null}
          <Field label="Confirmed" mono>{dates.day(r.confirmed_at)}</Field>
          <Field label="Gross" mono>{formatMoney(Math.abs(r.amount), currency)}</Field>
        </Section>

        {r.settled ? (
          <Section title="Bank settlement">
            <Field label="Settlement ref" mono>{r.settlement_reference || "-"}</Field>
            <Field label="Bank date" mono>{dates.day(r.settlement_date)}</Field>
            {r.settlement_description ? <Field label="Description">{r.settlement_description}</Field> : null}
            <Field label="Net settled" mono>{formatMoney(Math.abs(r.settled_amount ?? r.amount), currency)}</Field>
            <Field label="PSP fee" mono><span className={r.fee_amount ? "text-destructive" : ""}>{r.fee_amount ? formatMoney(r.fee_amount, currency) : "-"}</span></Field>
            <Field label="Matched by">{r.match_basis || "-"}</Field>
          </Section>
        ) : (
          <p className="font-mont text-[11px] leading-relaxed text-gray-05">
            This {inbound ? "collection" : "payout"} confirmed on the gateway but no bank statement line matches it yet. It settles automatically once the line imports (matched by reference or exact amount) - import the statement on <span className="font-medium text-gray-01">Bank Reconciliation</span> and re-run the match.
          </p>
        )}

        {r.settled && r.fee_amount ? (
          <p className="font-mont text-[11px] leading-relaxed text-gray-05">
            {r.match_basis === "settlement" || r.match_basis === "platform_settlement"
              ? <>The {formatMoney(r.fee_amount, currency)} fee was booked to bank charges with the settlement.</>
              : <>The {formatMoney(r.fee_amount, currency)} fee is the gap between gross and what the bank received. It&rsquo;s shown here as an observation; the adjusting entry that books it lives in <span className="font-medium text-gray-01">Bank Reconciliation</span>.</>}
          </p>
        ) : null}
      </div>
    </DetailDrawer>
  );
}

function ProvidersLabel(p: string) {
  return providerInfo(p).label;
}
