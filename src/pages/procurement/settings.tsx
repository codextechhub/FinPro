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
  History,
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
import { P } from "../../permissions";
import { routesPath } from "@/routes/routes-path";
import { usePermissions } from "@/hooks/use-permissions";
import {
  ConsoleSettingsLayout,
  PolicyBadge,
  SettingsAuditHistory,
  SettingsOverviewCard,
  SettingsPanel,
  SettingsRow,
  SettingsSectionHeader,
  type ConsoleSettingsGroup,
  type ConsoleSettingsSection,
} from "@/components/settings/settings-layout";
import { HintedPanel, HintedRow, InfoHint, SettingField, SettingToggle, useActiveEntity } from "@/components/finance-ui";
import { useSettingsWriteAccess } from "@/components/finance-ui/whole-school-access";
import { useGetFinanceAccountSettingsQuery } from "@/redux/services/finance/setup-api";
import { useGetProcurementSettingsHistoryQuery, useGetProcurementSettingsQuery, useUpdateProcurementSettingsMutation } from "@/redux/services/procurement/procurement-api";
import type { ProcurementSettingsValues } from "@/redux/services/procurement/procurement-types";
import type { SettingConsumer } from "@/redux/services/finance/setup-types";
import { ProcurementShell } from "./procurement-shell";
import { PROCUREMENT_HELP } from "./screen-help";
import { financeSettingsSections, platformName } from "../../host";
import { useIsSchool, wholeBooksLabel } from "../../lib/reader-words";
import { PAYMENT_TERMS } from "./payment-terms";
import {
  DEFAULT_PROCUREMENT_SETTINGS_SECTION, type ProcurementSettingsSection,
} from "./console-sections";

const PR = routesPath.PROTECTED.PROCUREMENT;
const F = routesPath.PROTECTED.FINANCE;

const SECTIONS: ConsoleSettingsSection[] = [
  { key: "overview", title: "Overview", description: "Configuration health", icon: Settings2 },
  { key: "general", title: "General defaults", description: "Entity and document defaults", icon: Building2 },
  { key: "purchasing", title: "Purchasing policy", description: "Requisitions and vendors", icon: ShoppingCart, group: "purchasing" },
  { key: "sourcing-lifecycle", title: "Sourcing and lifecycle", description: "RFQs and renewals", icon: Clock3, group: "purchasing" },
  { key: "competitive-governance", title: "Competitive governance", description: "Bid minimums and exceptions", icon: Gavel, group: "purchasing" },
  { key: "matching", title: "Invoice matching", description: "PO, receipt and invoice", icon: Scale, group: "payables" },
  { key: "accounting", title: "Accounting integration", description: "Control accounts (where each role posts)", icon: BookOpenCheck, group: "payables" },
  { key: "approvals", title: "Approvals", description: "Purchasing workflows", icon: Workflow },
  { key: "reference-data", title: "Reference data", description: "Vendors, catalog and stock", icon: Tags },
  { key: "recent-changes", title: "Recent changes", description: "All settings activity", icon: History },
];

/** Rail headings; a section's `group` puts it under one (see ConsoleSettingsLayout). */
const GROUPS: ConsoleSettingsGroup[] = [
  { key: "purchasing", title: "Purchasing", icon: ShoppingCart },
  { key: "payables", title: "Payables", icon: Scale },
];

const PROCUREMENT_ACCOUNTS = [
  ["ACCOUNTS_PAYABLE", "Accounts payable", "Control account for the vendor sub-ledger (the total owed to every vendor)."],
  ["GRIR_CLEARING", "GR/IR clearing", "Temporary liability between goods receipt and vendor invoice."],
  ["WHT_PAYABLE", "WHT payable", "Withholding tax deducted from vendor payments."],
  ["INVENTORY_ASSET", "Inventory asset", "Value of stock held for future issue."],
  ["INVENTORY_ADJUSTMENT", "Inventory adjustment", "Stock-count gains, losses and write-downs."],
  ["PURCHASE_PRICE_VARIANCE", "Purchase price variance", "Difference between receipt basis and vendor invoice price."],
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
        titleHelp={<InfoHint ariaLabel="About Procurement Settings">{PROCUREMENT_HELP.settings}</InfoHint>}
        description="Review the defaults and controls behind purchasing, vendor governance, matching and payables."
        basePath={PR.SETTINGS}
        activeSection={activeSection}
        sections={SECTIONS}
        groups={GROUPS}
        fitScreen
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
        {activeSection === "recent-changes" ? <RecentChanges entityCode={active.code} /> : null}
      </ConsoleSettingsLayout>
    </ProcurementShell>
  );
}

