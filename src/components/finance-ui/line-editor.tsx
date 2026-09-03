/**
 * <LineEditor> - edits the line items of a document (expense claims, credit
 * notes, …). Each row is description + account + qty + unit price (naira→kobo) +
 * optional tax/cost-centre. The parent maps `account` onto whatever the backend
 * calls it (expense_account / revenue_account). Amounts report in kobo.
 */

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "./money-input";
import { AccountPicker, TaxCodePicker, CostCenterPicker } from "./pickers";
import type { TaxCodeUsage } from "./tax-code-usage";

export interface DocLine {
  description: string;
  account: string;
  quantity: number;
  unitPriceKobo: number;
  taxCode: string;
  costCenter: string;
}

export const emptyLine = (): DocLine => ({ description: "", account: "", quantity: 1, unitPriceKobo: 0, taxCode: "", costCenter: "" });

export function LineEditor({
  entity,
  lines,
  onChange,
  accountLabel,
  accountType,
  currency,
  showTax = true,
  showCostCenter = true,
  taxUsage = "any",
}: {
  entity: string;
  lines: DocLine[];
  onChange: (lines: DocLine[]) => void;
  accountLabel: string;
  accountType?: string;
  currency?: string | null;
  showTax?: boolean;
  showCostCenter?: boolean;
  taxUsage?: TaxCodeUsage;
}) {
  const set = (i: number, patch: Partial<DocLine>) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {lines.map((l, i) => (
        <div key={i} className="space-y-2 rounded-md border border-white-02 p-3">
          <div className="flex items-center gap-2">
            <Input value={l.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Description" className="flex-1 bg-white" />
            <button type="button" onClick={() => remove(i)} disabled={lines.length <= 1} className="text-gray-05 hover:text-destructive disabled:opacity-30">
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <AccountPicker entity={entity} value={l.account} onChange={(v) => set(i, { account: v })} placeholder={accountLabel} postableOnly accountType={accountType} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min={0} step="any" value={l.quantity} onChange={(e) => set(i, { quantity: Number(e.target.value) })} placeholder="Qty" className="bg-white" aria-label="Quantity" />
              <MoneyInput valueKobo={l.unitPriceKobo} onChangeKobo={(k) => set(i, { unitPriceKobo: k })} currency={currency} placeholder="Unit price" />
            </div>
          </div>
          {(showTax || showCostCenter) && (
            <div className="grid grid-cols-2 gap-2">
              {showTax && <TaxCodePicker entity={entity} value={l.taxCode} onChange={(v) => set(i, { taxCode: v })} usage={taxUsage} />}
              {showCostCenter && <CostCenterPicker entity={entity} value={l.costCenter} onChange={(v) => set(i, { costCenter: v })} />}
            </div>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...lines, emptyLine()])} className="gap-1.5">
        <Plus className="size-4" /> Add line
      </Button>
    </div>
  );
}

/** Map editor lines to the backend line shape, naming the account field. */
export function toApiLines(lines: DocLine[], accountField: "expense_account" | "revenue_account") {
  return lines
    .filter((l) => l.account && (l.unitPriceKobo > 0 || l.description.trim()))
    .map((l) => ({
      description: l.description,
      [accountField]: l.account,
      quantity: l.quantity || 1,
      unit_price: l.unitPriceKobo,
      ...(l.taxCode ? { tax_code: l.taxCode } : {}),
      ...(l.costCenter ? { cost_center: l.costCenter } : {}),
    }));
}
