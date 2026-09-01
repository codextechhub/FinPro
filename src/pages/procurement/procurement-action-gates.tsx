import { ActionButton } from "@/components/finance-ui/action-button";
import { Can } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { P } from "../../permissions";

export function ContractRenewButton({ onClick }: { onClick: () => void }) {
  return (
    <Can permission={P.PROC_RENEW_CONTRACT}>
      <Button variant="outline" onClick={onClick}>Renew</Button>
    </Can>
  );
}

export function InvoiceVarianceOverrideAction({
  reference,
  onConfirm,
}: {
  reference: string;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Can
      permission={[
        P.PROC_POST_VENDOR_INVOICE,
        P.PROC_OVERRIDE_VENDOR_INVOICE_VARIANCE,
      ]}
      mode="all"
    >
      <ActionButton
        label="Post with Variance Override"
        permission={P.PROC_OVERRIDE_VENDOR_INVOICE_VARIANCE}
        title="Override the blocking match variance?"
        description={`${reference} has a blocking three-way-match variance. Posting will create the Accounts Payable journal and record the override in the finance audit trail.`}
        confirmText="Override & Post"
        onConfirm={onConfirm}
      />
    </Can>
  );
}
