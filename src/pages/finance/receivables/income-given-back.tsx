/**
 * The income a credit note or concession gave back to another branch.
 *
 * Tunde's textbook bill was raised at Ikeja and moved to Lekki with him. When
 * Lekki credits it, the revenue and VAT come off Ikeja's books, not Lekki's:
 * Ikeja booked them. The server books that as an "Income given back" transfer
 * between the two branches and lists it on the document (`income_given_back`).
 * This panel names each one and opens it in the inter-branch register, so the
 * bursar reading the credit note can see what it did at the other branch.
 *
 * It renders nothing for a document that touched no other branch's income.
 */

import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

import { formatMoney } from "@/utils/money";
import type { IncomeGivenBackRow } from "@/redux/services/finance/ar-types";
import { transferLink } from "../inter-branch/links";

/** One row's sentence: who gives back how much, and whether it still stands. */
export function incomeGivenBackLine(row: IncomeGivenBackRow, money: (kobo: number) => string): string {
  const base = `${row.to_branch_name} gives back ${money(row.amount)} of income it booked`;
  return row.status === "REVERSED" ? `${base} (reversed with this document)` : base;
}

export function IncomeGivenBack({ rows, currency }: { rows: IncomeGivenBackRow[] | undefined; currency?: string | null }) {
  if (!rows?.length) return null;
  const money = (kobo: number) => formatMoney(kobo, currency);
  return (
    <section className="space-y-2">
      <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Income given back between branches</p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white-02 px-3 py-2">
            <span className="min-w-0 font-mont text-sm text-black-01">{incomeGivenBackLine(row, money)}</span>
            <Link to={transferLink(row.id)} className="inline-flex items-center gap-1 font-mont text-xs font-medium text-primary hover:underline">
              {row.document_number || `Transfer #${row.id}`} <ArrowRight className="size-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
