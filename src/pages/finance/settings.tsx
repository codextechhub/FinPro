import {
  BadgePercent,
  Banknote,
  BookOpenCheck,
  Building2,
  CalendarRange,
  CircleDollarSign,
  FileCog,
  GitBranch,
  History,
  ListTree,
  Network,
  Percent,
  ReceiptText,
  RotateCcw,
  Save,
  Settings2,
  CalendarClock,
  Wallet,
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
  useGetFinanceSettingsHistoryQuery,
  useUpdateFinanceAccountSettingsMutation,
  useUpdateFinanceBankingSettingsMutation,
  useUpdateFinanceDocumentSettingsMutation,
} from "@/redux/services/finance/setup-api";
import type { FinanceBankingSettingsValues, FinanceDocumentSettingsValues, SettingConsumer } from "@/redux/services/finance/setup-types";
import {
  ConsoleSettingsLayout,
  PolicyBadge,
  SettingsAuditHistory,
  SettingsConsumer,
  SettingsOverviewCard,
  SettingsPanel,
  SettingsRow,
  SettingsSectionHeader,
  type ConsoleSettingsGroup,
  type ConsoleSettingsSection,
} from "@/components/settings/settings-layout";
import { InfoHint, useActiveEntity, useFieldAccess } from "@/components/finance-ui";
import { BANK_ACCOUNT, bankOptionLabel } from "./bank-account-access";
import { DEFAULT_FINANCE_SETTINGS_SECTION, type FinanceSettingsSection } from "./console-sections";
import { FeeDuePolicyPanel, financeSettingsSections, setupSections, useFinanceSettingsSectionAccess } from "@xvs/finance/host";
import { FinanceShell } from "./finance-shell";
import { EntitiesTab } from "./setup/entities-tab";
import { OnlinePaymentsPanel } from "./online-payments";
import { ReceivablesSettings } from "./receivables-settings";
import { PayrollSettingsPanel } from "./payroll-settings";
import { CalendarRulePanel, RecordKeepingPanel } from "./settings-records";
import { useSettingsWriteAccess } from "@/components/finance-ui/whole-school-access";
import { FINANCE_HELP } from "./screen-help";
import { visibleFinanceSettingsSections, visibleSetupSections } from "./settings-access";

const F = routesPath.PROTECTED.FINANCE;

// Keys typed to the section union rather than to `string`, so the host's
// mounted-sections list can be checked against them at compile time and a
// section renamed in one place cannot silently stop matching in the other.
//
// The rail order is this list's order; a section's `group` puts it under that
// heading, which opens like a sub-menu (see ConsoleSettingsLayout).
const SECTIONS: (ConsoleSettingsSection & { key: FinanceSettingsSection })[] = [
  { key: "overview", title: "Overview", description: "Configuration health", icon: Settings2 },
  { key: "entities", title: "Entities", description: "Sets of books", icon: Building2, group: "books" },
  { key: "fiscal-calendar", title: "Fiscal calendar", description: "Years, periods and records", icon: CalendarRange, group: "books" },
  { key: "accounting", title: "Accounting defaults", description: "Posting account map", icon: BookOpenCheck, group: "books" },
  { key: "reference-data", title: "Reference data", description: "Codes and dimensions", icon: ListTree, group: "books" },
  { key: "documents", title: "Documents", description: "Collections and policies", icon: FileCog, group: "billing" },
  { key: "fees", title: "Fee due dates", description: "When fee bills fall due", icon: CalendarClock, group: "billing" },
  { key: "banking-cash", title: "Banking and cash", description: "Matching, allocation, online payments", icon: Banknote, group: "billing" },
  { key: "receivables", title: "Receivables", description: "Credit, deferred income, deposits", icon: ReceiptText, group: "billing" },
  { key: "payroll", title: "Payroll", description: "PAYE, deductions and payslips", icon: Wallet },
  { key: "approvals", title: "Approvals", description: "Finance workflows", icon: Workflow },
  { key: "recent-changes", title: "Recent changes", description: "All settings activity", icon: History },
];

