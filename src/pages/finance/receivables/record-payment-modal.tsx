// Record payment - post a customer receipt against an invoice (Dr bank/cash, Cr AR)
// and allocate it. Amount is entered in naira → sent as integer kobo. Prefilled with
// the outstanding balance; the deposit account is the bank/cash GL account debited.
import { useState } from "react";
import { toast } from "sonner";
import { FormModal, FormField, AccountPicker, PostingDateField,} from "@/components/finance-ui";
import { toKobo } from "@/utils/money";
import { Input } from "@/components/ui/input";
import { useRecordPaymentMutation } from "@/redux/services/finance/ar-api";

const selectCls = "h-9 w-full rounded-md border border-white-02 bg-white px-2 font-mont text-sm focus:border-primary focus:outline-none";
const METHODS = ["BANK_TRANSFER", "CASH", "CARD", "CHEQUE", "ONLINE", "OTHER"] as const;
const methodLabel = (m: string) => m.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function RecordPaymentModal({ open, onOpenChange, entity, invoiceId, docNumber, balanceKobo }: {
  open: boolean; onOpenChange: (o: boolean) => void; entity: string;
  invoiceId: number; docNumber: string; balanceKobo: number;
}) {
  // State initialises from props on mount; the parent remounts (via `key`) on each
  // open so the amount prefills with the current outstanding balance.
  const [amount, setAmount] = useState((balanceKobo / 100).toFixed(2));
  const [date, setDate] = useState("");
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [account, setAccount] = useState("");
  const [reference, setReference] = useState("");
  const [pay, { isLoading }] = useRecordPaymentMutation();

  const kobo = toKobo(amount);
  const canSubmit = kobo > 0 && !!date && !!account;

  const submit = async () => {
    try {
      const res = await pay({
        id: invoiceId, entity, amount: kobo, payment_date: date,
        method, deposit_account: account, reference: reference || undefined,
      }).unwrap();
      toast.success(res.message || "Payment recorded.");
      onOpenChange(false);
    } catch { /* central */ }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      description={`Apply a customer receipt to ${docNumber}.`}
      submitText="Record payment"
      loading={isLoading}
      canSubmit={canSubmit}
      onSubmit={submit}
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Amount (₦)" required>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-white" />
        </FormField>
        <PostingDateField label="Payment date" entity={entity} value={date} onChange={setDate} />
      </div>
      <FormField label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectCls} aria-label="Payment method">
          {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
        </select>
      </FormField>
      <FormField label="Deposit account (bank / cash)" required>
        <AccountPicker entity={entity} value={account} onChange={setAccount} postableOnly accountType="ASSET" placeholder="Type a bank / cash account…" />
      </FormField>
      <FormField label="Reference">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. txn ref / cheque no" className="bg-white" />
      </FormField>
      {kobo > balanceKobo && balanceKobo > 0 && (
        <p className="font-mont text-[11px] text-amber-700">Amount exceeds the balance - the excess is kept as unallocated credit on the customer.</p>
      )}
    </FormModal>
  );
}
