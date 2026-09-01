// New customer / payer - a right-side drawer (prototype style). The receivable
// control account uses the app's type-to-search AccountPicker; opening balance is
// entered in naira and sent as integer kobo. Defaults the AR control to 1200.
import { useState } from "react";
import { toast } from "sonner";
import { toKobo } from "@/utils/money";
import { Plus } from "lucide-react";
import { DetailDrawer, FormField, ReceivableAccountPicker, PostingDateField,} from "@/components/finance-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateCustomerMutation } from "@/redux/services/finance/ar-api";


export function NewCustomerDrawer({ open, onOpenChange, entity }: {
  open: boolean; onOpenChange: (o: boolean) => void; entity: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [account, setAccount] = useState("");
  const [opening, setOpening] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [active, setActive] = useState(true);
  const [create, { isLoading }] = useCreateCustomerMutation();

  const canSubmit = name.trim() !== "" && email.trim() !== "" && phone.trim() !== "";
  const reset = () => { setName(""); setEmail(""); setPhone(""); setAddress(""); setAccount(""); setOpening(""); setOpeningDate(""); setActive(true); };
  const close = () => { reset(); onOpenChange(false); };

  const submit = async () => {
    try {
      const res = await create({
        entity, name: name.trim(),
        billing_email: email.trim(), billing_phone: phone.trim(),
        billing_address: address || undefined,
        receivable_account: account || undefined,
        opening_balance: opening ? toKobo(opening) : undefined,
        opening_date: opening && openingDate ? openingDate : undefined,
        is_active: active,
      }).unwrap();
      toast.success(res.message || "Customer created.");
      close();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(o) => (o ? undefined : close())}
      title="New customer"
      description="Add a customer / payer to the AR sub-ledger."
      widthClass="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
          <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5">
            <Plus className="size-4" />{isLoading ? "Saving…" : "Create customer"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Ltd" className="bg-white" /></FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Billing email" required><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="billing@acme.com" className="bg-white" /></FormField>
          <FormField label="Billing phone" required><Input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234…" className="bg-white" /></FormField>
        </div>
        <FormField label="Billing address"><Input value={address} onChange={(e) => setAddress(e.target.value)} className="bg-white" /></FormField>
        <FormField label="Receivable account">
          <ReceivableAccountPicker entity={entity} value={account} onChange={setAccount} placeholder="Defaults to 1200 Accounts Receivable" />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Opening balance (₦)"><Input type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" className="bg-white" /></FormField>
          <PostingDateField label="Opening as of" entity={entity} value={openingDate} onChange={setOpeningDate} required={false} disabled={!opening} />
        </div>
        {opening ? <p className="-mt-1 font-mont text-[11px] text-gray-05">Backdates the opening-balance invoice into its period. Leave blank to date it today. The period must be open.</p> : null}
        <label className="flex items-center gap-2 font-mont text-sm text-gray-01">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active
        </label>
      </div>
    </DetailDrawer>
  );
}