const GROUPS: ConsoleSettingsGroup[] = [
  { key: "books", title: "Books", icon: BookOpenCheck },
  { key: "billing", title: "Billing and cash", icon: Banknote },
];

const ACCOUNT_DESCRIPTIONS: Record<string, string> = {
  CASH_BANK: "Primary cash line used by cash reporting and operational fallbacks.",
  ACCOUNTS_RECEIVABLE: "Control account for customer balances (the total every customer owes).",
  ACCOUNTS_PAYABLE: "Control account for vendor balances (the total owed to every vendor).",
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
  // Entities are administered where they are created. A product that keeps a
  // single set of books grants nobody finance.entity.create, does not mount the
  // section, and must not be offered it here either: the list and the overview
  // card both led to a 404, which reads as a broken screen rather than as a
  // section this product does not have.
  // Two gates, and they answer different questions. The host says which
  // sections it routes at all - offering one it does not mount produced a link
  // that 404ed - and the permission then decides whether a mounted section is
  // shown to this caller.
  const { hasPermission } = usePermissions();
  const hostAllows = useFinanceSettingsSectionAccess();
  const visibleKeys = visibleFinanceSettingsSections({
    mounted: financeSettingsSections,
    mountedSetup: setupSections,
    can: hasPermission,
    hostAllows,
  });
  const sections = SECTIONS.filter((item) => visibleKeys.includes(item.key));
  const activeSection = sections.some((item) => item.key === section) ? section : "overview";
  const active = useActiveEntity();

  if (sections.length === 0) return null;

  return (
    <FinanceShell>
      <ConsoleSettingsLayout
        title="Finance Settings"
        titleHelp={<InfoHint ariaLabel="About Finance settings">{FINANCE_HELP.settings}</InfoHint>}
        description="Manage the structure, defaults and controls behind each set of books. Operational work stays in the main Finance menu."
        basePath={F.SETTINGS}
        activeSection={activeSection}
        sections={sections}
        groups={GROUPS}
        fitScreen
      >
        {activeSection === "overview" ? <Overview entity={active.entity} sections={sections} /> : null}
        {activeSection === "entities" ? <Entities /> : null}
        {activeSection === "fiscal-calendar" ? <FiscalCalendar entity={active.entity} entityCode={active.code} /> : null}
        {/* Keyed on the entity: unsaved mapping edits are per-entity, so switching
            the active entity must discard them rather than carry them across and
            offer to save one entity's account map into another's books. */}
        {activeSection === "accounting" ? <AccountingDefaults key={active.code ?? "no-entity"} entityCode={active.code} /> : null}
        {activeSection === "documents" ? <DocumentSettings entityCode={active.code} /> : null}
        {activeSection === "banking-cash" ? <BankingCashPolicy entityCode={active.code} /> : null}
        {activeSection === "reference-data" ? <ReferenceData /> : null}
        {activeSection === "approvals" ? <Approvals /> : null}
        {activeSection === "fees" ? <FeeDuePolicyPanel /> : null}
        {activeSection === "receivables" ? <ReceivablesSettings key={active.code ?? "no-entity"} entityCode={active.code} /> : null}
        {activeSection === "payroll" ? <PayrollSettingsPanel key={active.code ?? "no-entity"} entityCode={active.code} /> : null}
        {activeSection === "recent-changes" ? <RecentChanges entityCode={active.code} /> : null}
      </ConsoleSettingsLayout>
    </FinanceShell>
  );
}

/** What each section's overview card says. Keyed by section so the cards cannot
 *  drift from the nav: both are rendered from the one filtered list. */
