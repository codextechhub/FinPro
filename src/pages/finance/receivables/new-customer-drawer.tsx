/**
 * New customer / payer - a right-side drawer (prototype style). The receivable
 * control account uses the app's type-to-search AccountPicker; opening balance is
 * entered in naira and sent as integer kobo. Defaults the AR control to 1200.
 *
 * A customer is master data: it may be filed under one branch or shared by every
 * branch. Who decides is the reader's reach (see `customerBranchChoice`): a
 * reader covering several branches names one of theirs, a whole-school reader may
 * name one or leave the customer shared, and a reader pinned to one branch, or a
 * school with one, is not asked.
 *
 * The opening balance is a transaction and belongs to one branch. For a shared
 * customer at a school with several branches the form therefore asks which
 * branch the opening balance is for, once one is entered, and sends it as
 * `opening_branch`; a customer filed under a branch takes that branch.
 */
import { useState } from "react";
import { toast } from "sonner";
import { toKobo } from "@/utils/money";
import { Plus } from "lucide-react";
import {
  DetailDrawer, FormField, ReceivableAccountPicker, PostingDateField, RaisingBranchChoiceField,
  useRaisingBranchChoice, useReaderBranchLens,
} from "@/components/finance-ui";
import { NativeSelect } from "@/components/ui/native-select";
import type { ReaderBranchLens } from "@/components/finance-ui/raising-branch";
import { useReaderReach } from "../../../host";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateCustomerMutation } from "@/redux/services/finance/ar-api";


/**
 * Whether a new customer's branch is asked, whether it must be named, and what
 * it starts on. Asked at a school with several branches of a reader not pinned
 * to one. A whole-school reader may leave it blank, which files the customer as
 * shared by every branch; one covering several branches must name one of theirs,
 * as the server requires. It starts on the branch the reader is working in.
 */
export function customerBranchChoice(lens: ReaderBranchLens, wholeSchool: boolean) {
  const ask = lens.applies && lens.pinnedBranch == null && lens.choices.length > 0;
  const working = lens.branch !== "all" && lens.choices.some((b) => Number(b.id) === lens.branch) ? String(lens.branch) : "";
  return { ask, required: ask && !wholeSchool, choices: ask ? lens.choices : [], initial: ask ? working : "" };
}

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
  const filing = customerBranchChoice(useReaderBranchLens(), useReaderReach().wholeSchool);
  const [picked, setPicked] = useState<string | null>(null);
  const customerBranch = picked ?? filing.initial;
  const hasOpening = toKobo(opening) > 0;
  // A customer filed under a branch gives its opening balance that branch.
  const openingBranch = useRaisingBranchChoice({ unless: !hasOpening || !!customerBranch });

  const canSubmit = name.trim() !== "" && email.trim() !== "" && phone.trim() !== "" && openingBranch.ready
    && (!filing.required || !!customerBranch);
  const reset = () => { setName(""); setEmail(""); setPhone(""); setAddress(""); setAccount(""); setOpening(""); setOpeningDate(""); setActive(true); setPicked(null); openingBranch.reset(); };
  const close = () => { reset(); onOpenChange(false); };

  const submit = async () => {
    try {
      const res = await create({
        entity, name: name.trim(),
        ...(filing.ask && customerBranch ? { branch: Number(customerBranch) } : {}),
        billing_email: email.trim(), billing_phone: phone.trim(),
        billing_address: address || undefined,
        receivable_account: account || undefined,
        opening_balance: opening ? toKobo(opening) : undefined,
        opening_date: opening && openingDate ? openingDate : undefined,
        ...openingBranch.body("opening_branch"),
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
      description="Add a customer or payer."
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
        {filing.ask ? (
          <FormField label="Branch" required={filing.required}>
            <NativeSelect value={customerBranch} onChange={(e) => setPicked(e.target.value)} aria-label="Customer branch">
              {filing.required ? <option value="" disabled>Select branch</option> : <option value="">Shared by every branch</option>}
              {filing.choices.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </NativeSelect>
            <span className="mt-1 block font-mont text-[11px] leading-5 text-gray-05">
              {filing.required ? "The branch this customer belongs to." : "The branch this customer belongs to, or shared so every branch can bill them."}
            </span>
          </FormField>
        ) : null}
        <FormField label="Billing address"><Input value={address} onChange={(e) => setAddress(e.target.value)} className="bg-white" /></FormField>
        <FormField label="Receivable account">
          <ReceivableAccountPicker entity={entity} value={account} onChange={setAccount} placeholder="Defaults to 1200 Accounts Receivable" />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Opening balance (₦)"><Input type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" className="bg-white" /></FormField>
          <PostingDateField label="Opening as of" entity={entity} value={openingDate} onChange={setOpeningDate} required={false} disabled={!opening} />
        </div>
        {opening ? <p className="-mt-1 font-mont text-[11px] text-gray-05">Backdates the opening-balance invoice into its period. Leave blank to date it today. The period must be open.</p> : null}
        <RaisingBranchChoiceField choice={openingBranch} label="Opening balance branch" hint="The branch the opening-balance invoice is raised for." />
        <label className="flex items-center gap-2 font-mont text-sm text-gray-01">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active
        </label>
      </div>
    </DetailDrawer>
  );
}
