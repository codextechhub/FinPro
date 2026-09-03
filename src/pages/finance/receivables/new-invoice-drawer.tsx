/**
 * New invoice - a right-side drawer matching the detail-drawer structure (header ·
 * sectioned body · pinned footer). Customer/account/tax use the app's SearchSelect
 * (type the name → the list populates). Unit price is entered in naira and sent as
 * integer kobo; "Issue now" posts the AR journal, else it saves a priced draft.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { toKobo } from "@/utils/money";
import { Plus, Trash2 } from "lucide-react";
import { DetailDrawer, Money, CustomerPicker, AccountPicker, TaxCodePicker, toArray, PostingDateField,} from "@/components/finance-ui";
import { SearchSelect } from "@/components/custom/search-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGetTaxCodesQuery } from "@/redux/services/finance/setup-api";
import { useCreateInvoiceMutation, useGetFeeStructuresQuery } from "@/redux/services/finance/ar-api";
import type { FeeStructure } from "@/redux/services/finance/ar-types";
import type { TaxCode } from "@/redux/services/finance/setup-types";

const fieldLabel = "font-mont text-xs text-gray-05";

type Line = { account: string; description: string; qty: string; price: string; tax: string };
const blankLine = (): Line => ({ account: "", description: "", qty: "1", price: "", tax: "" });

export function NewInvoiceDrawer({ open, onOpenChange, entity, currency }: {
  open: boolean; onOpenChange: (o: boolean) => void; entity: string; currency?: string | null;
}) {
  // Tax rates for the live preview (the picker itself loads its own options).
  const { data: taxData } = useGetTaxCodesQuery({ entity }, { skip: !open });
  const taxByCode = useMemo(
    () => Object.fromEntries(toArray<TaxCode>(taxData?.data).map((t) => [t.code, t.rate_bps])),
    [taxData],
  );
  // Fee structures - an optional shortcut: pick one to prefill the lines below.
  const { data: fsData } = useGetFeeStructuresQuery({ entity, is_active: "true" }, { skip: !open });
  const structures = toArray<FeeStructure>(fsData?.data);
  const fsOptions = structures.map((f) => ({ value: String(f.id), label: `${f.code} - ${f.name} (${f.total_naira})` }));

  const [structure, setStructure] = useState("");
  const [customer, setCustomer] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [post, setPost] = useState(true);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [create, { isLoading }] = useCreateInvoiceMutation();

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, blankLine()]);
  const removeLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));

  // Prefill the lines from a fee structure's items (still fully editable after).
  const applyStructure = (id: string) => {
    setStructure(id);
    const fs = structures.find((f) => String(f.id) === id);
    if (fs && fs.items.length) {
      setLines(fs.items.map((it) => ({
        account: it.revenue_account_code, description: it.description,
        qty: "1", price: (it.amount / 100).toFixed(2), tax: it.tax_code_value || "",
      })));
    }
  };

  const totals = useMemo(() => {
    let net = 0, tax = 0;
    for (const l of lines) {
      const lineNet = Math.round((parseFloat(l.qty) || 0) * toKobo(l.price));
      net += lineNet;
      const bps = l.tax ? taxByCode[l.tax] ?? 0 : 0;
      tax += Math.round((lineNet * bps) / 10000);
    }
    return { net, tax, total: net + tax };
  }, [lines, taxByCode]);

  const validLines = lines.filter((l) => l.account && toKobo(l.price) > 0);
  const canSubmit = !!customer && !!invoiceDate && validLines.length > 0;

  const reset = () => {
    setStructure(""); setCustomer(""); setDueDate(""); setReference(""); setNarration("");
    setPost(true); setLines([blankLine()]); setInvoiceDate("");
  };
  const close = () => { reset(); onOpenChange(false); };

  const submit = async () => {
    try {
      const res = await create({
        entity, customer, invoice_date: invoiceDate,
        due_date: dueDate || undefined, reference: reference || undefined,
        narration: narration || undefined, post,
        lines: validLines.map((l) => ({
          revenue_account: l.account,
          description: l.description || undefined,
          quantity: parseFloat(l.qty) || 1,
          unit_price: toKobo(l.price),
          tax_code: l.tax || null,
        })),
      }).unwrap();
      toast.success(res.message || "Invoice created.");
      close();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title="New invoice"
      description="Raise a customer invoice - each line credits a revenue account."
      widthClass="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
          <Button disabled={isLoading || !canSubmit} onClick={submit}>
            {isLoading ? "Saving…" : post ? "Issue invoice" : "Save draft"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* customer & dates */}
        <div className="space-y-3">
          <CustomerPicker entity={entity} value={customer} onChange={setCustomer} label="Customer" isRequired placeholder="Type a customer name…" />
          <div className="grid grid-cols-2 gap-3">
            <PostingDateField label="Invoice date" entity={entity} value={invoiceDate} onChange={setInvoiceDate} />
            <label className="block space-y-1">
              <span className={fieldLabel}>Due date</span>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-white" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={fieldLabel}>Reference</span>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. PO-1024" className="bg-white" />
          </label>
        </div>

        {/* fee structure shortcut - prefills the lines below */}
        {fsOptions.length > 0 && (
          <div className="rounded-md bg-pry-01/40 p-3">
            <SearchSelect
              label="Start from a fee structure (optional)"
              options={fsOptions}
              value={structure}
              onChange={(e) => applyStructure(e.target.value)}
              placeholder="Pick a fee structure to prefill lines…"
            />
            <p className="mt-1.5 font-mont text-[11px] text-gray-05">Loads the structure’s items into the lines below - you can still edit, add or remove them.</p>
          </div>
        )}

        {/* lines */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mont text-sm font-semibold text-black-01">Lines</span>
            <Button type="button" variant="outline" size="sm" onClick={addLine} className="h-7 gap-1 px-2 text-xs"><Plus className="size-3.5" /> Add line</Button>
          </div>
          {lines.map((l, i) => {
            const net = Math.round((parseFloat(l.qty) || 0) * toKobo(l.price));
            return (
              <div key={i} className="space-y-2 rounded-md border border-white-02 bg-white p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <AccountPicker entity={entity} value={l.account} onChange={(v) => setLine(i, { account: v })} postableOnly accountType="INCOME" placeholder="Type a revenue account…" />
                  </div>
                  <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1}
                    className="mt-2 text-gray-05 hover:text-destructive disabled:opacity-30" aria-label="Remove line">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description" className="h-9 bg-white" />
                <div className="grid grid-cols-12 items-center gap-2">
                  <Input value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} type="number" min="0" step="1" placeholder="Qty" className="col-span-3 h-9 bg-white" aria-label="Quantity" />
                  <Input value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} type="number" min="0" step="0.01" placeholder="Unit price (₦)" className="col-span-5 h-9 bg-white" aria-label="Unit price" />
                  <div className="col-span-4">
                    <TaxCodePicker entity={entity} value={l.tax} onChange={(v) => setLine(i, { tax: v })} placeholder="No tax" usage="sales" />
                  </div>
                </div>
                <div className="text-right font-mont text-[11px] text-gray-05">Net <Money kobo={net} currency={currency} /></div>
              </div>
            );
          })}
        </div>

        {/* narration */}
        <label className="block space-y-1">
          <span className={fieldLabel}>Narration</span>
          <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Optional note shown on the invoice" className="bg-white" />
        </label>

        {/* totals + issue toggle */}
        <div className="space-y-2 rounded-md bg-gray-50 px-3 py-3 font-mont text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-05">Subtotal</span>
            <span className="font-semibold text-black-01"><Money kobo={totals.net} currency={currency} /></span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-05">Tax</span>
            <span className="font-semibold text-black-01"><Money kobo={totals.tax} currency={currency} /></span>
          </div>
          <div className="flex items-center justify-between border-t border-white-02 pt-2 text-sm">
            <span className="font-semibold text-black-01">Total</span>
            <span className="font-semibold text-black-01"><Money kobo={totals.total} currency={currency} /></span>
          </div>
          <label className="mt-1 flex items-center gap-2 text-gray-01">
            <input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} className="size-3.5 accent-primary" />
            Issue now (post the AR journal)
          </label>
        </div>
      </div>
    </DetailDrawer>
  );
}
