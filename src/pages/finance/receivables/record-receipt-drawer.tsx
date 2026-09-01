// Record receipt (Step 1 of 2) - capture the payment, then hand off to the
// allocation drawer. A right-side drawer matching the prototype: customer / date /
// method / amount / bank account / reference, with a live "Posting on receipt"
// preview (Dr bank · Cr AR) before you continue to allocation. Naira → integer kobo.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { toKobo } from "@/utils/money";
import { ArrowRight } from "lucide-react";
import { DetailDrawer, FormField, Money, CustomerPicker, AccountPicker, PostingDateField, toArray } from "@/components/finance-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRecordCustomerReceiptMutation } from "@/redux/services/finance/ar-api";
import { useGetChartOfAccountsQuery } from "@/redux/services/finance/setup-api";
import type { Account } from "@/redux/services/finance/setup-types";

const selectCls = "h-9 w-full rounded-md border border-white-02 bg-white px-2 font-mont text-sm focus:border-primary focus:outline-none";
const td = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";
const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const METHODS = ["BANK_TRANSFER", "CASH", "CARD", "CHEQUE", "ONLINE", "OTHER"] as const;
const methodLabel = (m: string) => m.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function RecordReceiptDrawer({ open, onOpenChange, entity, currency, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; entity: string;
  currency?: string | null; onCreated: (paymentId: number) => void;
}) {
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [account, setAccount] = useState("");
  const [reference, setReference] = useState("");
  const [record, { isLoading }] = useRecordCustomerReceiptMutation();

  // Resolve account names for the posting preview (Dr bank, Cr AR control).
  const { data: coaData } = useGetChartOfAccountsQuery({ entity }, { skip: !open });
  const accounts = toArray<Account>(coaData?.data);
  const depositAcc = useMemo(() => accounts.find((a) => a.code === account), [accounts, account]);
  const arAcc = useMemo(() => accounts.find((a) => a.account_type === "ASSET" && a.tag === "CONTROL"), [accounts]);

  const kobo = toKobo(amount);
  const canSubmit = !!customer && kobo > 0 && !!date && !!account;
  const reset = () => { setCustomer(""); setAmount(""); setDate(""); setMethod("BANK_TRANSFER"); setAccount(""); setReference(""); };
  const close = () => { reset(); onOpenChange(false); };

  const submit = async () => {
    try {
      const res = await record({
        entity, id: customer, amount: kobo, payment_date: date,
        method, deposit_account: account, reference: reference || undefined,
        auto_allocate: false,   // capture only - allocate in the next step
      }).unwrap();
      toast.success(res.message || "Receipt captured.");
      reset();
      onOpenChange(false);
      if (res.data?.id) onCreated(res.data.id);
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(o) => (o ? undefined : close())}
      title="Record receipt"
      description="Step 1 - capture the payment, then allocate."
      widthClass="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
          <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5">
            {isLoading ? "Saving…" : "Continue to allocation"}<ArrowRight className="size-4" />
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Customer" required>
          <CustomerPicker entity={entity} value={customer} onChange={setCustomer} placeholder="Type a customer name…" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
          <FormField label="Method" required>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectCls} aria-label="Method">
              {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
            </select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount (₦)" required>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-white" />
          </FormField>
          <FormField label="Bank account" required>
            <AccountPicker entity={entity} value={account} onChange={setAccount} postableOnly accountType="ASSET" placeholder="Type a bank / cash account…" />
          </FormField>
        </div>
        <FormField label="Reference">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer / gateway reference" className="bg-white" />
        </FormField>

        {/* posting preview */}
        {kobo > 0 && account && (
          <div>
            <p className="mb-1 font-mont text-sm font-semibold text-black-01">Posting on receipt</p>
            <div className="overflow-x-auto rounded-md border border-white-02">
              <table className="w-full border-collapse">
                <thead><tr><th className={th}>Account</th><th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Credit</th></tr></thead>
                <tbody>
                  <tr>
                    <td className={td}><span className="font-semibold tabular-nums">{account}</span> {depositAcc?.name ?? "Bank / cash"}</td>
                    <td className={cn(td, "text-right tabular-nums")}><Money kobo={kobo} currency={currency} align="right" /></td>
                    <td className={cn(td, "text-right text-gray-05")}>-</td>
                  </tr>
                  <tr>
                    <td className={td}><span className="font-semibold tabular-nums">{arAcc?.code ?? "1200"}</span> {arAcc?.name ?? "Accounts Receivable"}</td>
                    <td className={cn(td, "text-right text-gray-05")}>-</td>
                    <td className={cn(td, "text-right tabular-nums")}><Money kobo={kobo} currency={currency} align="right" /></td>
                  </tr>
                  <tr className="font-semibold">
                    <td className={cn(td, "border-t-2")}>Total</td>
                    <td className={cn(td, "border-t-2 text-right tabular-nums")}><Money kobo={kobo} currency={currency} align="right" /></td>
                    <td className={cn(td, "border-t-2 text-right tabular-nums")}><Money kobo={kobo} currency={currency} align="right" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1 font-mont text-[11px] text-gray-05">Cash debits the bank; the credit settles AR for what the customer owes and books any excess as customer credit (2140).</p>
          </div>
        )}
      </div>
    </DetailDrawer>
  );
}
