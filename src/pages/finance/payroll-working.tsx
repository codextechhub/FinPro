/**
 * How one person's pay on a run was made up: the deductions and employer
 * contributions on their line, and how their PAYE was worked out.
 *
 * Each part follows the reader's Field Access on the run's lines: the items
 * travel with Pay breakdown and the PAYE working with PAYE, so a role that may
 * not see PAYE sees neither the figure nor how it was reached, and a part the
 * server left out is not drawn at all.
 *
 * PAYE is cumulative over the tax year. The working shows the year to date it
 * was priced on, kept in three parts so nobody mistakes one employer's pay for
 * another's: what this payroll paid before this month, a previous employer's
 * months ("Earlier this tax year with ..."), and this employer's own months
 * before its payroll ran here ("Before this payroll"). Aisha joined Ikeja in
 * April after N900,000 and N45,000 PAYE at Unity Schools: her April working
 * shows one month here, Unity's three months apart, and the year's tax less
 * everything already deducted by both.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import type { PayrollLine } from "@/redux/services/finance/ops-types";
import type { PayeWorking, PayeYearFigures, PayrollLineItem } from "@/redux/services/finance/payroll-types";

/** A rate in basis points as a percentage: 250 reads "2.5%". */
export function ratePercent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** The items of one kind, in a stable order: PAYE, pension and NHF before voluntary ones. */
const ORDER = ["PAYE", "PENSION", "NHF", "VOLUNTARY", "EMPLOYER_PENSION", "NSITF", "ITF"];
function sortItems(items: PayrollLineItem[]): PayrollLineItem[] {
  return [...items].sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
}

/** "8% of ₦250,000.00" for a rated item, nothing for a flat one. */
function basisNote(item: PayrollLineItem, currency?: string | null): string {
  return item.rate_bps > 0 && item.basis_amount > 0
    ? `${ratePercent(item.rate_bps)} of ${formatMoney(item.basis_amount, currency)}`
    : "";
}

function Row({ label, note, value, strong, muted }: { label: ReactNode; note?: string; value: ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-3 py-1.5 font-mont text-xs", strong && "font-semibold")}>
      <span className={cn("min-w-0", muted ? "text-gray-05" : "text-black-01")}>
        {label}
        {note ? <span className="block text-[11px] font-normal text-gray-05">{note}</span> : null}
      </span>
      <span className="shrink-0 tabular-nums text-black-01">{value}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-white-02 bg-white">
      <p className="border-b border-white-02 bg-gray-03/40 px-3 py-1.5 font-mont text-[10px] font-semibold uppercase tracking-wide text-gray-05">{title}</p>
      <div className="divide-y divide-white-02">{children}</div>
    </div>
  );
}

/** A line's deductions and the employer's contributions, each with its rate and basis. */
export function LineItems({ items, currency }: { items: PayrollLineItem[]; currency?: string | null }) {
  const deductions = sortItems(items.filter((item) => item.kind === "DEDUCTION"));
  const employer = sortItems(items.filter((item) => item.kind === "EMPLOYER"));
  return (
    <div className="space-y-3">
      {deductions.length ? (
        <Block title="Deducted from pay">
          {deductions.map((item) => (
            <Row key={item.id} label={item.label} note={basisNote(item, currency)} value={`− ${formatMoney(item.amount, currency)}`} />
          ))}
        </Block>
      ) : null}
      {employer.length ? (
        <Block title="Paid by the school on top">
          {employer.map((item) => (
            <Row key={item.id} label={item.label} note={basisNote(item, currency)} value={formatMoney(item.amount, currency)} />
          ))}
        </Block>
      ) : null}
    </div>
  );
}

function YearRows({ figures, currency }: { figures: PayeYearFigures; currency?: string | null }) {
  return (
    <>
      <Row label="Gross pay" value={formatMoney(figures.gross, currency)} muted />
      <Row label="Taxable pay" value={formatMoney(figures.taxable_pay, currency)} muted />
      <Row label="PAYE deducted" value={formatMoney(figures.paye, currency)} muted />
      <Row label="Pension" value={formatMoney(figures.pension, currency)} muted />
      {figures.nhf ? <Row label="NHF" value={formatMoney(figures.nhf, currency)} muted /> : null}
    </>
  );
}

