/**
 * A payslip as the server lays it out, for reading on screen.
 *
 * The server's PDF and this view are built from the same content, so the
 * bursar's screen, the PDF and the person's own copy agree. The year to date is
 * this employer's alone, including its own months before its payroll ran here.
 * Two earlier parts are kept apart from it: a previous employer's months
 * ("Earlier this tax year with ..."), which PAYE counted but which are never
 * this employer's pay, and this school's months before its payroll ran here
 * ("Before this payroll"), which are part of the year to date and shown again
 * so the total can be followed.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PayslipContent, PayslipEarlierText } from "@/redux/services/finance/payroll-types";

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-white-02 bg-white">
      <p className="border-b border-white-02 bg-gray-03/40 px-3 py-1.5 font-mont text-[10px] font-semibold uppercase tracking-wide text-gray-05">{title}</p>
      <div className="divide-y divide-white-02">{children}</div>
      {note ? <p className="border-t border-white-02 px-3 py-1.5 font-mont text-[11px] text-gray-05">{note}</p> : null}
    </div>
  );
}

function Row({ label, value, strong, minus }: { label: string; value: string; strong?: boolean; minus?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-3 py-1.5 font-mont text-xs", strong && "font-semibold")}>
      <span className="min-w-0 text-black-01">{label}</span>
      <span className={cn("shrink-0 tabular-nums", minus ? "text-destructive" : "text-black-01")}>{minus ? `− ${value}` : value}</span>
    </div>
  );
}

function EarlierRows({ earlier }: { earlier: PayslipEarlierText }) {
  return (
    <>
      <Row label="Gross pay" value={earlier.gross} />
      <Row label="Taxable pay" value={earlier.taxable_pay} />
      <Row label="PAYE" value={earlier.paye} />
      <Row label="Pension" value={earlier.pension} />
    </>
  );
}

export function PayslipContentView({ content }: { content: PayslipContent }) {
  const details = [
    content.branch ? `Branch ${content.branch}` : null,
    content.tax_id ? `Tax ID ${content.tax_id}` : null,
    content.tax_state ? `PAYE to ${content.tax_state}` : null,
    content.pfa ? `Pension with ${content.pfa}${content.pension_pin ? ` (PIN ${content.pension_pin})` : ""}` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-3" data-testid="payslip-content">
      <p className="font-mont text-xs text-gray-05">{[content.issuer, content.period_label, `Paid ${content.pay_date}`, content.document_number].join(" · ")}</p>
      {details.length ? <p className="font-mont text-[11px] text-gray-05">{details.join(" · ")}</p> : null}

      <Section title="Earnings">
        {content.earnings.map((line, index) => <Row key={`${line.name}-${index}`} label={line.name} value={line.amount} />)}
        <Row label="Gross pay" value={content.gross} strong />
      </Section>
      <Section title="Deductions" note={content.paye_source ? `PAYE: ${content.paye_source}${content.tax_table ? `, ${content.tax_table}` : ""}.` : undefined}>
        {content.deductions.map((line, index) => <Row key={`${line.name}-${index}`} label={line.name} value={line.amount} minus />)}
        <Row label="Total deductions" value={content.total_deductions} strong minus />
      </Section>
      <div className="flex items-center justify-between rounded-md bg-gray-03 px-3 py-2.5 font-mont text-sm font-semibold">
        <span>Net pay</span><span className="tabular-nums">{content.net}</span>
      </div>
      {content.employer.length ? (
        <Section title="Paid by the employer on top">
          {content.employer.map((line, index) => <Row key={`${line.name}-${index}`} label={line.name} value={line.amount} />)}
        </Section>
      ) : null}
      <Section title="This employer, year to date">
        <Row label="Gross pay" value={content.ytd.gross} />
        <Row label="PAYE" value={content.ytd.paye} />
        <Row label="Pension" value={content.ytd.pension} />
        <Row label="Net pay through this payroll" value={content.ytd.net} />
      </Section>
      {content.opening ? (
        <Section title="Before this payroll" note="This employer's own months before its payroll ran here. They are in the year to date above.">
          <EarlierRows earlier={content.opening} />
        </Section>
      ) : null}
      {content.brought_forward ? (
        <Section title={`Earlier this tax year with ${content.brought_forward.employer_name || "a previous employer"}`} note="Counted in this payslip's PAYE, but that employer's pay: never in the year to date above.">
          <EarlierRows earlier={content.brought_forward} />
        </Section>
      ) : null}
    </div>
  );
}
