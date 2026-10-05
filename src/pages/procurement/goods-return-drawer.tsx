/**
 * Returning goods to the vendor against a posted receipt (RV-).
 *
 * Stock falls by the returned quantity at the receipt's cost and GR/IR reverses
 * with it, in the receipt's branch. Only what has not been billed beyond can go
 * back: goods already on a bill are credited on the bill first, and the server
 * says so if a return asks for more. With no quantities named, everything still
 * on the receipt goes back, which is how a receipt entered in error is undone.
 */

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";

import { DetailDrawer, PostingDateField, Segmented } from "@/components/finance-ui";
import { ReasonField } from "@/components/finance-ui/reason-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/utils/money";
import { formatQuantity } from "@/utils/quantity";
import { useDates } from "../../lib/display-prefs";
import { useReturnGoodsMutation } from "@/redux/services/procurement/payables-corrections-api";
import type { GoodsReceipt } from "@/redux/services/procurement/procurement-types";
import { returnableQuantity, returnLines } from "./goods-return";

export function GoodsReturnDrawer({ receipt, entity, currency, onClose }: { receipt: GoodsReceipt; entity: string; currency?: string | null; onClose: () => void }) {
  const dates = useDates();
  const [mode, setMode] = useState<"pick" | "all">("pick");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [returnDate, setReturnDate] = useState(() => dates.today(receipt.branch_id ?? undefined));
  const [returnGoods, { isLoading }] = useReturnGoodsMutation();
  const lines = returnLines(receipt.lines, quantities);
  const over = receipt.lines.some((line) => Number(quantities[line.id] || 0) > returnableQuantity(line));
  const ready = !!reason.trim() && !!returnDate && !over && (mode === "all" || lines.length > 0);
  const value = receipt.lines.reduce((sum, line) => sum + Math.round(Number(quantities[line.id] || 0) * line.unit_price), 0);
  const send = async () => {
    if (!ready) return;
    try {
      const response = await returnGoods({ id: receipt.id, entity, reason: reason.trim(), return_date: returnDate, ...(mode === "pick" ? { lines } : {}) }).unwrap();
      toast.success(response.message || "Goods returned to the vendor.");
      onClose();
    } catch { /* central */ }
  };
  return <DetailDrawer open onOpenChange={(open) => !isLoading && !open && onClose()} title={`Return goods on ${receipt.document_number}`} description={`${receipt.vendor_name || receipt.vendor_code} · received ${dates.day(receipt.received_date)}`} widthClass="sm:max-w-[680px]" footer={<><Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button><Button variant="outline-dest" disabled={!ready} loading={isLoading} onClick={send}><Undo2 className="size-4" /> Return goods</Button></>}>
    <div className="space-y-4">
      <p className="rounded-md border border-white-02 bg-gray-50 px-3 py-2 font-mont text-[11px] leading-5 text-gray-05">Stock falls by what goes back, at the receipt&rsquo;s cost, and the goods-received liability reverses with it. Goods already billed must be credited on the bill first.</p>
      <Segmented value={mode} onChange={setMode} options={[["pick", "Choose quantities"], ["all", "Everything still on it"]] as const} />
      {mode === "pick" ? <div className="space-y-2">{receipt.lines.map((line) => {
        const left = returnableQuantity(line);
        const typed = Number(quantities[line.id] || 0);
        return <div key={line.id} className="grid grid-cols-1 gap-3 rounded-md border border-white-02 p-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div className="min-w-0"><p className="font-mont text-sm font-semibold">{line.description}</p><p className="mt-1 font-mont text-[11px] text-gray-05">Accepted {formatQuantity(line.accepted_qty)}{Number(line.returned_qty || 0) ? ` · returned ${formatQuantity(line.returned_qty!)}` : ""} · up to {formatQuantity(String(left))} can go back · {formatMoney(line.unit_price, currency)} each</p>{typed > left && <p role="alert" className="mt-1 font-mont text-[11px] text-destructive">Only {formatQuantity(String(left))} received can go back.</p>}</div>
          <Input type="number" min="0" max={left} step="0.0001" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((rows) => ({ ...rows, [line.id]: event.target.value }))} placeholder="0" aria-label={`${line.description} quantity to return`} disabled={left <= 0} className="bg-white text-right tabular-nums" />
        </div>;
      })}{value > 0 && <p className="text-right font-mont text-xs text-gray-05">Value going back: <span className="font-semibold tabular-nums text-black-01">{formatMoney(value, currency)}</span></p>}</div>
        : <p className="font-mont text-xs text-gray-05">Everything on this receipt that has not been billed or already returned goes back to the vendor.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PostingDateField label="Return date" entity={entity} value={returnDate} onChange={setReturnDate} notBefore={receipt.received_date} notBeforeLabel={`receipt ${receipt.document_number}`} />
      </div>
      <ReasonField value={reason} onChange={setReason} label="Why the goods are going back" placeholder="e.g. 20 chairs arrived broken" />
    </div>
  </DetailDrawer>;
}
