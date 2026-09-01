// <PostingRecap> - the Vision prototype's DR/CR posting card, in the house theme.
// A "Debits = Credits" header, two side-by-side Debit (DR) / Credit (CR) columns
// (account left, amount right; debit amounts red, credit green), and a Total Dr /
// Total Cr footer. Used to recap a real journal (detail drawers) or preview the
// journal a form will post (create drawers) - never implies a second posting.
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";

export type RecapRow = { code: string; name: string; amount: number };

function RecapColumn({ label, totalLabel, rows, currency, side }: {
  label: string; totalLabel: string; rows: RecapRow[]; currency?: string | null; side: "DR" | "CR";
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  // Debit amounts read red, credit amounts green - by the column they sit in.
  const amtColor = side === "DR" ? "text-destructive" : "text-green-01";
  return (
    <div className="flex flex-col">
      <p className="border-b border-white-02 px-4 py-2 font-mont text-[10px] font-semibold uppercase tracking-wider text-gray-05">{label}</p>
      <div className="flex-1 space-y-2 px-4 py-3">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-mont text-[13px] text-gray-01">
              <span className="font-semibold text-black-01">{r.code}</span>{r.name ? ` ${r.name}` : ""}
            </span>
            <span className={cn("shrink-0 font-mont text-sm font-semibold tabular-nums", amtColor)}>{formatMoney(r.amount, currency)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-white-02 px-4 py-2.5">
        <span className="font-mont text-[11px] font-semibold uppercase tracking-wider text-gray-05">{totalLabel}</span>
        <span className="font-mont text-sm font-semibold tabular-nums text-black-01">{formatMoney(total, currency)}</span>
      </div>
    </div>
  );
}

export function PostingRecap({ title, dr, cr, currency, helper, stackOnMobile = false }: {
  title: string; dr: RecapRow[]; cr: RecapRow[]; currency?: string | null; helper?: string;
  stackOnMobile?: boolean;
}) {
  const totalDr = dr.reduce((s, r) => s + r.amount, 0);
  const totalCr = cr.reduce((s, r) => s + r.amount, 0);
  const balanced = totalDr === totalCr;
  return (
    <div className="overflow-hidden rounded-lg border border-white-02 bg-white">
      <div className="flex items-center justify-between border-b border-gray-03 bg-gray-03 px-4 py-2.5">
        <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-01">{title}</p>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mont text-[11px] font-semibold",
          balanced ? "bg-green-01/10 text-green-01" : "bg-amber-50 text-amber-700")}>
          {balanced ? <Check className="size-3" /> : null} Debits = Credits
        </span>
      </div>
      <div className={cn(
        "grid",
        stackOnMobile
          ? "grid-cols-1 divide-y divide-white-02 sm:grid-cols-2 sm:divide-x sm:divide-y-0"
          : "grid-cols-2 divide-x divide-white-02",
      )}>
        <RecapColumn label="Debit (DR)" totalLabel="Total Dr" rows={dr} currency={currency} side="DR" />
        <RecapColumn label="Credit (CR)" totalLabel="Total Cr" rows={cr} currency={currency} side="CR" />
      </div>
      {helper ? (
        <p className="border-t border-gray-03 bg-gray-03 px-4 py-2.5 font-mont text-[11px] text-gray-05">{helper}</p>
      ) : null}
    </div>
  );
}