function Overview({ entity }: { entity: ReturnType<typeof useActiveEntity>["entity"] }) {
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.overview"><SettingsSectionHeader title="Configuration overview" description="Review entity inheritance first, then the policies that control the procure-to-pay chain." /></div>
      <HintedPanel title="Active entity" hint="Procurement uses the same entity and fiscal posting window as Finance.">
        <SettingsRow icon={Building2} label={entity?.name ?? "No active entity selected"} description={entity ? `${entity.code} · reporting currency ${entity.base_currency}` : "Choose an entity from the header to inspect procurement settings."} badge={<PolicyBadge kind={entity ? "configured" : "default"}>{entity ? "Inherited" : "Needs entity"}</PolicyBadge>} />
      </HintedPanel>
      <div data-guide="procurement-settings.sections" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SettingsOverviewCard icon={Building2} title="General defaults" description="Review entity inheritance, currency, payment terms and delivery behavior." to={`${PR.SETTINGS}/general`} status="Inherited" />
        <SettingsOverviewCard icon={ShoppingCart} title="Purchasing policy" description="Set vendor eligibility, requisition timing and receipt evidence." to={`${PR.SETTINGS}/purchasing`} status="Configurable" tone="ready" />
        <SettingsOverviewCard icon={Clock3} title="Sourcing and lifecycle" description="Set RFQ response windows, closing alerts and contract renewal defaults." to={`${PR.SETTINGS}/sourcing-lifecycle`} status="Configurable" tone="ready" />
        <SettingsOverviewCard icon={Gavel} title="Competitive governance" description="Require enough invited vendors and submitted bids before commitment." to={`${PR.SETTINGS}/competitive-governance`} status="Protected" tone="attention" />
        <SettingsOverviewCard icon={Scale} title="Invoice matching" description="Understand quantity, price and receipt checks before vendor bills post." to={`${PR.SETTINGS}/matching`} status="Review" tone="attention" />
        <SettingsOverviewCard icon={BookOpenCheck} title="Accounting integration" description="Review the Finance accounts Procurement expects for P2P posting." to={`${PR.SETTINGS}/accounting`} status="Finance-owned" />
        <SettingsOverviewCard icon={Workflow} title="Approvals" description="Manage routing for requisitions, orders, invoices and payments." to={`${PR.SETTINGS}/approvals`} status="Shared workflow" />
        <SettingsOverviewCard icon={Tags} title="Reference data" description="Open vendor, category, catalog, contract and stock configuration." to={`${PR.SETTINGS}/reference-data`} status="Available" tone="ready" />
        <SettingsOverviewCard icon={History} title="Recent changes" description="Review the newest saved changes from every Procurement settings section in one place." to={`${PR.SETTINGS}/recent-changes`} status="Combined" tone="ready" />
      </div>
    </div>
  );
}

