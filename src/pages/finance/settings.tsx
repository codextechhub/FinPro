import {
  BadgePercent,
  Banknote,
  BookOpenCheck,
  Building2,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  FileCog,
  GitBranch,
  ListChecks,
  ListTree,
  Network,
  Percent,
  ReceiptText,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
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
  useGetFinanceAccountSettingsQuery,
  useGetFinanceBankingSettingsQuery,
  useGetFinanceDocumentSettingsQuery,
  useUpdateFinanceAccountSettingsMutation,
  useUpdateFinanceBankingSettingsMutation,
  useUpdateFinanceDocumentSettingsMutation,
} from "@/redux/services/finance/setup-api";
import type { FinanceAuditLog, FinanceBankingSettingsValues, FinanceDocumentSettingsValues, SettingConsumer } from "@/redux/services/finance/setup-types";
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
import { DEFAULT_FINANCE_SETTINGS_SECTION, type FinanceSettingsSection } from "./console-sections";
import { FinanceShell } from "./finance-shell";
import { EntitiesTab } from "./setup/entities-tab";

const F = routesPath.PROTECTED.FINANCE;

const SECTIONS: ConsoleSettingsSection[] = [
  { key: "overview", title: "Overview", description: "Configuration health", icon: Settings2 },
  { key: "entities", title: "Entities", description: "Sets of books", icon: Building2 },
  { key: "fiscal-calendar", title: "Fiscal calendar", description: "Years and periods", icon: CalendarRange },
  { key: "accounting", title: "Accounting defaults", description: "Posting account map", icon: BookOpenCheck },
  { key: "documents", title: "Documents", description: "Collections and policies", icon: FileCog },
  { key: "banking-cash", title: "Banking and cash", description: "Matching and allocation", icon: Banknote },
  { key: "reference-data", title: "Reference data", description: "Codes and dimensions", icon: ListTree },
  { key: "approvals", title: "Approvals", description: "Finance workflows", icon: Workflow },
];

const ACCOUNT_DESCRIPTIONS: Record<string, string> = {
  CASH_BANK: "Primary cash line used by cash reporting and operational fallbacks.",
  ACCOUNTS_RECEIVABLE: "Control account for customer balances.",
  ACCOUNTS_PAYABLE: "Control account for vendor balances.",
  CUSTOMER_CREDIT: "Unapplied receipts, overpayments and refundable customer credit.",
  GRIR_CLEARING: "Clears received goods against matched vendor invoices.",
  OUTPUT_VAT: "Tax collected on sales and held for remittance.",
  WHT_PAYABLE: "Withholding tax deducted from supplier payments.",
  RETAINED_EARNINGS: "Destination for year-end profit or loss.",
  BAD_DEBT_EXPENSE: "Fallback expense for approved write-offs.",
  BANK_CHARGES: "Fallback counter-account for bank adjustments.",
  INVENTORY_ASSET: "Balance-sheet value of stock held for issue.",
  INVENTORY_ADJUSTMENT: "Stock count, write-down and adjustment postings.",
  PURCHASE_PRICE_VARIANCE: "Difference between receipt basis and vendor invoice price.",
};

/** `section` comes from the route table; see console-sections.ts. */
export default function FinanceSettings({ section = DEFAULT_FINANCE_SETTINGS_SECTION }: {
  section?: FinanceSettingsSection;
}) {
  const activeSection = SECTIONS.some((item) => item.key === section) ? section : "overview";
  const active = useActiveEntity();

  return (
    <FinanceShell>
      <ConsoleSettingsLayout
        title="Finance Settings"
        description="Manage the structure, defaults and controls behind each set of books. Operational work stays in the main Finance menu."
        basePath={F.SETTINGS}
        activeSection={activeSection}
        sections={SECTIONS}
        scopeLabel={active.entity ? `${active.entity.code} · ${active.entity.name}` : "Select an entity"}
      >
        {activeSection === "overview" ? <Overview entity={active.entity} /> : null}
        {activeSection === "entities" ? <Entities /> : null}
        {activeSection === "fiscal-calendar" ? <FiscalCalendar entity={active.entity} /> : null}
        {/* Keyed on the entity: unsaved mapping edits are per-entity, so switching
            the active entity must discard them rather than carry them across and
            offer to save one entity's account map into another's books. */}
        {activeSection === "accounting" ? <AccountingDefaults key={active.code ?? "no-entity"} entityCode={active.code} /> : null}
        {activeSection === "documents" ? <DocumentSettings entityCode={active.code} /> : null}
        {activeSection === "banking-cash" ? <BankingCashPolicy entityCode={active.code} /> : null}
        {activeSection === "reference-data" ? <ReferenceData /> : null}
        {activeSection === "approvals" ? <Approvals /> : null}
      </ConsoleSettingsLayout>
    </FinanceShell>
  );
}

