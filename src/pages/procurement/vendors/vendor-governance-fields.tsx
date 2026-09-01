import { FormField } from "@/components/finance-ui";

export function VendorGovernanceFields({
  canManage,
  kyc,
  risk,
  onHold,
  onKycChange,
  onRiskChange,
  onHoldChange,
}: {
  canManage: boolean;
  kyc: string;
  risk: string;
  onHold: boolean;
  onKycChange: (value: string) => void;
  onRiskChange: (value: string) => void;
  onHoldChange: (value: boolean) => void;
}) {
  if (!canManage) {
    return <p className="text-xs text-gray-05">KYC, risk, and purchasing holds require vendor governance access.</p>;
  }

  return <>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormField label="KYC status">
        <select value={kyc} onChange={(event) => onKycChange(event.target.value)} className="h-9 w-full rounded-md border bg-white px-3 font-mont text-sm">
          <option value="PENDING">Pending</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </FormField>
      <FormField label="Risk">
        <select value={risk} onChange={(event) => onRiskChange(event.target.value)} className="h-9 w-full rounded-md border bg-white px-3 font-mont text-sm">
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </FormField>
    </div>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={onHold} onChange={(event) => onHoldChange(event.target.checked)} /> On hold
    </label>
    <p className="text-xs text-gray-05">Inactive, on-hold, and KYC-rejected vendors cannot receive new purchasing commitments. Payments additionally require KYC verified.</p>
  </>;
}
