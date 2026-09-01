import {
  BadgeCheck,
  BookOpenCheck,
  Boxes,
  Building2,
  Clock3,
  ClipboardCheck,
  FileCheck2,
  FileSignature,
  Gavel,
  ListChecks,
  PackageCheck,
  ReceiptText,
  Scale,
  Save,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { P } from "../../permissions";
import { routesPath } from "@/routes/routes-path";
import { usePermissions } from "@/hooks/use-permissions";
import {
  ConsoleSettingsLayout,
  PolicyBadge,
  SettingsAuditHistory,
  SettingsConsumer,
  SettingsOverviewCard,
  SettingsPanel,
  SettingsRow,
  SettingsSectionHeader,
  type ConsoleSettingsSection,
} from "@/components/settings/settings-layout";
import { useActiveEntity } from "@/components/finance-ui";
import { useGetFinanceAccountSettingsQuery } from "@/redux/services/finance/setup-api";
import { useGetProcurementSettingsQuery, useUpdateProcurementSettingsMutation } from "@/redux/services/procurement/procurement-api";
import type { ProcurementSettingsValues } from "@/redux/services/procurement/procurement-types";
import type { FinanceAuditLog, SettingConsumer } from "@/redux/services/finance/setup-types";
import { ProcurementShell } from "./procurement-shell";
import {
  DEFAULT_PROCUREMENT_SETTINGS_SECTION, type ProcurementSettingsSection,
} from "./console-sections";

const PR = routesPath.PROTECTED.PROCUREMENT;
const F = routesPath.PROTECTED.FINANCE;

const SECTIONS: ConsoleSettingsSection[] = [
  { key: "overview", title: "Overview", description: "Configuration health", icon: Settings2 },
  { key: "general", title: "General defaults", description: "Entity and document defaults", icon: Building2 },
  { key: "purchasing", title: "Purchasing policy", description: "Requisitions and vendors", icon: ShoppingCart },
  { key: "sourcing-lifecycle", title: "Sourcing and lifecycle", description: "RFQs and renewals", icon: Clock3 },
  { key: "competitive-governance", title: "Competitive governance", description: "Bid minimums and exceptions", icon: Gavel },
  { key: "matching", title: "Invoice matching", description: "PO, receipt and invoice", icon: Scale },
  { key: "accounting", title: "Accounting integration", description: "Control account map", icon: BookOpenCheck },
  { key: "approvals", title: "Approvals", description: "Purchasing workflows", icon: Workflow },
  { key: "reference-data", title: "Reference data", description: "Vendors, catalog and stock", icon: Tags },
];

const PROCUREMENT_ACCOUNTS = [
  ["ACCOUNTS_PAYABLE", "Accounts payable", "Vendor sub-ledger control account."],
  ["GRIR_CLEARING", "GR/IR clearing", "Temporary liability between goods receipt and vendor invoice."],
  ["WHT_PAYABLE", "WHT payable", "Withholding tax deducted from vendor payments."],
  ["INVENTORY_ASSET", "Inventory asset", "Value of stock held for future issue."],
  ["INVENTORY_ADJUSTMENT", "Inventory adjustment", "Stock-count gains, losses and write-downs."],
  ["PURCHASE_PRICE_VARIANCE", "Purchase price variance", "Difference between receipt basis and vendor invoice price."],
] as const;

const PAYMENT_TERMS = [
  ["NET_0", "Due on receipt"], ["NET_7", "Net 7 days"], ["NET_14", "Net 14 days"],
  ["NET_30", "Net 30 days"], ["NET_60", "Net 60 days"], ["NET_90", "Net 90 days"],
] as const;

/** `section` comes from the route table; see console-sections.ts. */
export default function ProcurementSettings({ section = DEFAULT_PROCUREMENT_SETTINGS_SECTION }: {
  section?: ProcurementSettingsSection;
}) {
  // Only registered sections reach here, so no fallback guard is needed.
  const activeSection = section;
  const active = useActiveEntity();

  return (
    <ProcurementShell>
      <ConsoleSettingsLayout
        title="Procurement Settings"
        description="Review the defaults and controls behind purchasing, vendor governance, matching and payables."
        basePath={PR.SETTINGS}
        activeSection={activeSection}
        sections={SECTIONS}
        scopeLabel={active.entity ? `${active.entity.code} · ${active.entity.name}` : "Select an entity"}
      >
        {activeSection === "overview" ? <Overview entity={active.entity} /> : null}
        {activeSection === "general" ? <General entity={active.entity} entityCode={active.code} /> : null}
        {activeSection === "purchasing" ? <PurchasingPolicy entityCode={active.code} /> : null}
        {activeSection === "sourcing-lifecycle" ? <SourcingLifecycle entityCode={active.code} /> : null}
        {activeSection === "competitive-governance" ? <CompetitiveGovernance entityCode={active.code} /> : null}
        {activeSection === "matching" ? <MatchingPolicy entityCode={active.code} /> : null}
        {activeSection === "accounting" ? <AccountingIntegration entityCode={active.code} /> : null}
        {activeSection === "approvals" ? <Approvals /> : null}
        {activeSection === "reference-data" ? <ReferenceData /> : null}
      </ConsoleSettingsLayout>
    </ProcurementShell>
  );
}

function Overview({ entity }: { entity: ReturnType<typeof useActiveEntity>["entity"] }) {
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.overview"><SettingsSectionHeader title="Configuration overview" description="Review entity inheritance first, then the policies that control the procure-to-pay chain." /></div>
      <SettingsPanel title="Active entity" description="Procurement uses the same entity and fiscal posting window as Finance.">
        <SettingsRow icon={Building2} label={entity?.name ?? "No active entity selected"} description={entity ? `${entity.code} · reporting currency ${entity.base_currency}` : "Choose an entity from the header to inspect procurement settings."} badge={<PolicyBadge kind={entity ? "configured" : "default"}>{entity ? "Inherited" : "Needs entity"}</PolicyBadge>} />
      </SettingsPanel>
      <div data-guide="procurement-settings.sections" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SettingsOverviewCard icon={Building2} title="General defaults" description="Review entity inheritance, currency, payment terms and delivery behavior." to={`${PR.SETTINGS}/general`} status="Inherited" />
        <SettingsOverviewCard icon={ShoppingCart} title="Purchasing policy" description="Set vendor eligibility, requisition timing and receipt evidence." to={`${PR.SETTINGS}/purchasing`} status="Configurable" tone="ready" />
        <SettingsOverviewCard icon={Clock3} title="Sourcing and lifecycle" description="Set RFQ response windows, closing alerts and contract renewal defaults." to={`${PR.SETTINGS}/sourcing-lifecycle`} status="Configurable" tone="ready" />
        <SettingsOverviewCard icon={Gavel} title="Competitive governance" description="Require enough invited vendors and submitted bids before commitment." to={`${PR.SETTINGS}/competitive-governance`} status="Protected" tone="attention" />
        <SettingsOverviewCard icon={Scale} title="Invoice matching" description="Understand quantity, price and receipt checks before vendor bills post." to={`${PR.SETTINGS}/matching`} status="Review" tone="attention" />
        <SettingsOverviewCard icon={BookOpenCheck} title="Accounting integration" description="Review the Finance accounts Procurement expects for P2P posting." to={`${PR.SETTINGS}/accounting`} status="Finance-owned" />
        <SettingsOverviewCard icon={Workflow} title="Approvals" description="Manage routing for requisitions, orders, invoices and payments." to={`${PR.SETTINGS}/approvals`} status="Shared workflow" />
        <SettingsOverviewCard icon={Tags} title="Reference data" description="Open vendor, category, catalog, contract and stock configuration." to={`${PR.SETTINGS}/reference-data`} status="Available" tone="ready" />
      </div>
    </div>
  );
}

