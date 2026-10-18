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
import { P } from "../../permissions";
import { routesPath } from "@/routes/routes-path";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useGetFinanceAccountSettingsQuery,
  useGetFinanceBankingSettingsQuery,
  useGetFinanceDocumentSettingsQuery,
  useGetFinanceSettingsHistoryQuery,
  useUpdateFinanceAccountSettingsMutation,
  useUpdateFinanceDocumentSettingsMutation,
} from "@/redux/services/finance/setup-api";
import type { FinanceDocumentSettingsValues, SettingConsumer } from "@/redux/services/finance/setup-types";
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
import {
  AccessField, HintedPanel, InfoHint, SettingField, SettingHint, SettingToggle, UsedBy,
  fieldWriteErrors, useActiveEntity, useFieldAccess, type FieldErrors,
} from "@/components/finance-ui";
import { BANK_ACCOUNT, bankOptionLabel } from "./bank-account-access";
import { DEFAULT_FINANCE_SETTINGS_SECTION, type FinanceSettingsSection } from "./console-sections";
import { FeeDuePolicyPanel, financeSettingsSections, setupSections, useFinanceSettingsSectionAccess } from "@xvs/finance/host";
import { FinanceShell } from "./finance-shell";
import { EntitiesTab } from "./setup/entities-tab";
import { OnlinePaymentsPanel } from "./online-payments";
import { ReceivablesSettings } from "./receivables-settings";
import { BankingCashForm } from "./banking-cash-settings";
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

/**
 * What each posting role is for, in the role's ⓘ when the server sends no
 * consumer sentence for it. The server's sentence is the fuller one, so it
 * wins wherever it exists.
 */
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
        <HintedPanel title="Active entity" hint="The selected entity is the scope for Finance and Procurement documents.">
          <SettingsRow icon={Building2} label={entity.name} description={entity.kind_label ? `${entity.code} · ${entity.kind_label}` : entity.code} value={entity.base_currency} badge={<PolicyBadge kind="configured">Active</PolicyBadge>} />
        </HintedPanel>
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
        description="How the next fiscal year opens and how long the books are kept."
        action={entity ? <Button asChild variant="outline"><Link to={`${F.SETUP}/periods`}>Open period workbench</Link></Button> : undefined}
      />
      <CalendarRulePanel entityCode={entityCode} />
      <RecordKeepingPanel entityCode={entityCode} />
    </div>
  );
}

/**
 * The posting account map.
 *
 * Each role is a `finance.settings` Field Access field travelling under its
 * key (`CASH_BANK`). A role the reader may not read never arrives, so it has
 * no row; a role named in `read_only_keys` is shown greyed and never sent,
 * because the server refuses a change to it before saving anything. A refusal
 * that names a role is shown on that role's row.
 */
