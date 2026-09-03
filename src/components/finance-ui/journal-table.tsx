/**
 * <JournalTable lines={…} /> - the Dr/Cr table shown on every "view journal"
 * drawer. Mirrors vs_finance JournalLineSerializer (debit/credit are integer
 * kobo) and shows column totals with a "Balanced ✓" indicator (Σdebit must
 * equal Σcredit for a valid double-entry posting).
 */

import { Check, TriangleAlert } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Money } from "./money";

/** One posted journal line (JournalLineSerializer). */
export interface JournalLineView {
  id?: number;
  line_no?: number;
  account_code?: string;
  account_name?: string;
  description?: string | null;
  debit: number; // kobo
  credit: number; // kobo
}

const headCls =
  "text-gray-01 bg-[#F1F1F1] font-semibold font-mont text-xs whitespace-nowrap pt-3 pb-2";
const cellCls = "text-black-01 border-white-02 font-medium font-mont text-sm";

export function JournalTable({
  lines,
  currency,
  totalDebit,
  totalCredit,
}: {
  lines: JournalLineView[];
  currency?: string | null;
  /** Optional server-computed totals (kobo); falls back to summing the lines. */
  totalDebit?: number;
  totalCredit?: number;
}) {
  const sumDebit = totalDebit ?? lines.reduce((s, l) => s + (l.debit || 0), 0);
  const sumCredit = totalCredit ?? lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = sumDebit === sumCredit;

  return (
    <div className="rounded-md border border-white-02 bg-white">
      <Table>
        <TableHeader className="border-0">
          <TableRow>
            <TableHead className={headCls}>Account</TableHead>
            <TableHead className={headCls}>Description</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Debit</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Credit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, i) => (
            <TableRow key={line.id ?? i}>
              <TableCell className={cellCls}>
                <span className="font-semibold">{line.account_code}</span>
                {line.account_name ? (
                  <span className="ml-2 text-gray-05">{line.account_name}</span>
                ) : null}
              </TableCell>
              <TableCell className={cn(cellCls, "text-gray-01")}>
                {line.description || "-"}
              </TableCell>
              <TableCell className={cellCls}>
                {line.debit ? <Money kobo={line.debit} currency={currency} align="right" /> : <span className="block text-right text-gray-05">-</span>}
              </TableCell>
              <TableCell className={cellCls}>
                {line.credit ? <Money kobo={line.credit} currency={currency} align="right" /> : <span className="block text-right text-gray-05">-</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Totals + balanced indicator */}
      <div className="flex items-center justify-between gap-4 border-t border-white-02 px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-mont text-xs font-semibold",
            balanced ? "text-green-01" : "text-destructive",
          )}
        >
          {balanced ? <Check className="size-4" /> : <TriangleAlert className="size-4" />}
          {balanced ? "Balanced" : "Out of balance"}
        </span>
        <div className="flex items-center gap-8 font-mont text-sm">
          <span className="text-gray-05">
            Debit <Money kobo={sumDebit} currency={currency} className="ml-1 font-semibold text-black-01" />
          </span>
          <span className="text-gray-05">
            Credit <Money kobo={sumCredit} currency={currency} className="ml-1 font-semibold text-black-01" />
          </span>
        </div>
      </div>
    </div>
  );
}
