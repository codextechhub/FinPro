/**
 * My payslips: the signed-in person's own payslips and yearly tax summary.
 *
 * Nobody else's are ever here. The server answers for the caller alone, needs
 * no payroll key, and treats a colleague's payslip id as not found, so this
 * page is safe to offer every member of staff from the account menu. A school
 * that has switched in-app payslips off shows none, and the page says what to
 * expect rather than looking broken.
 *
 * Each payslip opens as the server's own PDF, the same document the school's
 * bursar prints and the email carries. The tax summary is this employer's year
 * for the person: the months paid here plus the school's own months before its
 * payroll ran here, with any previous employer's months shown apart and never
 * added in.
 */

import { useMemo, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { Download, FileText } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { DataTable, DetailDrawer, Money, TabStrip, toArray, type Column, type TabStripItem } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { useDates } from "../../lib/display-prefs";
import { openMyPayslip, openMyTaxSummary } from "../../utils/payroll-documents";
import { PayslipContentView } from "./payslip-view";
import { TaxSummaryView } from "./payroll-record";
import { useGetMyPayslipQuery, useGetMyPayslipsQuery, useGetMyTaxSummaryQuery } from "@/redux/services/finance/payroll-api";
import type { MyPayslip } from "@/redux/services/finance/payroll-types";

type Section = "payslips" | "tax";
const SECTIONS: TabStripItem<Section>[] = [
  { value: "payslips", label: "Payslips" },
  { value: "tax", label: "Tax summary" },
];

export default function MyPayslipsPage() {
  const [section, setSection] = useState<Section>("payslips");
  return (
    <PageShell className="space-y-5 text-black-01">
      <div>
        <h1 className="font-mont text-lg font-semibold text-gray-01">My payslips</h1>
        <p className="mt-0.5 font-mont text-xs text-gray-05">Your own payslips and your pay and tax for the year. Only you see these.</p>
      </div>
      <TabStrip items={SECTIONS} value={section} onChange={setSection} variant="underline" ariaLabel="My payslips sections" className="w-full gap-1" buttonClassName="px-3 py-2 font-semibold" />
      {section === "payslips" ? <MyPayslipList /> : <MyTaxSummary />}
    </PageShell>
  );
}

export function MyPayslipList() {
  const dates = useDates();
  const { data, isLoading, isFetching, isError, refetch } = useGetMyPayslipsQuery();
  const rows = useMemo(() => toArray(data?.data), [data]);
  const [openId, setOpenId] = useState<number | null>(null);
  const showBranch = new Set(rows.map((row) => row.branch_name ?? "")).size > 1;

  const columns: Column<MyPayslip>[] = [
    { header: "Period", cell: (row) => <span className="font-medium text-gray-01">{row.period_label || dates.monthYear(row.pay_date)}</span> },
    { header: "Paid", cell: (row) => <span className="tabular-nums text-gray-05">{dates.day(row.pay_date)}</span> },
    ...(showBranch ? [{ header: "Branch", cell: (row: MyPayslip) => <span className="text-gray-05">{row.branch_name ?? "-"}</span> }] : []),
    { header: "Gross", align: "right", cell: (row) => <Money kobo={row.gross_amount} align="right" /> },
    { header: "PAYE", align: "right", cell: (row) => <Money kobo={row.paye_amount} align="right" /> },
    { header: "Net", align: "right", cell: (row) => <Money kobo={row.net_amount} align="right" /> },
    { header: "", align: "right", cell: (row) => (
      <button type="button" onClick={(event) => { event.stopPropagation(); void openMyPayslip(row.id); }}
        className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-primary hover:underline"><Download className="size-3" /> PDF</button>
    ) },
  ];

  return (
    <>
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(row) => setOpenId(row.id)}
        emptyTitle="No payslips yet"
        emptyMessage="A payslip appears here once a payroll run that pays you is paid. If your school sends payslips by email only, they are not shown here." />
      <MyPayslipDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function MyPayslipDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data, isLoading, isError } = useGetMyPayslipQuery(id != null ? { id } : skipToken);
  const content = data?.data;
  if (id == null) return null;
  return (
    <DetailDrawer open onOpenChange={(open) => (open ? undefined : onClose())} typeface="app"
      title={content?.period_label ?? "Payslip"} description={content ? content.employee_name : undefined} widthClass="sm:max-w-lg"
      footer={<>
        <div className="flex-1" />
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={() => void openMyPayslip(id)} className="gap-1.5"><FileText className="size-4" /> Open PDF</Button>
      </>}>
      {isLoading ? <p className="font-mont text-xs text-gray-05">Loading your payslip…</p>
        : isError || !content ? <p className="font-mont text-xs text-gray-05">This payslip could not be read.</p>
        : <PayslipContentView content={content} />}
    </DetailDrawer>
  );
}

export function MyTaxSummary() {
  const dates = useDates();
  const thisYear = Number(dates.today().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const { data, isLoading, isError } = useGetMyTaxSummaryQuery({ year });
  const summaries = useMemo(() => toArray(data?.data), [data]);
  return (
    <div className="space-y-4">
      <select aria-label="Tax year" value={year} onChange={(event) => setYear(Number(event.target.value))}
        className="h-9 w-32 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01">
        {[thisYear, thisYear - 1, thisYear - 2].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      {isLoading ? <p className="font-mont text-xs text-gray-05">Loading your tax year…</p>
        : isError ? <p className="font-mont text-xs text-gray-05">Your tax year could not be read.</p>
        : !summaries.length ? <p className="font-mont text-xs text-gray-05">{`You have no payslips for ${year}.`}</p>
        : summaries.map((summary) => (
          <div key={summary.entity} className="space-y-3 rounded-md border border-white-02 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mont text-sm font-semibold text-gray-01">{`${summary.year} at ${summary.issuer}`}</p>
              <Button variant="outline" onClick={() => void openMyTaxSummary(year, summary.entity)} className="gap-1.5"><Download className="size-4" /> PDF</Button>
            </div>
            <TaxSummaryView summary={summary} />
          </div>
        ))}
    </div>
  );
}