function Overview({ entity }: { entity: ReturnType<typeof useActiveEntity>["entity"] }) {
  // Administering entities is a platform act, not a tenant one: a product whose
  // customer keeps a single set of books never mounts the section and grants
  // nobody finance.entity.create. The card was offered there anyway and led to
  // a 404. Gated on the key that decides whether entities are administered
  // here at all, rather than on the key to read the one you already have.
  const { hasPermission } = usePermissions();
  const administersEntities = hasPermission(P.FIN_CREATE_ENTITY);
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Configuration overview" description="Start with the legal entity and fiscal calendar, then review the controls that drive posting." />
      {!entity ? (
        <SettingsPanel>
          <SettingsRow icon={Building2} label="No active entity selected" description="Choose an entity from the header to inspect entity-specific settings." badge={<PolicyBadge kind="default">Needs entity</PolicyBadge>} />
        </SettingsPanel>
      ) : (
        <SettingsPanel title="Active entity" description="The selected entity is the scope for Finance and Procurement documents.">
          <SettingsRow icon={Building2} label={entity.name} description={`${entity.code} · ${entity.kind.toLowerCase()} entity`} value={entity.base_currency} badge={<PolicyBadge kind="configured">Active</PolicyBadge>} />
        </SettingsPanel>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {administersEntities && (
          <SettingsOverviewCard icon={Building2} title="Entities" description="Create and review the independent sets of books owned by this tenant." to={`${F.SETTINGS}/entities`} status="Available" tone="ready" />
        )}
        <SettingsOverviewCard icon={CalendarRange} title="Fiscal calendar" description="Open fiscal years, manage posting periods and control the close." to={`${F.SETTINGS}/fiscal-calendar`} status={entity ? "Configured" : "Select entity"} tone={entity ? "ready" : "attention"} />
        <SettingsOverviewCard icon={BookOpenCheck} title="Accounting defaults" description="Review the control accounts currently resolved by finance posting services." to={`${F.SETTINGS}/accounting`} status="Review" tone="attention" />
        <SettingsOverviewCard icon={FileCog} title="Documents" description="Manage collection defaults, reminders, fee structures and document policies." to={`${F.SETTINGS}/documents`} status="Mixed" />
        <SettingsOverviewCard icon={Banknote} title="Banking and cash" description="Set automatic reconciliation and receipt-allocation defaults." to={`${F.SETTINGS}/banking-cash`} status="Configurable" tone="ready" />
        <SettingsOverviewCard icon={ListTree} title="Reference data" description="Maintain the chart, tax codes, currencies, cost centres and dimensions." to={`${F.SETTINGS}/reference-data`} status="Available" tone="ready" />
        <SettingsOverviewCard icon={Workflow} title="Approvals" description="Review approval templates for journals, refunds and write-offs." to={`${F.SETTINGS}/approvals`} status="Shared workflow" />
      </div>
    </div>
  );
}

function Entities() {
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Ledger entities" description="Each entity has its own reporting currency, chart of accounts, fiscal calendar and documents." />
      <EntitiesTab />
    </div>
  );
}

function FiscalCalendar({ entity }: { entity: ReturnType<typeof useActiveEntity>["entity"] }) {
  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="Fiscal calendar"
        description="Fiscal years and posting periods are administered in the close workbench. New entities can start monthly or quarterly calendars on a chosen month and day."
        action={entity ? <Button asChild variant="outline"><Link to={`${F.SETUP}/periods`}>Open period workbench</Link></Button> : undefined}
      />
      <SettingsPanel title="Current scope">
        <SettingsRow icon={Building2} label="Entity" description="The calendar belongs to one set of books and cannot be shared across entities." value={entity ? `${entity.code} · ${entity.name}` : "Not selected"} />
        <SettingsRow icon={CalendarRange} label="Period control" description="Open periods accept postings. Closed and locked periods are protected by the backend posting guard." badge={<PolicyBadge kind="enforced" />} />
        <SettingsRow icon={ShieldCheck} label="Year-end close" description="Year-end closes income and expense accounts into retained earnings before the final period can be locked." badge={<PolicyBadge kind="enforced" />} />
      </SettingsPanel>
    </div>
  );
}

