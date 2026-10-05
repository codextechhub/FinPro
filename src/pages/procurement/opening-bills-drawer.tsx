/**
 * The drawer that carries in opening supplier bills from a CSV file.
 *
 * The file is read in the browser and checked line by line before anything is
 * sent (see opening-bills.ts), then sent whole. The server refuses the whole
 * file for one bad row, or for any bill dated on or after the day the books went
 * live, and its refusal is listed here by line rather than in a toast.
 */

import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { DetailDrawer, useRaisingBranch } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/utils/money";
import { useDates } from "../../lib/display-prefs";
import { useImportOpeningVendorBillsMutation } from "@/redux/services/procurement/payables-corrections-api";
import { OPENING_BILL_LIMIT, openingBillTemplate, openingImportRefusal, parseOpeningBills } from "./opening-bills";

export function OpeningBillsDrawer({ entity, currency, onClose }: { entity: string; currency?: string | null; onClose: () => void }) {
  const dates = useDates();
  const raising = useRaisingBranch();
  const [text, setText] = useState("");
  const [refusal, setRefusal] = useState<string[]>([]);
  const [importBills, { isLoading }] = useImportOpeningVendorBillsMutation();
  const parsed = text.trim() ? parseOpeningBills(text, { branches: raising.choices, askBranch: raising.ask }) : null;
  const total = parsed?.rows.reduce((sum, row) => sum + row.amount, 0) ?? 0;
  const ready = !!parsed && parsed.rows.length > 0 && parsed.problems.length === 0;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setRefusal([]);
    setText(await file.text());
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([openingBillTemplate(raising.ask)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "opening-supplier-bills.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  const send = async () => {
    if (!ready || !parsed) return;
    setRefusal([]);
    try {
      const response = await importBills({ entity, bills: parsed.rows }).unwrap();
      toast.success(response.message || `${parsed.rows.length} opening bills carried in.`);
      onClose();
    } catch (error) {
      setRefusal(openingImportRefusal(error));
    }
  };

  return <DetailDrawer open onOpenChange={(open) => !isLoading && !open && onClose()} title="Opening supplier bills" description="Carry in the bills still unpaid when the books began." widthClass="sm:max-w-[720px]" footer={<><Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button><Button disabled={!ready} loading={isLoading} onClick={send}><Upload className="size-4" /> Import {parsed?.rows.length ? `${parsed.rows.length} bill${parsed.rows.length === 1 ? "" : "s"}` : "bills"}</Button></>}>
    <div className="space-y-4">
      <p className="rounded-md border border-white-02 bg-gray-50 px-3 py-2 font-mont text-[11px] leading-5 text-gray-05">One row per unpaid bill, dated when the supplier raised it, for the amount still owed. Each posts to Accounts Payable against retained earnings with no approval. Bills dated on or after the day the books went live are refused: record those as ordinary bills. One bad row refuses the whole file. At most {OPENING_BILL_LIMIT} bills per file.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="size-4" /> Template</Button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white-02 bg-white px-3 py-1.5 font-mont text-xs font-medium hover:border-primary/40">
          <Upload className="size-3.5" /> Choose CSV file
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void readFile(event.target.files?.[0])} />
        </label>
        <span className="font-mont text-[11px] text-gray-05">or paste the rows below</span>
      </div>
      <Textarea value={text} onChange={(event) => { setText(event.target.value); setRefusal([]); }} placeholder={openingBillTemplate(raising.ask)} className="min-h-32 bg-white font-mono text-xs" aria-label="Opening bills CSV" />
      {parsed && parsed.problems.length > 0 && <ul role="alert" className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 font-mont text-[11px] text-red-700">{parsed.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
      {refusal.length > 0 && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 font-mont text-[11px] text-red-700"><p className="font-semibold">Nothing was imported.</p><ul className="mt-1 space-y-1">{refusal.map((line) => <li key={line}>{line}</li>)}</ul></div>}
      {ready && parsed && <div className="overflow-x-auto rounded-md border border-white-02">
        <table className="w-full min-w-[520px]"><thead><tr>{["Vendor", "Raised", "Due", "Reference", ...(raising.ask ? ["Branch"] : []), "Owed"].map((label) => <th key={label} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{label}</th>)}</tr></thead>
          <tbody>{parsed.rows.slice(0, 8).map((row, index) => <tr key={index}>
            <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold">{row.vendor}</td>
            <td className="border-t border-white-02 px-3 py-2 font-mont text-xs">{dates.day(row.invoice_date)}</td>
            <td className="border-t border-white-02 px-3 py-2 font-mont text-xs">{dates.day(row.due_date ?? row.invoice_date)}</td>
            <td className="border-t border-white-02 px-3 py-2 font-mont text-xs">{row.vendor_reference || "-"}</td>
            {raising.ask && <td className="border-t border-white-02 px-3 py-2 font-mont text-xs">{raising.choices.find((b) => Number(b.id) === row.branch)?.name ?? "-"}</td>}
            <td className="border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums">{formatMoney(row.amount, currency)}</td>
          </tr>)}</tbody>
        </table>
        <p className="border-t border-white-02 px-3 py-2 font-mont text-[11px] text-gray-05">{parsed.rows.length} bill{parsed.rows.length === 1 ? "" : "s"}, {formatMoney(total, currency)} owed in all{parsed.rows.length > 8 ? "; the first 8 are shown" : ""}.</p>
      </div>}
    </div>
  </DetailDrawer>;
}