function RecentChanges({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const query = useGetProcurementSettingsHistoryQuery(
    { entity: entityCode! }, { skip: !entityCode || !canView },
  );
  return (
    <div data-guide="procurement-settings.recent-changes" className="space-y-5">
      <SettingsSectionHeader
        title="Recent changes"
        description="Review saved changes from every Procurement settings section for the active entity."
      />
      {!canView ? (
        <ProtectedSettings />
      ) : !entityCode ? (
        <SettingsPanel><SettingsRow icon={Building2} label="No active entity selected" description="Choose an entity from the header to review its settings changes." /></SettingsPanel>
      ) : query.isError ? (
        <SettingsPanel><SettingsRow icon={History} label="Recent changes could not be loaded" description="Check your connection or try the request again." value={<Button variant="outline" size="sm" onClick={() => query.refetch()}>Try again</Button>} /></SettingsPanel>
      ) : query.isLoading || !query.data ? (
        <SettingsPanel><SettingsRow label="Loading recent changes" description="Reading settings activity for the selected entity." /></SettingsPanel>
      ) : (
        <SettingsAuditHistory rows={query.data.data.history} />
      )}
    </div>
  );
}

function General({ entity, entityCode }: { entity: ReturnType<typeof useActiveEntity>["entity"]; entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  // The same two gates Finance Settings puts on its entities section.
  const canManageEntities = financeSettingsSections.includes("entities") && hasPermission(P.FIN_CREATE_ENTITY);
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.PROC_UPDATE_SETTINGS);
  const query = useGetProcurementSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="General defaults" description="Payment and delivery defaults for new Procurement records." action={canManageEntities ? <Button asChild variant="outline"><Link to={`${F.SETTINGS}/entities`}>Manage entities</Link></Button> : undefined} />
      <HintedPanel title="Inherited from Finance">
        <HintedRow icon={Building2} label="Ledger entity" hint="Every procurement document and journal is isolated to this entity." value={entity ? `${entity.code} · ${entity.name}` : "Not selected"} badge={<PolicyBadge kind="enforced">Shared scope</PolicyBadge>} />
        <HintedRow icon={BookOpenCheck} label="Reporting currency" hint="Purchase amounts post in the selected entity's reporting currency." value={entity?.base_currency ?? "Not selected"} badge={<PolicyBadge kind="default">Inherited</PolicyBadge>} />
      </HintedPanel>
      {!canView ? <ProtectedSettings /> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading defaults" description="Reading the selected entity's procurement settings." /></SettingsPanel> : <GeneralForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers} canUpdate={canUpdate} readOnlyNote={readOnlyNote} />}
    </div>
  );
}

function GeneralForm({ entityCode, values, consumers, canUpdate, readOnlyNote }: { entityCode: string; values: ProcurementSettingsValues; consumers: Record<string, SettingConsumer>; canUpdate: boolean; readOnlyNote: string | null }) {
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
    <HintedPanel title="Procurement defaults" hint="New vendors and contracts use the payment term. New purchase orders use the delivery address when the buyer leaves it blank.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
        <SettingField label="Default payment terms" consumer={consumers.default_payment_terms}>
          {(id) => <select id={id} className="h-10 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02" value={terms} onChange={(event) => setTerms(event.target.value)} disabled={!canUpdate}>{PAYMENT_TERMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
        </SettingField>
        <SettingField label="Default delivery address" hint="Buyers can still override it on a purchase order." consumer={consumers.default_delivery_address}>
          {(id) => <Textarea id={id} className="min-h-24 bg-white font-mont text-sm" value={address} onChange={(event) => setAddress(event.target.value)} disabled={!canUpdate} placeholder="Enter the standard receiving location" maxLength={2000} />}
        </SettingField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{readOnlyNote}</p>{canUpdate ? <Button onClick={save} disabled={!dirty || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save defaults"}</Button> : null}</div>
    </HintedPanel>
  </>;
}

function PurchasingPolicy({ entityCode }: { entityCode: string | null }) {
  const wholeBooks = wholeBooksLabel(useIsSchool());
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.PROC_UPDATE_SETTINGS);
  const query = useGetProcurementSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.purchasing"><SettingsSectionHeader title="Purchasing policy" description={`${wholeBooks} vendor, requisition and receipt defaults.`} /></div>
      {!canView ? <ProtectedSettings /> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading purchasing policy" description="Reading the selected entity's procurement controls." /></SettingsPanel> : <PurchasingForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers} canUpdate={canUpdate} readOnlyNote={readOnlyNote} />}
      <HintedPanel title="Always-enforced controls" hint="These hold for every entity and cannot be switched off.">
        <HintedRow icon={ClipboardCheck} label="Approved requisition required" hint="A purchase order can only be created from an approved requisition in the same entity." badge={<PolicyBadge kind="enforced" />} />
        <HintedRow icon={BadgeCheck} label="Verified vendor required for payment" hint="Vendor payments require an active, KYC-verified vendor that is not on hold." badge={<PolicyBadge kind="enforced" />} />
        <HintedRow icon={FileCheck2} label="Approved payment required" hint="Interactive vendor payments must complete approval before they can post." badge={<PolicyBadge kind="enforced" />} />
      </HintedPanel>
    </div>
  );
}

function PurchasingForm({ entityCode, values, consumers, canUpdate, readOnlyNote }: { entityCode: string; values: ProcurementSettingsValues; consumers: Record<string, SettingConsumer>; canUpdate: boolean; readOnlyNote: string | null }) {
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
    <HintedPanel title="Configurable controls" hint="A saved change applies to new purchasing records straight away.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <SettingField label="Vendor KYC requirement" hint="Applies to new sourcing, orders, contracts and catalog links." consumer={consumers.vendor_purchase_kyc_requirement}>
          {(id) => <select id={id} className="h-10 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02" value={kycRequirement} onChange={(event) => setKycRequirement(event.target.value as ProcurementSettingsValues["vendor_purchase_kyc_requirement"])} disabled={!canUpdate}><option value="PENDING_OR_VERIFIED">Pending or verified</option><option value="VERIFIED_ONLY">Verified only</option></select>}
        </SettingField>
        <SettingField label="Default requisition lead days" hint="Counted from the request date. A whole number from 0 to 365." consumer={consumers.default_requisition_lead_days}>
          {(id) => <Input id={id} type="number" min="0" max="365" step="1" className="bg-white" value={leadDays} onChange={(event) => setLeadDays(event.target.value)} disabled={!canUpdate} />}
        </SettingField>
      </div>
      <SettingToggle label="Require a purchase order for goods receipts" consumer={consumers.require_purchase_order_for_receipts} checked={requirePo} onCheckedChange={setRequirePo} disabled={!canUpdate} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Use whole numbers from 0 to 365 days." : readOnlyNote}</p>{canUpdate ? <Button onClick={save} disabled={!dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save purchasing policy"}</Button> : null}</div>
    </HintedPanel>
  </>;
}

function SourcingLifecycle({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.PROC_UPDATE_SETTINGS);
  const query = useGetProcurementSettingsQuery(
    { entity: entityCode! }, { skip: !entityCode || !canView },
  );
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Sourcing and lifecycle" description="RFQ response and alert windows, and the renewal notice for new contracts." />
      {!canView ? <ProtectedSettings /> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading sourcing policy" description="Reading the selected entity's RFQ and contract defaults." /></SettingsPanel> : <SourcingLifecycleForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers} canUpdate={canUpdate} readOnlyNote={readOnlyNote} />}
      <HintedPanel title="How lifecycle defaults behave">
        <HintedRow icon={Clock3} label="Explicit dates win" hint="A response due date entered on an RFQ overrides the default response period for that RFQ." badge={<PolicyBadge kind="enforced">Override allowed</PolicyBadge>} />
        <HintedRow icon={FileSignature} label="Existing records keep their terms" hint="Changing these values does not rewrite existing RFQ due dates or contract renewal windows." badge={<PolicyBadge kind="enforced" />} />
        <HintedRow icon={ShieldCheck} label="Contract alerts use each stored notice" hint="The expiring list and summary use the renewal notice saved on each contract, not a hidden fixed 30-day window." badge={<PolicyBadge kind="configured">Aligned</PolicyBadge>} />
      </HintedPanel>
    </div>
  );
}

function SourcingLifecycleForm({ entityCode, values, consumers, canUpdate, readOnlyNote }: { entityCode: string; values: ProcurementSettingsValues; consumers: Record<string, SettingConsumer>; canUpdate: boolean; readOnlyNote: string | null }) {
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
    <HintedPanel title="RFQ and contract defaults" hint="Each value is in calendar days, a whole number from 0 to 365.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-3">
        <SettingField label="Default RFQ response days" consumer={consumers.default_rfq_response_days}>
          {(id) => <Input id={id} type="number" min="0" max="365" step="1" className="bg-white" value={responseDays} onChange={(event) => setResponseDays(event.target.value)} disabled={!canUpdate} />}
        </SettingField>
        <SettingField label="RFQ closing-soon horizon" hint="Issued RFQs due within this many days are counted in the sourcing summary." consumer={consumers.rfq_closing_soon_days}>
          {(id) => <Input id={id} type="number" min="0" max="365" step="1" className="bg-white" value={closingSoonDays} onChange={(event) => setClosingSoonDays(event.target.value)} disabled={!canUpdate} />}
        </SettingField>
        <SettingField label="Contract renewal notice days" consumer={consumers.contract_renewal_notice_days}>
          {(id) => <Input id={id} type="number" min="0" max="365" step="1" className="bg-white" value={renewalDays} onChange={(event) => setRenewalDays(event.target.value)} disabled={!canUpdate} />}
        </SettingField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Use whole numbers from 0 to 365 days." : readOnlyNote}</p>{canUpdate ? <Button onClick={save} disabled={!dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save lifecycle policy"}</Button> : null}</div>
    </HintedPanel>
  </>;
}