function General({ entity, entityCode }: { entity: ReturnType<typeof useActiveEntity>["entity"]; entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canManageEntities = hasPermission(P.FIN_VIEW_ENTITIES);
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const canUpdate = hasPermission(P.PROC_UPDATE_SETTINGS);
  const query = useGetProcurementSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="General defaults" description="Set the payment and delivery defaults applied when buyers create new Procurement records." action={canManageEntities ? <Button asChild variant="outline"><Link to={`${F.SETTINGS}/entities`}>Manage entities</Link></Button> : undefined} />
      <SettingsPanel title="Inherited from Finance">
        <SettingsRow icon={Building2} label="Ledger entity" description="Every procurement document and journal is isolated to this entity." value={entity ? `${entity.code} · ${entity.name}` : "Not selected"} badge={<PolicyBadge kind="enforced">Shared scope</PolicyBadge>} />
        <SettingsRow icon={BookOpenCheck} label="Reporting currency" description="Purchase amounts post in the selected entity's reporting currency." value={entity?.base_currency ?? "Not selected"} badge={<PolicyBadge kind="default">Inherited</PolicyBadge>} />
      </SettingsPanel>
      {!canView ? <ProtectedSettings /> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading defaults" description="Reading the selected entity's procurement settings." /></SettingsPanel> : <GeneralForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} history={payload.history} consumers={payload.consumers} canUpdate={canUpdate} />}
    </div>
  );
}

function GeneralForm({ entityCode, values, history, consumers, canUpdate }: { entityCode: string; values: ProcurementSettingsValues; history: FinanceAuditLog[]; consumers: Record<string, SettingConsumer>; canUpdate: boolean }) {
  const [terms, setTerms] = useState(values.default_payment_terms);
  const [address, setAddress] = useState(values.default_delivery_address);
  const [update, state] = useUpdateProcurementSettingsMutation();
  const dirty = terms !== values.default_payment_terms || address.trim() !== values.default_delivery_address;
  const save = async () => {
    try {
      const response = await update({ entity: entityCode, default_payment_terms: terms, default_delivery_address: address }).unwrap();
      toast.success(response.message || "Procurement defaults saved.");
    } catch { /* Central API handling shows the actionable error. */ }
  };
  return <>
    <SettingsPanel title="Procurement defaults" description="New vendors and contracts use the payment term. New purchase orders use the delivery address when the buyer leaves it blank.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
        <label className="min-w-0 font-mont text-xs font-semibold text-gray-01">Default payment terms<select className="mt-2 h-10 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02" value={terms} onChange={(event) => setTerms(event.target.value)} disabled={!canUpdate}>{PAYMENT_TERMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="mt-1 block font-normal leading-5 text-gray-05">Applied to new vendor records.</span><SettingsConsumer consumer={consumers.default_payment_terms} /></label>
        <label className="min-w-0 font-mont text-xs font-semibold text-gray-01">Default delivery address<Textarea className="mt-2 min-h-24 bg-white font-mont text-sm" value={address} onChange={(event) => setAddress(event.target.value)} disabled={!canUpdate} placeholder="Enter the standard receiving location" maxLength={2000} /><span className="mt-1 block font-normal leading-5 text-gray-05">Buyers can still override this on a purchase order.</span><SettingsConsumer consumer={consumers.default_delivery_address} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{canUpdate ? "Only changed values are recorded in audit history." : "You have read-only access."}</p><Button onClick={save} disabled={!canUpdate || !dirty || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save defaults"}</Button></div>
    </SettingsPanel>
    <div className="mt-5"><SettingsAuditHistory rows={history} /></div>
  </>;
}

function PurchasingPolicy({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const canUpdate = hasPermission(P.PROC_UPDATE_SETTINGS);
  const query = useGetProcurementSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.purchasing"><SettingsSectionHeader title="Purchasing policy" description="Set entity-wide vendor, requisition and receipt defaults. The backend applies each saved rule to new purchasing activity." /></div>
      {!canView ? <ProtectedSettings /> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading purchasing policy" description="Reading the selected entity's procurement controls." /></SettingsPanel> : <PurchasingForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} history={payload.history} consumers={payload.consumers} canUpdate={canUpdate} />}
      <SettingsPanel title="Always-enforced controls">
        <SettingsRow icon={ClipboardCheck} label="Approved requisition required" description="A purchase order can only be created from an approved requisition in the same entity." badge={<PolicyBadge kind="enforced" />} />
        <SettingsRow icon={BadgeCheck} label="Verified vendor required for payment" description="Vendor payments require an active, KYC-verified vendor that is not on hold." badge={<PolicyBadge kind="enforced" />} />
        <SettingsRow icon={FileCheck2} label="Approved payment required" description="Interactive vendor payments must complete approval before they can post." badge={<PolicyBadge kind="enforced" />} />
      </SettingsPanel>
    </div>
  );
}

function PurchasingForm({ entityCode, values, history, consumers, canUpdate }: { entityCode: string; values: ProcurementSettingsValues; history: FinanceAuditLog[]; consumers: Record<string, SettingConsumer>; canUpdate: boolean }) {
  const [kycRequirement, setKycRequirement] = useState(values.vendor_purchase_kyc_requirement);
  const [leadDays, setLeadDays] = useState(String(values.default_requisition_lead_days));
  const [requirePo, setRequirePo] = useState(values.require_purchase_order_for_receipts);
  const [update, state] = useUpdateProcurementSettingsMutation();
  const leadDaysValue = Number(leadDays);
  const valid = leadDays.trim() !== ""
    && Number.isInteger(leadDaysValue) && leadDaysValue >= 0 && leadDaysValue <= 365;
  const dirty = valid && (
    kycRequirement !== values.vendor_purchase_kyc_requirement
    || leadDaysValue !== values.default_requisition_lead_days
    || requirePo !== values.require_purchase_order_for_receipts
  );
  const save = async () => {
    try {
      const response = await update({
        entity: entityCode,
        vendor_purchase_kyc_requirement: kycRequirement,
        default_requisition_lead_days: leadDaysValue,
        require_purchase_order_for_receipts: requirePo,
      }).unwrap();
      toast.success(response.message || "Purchasing policy saved.");
    } catch { /* Central API handling shows the actionable error. */ }
  };
  return <>
    <SettingsPanel title="Configurable controls" description="These defaults affect new purchasing records immediately after a successful save.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <label className="min-w-0 font-mont text-xs font-semibold text-gray-01">Vendor KYC requirement<select className="mt-2 h-10 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02" value={kycRequirement} onChange={(event) => setKycRequirement(event.target.value as ProcurementSettingsValues["vendor_purchase_kyc_requirement"])} disabled={!canUpdate}><option value="PENDING_OR_VERIFIED">Pending or verified</option><option value="VERIFIED_ONLY">Verified only</option></select><span className="mt-1 block font-normal leading-5 text-gray-05">Controls which active vendors buyers can use for new sourcing, orders, contracts and catalog links.</span><SettingsConsumer consumer={consumers.vendor_purchase_kyc_requirement} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01">Default requisition lead days<Input type="number" min="0" max="365" step="1" className="mt-2 bg-white" value={leadDays} onChange={(event) => setLeadDays(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Sets needed-by from the request date when the requester leaves it blank.</span><SettingsConsumer consumer={consumers.default_requisition_lead_days} /></label>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="min-w-0"><p className="font-mont text-sm font-medium text-gray-01">Require a purchase order for goods receipts</p><p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">When on, receiving cannot record a vendor delivery without purchase-order evidence.</p><SettingsConsumer consumer={consumers.require_purchase_order_for_receipts} /></div><Switch checked={requirePo} onCheckedChange={setRequirePo} disabled={!canUpdate} aria-label="Require a purchase order for goods receipts" /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Use whole numbers from 0 to 365 days." : canUpdate ? "Only changed values are recorded in audit history." : "You have read-only access."}</p><Button onClick={save} disabled={!canUpdate || !dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save purchasing policy"}</Button></div>
    </SettingsPanel>
    <div className="mt-5"><SettingsAuditHistory rows={history} /></div>
  </>;
}

function SourcingLifecycle({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const canUpdate = hasPermission(P.PROC_UPDATE_SETTINGS);
  const query = useGetProcurementSettingsQuery(
    { entity: entityCode! }, { skip: !entityCode || !canView },
  );
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Sourcing and lifecycle" description="Set the default time buyers give vendors to respond, the RFQ alert horizon, and the renewal notice copied to new contracts." />
      {!canView ? <ProtectedSettings /> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading sourcing policy" description="Reading the selected entity's RFQ and contract defaults." /></SettingsPanel> : <SourcingLifecycleForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} history={payload.history} consumers={payload.consumers} canUpdate={canUpdate} />}
      <SettingsPanel title="How lifecycle defaults behave">
        <SettingsRow icon={Clock3} label="Explicit dates win" description="A response due date entered on an RFQ overrides the default response period for that RFQ." badge={<PolicyBadge kind="enforced">Override allowed</PolicyBadge>} />
        <SettingsRow icon={FileSignature} label="Existing records keep their terms" description="Changing these values does not rewrite existing RFQ due dates or contract renewal windows." badge={<PolicyBadge kind="enforced" />} />
        <SettingsRow icon={ShieldCheck} label="Contract alerts use each stored notice" description="The expiring list and summary use the renewal notice saved on each contract, not a hidden fixed 30-day window." badge={<PolicyBadge kind="configured">Aligned</PolicyBadge>} />
      </SettingsPanel>
    </div>
  );
}

function SourcingLifecycleForm({ entityCode, values, history, consumers, canUpdate }: { entityCode: string; values: ProcurementSettingsValues; history: FinanceAuditLog[]; consumers: Record<string, SettingConsumer>; canUpdate: boolean }) {
  const [responseDays, setResponseDays] = useState(String(values.default_rfq_response_days));
  const [closingSoonDays, setClosingSoonDays] = useState(String(values.rfq_closing_soon_days));
  const [renewalDays, setRenewalDays] = useState(String(values.contract_renewal_notice_days));
  const [update, state] = useUpdateProcurementSettingsMutation();
  const responseDaysValue = Number(responseDays);
  const closingSoonDaysValue = Number(closingSoonDays);
  const renewalDaysValue = Number(renewalDays);
  const valid = responseDays.trim() !== "" && closingSoonDays.trim() !== "" && renewalDays.trim() !== ""
    && Number.isInteger(responseDaysValue) && responseDaysValue >= 0 && responseDaysValue <= 365
    && Number.isInteger(closingSoonDaysValue) && closingSoonDaysValue >= 0 && closingSoonDaysValue <= 365
    && Number.isInteger(renewalDaysValue) && renewalDaysValue >= 0 && renewalDaysValue <= 365;
  const dirty = valid && (
    responseDaysValue !== values.default_rfq_response_days
    || closingSoonDaysValue !== values.rfq_closing_soon_days
    || renewalDaysValue !== values.contract_renewal_notice_days
  );
  const save = async () => {
    try {
      const response = await update({
        entity: entityCode,
        default_rfq_response_days: responseDaysValue,
        rfq_closing_soon_days: closingSoonDaysValue,
        contract_renewal_notice_days: renewalDaysValue,
      }).unwrap();
      toast.success(response.message || "Sourcing and lifecycle policy saved.");
    } catch { /* Central API handling shows the actionable error. */ }
  };
  return <>
    <SettingsPanel title="RFQ and contract defaults" description="Values are measured in calendar days and apply after a successful save.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-3">
        <label className="font-mont text-xs font-semibold text-gray-01">Default RFQ response days<Input type="number" min="0" max="365" step="1" className="mt-2 bg-white" value={responseDays} onChange={(event) => setResponseDays(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Sets the response due date for a new RFQ when the buyer leaves it blank.</span><SettingsConsumer consumer={consumers.default_rfq_response_days} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01">RFQ closing-soon horizon<Input type="number" min="0" max="365" step="1" className="mt-2 bg-white" value={closingSoonDays} onChange={(event) => setClosingSoonDays(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Counts issued RFQs due within this many days in the sourcing summary.</span><SettingsConsumer consumer={consumers.rfq_closing_soon_days} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01">Contract renewal notice days<Input type="number" min="0" max="365" step="1" className="mt-2 bg-white" value={renewalDays} onChange={(event) => setRenewalDays(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Copied to new contracts when no notice window is supplied.</span><SettingsConsumer consumer={consumers.contract_renewal_notice_days} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Use whole numbers from 0 to 365 days." : canUpdate ? "Only effective changes are written to audit history." : "You have read-only access."}</p><Button onClick={save} disabled={!canUpdate || !dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save lifecycle policy"}</Button></div>
    </SettingsPanel>
    <div className="mt-5"><SettingsAuditHistory rows={history} /></div>
  </>;
}

function CompetitiveGovernance({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const canUpdate = hasPermission(P.PROC_UPDATE_SETTINGS);
  const query = useGetProcurementSettingsQuery(
    { entity: entityCode! }, { skip: !entityCode || !canView },
  );
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.competition"><SettingsSectionHeader title="Competitive bidding governance" description="Set the minimum market evidence required before an RFQ can be issued or a supplier can be selected." /></div>
      {!canView ? <ProtectedSettings /> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading competitive policy" description="Reading the selected entity's bidding controls." /></SettingsPanel> : <CompetitiveGovernanceForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} history={payload.history} consumers={payload.consumers} canUpdate={canUpdate} />}
      <SettingsPanel title="Exception controls">
        <SettingsRow icon={ShieldCheck} label="Separate override permission" description="Changing settings does not grant exception authority. A user also needs the critical competitive-policy override permission." badge={<PolicyBadge kind="enforced">Critical permission</PolicyBadge>} />
        <SettingsRow icon={FileCheck2} label="Written reason required" description="An RFQ below either minimum cannot proceed until an authorized user supplies a reason for the exception." badge={<PolicyBadge kind="enforced" />} />
        <SettingsRow icon={ClipboardCheck} label="Evidence stays in audit history" description="The audit entry records the actual count, required minimum, exception decision and written reason." badge={<PolicyBadge kind="enforced">Immutable evidence</PolicyBadge>} />
      </SettingsPanel>
    </div>
  );
}

function CompetitiveGovernanceForm({ entityCode, values, history, consumers, canUpdate }: { entityCode: string; values: ProcurementSettingsValues; history: FinanceAuditLog[]; consumers: Record<string, SettingConsumer>; canUpdate: boolean }) {
  const [invitedVendors, setInvitedVendors] = useState(String(values.minimum_rfq_invited_vendors));
  const [submittedBids, setSubmittedBids] = useState(String(values.minimum_submitted_quotations_before_award));
  const [update, state] = useUpdateProcurementSettingsMutation();
  const invitedValue = Number(invitedVendors);
  const submittedValue = Number(submittedBids);
  const valid = invitedVendors.trim() !== "" && submittedBids.trim() !== ""
    && Number.isInteger(invitedValue) && invitedValue >= 1 && invitedValue <= 50
    && Number.isInteger(submittedValue) && submittedValue >= 1 && submittedValue <= 50;
  const dirty = valid && (
    invitedValue !== values.minimum_rfq_invited_vendors
    || submittedValue !== values.minimum_submitted_quotations_before_award
  );
  const save = async () => {
    try {
      const response = await update({
        entity: entityCode,
        minimum_rfq_invited_vendors: invitedValue,
        minimum_submitted_quotations_before_award: submittedValue,
      }).unwrap();
      toast.success(response.message || "Competitive bidding policy saved.");
    } catch { /* Central API handling shows the actionable error. */ }
  };
  return <>
    <SettingsPanel title="Competitive minimums" description="Defaults of one preserve the existing sourcing process. Raise them when this entity requires broader competition.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <label className="font-mont text-xs font-semibold text-gray-01">Minimum vendors invited<Input type="number" min="1" max="50" step="1" className="mt-2 bg-white" value={invitedVendors} onChange={(event) => setInvitedVendors(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Checked when a draft RFQ is issued. Duplicate invitations do not increase the count.</span><SettingsConsumer consumer={consumers.minimum_rfq_invited_vendors} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01">Minimum submitted quotations<Input type="number" min="1" max="50" step="1" className="mt-2 bg-white" value={submittedBids} onChange={(event) => setSubmittedBids(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Checked when a submitted quotation is awarded and converted into a draft purchase order.</span><SettingsConsumer consumer={consumers.minimum_submitted_quotations_before_award} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Use whole numbers from 1 to 50 vendors." : canUpdate ? "Saved minimums apply to the next issue or award decision." : "You have read-only access."}</p><Button onClick={save} disabled={!canUpdate || !dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save competitive policy"}</Button></div>
    </SettingsPanel>
    <div className="mt-5"><SettingsAuditHistory rows={history} /></div>
  </>;
}

function MatchingPolicy({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const canUpdate = hasPermission(P.PROC_UPDATE_SETTINGS);
  const query = useGetProcurementSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.matching"><SettingsSectionHeader title="Invoice matching" description="Set the entity's allowed quantity and unit-price variance before an invoice is blocked for review." /></div>
      {!canView ? <ProtectedSettings /> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading matching policy" description="Reading the selected entity's tolerances." /></SettingsPanel> : <MatchingForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} history={payload.history} consumers={payload.consumers} canUpdate={canUpdate} />}
    </div>
  );
}

function MatchingForm({ entityCode, values, history, consumers, canUpdate }: { entityCode: string; values: ProcurementSettingsValues; history: FinanceAuditLog[]; consumers: Record<string, SettingConsumer>; canUpdate: boolean }) {
  const [quantity, setQuantity] = useState(String(values.quantity_tolerance_bps / 100));
  const [price, setPrice] = useState(String(values.price_tolerance_bps / 100));
  const [allowNonPo, setAllowNonPo] = useState(values.allow_non_po_invoices);
  const [update, state] = useUpdateProcurementSettingsMutation();
  const quantityBps = Math.round(Number(quantity) * 100);
  const priceBps = Math.round(Number(price) * 100);
  const valid = Number.isFinite(quantityBps) && Number.isFinite(priceBps) && quantityBps >= 0 && quantityBps <= 10000 && priceBps >= 0 && priceBps <= 10000;
  const dirty = valid && (quantityBps !== values.quantity_tolerance_bps || priceBps !== values.price_tolerance_bps || allowNonPo !== values.allow_non_po_invoices);
  const save = async () => {
    try {
      const response = await update({ entity: entityCode, quantity_tolerance_bps: quantityBps, price_tolerance_bps: priceBps, allow_non_po_invoices: allowNonPo }).unwrap();
      toast.success(response.message || "Invoice matching policy saved.");
    } catch { /* Central API handling shows the actionable error. */ }
  };
  return <>
    <SettingsPanel title="Three-way match policy" description="Tolerances apply to cumulative invoicing against ordered and received evidence. Values are percentages from 0 to 100.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <label className="font-mont text-xs font-semibold text-gray-01">Quantity tolerance (%)<Input type="number" min="0" max="100" step="0.01" className="mt-2 bg-white" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Allowed overage against ordered and received quantity.</span><SettingsConsumer consumer={consumers.quantity_tolerance_bps} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01">Price tolerance (%)<Input type="number" min="0" max="100" step="0.01" className="mt-2 bg-white" value={price} onChange={(event) => setPrice(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Allowed absolute unit-price difference from the PO.</span><SettingsConsumer consumer={consumers.price_tolerance_bps} /></label>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="min-w-0"><p className="font-mont text-sm font-medium text-gray-01">Allow non-PO invoices</p><p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">When off, invoices without purchase-order evidence receive a blocking match status.</p><SettingsConsumer consumer={consumers.allow_non_po_invoices} /></div><Switch checked={allowNonPo} onCheckedChange={setAllowNonPo} disabled={!canUpdate} aria-label="Allow non-PO invoices" /></div>
      <SettingsRow icon={ShieldCheck} label="Variance override" description="Blocking outcomes still require the dedicated variance-override permission, and every override remains audited." badge={<PolicyBadge kind="enforced" />} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Enter values between 0 and 100%." : canUpdate ? "Saved tolerances affect the next match run." : "You have read-only access."}</p><Button onClick={save} disabled={!canUpdate || !dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save matching policy"}</Button></div>
    </SettingsPanel>
    <div className="mt-5"><SettingsAuditHistory rows={history} /></div>
  </>;
}

function AccountingIntegration({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const query = useGetFinanceAccountSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const byKey = new Map((query.data?.data.mappings ?? []).map((mapping) => [mapping.key, mapping]));
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.accounting"><SettingsSectionHeader title="Accounting integration" description="Procurement uses the Finance-owned account mappings, so there is one posting source of truth." action={canView ? <Button asChild variant="outline"><Link to={`${F.SETTINGS}/accounting`}>Edit in Finance</Link></Button> : undefined} /></div>
      <SettingsPanel title="Required Finance accounts" description="Changes are made in Finance Settings and take effect in Procurement posting services immediately.">
        {!canView ? <SettingsRow icon={ShieldCheck} label="Finance mappings are protected" description="Finance settings view permission is required to resolve these account names." badge={<PolicyBadge kind="enforced">Permission required</PolicyBadge>} /> : PROCUREMENT_ACCOUNTS.map(([key, label, description]) => { const mapping = byKey.get(key); return <SettingsRow key={key} label={label} description={description} value={mapping?.account ? `${mapping.account.code} · ${mapping.account.name}` : mapping ? `${mapping.default_code} · Missing` : "Loading"} badge={<PolicyBadge kind={mapping?.is_valid ? "configured" : "default"}>{mapping?.source === "OVERRIDE" ? "Custom" : "Finance-owned"}</PolicyBadge>} />; })}
      </SettingsPanel>
    </div>
  );
}

function ProtectedSettings() {
  return <SettingsPanel><SettingsRow icon={ShieldCheck} label="Procurement settings are protected" description="You need Procurement settings view permission to read this entity's policy." badge={<PolicyBadge kind="enforced">Permission required</PolicyBadge>} /></SettingsPanel>;
}

function Approvals() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.VIEW_WORKFLOW_TEMPLATES);
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.approvals"><SettingsSectionHeader title="Procurement approvals" description="Each document type can resolve its own branch, tenant or platform workflow template." action={canView ? <Button asChild><Link to={routesPath.PROTECTED.WORKFLOW.TEMPLATES}>Manage workflows</Link></Button> : undefined} /></div>
      <SettingsPanel title="Approval-capable documents">
        <SettingsRow icon={ClipboardCheck} label="Purchase requisitions" description="Route the initial request and estimated commitment." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <SettingsRow icon={ShoppingCart} label="Purchase orders" description="Approve the legal commitment before receipt." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <SettingsRow icon={ReceiptText} label="Vendor invoices" description="Approve the priced and matched invoice evidence before posting." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <SettingsRow icon={FileCheck2} label="Vendor payments" description="Approve cash settlement independently from invoice approval." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <SettingsRow icon={ListChecks} label="Senior approval threshold" description="The seeded fallback workflow adds senior approval from ₦500,000. Scoped templates can replace that ladder." value="₦500,000" badge={<PolicyBadge kind="default" />} />
      </SettingsPanel>
    </div>
  );
}

function ReferenceData() {
  const cards = [
    [Store, "Vendors", "Supplier identity, KYC, payment terms and accounting defaults.", `${PR.VENDORS}/vendors`],
    [Tags, "Categories", "Three-level purchasing hierarchy and category expense defaults.", `${PR.VENDORS}/categories`],
    [Boxes, "Catalog", "Orderable items, preferred suppliers, prices and tax defaults.", `${PR.VENDORS}/catalog`],
    [FileSignature, "Contracts", "Commercial terms, milestones and renewal windows.", PR.CONTRACTS],
    [PackageCheck, "Stock items", "Inventory mappings, reorder points and current balances.", `${PR.INVENTORY}/items`],
  ] as const;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Reference data" description="Open the master records that supply defaults to new purchasing documents without rewriting history." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([icon, title, description, to]) => <SettingsOverviewCard key={title} icon={icon} title={title} description={description} to={to} status="Manage" />)}
      </div>
    </div>
  );
}