export function AccountingDefaults({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.FIN_UPDATE_SETTINGS);
  const query = useGetFinanceAccountSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const [update, updateState] = useUpdateFinanceAccountSettingsMutation();
  const [changes, setChanges] = useState<Record<string, string | null>>({});
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const payload = query.data?.data;
  const readOnlyKeys = payload?.read_only_keys ?? [];
  const writable = Object.fromEntries(Object.entries(changes).filter(([key]) => !readOnlyKeys.includes(key)));
  const hasChanges = Object.keys(writable).length > 0;

  const save = async () => {
    if (!entityCode || !hasChanges) return;
    try {
      const response = await update({ entity: entityCode, mappings: writable }).unwrap();
      setChanges({});
      setDenied(null);
      toast.success(response.message || "Finance account mappings saved.");
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="Accounting defaults"
        description="The account each posting role uses in this entity."
        action={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={`${F.SETUP}/accounts`}>Open chart</Link></Button>{canUpdate ? <Button onClick={save} disabled={!hasChanges || updateState.isLoading}><Save className="mr-2 size-4" />{updateState.isLoading ? "Saving" : "Save changes"}</Button> : null}</div>}
      />
      <HintedPanel title="Posting account map" hint="Each choice must be an active, postable account of the right type in this entity. Posting services use a saved change straight away. Resetting a role returns it to the starter-chart default shown.">
          {!entityCode ? <SettingsRow label="Select an entity" description="Choose an entity to resolve its current account map." /> : query.isLoading ? <SettingsRow label="Loading account mappings" description="Resolving the active entity's posting roles." /> : (payload?.mappings ?? []).length === 0 ? <SettingsRow label="No posting roles to show" description="Your role cannot read any of this entity's account mappings." /> : (payload?.mappings ?? []).map((mapping) => {
            const locked = readOnlyKeys.includes(mapping.key);
            const changed = !locked && Object.prototype.hasOwnProperty.call(changes, mapping.key);
            const selected = changed ? (changes[mapping.key] ?? "") : (mapping.source === "OVERRIDE" ? String(mapping.account?.id ?? "") : "");
            const options = (payload?.account_options ?? []).filter((account) => account.account_type === mapping.expected_account_type);
            const refusal = denied?.[mapping.key];
            const consumer = payload?.consumers[mapping.key];
            return (
              <div key={mapping.key} data-field={mapping.key} data-read-only={locked || undefined} className="grid grid-cols-1 gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                      <p className="font-mont text-sm font-medium text-gray-01">{mapping.label}</p>
                      <SettingHint label={mapping.label} consumer={consumer} hint={consumer?.impact ? undefined : ACCOUNT_DESCRIPTIONS[mapping.key]} />
                    </div>
                    <PolicyBadge kind={changed || mapping.source === "OVERRIDE" ? "configured" : "default"}>{changed ? "Unsaved" : mapping.source === "OVERRIDE" ? "Custom" : `Default ${mapping.default_code}`}</PolicyBadge>
                  </div>
                  <UsedBy consumer={consumer} />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                    <select aria-label={`${mapping.label} account`} className="h-10 min-w-0 flex-1 rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:cursor-not-allowed disabled:bg-gray-02" value={selected} disabled={!canUpdate || locked} onChange={(event) => setChanges((current) => ({ ...current, [mapping.key]: event.target.value || null }))}>
                      <option value="">Use default {mapping.default_code}{mapping.source === "DEFAULT" && mapping.account ? ` · ${mapping.account.name}` : ""}</option>
                      {options.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                    </select>
                    {changed ? <Button variant="ghost" size="icon" aria-label={`Undo ${mapping.label} change`} onClick={() => setChanges((current) => { const next = { ...current }; delete next[mapping.key]; return next; })}><RotateCcw className="size-4" /></Button> : null}
                  </div>
                  {refusal ? <p role="alert" className="mt-1 font-mont text-[11px] text-destructive">{refusal}</p> : null}
                </div>
              </div>
            );
          })}
      </HintedPanel>
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
      <SettingsSectionHeader title="Documents and collections" description="Defaults for customer invoices, receipts and collections." />
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
 * The document and collection policy form.
 *
 * Each default is a `finance.settings` Field Access field with its own Read
 * and Write switch. A default the role may not read is absent from the payload
 * and from the form, and the panel goes when every one of them is absent; one
 * it may read and not change is greyed and left out of the saved body. Only
 * values that changed are sent, so saving one never rewrites another the
 * reader cannot see, and a refusal is shown under the field it names.
 *
 * The primary collection account choice writes that account's collection flag,
 * so it follows the bank account switch for that flag instead: greyed and left
 * out of the saved body when the role may not change it.
 */
export function FinanceDocumentForm({ entityCode, values, consumers, canUpdate, readOnlyNote }: { entityCode: string; values: FinanceDocumentSettingsValues; consumers: Record<string, SettingConsumer>; canUpdate: boolean; readOnlyNote: string | null }) {
  const access = useFieldAccess("finance.settings", values);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [dueDays, setDueDays] = useState(String(values.default_invoice_due_days ?? ""));
  const [narration, setNarration] = useState(values.default_invoice_narration ?? "");
  const [autoPost, setAutoPost] = useState(values.auto_post_manual_invoices ?? false);
  const [openingBalances, setOpeningBalances] = useState(values.allow_customer_opening_balances ?? false);
  const [bankAccount, setBankAccount] = useState(values.primary_collection_bank_account ? String(values.primary_collection_bank_account.id) : "");
  // Naming another collection account writes that account's collection flag.
  const bankWritable = !useFieldAccess(BANK_ACCOUNT).isReadOnly("is_primary_collection");
  const [target, setTarget] = useState(String(values.term_collection_target_pct ?? ""));
  const [update, state] = useUpdateFinanceDocumentSettingsMutation();

  const shown = (name: keyof FinanceDocumentSettingsValues) => !access.isHidden(name);
  const editable = (name: keyof FinanceDocumentSettingsValues) => canUpdate && !access.isReadOnly(name);

  const dueDaysValue = Number(dueDays);
  const dueDaysValid = dueDays.trim() !== "" && Number.isInteger(dueDaysValue) && dueDaysValue >= 0 && dueDaysValue <= 365;
  const targetValue = Number(target);
  const targetValid = target.trim() !== "" && Number.isInteger(targetValue) && targetValue >= 1 && targetValue <= 100;
  const dueDaysOk = !shown("default_invoice_due_days") || !editable("default_invoice_due_days") || dueDaysValid;
  const targetOk = !shown("term_collection_target_pct") || !editable("term_collection_target_pct") || targetValid;
  const valid = dueDaysOk && targetOk;

  const savedBank = values.primary_collection_bank_account ? String(values.primary_collection_bank_account.id) : "";
  const patch = {
    ...access.writableOnly({
      ...(shown("default_invoice_due_days") && dueDaysValid && dueDaysValue !== values.default_invoice_due_days
        ? { default_invoice_due_days: dueDaysValue } : {}),
      ...(shown("default_invoice_narration") && narration.trim() !== (values.default_invoice_narration ?? "")
        ? { default_invoice_narration: narration } : {}),
      ...(shown("auto_post_manual_invoices") && autoPost !== values.auto_post_manual_invoices
        ? { auto_post_manual_invoices: autoPost } : {}),
      ...(shown("allow_customer_opening_balances") && openingBalances !== values.allow_customer_opening_balances
        ? { allow_customer_opening_balances: openingBalances } : {}),
      ...(shown("term_collection_target_pct") && targetValid && targetValue !== values.term_collection_target_pct
        ? { term_collection_target_pct: targetValue } : {}),
    }),
    ...(bankWritable && bankAccount !== savedBank ? { primary_collection_bank_account: bankAccount ? Number(bankAccount) : null } : {}),
  };
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    try {
      const response = await update({ entity: entityCode, ...patch }).unwrap();
      setDenied(null);
      toast.success(response.message || "Finance document policy saved.");
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  return <>
    <HintedPanel title="Billing defaults" hint="Each default applies when a user leaves the matching field blank.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
        <AccessField access={access} name="default_invoice_due_days" errors={denied}>
          <SettingField label="Default invoice due days" hint="A whole number of days from 0 to 365." consumer={consumers.default_invoice_due_days}>
            {(id) => <Input id={id} className="bg-white" type="number" min="0" max="365" step="1" value={dueDays} onChange={(event) => setDueDays(event.target.value)} disabled={!editable("default_invoice_due_days")} />}
          </SettingField>
        </AccessField>
        <SettingField label="Primary collection account" hint="Automatic fallback prints each branch's first active bank account." consumer={consumers.primary_collection_bank_account}>
          {(id) => <select id={id} className="h-10 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02" value={bankAccount} onChange={(event) => setBankAccount(event.target.value)} disabled={!canUpdate || !bankWritable}><option value="">Automatic fallback</option>{values.bank_account_options.map((bank) => <option key={bank.id} value={bank.id}>{bankOptionLabel(bank)}</option>)}</select>}
        </SettingField>
        <AccessField access={access} name="term_collection_target_pct" errors={denied}>
          <SettingField label="Term collection target (%)" hint="The share of a term's fees you aim to have collected by the end of the term, from 1 to 100." consumer={consumers.term_collection_target_pct}>
            {(id) => <Input id={id} className="bg-white" type="number" min="1" max="100" step="1" value={target} onChange={(event) => setTarget(event.target.value)} disabled={!editable("term_collection_target_pct")} />}
          </SettingField>
        </AccessField>
        <AccessField access={access} name="default_invoice_narration" errors={denied} className="lg:col-span-2">
          <SettingField label="Default invoice narration" consumer={consumers.default_invoice_narration}>
            {(id) => <Textarea id={id} className="min-h-20 bg-white font-mont text-sm" value={narration} onChange={(event) => setNarration(event.target.value)} disabled={!editable("default_invoice_narration")} maxLength={255} placeholder="Optional text for new manual invoices" />}
          </SettingField>
        </AccessField>
      </div>
      <AccessField access={access} name="auto_post_manual_invoices" errors={denied}>
        <SettingToggle label="Post manual invoices immediately" hint="When off, a new manual invoice is priced and kept as a draft until somebody chooses to post it." consumer={consumers.auto_post_manual_invoices} checked={autoPost} onCheckedChange={setAutoPost} disabled={!editable("auto_post_manual_invoices")} />
      </AccessField>
      <AccessField access={access} name="allow_customer_opening_balances" errors={denied}>
        <SettingToggle label="Allow customer opening balances" hint="When off, creating or editing a customer with a non-zero opening balance is refused." consumer={consumers.allow_customer_opening_balances} checked={openingBalances} onCheckedChange={setOpeningBalances} disabled={!editable("allow_customer_opening_balances")} />
      </AccessField>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><p className="font-mont text-xs text-gray-05">{!dueDaysOk ? "Use a whole number from 0 to 365 days." : !targetOk ? "Use a whole-number target from 1 to 100." : readOnlyNote}</p>{canUpdate ? <Button onClick={save} disabled={!dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save document policy"}</Button> : null}</div>
    </HintedPanel>
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
      <SettingsSectionHeader title="Banking and cash policy" description={canView ? "Defaults for bank matching, receipts, petty cash and online payments." : "The online-payment settings available to your role."} />
      {canView ? (query.isLoading || !payload ? <SettingsPanel><SettingsRow label="Loading banking policy" description="Reading the selected entity's reconciliation and allocation defaults." /></SettingsPanel> : <BankingCashForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers} canUpdate={canUpdate} readOnlyNote={readOnlyNote} />) : null}
      {/* Read under its own payments key, so it stands apart from the finance policy above. */}
      <OnlinePaymentsPanel entityCode={entityCode} />
    </div>
  );
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