function CompetitiveGovernance({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.PROC_UPDATE_SETTINGS);
  const query = useGetProcurementSettingsQuery(
    { entity: entityCode! }, { skip: !entityCode || !canView },
  );
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.competition"><SettingsSectionHeader title="Competitive bidding governance" description="The minimum competition before an RFQ is issued or a supplier is chosen." /></div>
      {!canView ? <ProtectedSettings /> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading competitive policy" description="Reading the selected entity's bidding controls." /></SettingsPanel> : <CompetitiveGovernanceForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers} canUpdate={canUpdate} readOnlyNote={readOnlyNote} />}
      <HintedPanel title="Exception controls">
        <HintedRow icon={ShieldCheck} label="Separate override permission" hint="Changing settings does not grant exception authority. A user also needs the critical competitive-policy override permission." badge={<PolicyBadge kind="enforced">Critical permission</PolicyBadge>} />
        <HintedRow icon={FileCheck2} label="Written reason required" hint="An RFQ below either minimum cannot proceed until an authorized user supplies a reason for the exception." badge={<PolicyBadge kind="enforced" />} />
        <HintedRow icon={ClipboardCheck} label="Evidence stays in audit history" hint="The audit entry records the actual count, required minimum, exception decision and written reason." badge={<PolicyBadge kind="enforced">Immutable evidence</PolicyBadge>} />
      </HintedPanel>
    </div>
  );
}

