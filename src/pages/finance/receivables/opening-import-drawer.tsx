/**
 * Import opening balances: many unpaid customer bills from before the books
 * went live, carried in at once.
 *
 * Each row of the file becomes its own opening invoice, dated as the original
 * bill was and filed under its branch, so it ages from that date. The file is
 * checked here first and every bad row is named by its line; the server then
 * takes it all or nothing, so one row it refuses refuses the whole file and
 * nothing is created. Bills dated on or after the day the books went live are
 * ordinary business and are refused.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileUp } from "lucide-react";
import { DetailDrawer, Money } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/money";
import { useBranches } from "../../../host";
import { useDates } from "../../../lib/display-prefs";
import { useImportOpeningInvoicesMutation } from "@/redux/services/finance/fees-api";
import { Note, useBranchColumn } from "./fees-parts";
import { OPENING_TEMPLATE, readOpeningFile, type ParsedOpeningFile } from "./opening-import";

const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const td = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";
const PREVIEW_ROWS = 10;

export function OpeningImportDrawer({ open, onClose, entity, currency }: {
  open: boolean; onClose: () => void; entity: string; currency?: string | null;
}) {
  const dates = useDates();
  const { data: branchList } = useBranches();
  const branches = useBranchColumn();
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedOpeningFile | null>(null);
  const [importInvoices, { isLoading }] = useImportOpeningInvoicesMutation();

  const reset = () => { setFileName(""); setParsed(null); };
  const close = () => { reset(); onClose(); };
  const read = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setParsed(readOpeningFile(await file.text(), branchList ?? []));
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([OPENING_TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "opening-balances.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const submit = async () => {
    if (!parsed?.rows.length) return;
    try {
      const res = await importInvoices({ entity, invoices: parsed.rows }).unwrap();
      toast.success(res.message || `${parsed.rows.length} opening invoice(s) carried in.`);
      close();
    } catch { /* central */ }
  };
  const ready = !!parsed && parsed.problems.length === 0 && parsed.rows.length > 0;

  return (
    <DetailDrawer
      open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="Import opening balances"
      description="Unpaid customer bills from before the books went live, one row per bill."
      widthClass="sm:max-w-3xl"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={!ready || isLoading} onClick={submit} className="gap-1.5">
          <FileUp className="size-4" />{isLoading ? "Importing..." : ready ? `Import ${parsed!.rows.length} bill${parsed!.rows.length === 1 ? "" : "s"}` : "Import"}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <Note>
          Each bill keeps its own date and branch, so it ages as the original did. If any row is refused, nothing is
          imported. Bills dated on or after the day the books went live are raised as ordinary invoices instead.
        </Note>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white-02 bg-white px-3 py-2 font-mont text-sm text-gray-01 hover:bg-gray-50">
            <FileUp className="size-4" />
            <span>{fileName || "Choose a CSV file"}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => read(e.target.files?.[0])} />
          </label>
          <Button variant="ghost" size="sm" onClick={downloadTemplate} className="gap-1.5"><Download className="size-4" /> Download a template</Button>
        </div>
        <p className="font-mont text-[11px] leading-5 text-gray-05">
          Columns: customer (code), invoice_date, due_date, amount (naira still owed), reference, period,
          {branches.show ? " branch (name)," : ""} narration. Dates as YYYY-MM-DD or DD/MM/YYYY.
        </p>

        {parsed && parsed.problems.length ? (
          <div role="alert" className="space-y-1 rounded-md border border-error/30 bg-error/5 px-3 py-2.5">
            <p className="font-mont text-xs font-semibold text-gray-01">Fix these rows and choose the file again</p>
            <ul className="list-disc space-y-0.5 pl-4 font-mont text-[11px] leading-4 text-gray-05">
              {parsed.problems.slice(0, 20).map((p) => <li key={p}>{p}</li>)}
              {parsed.problems.length > 20 ? <li>and {parsed.problems.length - 20} more.</li> : null}
            </ul>
          </div>
        ) : null}

        {ready ? (
          <div className="space-y-2">
            <p className="font-mont text-sm text-gray-01">
              {parsed!.rows.length} bill{parsed!.rows.length === 1 ? "" : "s"}, {formatMoney(parsed!.total, currency)} owed in all.
            </p>
            <div className="overflow-x-auto rounded-md border border-white-02">
              <table className="w-full min-w-[480px] border-collapse">
                <thead><tr>
                  <th className={th}>Customer</th><th className={th}>Dated</th><th className={th}>Due</th>
                  {branches.show ? <th className={th}>Branch</th> : null}
                  <th className={`${th} text-right`}>Owed</th>
                </tr></thead>
                <tbody>
                  {parsed!.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <tr key={i}>
                      <td className={td}>{r.customer}{r.reference ? <span className="text-gray-05"> · {r.reference}</span> : null}</td>
                      <td className={`${td} tabular-nums`}>{dates.day(r.invoice_date)}</td>
                      <td className={`${td} tabular-nums`}>{r.due_date ? dates.day(r.due_date) : "-"}</td>
                      {branches.show ? <td className={td}>{r.branch ? branches.name(r.branch) : "Customer's own"}</td> : null}
                      <td className={`${td} text-right`}><Money kobo={r.amount} currency={currency} align="right" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed!.rows.length > PREVIEW_ROWS ? <p className="font-mont text-[11px] text-gray-05">and {parsed!.rows.length - PREVIEW_ROWS} more.</p> : null}
          </div>
        ) : null}
      </div>
    </DetailDrawer>
  );
}