const OVERVIEW_CARDS: Record<Exclude<FinanceSettingsSection, "overview">, {
  description: string;
  status: string;
  tone?: "ready" | "attention";
}> = {
  entities: { description: "Create and review the independent sets of books owned by this tenant.", status: "Available", tone: "ready" },
  "fiscal-calendar": { description: "How the next fiscal year opens, how long records are kept, and the close workbench.", status: "Configured", tone: "ready" },
  accounting: { description: "Review the control accounts currently resolved by finance posting services.", status: "Review", tone: "attention" },
  documents: { description: "Manage collection defaults, reminders, fee structures and document policies.", status: "Mixed" },
  "banking-cash": { description: "Set reconciliation and receipt-allocation defaults, and who holds the school's online payments.", status: "Configurable", tone: "ready" },
  // Deliberately not a list of the pages behind it. Which reference pages exist
  // is the host's answer, and naming currencies and dimensions here was wrong in
  // an app that mounts neither.
  "reference-data": { description: "Maintain the chart of accounts, tax codes and the other shared reference data.", status: "Available", tone: "ready" },
  approvals: { description: "Review approval templates for journals, refunds and write-offs.", status: "Shared workflow" },
  fees: { description: "Choose when fee bills fall due once they are raised.", status: "Configurable", tone: "ready" },
  receivables: { description: "Credit on new bills, the concession limit, fees billed ahead, doubtful debts, deposits and payer payments.", status: "Configurable", tone: "ready" },
  payroll: { description: "Choose how PAYE is worked out, which deductions apply, how payslips reach staff and how earlier pay is handled.", status: "Configurable", tone: "ready" },
  "recent-changes": { description: "Review the newest saved changes from every Finance settings section in one place.", status: "Combined", tone: "ready" },
};

function Overview({ entity, sections }: {
  entity: ReturnType<typeof useActiveEntity>["entity"];
  // The same list the nav was built from. Passed in rather than recomputed: the
  // cards were their own hardcoded set, so Entities kept its card in an app that
  // does not mount the section long after the nav entry had gone.
  sections: (ConsoleSettingsSection & { key: FinanceSettingsSection })[];
}) {
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Configuration overview" description="Start with the legal entity and fiscal calendar, then review the controls that drive posting." />
      {!entity ? (
        <SettingsPanel>
          <SettingsRow icon={Building2} label="No active entity selected" description="Choose an entity from the header to inspect entity-specific settings." badge={<PolicyBadge kind="default">Needs entity</PolicyBadge>} />
        </SettingsPanel>
      ) : (
        <SettingsPanel title="Active entity" description="The selected entity is the scope for Finance and Procurement documents.">
          <SettingsRow icon={Building2} label={entity.name} description={entity.kind_label ? `${entity.code} · ${entity.kind_label}` : entity.code} value={entity.base_currency} badge={<PolicyBadge kind="configured">Active</PolicyBadge>} />
        </SettingsPanel>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections
          .filter((item) => item.key !== "overview")
          .map((item) => {
            const card = OVERVIEW_CARDS[item.key as Exclude<FinanceSettingsSection, "overview">];
            if (!card) return null;
            // The fiscal calendar is the one card whose state depends on there
            // being an active entity to read periods from.
            const needsEntity = item.key === "fiscal-calendar" && !entity;
            return (
              <SettingsOverviewCard
                key={item.key}
                icon={item.icon}
                title={item.title}
                description={card.description}
                to={`${F.SETTINGS}/${item.key}`}
                status={needsEntity ? "Select entity" : card.status}
                tone={needsEntity ? "attention" : card.tone}
              />
            );
          })}
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

function FiscalCalendar({ entity, entityCode }: { entity: ReturnType<typeof useActiveEntity>["entity"]; entityCode: string | null }) {
  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="Fiscal calendar"
        description="How the next fiscal year opens and how long the books are kept. Fiscal years and posting periods themselves are administered in the close workbench."
        action={entity ? <Button asChild variant="outline"><Link to={`${F.SETUP}/periods`}>Open period workbench</Link></Button> : undefined}
      />
      <CalendarRulePanel entityCode={entityCode} />
      <RecordKeepingPanel entityCode={entityCode} />
    </div>
  );
}

function AccountingDefaults({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.FIN_UPDATE_SETTINGS);
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
        action={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={`${F.SETUP}/accounts`}>Open chart</Link></Button>{canUpdate ? <Button onClick={save} disabled={!hasChanges || updateState.isLoading}><Save className="mr-2 size-4" />{updateState.isLoading ? "Saving" : "Save changes"}</Button> : null}</div>}
      />
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
      {canView && readOnlyNote ? <p className="font-mont text-xs text-gray-05">{readOnlyNote}</p> : null}
    </div>
  );
}