function CompetitiveGovernanceForm({ entityCode, values, consumers, canUpdate, readOnlyNote }: { entityCode: string; values: ProcurementSettingsValues; consumers: Record<string, SettingConsumer>; canUpdate: boolean; readOnlyNote: string | null }) {
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
    <HintedPanel title="Competitive minimums" hint="A minimum of one keeps sourcing as it is. Raise them when this entity requires broader competition.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <SettingField label="Minimum vendors invited" hint="Checked when a draft RFQ is issued. Duplicate invitations do not increase the count." consumer={consumers.minimum_rfq_invited_vendors}>
          {(id) => <Input id={id} type="number" min="1" max="50" step="1" className="bg-white" value={invitedVendors} onChange={(event) => setInvitedVendors(event.target.value)} disabled={!canUpdate} />}
        </SettingField>
        <SettingField label="Minimum submitted quotations" hint="Checked when a submitted quotation is awarded and converted into a draft purchase order." consumer={consumers.minimum_submitted_quotations_before_award}>
          {(id) => <Input id={id} type="number" min="1" max="50" step="1" className="bg-white" value={submittedBids} onChange={(event) => setSubmittedBids(event.target.value)} disabled={!canUpdate} />}
        </SettingField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Use whole numbers from 1 to 50 vendors." : readOnlyNote ?? "Saved minimums apply to the next issue or award decision."}</p>{canUpdate ? <Button onClick={save} disabled={!dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save competitive policy"}</Button> : null}</div>
    </HintedPanel>
  </>;
}

