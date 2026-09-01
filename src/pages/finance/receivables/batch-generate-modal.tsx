// Batch generate - raise a posted invoice per customer from a fee structure.
// Backed by POST /finance/fee-structures/<id>/generate/ (gated on
// finance.feestructure.generate). Pick a structure, choose all active customers
// (the common case) and set the dates.
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { FormModal, FormField, toArray, PostingDateField,} from "@/components/finance-ui";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/utils/api-errors";
import { useGetFeeStructuresQuery, useGenerateFromFeeStructureMutation } from "@/redux/services/finance/ar-api";
import type { FeeStructure } from "@/redux/services/finance/ar-types";

const selectCls = "h-9 w-full rounded-md border border-white-02 bg-white px-2 font-mont text-sm focus:border-primary focus:outline-none";

export function BatchGenerateModal({ open, onOpenChange, entity }: {
  open: boolean; onOpenChange: (o: boolean) => void; entity: string;
}) {
  const { data } = useGetFeeStructuresQuery({ entity, is_active: "true" }, { skip: !open });
  const structures = toArray<FeeStructure>(data?.data);
  const [structure, setStructure] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [failure, setFailure] = useState("");
  const [generate, { isLoading }] = useGenerateFromFeeStructureMutation();
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setFailure("");
    onOpenChange(nextOpen);
  };

  const submit = async () => {
    setFailure("");
    try {
      const res = await generate({
        id: structure, entity, all_active: true,
        invoice_date: invoiceDate || undefined, due_date: dueDate || undefined,
      }).unwrap();
      toast.success(res.message || `${res.data?.generated ?? 0} invoice(s) generated.`);
      onOpenChange(false); setStructure(""); setDueDate(""); setFailure("");
    } catch (error) {
      setFailure(apiErrorMessage(error, "The invoices could not be generated. Check the billing setup and try again."));
    }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Batch generate invoices"
      description="Raise a posted invoice for every active customer from the selected fee structure."
      submitText="Generate"
      loading={isLoading}
      canSubmit={!!structure}
      onSubmit={submit}
    >
      <FormField label="Fee structure" required>
        <select value={structure} onChange={(e) => { setStructure(e.target.value); setFailure(""); }} className={selectCls} aria-label="Fee structure">
          <option value="">Select a fee structure…</option>
          {structures.map((f) => (
            <option key={f.id} value={f.id}>{f.code} - {f.name} ({f.total_naira})</option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PostingDateField label="Invoice date" entity={entity} value={invoiceDate} onChange={setInvoiceDate} required={false} />
        <FormField label="Due date">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-white" />
        </FormField>
      </div>
      {failure ? (
        <div role="alert" className="flex gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-mont text-xs font-semibold text-gray-01">Invoices could not be generated</p>
            <p className="mt-0.5 font-mont text-[11px] leading-4 text-gray-05">{failure}</p>
          </div>
        </div>
      ) : null}
      <p className="font-mont text-[11px] text-gray-05">Invoices are raised and posted for all active customers. Customers already billed for this structure are skipped.</p>
    </FormModal>
  );
}