function RecentChanges({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const query = useGetFinanceSettingsHistoryQuery(
    { entity: entityCode! }, { skip: !entityCode || !canView },
  );
  return (
    <div data-guide="finance-settings.recent-changes" className="space-y-5">
      <SettingsSectionHeader
        title="Recent changes"
        description="Review saved changes from every Finance settings section for the active entity."
      />
      {!entityCode ? (
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

function DocumentSettings({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.FIN_UPDATE_SETTINGS);
  const query = useGetFinanceDocumentSettingsQuery(
    { entity: entityCode! }, { skip: !entityCode || !canView },
  );
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Documents and collections" description="Configuration that shapes customer-facing documents, collections and follow-up behavior." />
      {query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading document policy" description="Reading the selected entity's billing defaults." /></SettingsPanel> : <FinanceDocumentForm key={`${entityCode}-${payload.settings.updated_at}-${payload.settings.primary_collection_bank_account?.id ?? "auto"}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers} canUpdate={canUpdate} readOnlyNote={readOnlyNote} />}
      {hasPermission(P.FIN_VIEW_FEE_STRUCTURES) || hasPermission(P.FIN_VIEW_DUNNING) ? (
        <SettingsPanel title="Related settings">
          {hasPermission(P.FIN_VIEW_FEE_STRUCTURES) ? <SettingsRow icon={CircleDollarSign} label="Fee structures" description="Maintain reusable fee definitions and generate customer invoices from them." value={<Link className="text-primary hover:underline" to={`${F.RECEIVABLES}/fee-structures`}>Open</Link>} /> : null}
          {hasPermission(P.FIN_VIEW_DUNNING) ? <SettingsRow icon={BadgePercent} label="Dunning policies" description="Configure reminder stages, overdue days and communication channels." value={<Link className="text-primary hover:underline" to={`${F.RECEIVABLES}/dunning`}>Open</Link>} /> : null}
        </SettingsPanel>
      ) : null}
    </div>
  );
}

/**
 * The document and collection policy form. The primary collection account choice
 * writes that account's collection flag, so it follows the bank account switch
 * for that flag: greyed and left out of the saved body when the role may not
 * change it.
 */
export function FinanceDocumentForm({ entityCode, values, consumers, canUpdate, readOnlyNote }: { entityCode: string; values: FinanceDocumentSettingsValues; consumers: Record<string, SettingConsumer>; canUpdate: boolean; readOnlyNote: string | null }) {
  const [dueDays, setDueDays] = useState(String(values.default_invoice_due_days));
  const [narration, setNarration] = useState(values.default_invoice_narration);
  const [autoPost, setAutoPost] = useState(values.auto_post_manual_invoices);
  const [openingBalances, setOpeningBalances] = useState(values.allow_customer_opening_balances);
  const [bankAccount, setBankAccount] = useState(values.primary_collection_bank_account ? String(values.primary_collection_bank_account.id) : "");
  // Naming another collection account writes that account's collection flag.
  const bankWritable = !useFieldAccess(BANK_ACCOUNT).isReadOnly("is_primary_collection");
  const [target, setTarget] = useState(String(values.term_collection_target_pct));
  const [update, state] = useUpdateFinanceDocumentSettingsMutation();
  const dueDaysValue = Number(dueDays);
  const targetValue = Number(target);
  const targetValid = target.trim() !== "" && Number.isInteger(targetValue) && targetValue >= 1 && targetValue <= 100;
  const valid = dueDays.trim() !== "" && Number.isInteger(dueDaysValue) && dueDaysValue >= 0 && dueDaysValue <= 365 && targetValid;
  const dirty = valid && (
    dueDaysValue !== values.default_invoice_due_days
    || narration.trim() !== values.default_invoice_narration
    || autoPost !== values.auto_post_manual_invoices
    || openingBalances !== values.allow_customer_opening_balances
    || targetValue !== values.term_collection_target_pct
    || (bankWritable && bankAccount !== (values.primary_collection_bank_account ? String(values.primary_collection_bank_account.id) : ""))
  );
  const save = async () => {
    try {
      const response = await update({
        entity: entityCode,
        default_invoice_due_days: dueDaysValue,
        default_invoice_narration: narration,
        auto_post_manual_invoices: autoPost,
        allow_customer_opening_balances: openingBalances,
        term_collection_target_pct: targetValue,
        ...(bankWritable ? { primary_collection_bank_account: bankAccount ? Number(bankAccount) : null } : {}),
      }).unwrap();
      toast.success(response.message || "Finance document policy saved.");
    } catch { /* Central API handling shows the actionable error. */ }
  };
  return <>
    <SettingsPanel title="Billing defaults" description="These defaults are applied by the backend when a user leaves the corresponding field blank.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
        <label className="font-mont text-xs font-semibold text-gray-01">Default invoice due days<Input className="mt-2 bg-white" type="number" min="0" max="365" step="1" value={dueDays} onChange={(event) => setDueDays(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Used for manual and fee-generated invoices without a due date.</span><SettingsConsumer consumer={consumers.default_invoice_due_days} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01">Primary collection account<select className="mt-2 h-10 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02" value={bankAccount} onChange={(event) => setBankAccount(event.target.value)} disabled={!canUpdate || !bankWritable}><option value="">Automatic fallback</option>{values.bank_account_options.map((bank) => <option key={bank.id} value={bank.id}>{bankOptionLabel(bank)}</option>)}</select><span className="mt-1 block font-normal leading-5 text-gray-05">Printed as the payment destination on invoices and receipts.</span><SettingsConsumer consumer={consumers.primary_collection_bank_account} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01">Term collection target (%)<Input className="mt-2 bg-white" type="number" min="1" max="100" step="1" value={target} onChange={(event) => setTarget(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">The share of a term&rsquo;s fees you aim to have collected by the end of the term. Drawn as the target on the collection curve.</span><SettingsConsumer consumer={consumers.term_collection_target_pct} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01 lg:col-span-2">Default invoice narration<Textarea className="mt-2 min-h-20 bg-white font-mont text-sm" value={narration} onChange={(event) => setNarration(event.target.value)} disabled={!canUpdate} maxLength={255} placeholder="Optional text for new manual invoices" /><SettingsConsumer consumer={consumers.default_invoice_narration} /></label>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="font-mont text-sm font-medium text-gray-01">Post manual invoices immediately</p><p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">When off, a manual invoice is priced and kept as a draft unless the user explicitly chooses to post.</p><SettingsConsumer consumer={consumers.auto_post_manual_invoices} /></div><Switch checked={autoPost} onCheckedChange={setAutoPost} disabled={!canUpdate} aria-label="Post manual invoices immediately" /></div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="font-mont text-sm font-medium text-gray-01">Allow customer opening balances</p><p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">When off, customer creation and edits reject non-zero opening balances.</p><SettingsConsumer consumer={consumers.allow_customer_opening_balances} /></div><Switch checked={openingBalances} onCheckedChange={setOpeningBalances} disabled={!canUpdate} aria-label="Allow customer opening balances" /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? (targetValid ? "Use a whole number from 0 to 365 days." : "Use a whole-number target from 1 to 100.") : readOnlyNote ?? "Only changed values are written to audit history."}</p>{canUpdate ? <Button onClick={save} disabled={!dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save document policy"}</Button> : null}</div>
    </SettingsPanel>
  </>;
}

function BankingCashPolicy({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.FIN_UPDATE_SETTINGS);
  const query = useGetFinanceBankingSettingsQuery(
    { entity: entityCode! }, { skip: !entityCode || !canView },
  );
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Banking and cash policy" description={canView ? "Set reconciliation, receipt allocation, petty-cash and online-payment defaults for the selected entity." : "Manage the online-payment settings available to your role."} />
      {canView ? (query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading banking policy" description="Reading the selected entity's reconciliation and allocation defaults." /></SettingsPanel> : <BankingCashForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers} canUpdate={canUpdate} readOnlyNote={readOnlyNote} />) : null}
      {/* Read under its own payments key, so it stands apart from the finance policy above. */}
      <OnlinePaymentsPanel entityCode={entityCode} />
    </div>
  );
}

function BankingCashForm({ entityCode, values, consumers, canUpdate, readOnlyNote }: { entityCode: string; values: FinanceBankingSettingsValues; consumers: Record<string, SettingConsumer>; canUpdate: boolean; readOnlyNote: string | null }) {
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
        <label className="min-w-0 font-mont text-xs font-semibold text-gray-01">Default receipt allocation<select className="mt-2 h-10 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02" value={allocationStrategy} onChange={(event) => setAllocationStrategy(event.target.value as FinanceBankingSettingsValues["default_receipt_allocation_strategy"])} disabled={!canUpdate}>{values.default_receipt_allocation_strategy_options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className="mt-1 block font-normal leading-5 text-gray-05">Applied when a receipt is automatically allocated without a user-selected order.</span><SettingsConsumer consumer={consumers.default_receipt_allocation_strategy} /></label>
        <label className="font-mont text-xs font-semibold text-gray-01">Petty cash low-balance threshold (%)<Input className="mt-2 bg-white" type="number" min="0" max="100" step="0.01" value={pettyCashThreshold} onChange={(event) => setPettyCashThreshold(event.target.value)} disabled={!canUpdate} /><span className="mt-1 block font-normal leading-5 text-gray-05">Flags a fund for replenishment when live cash on hand reaches or falls below this share of its imprest float.</span><SettingsConsumer consumer={consumers.petty_cash_low_balance_threshold_bps} /></label>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="font-mont text-sm font-medium text-gray-01">Allow grouped automatic matches</p><p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">Lets one bank statement line match a uniquely determined group of ledger lines with the same total.</p><SettingsConsumer consumer={consumers.default_group_reconciliation_matches} /></div><Switch checked={groupMatches} onCheckedChange={setGroupMatches} disabled={!canUpdate} aria-label="Allow grouped automatic matches" /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!valid ? "Use 0 to 30 days and a threshold from 0 to 100%." : readOnlyNote ?? "Only effective changes are written to audit history."}</p>{canUpdate ? <Button onClick={save} disabled={!dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save banking policy"}</Button> : null}</div>
    </SettingsPanel>
  </>;
}

function ReferenceData() {
  // Keyed by the setup section each card opens, so a card can only be offered
  // where the host routes its page. Dimensions and currencies are the reason:
  // both were shown unconditionally and both 404ed in an app that mounts
  // neither.
  const all = [
    ["accounts", ListTree, "Chart of accounts", "Account hierarchy and posting availability."],
    ["tax-codes", Percent, "Tax codes", "Rates and input or output tax accounts."],
    ["cost-centers", Network, "Cost centres", "Ownership tags for income and spend."],
    ["dimensions", GitBranch, "Dimensions", "Additional reporting axes and allowed values."],
    ["currencies", Banknote, "Currencies and FX", "Supported currencies and dated exchange rates."],
  ] as const;
  const { hasPermission } = usePermissions();
  const visibleSections = visibleSetupSections(setupSections, hasPermission);
  const cards = all
    .filter(([section]) => visibleSections.includes(section))
    .map(([section, icon, title, description]) =>
      [icon, title, description, `${F.SETUP}/${section}`] as const);
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
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Finance approvals" description="Manage the approval paths used by Finance documents." action={<Button asChild><Link to={routesPath.PROTECTED.WORKFLOW.TEMPLATES}>Manage workflows</Link></Button>} />
    </div>
  );
}
