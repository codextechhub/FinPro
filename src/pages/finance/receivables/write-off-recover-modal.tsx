/**
 * Recover a written-off debt that is paid after all.
 *
 * Chidi's family pays the N40,000 written off last year. The money first lands
 * as an ordinary receipt and, because his bill reads settled, as his credit.
 * Recovering applies that receipt to the write-off: the written-off amount is
 * reinstated and booked to Bad debts recovered (4810), then the receipt settles
 * it, so the school shows recovery income rather than money it owes him.
 * Voiding that receipt later writes the debt off again.
 *
 * The receipt must be the same customer's, of the bill's branch, dated no
 * earlier than the write-off, and still hold the credit; the server refuses
 * anything else. Only receipts with credit left are offered.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionModal, FormField, MoneyInput, PostingRecap, toArray } from "@/components/finance-ui";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/utils/money";
import { useDates } from "../../../lib/display-prefs";
import { useGetPaymentsQuery, useGetWriteOffRequestQuery } from "@/redux/services/finance/ar-api";
import { useRecoverWriteOffMutation } from "@/redux/services/finance/fees-api";

/** What is still written off, and the most a receipt holding `credit` may recover. */
export function recoverable(writtenOff: number, recovered: number, credit: number) {
  const left = Math.max(0, writtenOff - recovered);
  return { left, most: Math.min(left, Math.max(0, credit)) };
}

export function WriteOffRecoverModal({ open, onClose, entity, writeOffId, customerCode, currency }: {
  open: boolean; onClose: () => void; entity: string; writeOffId: number; customerCode: string; currency?: string | null;
}) {
  const dates = useDates();
  const { data: woData } = useGetWriteOffRequestQuery({ entity, id: writeOffId }, { skip: !open });
  const { data: payData } = useGetPaymentsQuery({ entity, customer: customerCode }, { skip: !open });
  const writeOff = woData?.data;
  const receipts = useMemo(
    () => toArray(payData?.data).filter((p) => p.status === "POSTED" && p.credit_remaining > 0),
    [payData],
  );
  const [payment, setPayment] = useState("");
  const [amount, setAmount] = useState(0);
  const [recover, { isLoading }] = useRecoverWriteOffMutation();
  const chosen = receipts.find((p) => String(p.id) === payment);
  const limits = recoverable(writeOff?.amount ?? 0, writeOff?.recovered_amount ?? 0, chosen?.credit_remaining ?? 0);
  const value = amount || limits.most;

  const pick = (id: string) => { setPayment(id); setAmount(0); };
  const close = () => { setPayment(""); setAmount(0); onClose(); };
  const submit = async () => {
    if (!chosen) return;
    try {
      const res = await recover({ entity, id: writeOffId, payment: chosen.id, amount: value }).unwrap();
      toast.success(res.message || "Written-off debt recovered.");
      close();
    } catch { /* central */ }
  };

  return (
    <ConfirmActionModal
      open={open} onOpenChange={(o) => !o && close()}
      title="Recover this written-off debt?"
      description="Applies a later receipt to the debt written off. The amount is booked as Bad debts recovered, not as credit the school owes. Voiding that receipt writes the debt off again."
      confirmText="Recover" loading={isLoading} onConfirm={submit}
      confirmDisabled={!chosen || value <= 0 || value > limits.most}
    >
      <div className="space-y-3">
        {writeOff ? (
          <p className="font-mont text-xs text-gray-05">
            Written off {formatMoney(writeOff.amount, currency)}
            {(writeOff.recovered_amount ?? 0) > 0 ? `, ${formatMoney(writeOff.recovered_amount ?? 0, currency)} already recovered` : ""}.
            {" "}Still written off: <span className="font-semibold text-gray-01">{formatMoney(limits.left, currency)}</span>.
          </p>
        ) : null}
        <FormField label="Receipt that paid it" required>
          <NativeSelect value={payment} onChange={(e) => pick(e.target.value)} aria-label="Receipt that paid it">
            <option value="" disabled>{receipts.length ? "Select a receipt" : "No receipt of this customer holds credit"}</option>
            {receipts.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.document_number} · {dates.day(p.payment_date)} · {formatMoney(p.credit_remaining, currency)} credit
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {chosen ? (
          <FormField label="Amount to recover" required>
            <MoneyInput valueKobo={value} onChangeKobo={setAmount} currency={currency} />
            {value > limits.most ? (
              <span className="mt-1 block font-mont text-[11px] text-destructive">At most {formatMoney(limits.most, currency)}.</span>
            ) : null}
          </FormField>
        ) : null}
        {chosen && value > 0 ? (
          <PostingRecap
            title="Recovery" stackOnMobile currency={currency}
            dr={[{ code: "AR", name: "Accounts Receivable", amount: value }]}
            cr={[{ code: "4810", name: "Bad debts recovered", amount: value }]}
            helper="The receipt's credit then settles the reinstated amount."
          />
        ) : null}
      </div>
    </ConfirmActionModal>
  );
}
