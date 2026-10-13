/**
 * The vendor form's compliance controls: KYC status, risk rating and purchasing hold.
 *
 * Two gates apply and they ask different things. The vendor-governance key
 * (`canManage`) says who may take the decision. Field Access on
 * `procurement.vendor` says who may see and change each value: a hidden one is
 * not on the form, a read-only one is greyed. A role without the key sees only a
 * note, and only when it can read at least one of the three.
 */

import { AccessField, type FieldAccess, type FieldErrors } from "@/components/finance-ui";

const NAMES = ["kyc_status", "risk", "on_hold"] as const;

export function VendorGovernanceFields({
  canManage,
  access,
  errors,
  kyc,
  risk,
  onHold,
  onKycChange,
  onRiskChange,
  onHoldChange,
}: {
  canManage: boolean;
  access: FieldAccess;
  errors?: FieldErrors | null;
  kyc: string;
  risk: string;
  onHold: boolean;
  onKycChange: (value: string) => void;
  onRiskChange: (value: string) => void;
  onHoldChange: (value: boolean) => void;
}) {
  if (!access.anyVisible(...NAMES)) return null;
  if (!canManage) {
    return <p className="text-xs text-gray-05">KYC, risk, and purchasing holds require vendor governance access.</p>;
  }

  return <>
    {access.anyVisible("kyc_status", "risk") ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <AccessField access={access} name="kyc_status" label="KYC status" errors={errors}>
        <select value={kyc} onChange={(event) => onKycChange(event.target.value)} className="h-9 w-full rounded-md border bg-white px-3 font-mont text-sm">
          <option value="PENDING">Pending</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </AccessField>
      <AccessField access={access} name="risk" label="Risk" errors={errors}>
        <select value={risk} onChange={(event) => onRiskChange(event.target.value)} className="h-9 w-full rounded-md border bg-white px-3 font-mont text-sm">
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </AccessField>
    </div> : null}
    <AccessField access={access} name="on_hold" errors={errors}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onHold} onChange={(event) => onHoldChange(event.target.checked)} /> On hold
      </label>
    </AccessField>
    <p className="text-xs text-gray-05">Inactive, on-hold, and KYC-rejected vendors cannot receive new purchasing commitments. Payments additionally require KYC verified.</p>
  </>;
}