function MatchingPolicy({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.PROC_VIEW_SETTINGS);
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.PROC_UPDATE_SETTINGS);
  const query = useGetProcurementSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.matching"><SettingsSectionHeader title="Invoice matching" description="How far an invoice may differ from its order and receipt before it is blocked for review." /></div>
      {!canView ? <ProtectedSettings /> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading matching policy" description="Reading the selected entity's tolerances." /></SettingsPanel> : <MatchingForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers} canUpdate={canUpdate} readOnlyNote={readOnlyNote} />}
    </div>
  );
}

function MatchingForm({ entityCode, values, consumers, canUpdate, readOnlyNote }: { entityCode: string; values: ProcurementSettingsValues; consumers: Record<string, SettingConsumer>; canUpdate: boolean; readOnlyNote: string | null }) {
  const [quantity, setQuantity] = useState(String(values.quantity_tolerance_bps / 100));
  const [price, setPrice] = useState(String(values.price_tolerance_bps / 100));
  const [allowNonPo, setAllowNonPo] = useState(values.allow_non_po_invoices);
  const [nonPoLimit, setNonPoLimit] = useState(String(values.non_po_spend_limit_pct));
  const [update, state] = useUpdateProcurementSettingsMutation();
  const quantityBps = Math.round(Number(quantity) * 100);
  const priceBps = Math.round(Number(price) * 100);
  const nonPoLimitValue = Number(nonPoLimit);
  const valid = Number.isFinite(quantityBps) && Number.isFinite(priceBps) && quantityBps >= 0 && quantityBps <= 10000 && priceBps >= 0 && priceBps <= 10000
    && nonPoLimit.trim() !== "" && Number.isInteger(nonPoLimitValue) && nonPoLimitValue >= 0 && nonPoLimitValue <= 100;
  const dirty = valid && (quantityBps !== values.quantity_tolerance_bps || priceBps !== values.price_tolerance_bps || allowNonPo !== values.allow_non_po_invoices
    || nonPoLimitValue !== values.non_po_spend_limit_pct);
  const save = async () => {
    try {
      const response = await update({ entity: entityCode, quantity_tolerance_bps: quantityBps, price_tolerance_bps: priceBps, allow_non_po_invoices: allowNonPo, non_po_spend_limit_pct: nonPoLimitValue }).unwrap();
      toast.success(response.message || "Invoice matching policy saved.");
    } catch { /* Central API handling shows the actionable error. */ }
  };
  return <>
    <HintedPanel title="Three-way match policy" hint="Tolerances apply to cumulative invoicing against ordered and received evidence. Values are percentages from 0 to 100.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <SettingField label="Quantity tolerance (%)" hint="The overage allowed against ordered and received quantity." consumer={consumers.quantity_tolerance_bps}>
          {(id) => <Input id={id} type="number" min="0" max="100" step="0.01" className="bg-white" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={!canUpdate} />}
        </SettingField>
        <SettingField label="Price tolerance (%)" hint="The unit-price difference allowed from the PO, either way." consumer={consumers.price_tolerance_bps}>
          {(id) => <Input id={id} type="number" min="0" max="100" step="0.01" className="bg-white" value={price} onChange={(event) => setPrice(event.target.value)} disabled={!canUpdate} />}
        </SettingField>
      </div>
      <SettingToggle label="Allow non-PO invoices" hint="When off, an invoice without purchase-order evidence gets a blocking match status." consumer={consumers.allow_non_po_invoices} checked={allowNonPo} onCheckedChange={setAllowNonPo} disabled={!canUpdate} />
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <SettingField label="Non-PO spend limit (%)" hint="The share of spend the school accepts on bills without a purchase order, as a whole number." consumer={consumers.non_po_spend_limit_pct}>
          {(id) => <Input id={id} type="number" min="0" max="100" step="1" className="bg-white" value={nonPoLimit} onChange={(event) => setNonPoLimit(event.target.value)} disabled={!canUpdate} />}
        </SettingField>
      </div>
      <HintedRow icon={ShieldCheck} label="Variance override" hint="Blocking outcomes still require the dedicated variance-override permission, and every override remains audited." badge={<PolicyBadge kind="enforced" />} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Enter values between 0 and 100%; the non-PO limit is a whole number." : readOnlyNote ?? "Saved tolerances affect the next match run."}</p>{canUpdate ? <Button onClick={save} disabled={!dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save matching policy"}</Button> : null}</div>
    </HintedPanel>
  </>;
}