/**
 * How a line's PAYE was reached, from the working the server stored with it.
 *
 * A line whose PAYE was supplied or typed by hand has no working to show; it
 * says where the figure came from instead. Earlier months from before this
 * payroll are shown even then, because the server records them on every line.
 */
export function PayeWorkingView({ line, currency }: { line: Pick<PayrollLine, "tax_basis" | "paye_source" | "paye_source_label" | "paye_amount">; currency?: string | null }) {
  const working: PayeWorking = line.tax_basis ?? {};
  const inputs = working.inputs;
  const money = (kobo?: number) => formatMoney(kobo ?? 0, currency);
  const source = line.paye_source_label ?? null;
  const previous = working.brought_forward;
  const opening = working.opening;
  const deductedBefore = (inputs?.paye_before ?? 0) + (previous?.paye ?? 0) + (opening?.paye ?? 0);

  return (
    <div className="space-y-3" data-testid="paye-working">
      {source ? <p className="font-mont text-xs text-gray-05">PAYE: <span className="font-medium text-gray-01">{source}</span></p> : null}

      {working.override ? (
        <p role="note" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-900">
          {`Set by hand to ${money(working.override.amount)} in place of ${money(working.override.computed)} worked out from the table. Reason: ${working.override.reason || "none given"}.`}
        </p>
      ) : null}

      {inputs ? (
        <>
          <Block title={`${working.table?.name ?? "Tax table"} · month ${working.month ?? "-"} of 12`}>
            <Row label="Gross this month" value={money(inputs.gross_this_month)} />
            <Row label="Taxable this month" value={money(inputs.taxable_this_month)} />
            <Row label="Pension this month" value={money(inputs.pension_this_month)} />
            {inputs.nhf_this_month ? <Row label="NHF this month" value={money(inputs.nhf_this_month)} /> : null}
            {inputs.annual_rent ? <Row label="Annual rent declared" value={money(inputs.annual_rent)} /> : null}
          </Block>
          <Block title="Earlier months on this payroll">
            <Row label="Gross pay" value={money(inputs.gross_before)} muted />
            <Row label="Taxable pay" value={money(inputs.taxable_before)} muted />
            <Row label="PAYE deducted" value={money(inputs.paye_before)} muted />
            <Row label="Pension" value={money(inputs.pension_before)} muted />
          </Block>
        </>
      ) : null}

      {previous ? (
        <Block title={`Earlier this tax year with ${previous.employer_name || "a previous employer"}`}>
          <YearRows figures={previous} currency={currency} />
        </Block>
      ) : null}
      {opening ? (
        <Block title="Before this payroll">
          <YearRows figures={opening} currency={currency} />
          {opening.evidence_reference ? <Row label="Evidence" value={opening.evidence_reference} muted /> : null}
        </Block>
      ) : null}

      {inputs ? (
        <Block title="The year so far">
          <Row label="Taxable pay to date" value={money(working.taxable_to_date)} />
          {(working.reliefs ?? []).map((relief) => (
            <Row key={relief.code} label={relief.name} note="Relief to date" value={`− ${money(relief.amount)}`} muted />
          ))}
          <Row label="Chargeable to date" value={money(working.chargeable_to_date)} />
          <Row label={working.exempt ? "Tax to date (below the tax-free income)" : working.minimum_tax_applied ? "Tax to date (the minimum tax)" : "Tax to date"} value={money(working.tax_to_date)} />
          <Row label="Already deducted this year" value={`− ${money(deductedBefore)}`} muted />
          <Row label="PAYE this month" note="Never below nothing: payroll does not refund tax" value={money(working.paye_this_month)} strong />
          {working.excess_withheld ? (
            <Row label="Deducted beyond the tax due so far" note="Used up against later months of the year" value={money(working.excess_withheld)} muted />
          ) : null}
        </Block>
      ) : !working.override ? (
        <p className="font-mont text-xs text-gray-05">No table working is kept for this line: its PAYE was not computed from the national tax table.</p>
      ) : null}
    </div>
  );
}