function AccountingDefaults({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const canUpdate = hasPermission(P.FIN_UPDATE_SETTINGS);
  const query = useGetFinanceAccountSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const [update, updateState] = useUpdateFinanceAccountSettingsMutation();
  const [changes, setChanges] = useState<Record<string, string | null>>({});
  const payload = query.data?.data;
  const hasChanges = Object.keys(changes).length > 0;

  const save = async () => {
    if (!entityCode || !hasChanges) return;
    try {
      const response = await update({ entity: entityCode, mappings: changes }).unwrap();
      setChanges({});
      toast.success(response.message || "Finance account mappings saved.");
    } catch { /* Central API handling shows the actionable error. */ }
  };

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="Accounting defaults"
        description="Map stable posting roles to active accounts in this entity. Posting services use these mappings immediately after a successful save."
        action={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={`${F.SETUP}/accounts`}>Open chart</Link></Button><Button onClick={save} disabled={!canUpdate || !hasChanges || updateState.isLoading}><Save className="mr-2 size-4" />{updateState.isLoading ? "Saving" : "Save changes"}</Button></div>}
      />
      {!canView ? (
        <SettingsPanel><SettingsRow icon={ShieldCheck} label="Finance settings are protected" description="You need Finance settings view permission to read these mappings." badge={<PolicyBadge kind="enforced">Permission required</PolicyBadge>} /></SettingsPanel>
      ) : (
        <SettingsPanel title="Posting account map" description="Each choice is type-checked, entity-scoped, active and postable. Resetting a role returns it to the displayed starter-chart default.">
          {!entityCode ? <SettingsRow label="Select an entity" description="Choose an entity to resolve its current account map." /> : query.isLoading ? <SettingsRow label="Loading account mappings" description="Resolving the active entity's posting roles." /> : (payload?.mappings ?? []).map((mapping) => {
            const changed = Object.prototype.hasOwnProperty.call(changes, mapping.key);
            const selected = changed ? (changes[mapping.key] ?? "") : (mapping.source === "OVERRIDE" ? String(mapping.account?.id ?? "") : "");
            const options = (payload?.account_options ?? []).filter((account) => account.account_type === mapping.expected_account_type);
            return (
              <div key={mapping.key} className="grid grid-cols-1 gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-mont text-sm font-medium text-gray-01">{mapping.label}</p><PolicyBadge kind={changed || mapping.source === "OVERRIDE" ? "configured" : "default"}>{changed ? "Unsaved" : mapping.source === "OVERRIDE" ? "Custom" : `Default ${mapping.default_code}`}</PolicyBadge></div>
                  <p className="mt-1 font-mont text-xs leading-5 text-gray-05">{ACCOUNT_DESCRIPTIONS[mapping.key]}</p>
                  <SettingsConsumer consumer={payload?.consumers[mapping.key]} />
                </div>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <select aria-label={`${mapping.label} account`} className="h-10 min-w-0 flex-1 rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02" value={selected} disabled={!canUpdate} onChange={(event) => setChanges((current) => ({ ...current, [mapping.key]: event.target.value || null }))}>
                    <option value="">Use default {mapping.default_code}{mapping.source === "DEFAULT" && mapping.account ? ` · ${mapping.account.name}` : ""}</option>
                    {options.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                  </select>
                  {changed ? <Button variant="ghost" size="icon" aria-label={`Undo ${mapping.label} change`} onClick={() => setChanges((current) => { const next = { ...current }; delete next[mapping.key]; return next; })}><RotateCcw className="size-4" /></Button> : null}
                </div>
              </div>
            );
          })}
        </SettingsPanel>
      )}
      {canView && !canUpdate ? <p className="font-mont text-xs text-gray-05">You have read-only access. Finance settings update permission is required to save.</p> : null}
      {canView && payload ? <SettingsAuditHistory rows={payload.history} /> : null}
    </div>
  );
}

function DocumentSettings({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const canUpdate = hasPermission(P.FIN_UPDATE_SETTINGS);
  const query = useGetFinanceDocumentSettingsQuery(
    { entity: entityCode! }, { skip: !entityCode || !canView },
  );
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Documents and collections" description="Configuration that shapes customer-facing documents, collections and follow-up behavior." />
      {!canView ? <SettingsPanel><SettingsRow icon={ShieldCheck} label="Finance settings are protected" description="You need Finance settings view permission to read document policy." badge={<PolicyBadge kind="enforced">Permission required</PolicyBadge>} /></SettingsPanel> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading document policy" description="Reading the selected entity's billing defaults." /></SettingsPanel> : <FinanceDocumentForm key={`${entityCode}-${payload.settings.updated_at}-${payload.settings.primary_collection_bank_account?.id ?? "auto"}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers} history={payload.history} canUpdate={canUpdate} />}
      <SettingsPanel title="Related controls">
        <SettingsRow icon={ReceiptText} label="Document numbering" description="Numbers use the concurrency-safe tenant sequence. Entity reporting codes do not change the live sequence." badge={<PolicyBadge kind="enforced" />} />
        <SettingsRow icon={CircleDollarSign} label="Fee structures" description="Maintain reusable fee definitions and generate customer invoices from them." value={<Link className="text-primary hover:underline" to={`${F.RECEIVABLES}/fee-structures`}>Open</Link>} />
        <SettingsRow icon={BadgePercent} label="Dunning policies" description="Configure reminder stages, overdue days and communication channels." value={<Link className="text-primary hover:underline" to={`${F.RECEIVABLES}/dunning`}>Open</Link>} />
      </SettingsPanel>
    </div>
  );
}

function FinanceDocumentForm({ entityCode, values, consumers, history, canUpdate }: { entityCode: string; values: FinanceDocumentSettingsValues; consumers: Record<string, SettingConsumer>; history: FinanceAuditLog[]; canUpdate: boolean }) {
  const [dueDays, setDueDays] = useState(String(values.default_invoice_due_days));
  const [narration, setNarration] = useState(values.default_invoice_narration);
  const [autoPost, setAutoPost] = useState(values.auto_post_manual_invoices);
  const [openingBalances, setOpeningBalances] = useState(values.allow_customer_opening_balances);
  const [bankAccount, setBankAccount] = useState(values.primary_collection_bank_account ? String(values.primary_collection_bank_account.id) : "");
  const [update, state] = useUpdateFinanceDocumentSettingsMutation();
  const dueDaysValue = Number(dueDays);
  const valid = dueDays.trim() !== "" && Number.isInteger(dueDaysValue) && dueDaysValue >= 0 && dueDaysValue <= 365;
  const dirty = valid && (
    dueDaysValue !== values.default_invoice_due_days
    || narration.trim() !== values.default_invoice_narration
    || autoPost !== values.auto_post_manual_invoices
    || openingBalances !== values.allow_customer_opening_balances
    || bankAccount !== (values.primary_collection_bank_account ? String(values.primary_collection_bank_account.id) : "")
  );
  const save = async () => {
    try {
      const response = await update({
        entity: entityCode,
        default_invoice_due_days: dueDaysValue,
        default_invoice_narration: narration,
        auto_post_manual_invoices: autoPost,
        allow_customer_opening_balances: openingBalances,
        primary_collection_bank_account: bankAccount ? Number(bankAccount) : null,
      }).unwrap();
      toast.success(response.message || "Finance document policy saved.");
    } catch { /* Central API handling shows the actionable error. */ }
  };
  return <>
    <SettingsPanel title="Billing defaults" description="These defaults are applied by the backend when a user leaves the corresponding field blank.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
        <label className="font-mont text-xs font-semibold text-gray-01">Default invoice due days<Input className="mt-2 bg-white" type="number" min="0" max="365" step="1" value={dueDays} onChange={(event) => setDueDays(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Used for manual and fee-generated invoices without a due date.</span><SettingsConsumer consumer={consumers.default_invoice_due_days} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01">Primary collection account<select className="mt-2 h-10 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02" value={bankAccount} onChange={(event) => setBankAccount(event.target.value)} disabled={!canUpdate}><option value="">Automatic fallback</option>{values.bank_account_options.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}{bank.bank_name ? ` · ${bank.bank_name}` : ""} · {bank.currency}</option>)}</select><span className="mt-1 block font-normal leading-5 text-gray-05">Printed as the payment destination on invoices and receipts.</span><SettingsConsumer consumer={consumers.primary_collection_bank_account} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01 lg:col-span-2">Default invoice narration<Textarea className="mt-2 min-h-20 bg-white font-mont text-sm" value={narration} onChange={(event) => setNarration(event.target.value)} disabled={!canUpdate} maxLength={255} placeholder="Optional text for new manual invoices" /><SettingsConsumer consumer={consumers.default_invoice_narration} /></label>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="font-mont text-sm font-medium text-gray-01">Post manual invoices immediately</p><p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">When off, a manual invoice is priced and kept as a draft unless the user explicitly chooses to post.</p><SettingsConsumer consumer={consumers.auto_post_manual_invoices} /></div><Switch checked={autoPost} onCheckedChange={setAutoPost} disabled={!canUpdate} aria-label="Post manual invoices immediately" /></div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="font-mont text-sm font-medium text-gray-01">Allow customer opening balances</p><p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">When off, customer creation and edits reject non-zero opening balances.</p><SettingsConsumer consumer={consumers.allow_customer_opening_balances} /></div><Switch checked={openingBalances} onCheckedChange={setOpeningBalances} disabled={!canUpdate} aria-label="Allow customer opening balances" /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Use a whole number from 0 to 365 days." : canUpdate ? "Only changed values are written to audit history." : "You have read-only access."}</p><Button onClick={save} disabled={!canUpdate || !dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save document policy"}</Button></div>
    </SettingsPanel>
    <div className="mt-5"><SettingsAuditHistory rows={history} /></div>
  </>;
}

function BankingCashPolicy({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const canUpdate = hasPermission(P.FIN_UPDATE_SETTINGS);
  const query = useGetFinanceBankingSettingsQuery(
    { entity: entityCode! }, { skip: !entityCode || !canView },
  );
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Banking and cash policy" description="Set reconciliation, receipt allocation and petty-cash alert defaults for the selected entity." />
      {!canView ? <SettingsPanel><SettingsRow icon={ShieldCheck} label="Finance settings are protected" description="You need Finance settings view permission to read banking policy." badge={<PolicyBadge kind="enforced">Permission required</PolicyBadge>} /></SettingsPanel> : query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading banking policy" description="Reading the selected entity's reconciliation and allocation defaults." /></SettingsPanel> : <BankingCashForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers} history={payload.history} canUpdate={canUpdate} />}
      <SettingsPanel title="How defaults are applied">
        <SettingsRow icon={RotateCcw} label="Explicit workbench choices win" description="A user-supplied reconciliation window, grouping choice, or receipt strategy overrides these defaults for that operation." badge={<PolicyBadge kind="enforced">Override allowed</PolicyBadge>} />
        <SettingsRow icon={ShieldCheck} label="Matching does not post new money" description="Automatic reconciliation links existing statement and ledger evidence. It does not create an adjusting journal unless a separate authorized action does so." badge={<PolicyBadge kind="enforced" />} />
        <SettingsRow icon={CircleDollarSign} label="Petty cash remains GL-backed" description="The replenishment alert compares the saved threshold with live cash on hand from the ledger, not a manually edited balance." badge={<PolicyBadge kind="enforced" />} />
      </SettingsPanel>
    </div>
  );
}

function BankingCashForm({ entityCode, values, consumers, history, canUpdate }: { entityCode: string; values: FinanceBankingSettingsValues; consumers: Record<string, SettingConsumer>; history: FinanceAuditLog[]; canUpdate: boolean }) {
  const [toleranceDays, setToleranceDays] = useState(String(values.default_bank_reconciliation_tolerance_days));
  const [groupMatches, setGroupMatches] = useState(values.default_group_reconciliation_matches);
  const [allocationStrategy, setAllocationStrategy] = useState(values.default_receipt_allocation_strategy);
  const [pettyCashThreshold, setPettyCashThreshold] = useState(String(values.petty_cash_low_balance_threshold_bps / 100));
  const [update, state] = useUpdateFinanceBankingSettingsMutation();
  const toleranceValue = Number(toleranceDays);
  const pettyCashThresholdBps = Math.round(Number(pettyCashThreshold) * 100);
  const valid = toleranceDays.trim() !== "" && pettyCashThreshold.trim() !== ""
    && Number.isInteger(toleranceValue) && toleranceValue >= 0 && toleranceValue <= 30
    && Number.isFinite(pettyCashThresholdBps) && pettyCashThresholdBps >= 0 && pettyCashThresholdBps <= 10000;
  const dirty = valid && (
    toleranceValue !== values.default_bank_reconciliation_tolerance_days
    || groupMatches !== values.default_group_reconciliation_matches
    || allocationStrategy !== values.default_receipt_allocation_strategy
    || pettyCashThresholdBps !== values.petty_cash_low_balance_threshold_bps
  );
  const save = async () => {
    try {
      const response = await update({
        entity: entityCode,
        default_bank_reconciliation_tolerance_days: toleranceValue,
        default_group_reconciliation_matches: groupMatches,
        default_receipt_allocation_strategy: allocationStrategy,
        petty_cash_low_balance_threshold_bps: pettyCashThresholdBps,
      }).unwrap();
      toast.success(response.message || "Finance banking policy saved.");
    } catch { /* Central API handling shows the actionable error. */ }
  };
  return <>
    <SettingsPanel title="Banking and cash defaults" description="These values are used only when an operation or report does not supply its own choice.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-3">
        <label className="font-mont text-xs font-semibold text-gray-01">Reconciliation date tolerance (days)<Input className="mt-2 bg-white" type="number" min="0" max="30" step="1" value={toleranceDays} onChange={(event) => setToleranceDays(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Allows automatic matching when statement and journal dates are this many days apart.</span><SettingsConsumer consumer={consumers.default_bank_reconciliation_tolerance_days} /></label>
        <label className="min-w-0 font-mont text-xs font-semibold text-gray-01">Default receipt allocation<select className="mt-2 h-10 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02" value={allocationStrategy} onChange={(event) => setAllocationStrategy(event.target.value as FinanceBankingSettingsValues["default_receipt_allocation_strategy"])} disabled={!canUpdate}><option value="oldest">Oldest due first</option><option value="largest">Largest balance first</option></select><span className="mt-1 block font-normal leading-5 text-gray-05">Applied when a receipt is automatically allocated without a user-selected order.</span><SettingsConsumer consumer={consumers.default_receipt_allocation_strategy} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01">Petty cash low-balance threshold (%)<Input className="mt-2 bg-white" type="number" min="0" max="100" step="0.01" value={pettyCashThreshold} onChange={(event) => setPettyCashThreshold(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Flags a fund for replenishment when live cash on hand reaches or falls below this share of its imprest float.</span><SettingsConsumer consumer={consumers.petty_cash_low_balance_threshold_bps} /></label>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="font-mont text-sm font-medium text-gray-01">Allow grouped automatic matches</p><p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">Lets one bank statement line match a uniquely determined group of ledger lines with the same total.</p><SettingsConsumer consumer={consumers.default_group_reconciliation_matches} /></div><Switch checked={groupMatches} onCheckedChange={setGroupMatches} disabled={!canUpdate} aria-label="Allow grouped automatic matches" /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Use 0 to 30 days and a threshold from 0 to 100%." : canUpdate ? "Only effective changes are written to audit history." : "You have read-only access."}</p><Button onClick={save} disabled={!canUpdate || !dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save banking policy"}</Button></div>
    </SettingsPanel>
    <div className="mt-5"><SettingsAuditHistory rows={history} /></div>
  </>;
}

function ReferenceData() {
  const cards = [
    [ListTree, "Chart of accounts", "Account hierarchy and posting availability.", `${F.SETUP}/accounts`],
    [Percent, "Tax codes", "Rates and input or output tax accounts.", `${F.SETUP}/tax-codes`],
    [Network, "Cost centres", "Ownership tags for income and spend.", `${F.SETUP}/cost-centers`],
    [GitBranch, "Dimensions", "Additional reporting axes and allowed values.", `${F.SETUP}/dimensions`],
    [Banknote, "Currencies and FX", "Supported currencies and dated exchange rates.", `${F.SETUP}/currencies`],
  ] as const;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Reference data" description="Stable codes and analytical structures used by transactions across Finance and Procurement." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([icon, title, description, to]) => <SettingsOverviewCard key={title} icon={icon} title={title} description={description} to={to} status="Manage" />)}
      </div>
    </div>
  );
}

function Approvals() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.VIEW_WORKFLOW_TEMPLATES);
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Finance approvals" description="Finance uses the shared workflow engine, while the final posting remains protected by the ledger and period guards." action={canView ? <Button asChild><Link to={routesPath.PROTECTED.WORKFLOW.TEMPLATES}>Manage workflows</Link></Button> : undefined} />
      <SettingsPanel title="Approval-capable documents">
        <SettingsRow icon={BookOpenCheck} label="Journal entries" description="A published finance.journal template routes journals before they post." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <SettingsRow icon={CircleDollarSign} label="Refunds" description="Approved refunds post only after the workflow reaches its final decision." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <SettingsRow icon={ListChecks} label="Write-offs" description="Write-off requests can use a separate approval ladder and value threshold." badge={<PolicyBadge kind="configured">Workflow ready</PolicyBadge>} />
        <SettingsRow icon={CheckCircle2} label="Posting protection" description="Approval never bypasses balance, chronology, account-state or fiscal-period validation." badge={<PolicyBadge kind="enforced" />} />
      </SettingsPanel>
    </div>
  );
}