function AccountingIntegration({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const query = useGetFinanceAccountSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const byKey = new Map((query.data?.data.mappings ?? []).map((mapping) => [mapping.key, mapping]));
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.accounting"><SettingsSectionHeader title="Accounting integration" description="Procurement posts to the accounts Finance maps." action={canView ? <Button asChild variant="outline"><Link to={`${F.SETTINGS}/accounting`}>Edit in Finance</Link></Button> : undefined} /></div>
      <HintedPanel title="Required Finance accounts" hint="Procurement uses the Finance account map, so there is one posting source of truth. Changes are made in Finance Settings and apply to Procurement posting straight away.">
        {!canView ? <SettingsRow icon={ShieldCheck} label="Finance mappings are protected" description="Finance settings view permission is required to resolve these account names." badge={<PolicyBadge kind="enforced">Permission required</PolicyBadge>} /> : PROCUREMENT_ACCOUNTS.map(([key, label, description]) => { const mapping = byKey.get(key); return <HintedRow key={key} label={label} hint={description} value={mapping?.account ? `${mapping.account.code} · ${mapping.account.name}` : mapping ? `${mapping.default_code} · Missing` : "Loading"} badge={<PolicyBadge kind={mapping?.is_valid ? "configured" : "default"}>{mapping?.source === "OVERRIDE" ? "Custom" : "Finance-owned"}</PolicyBadge>} />; })}
      </HintedPanel>
    </div>
  );
}

function ProtectedSettings() {
  return <SettingsPanel><SettingsRow icon={ShieldCheck} label="Procurement settings are protected" description="You need Procurement settings view permission to read this entity's policy." badge={<PolicyBadge kind="enforced">Permission required</PolicyBadge>} /></SettingsPanel>;
}

function Approvals() {
  const isSchool = useIsSchool();
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.VIEW_WORKFLOW_TEMPLATES);
  return (
    <div className="space-y-5">
      <div data-guide="procurement-settings.approvals"><SettingsSectionHeader title="Procurement approvals" description={isSchool ? `Each document type follows its own approval path: one for a branch, one for the whole school, or the ${platformName} version.` : "Each document type can resolve its own branch, tenant or platform workflow template."} action={canView ? <Button asChild><Link to={routesPath.PROTECTED.WORKFLOW.TEMPLATES}>Manage workflows</Link></Button> : undefined} /></div>
      <HintedPanel title="Approval-capable documents">
        <HintedRow icon={ClipboardCheck} label="Purchase requisitions" hint="Route the initial request and estimated commitment." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <HintedRow icon={ShoppingCart} label="Purchase orders" hint="Approve the legal commitment before receipt." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <HintedRow icon={ReceiptText} label="Vendor invoices" hint="Approve the priced and matched invoice evidence before posting." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <HintedRow icon={FileCheck2} label="Vendor payments" hint="Approve cash settlement independently from invoice approval." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <HintedRow icon={ListChecks} label="Senior approval threshold" hint="The seeded fallback workflow adds senior approval from ₦500,000. Scoped templates can replace that ladder." value="₦500,000" badge={<PolicyBadge kind="default" />} />
      </HintedPanel>
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
