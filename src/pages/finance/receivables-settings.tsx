/**
 * Finance Settings -> Receivables: the school's own choices about fees owed.
 *
 * Two endpoints hold them, and the screen keeps each panel on the one it saves
 * to: whether a customer's unused credit settles their next bill by itself and
 * the amount above which a concession needs a second person are document
 * settings; how fees billed ahead become income, the doubtful-debt bands,
 * deposits and the split of a payer's payment are the receivables policy.
 *
 * Every one of these binds every branch, so a reader who does not cover the
 * whole school may read them and may not change them; the server refuses the
 * write with a 403 in that case, and the form is drawn read-only rather than
 * offering a Save that cannot succeed. At a school with one branch its bursar
 * covers the whole school.
 *
 * Each receivables policy value is a `finance.settings` Field Access field with
 * its own Read and Write switch. A value the role may not read is absent from
 * the payload and from the screen, a panel whose values are all absent
 * disappears, and the Save row moves to the last panel still shown. A value the
 * role may read and not change is greyed and left out of the saved body. The
 * credit and concession panel belongs to the document settings, not to this
 * resource.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import {
  SettingsAuditHistory, SettingsConsumer, SettingsPanel, SettingsRow, SettingsSectionHeader,
} from "@/components/settings/settings-layout";
import { usePermissions } from "@/hooks/use-permissions";
import { AccessField, MoneyInput, fieldWriteErrors, useFieldAccess, type FieldErrors } from "@/components/finance-ui";
import { formatMoney } from "@/utils/money";
import { P } from "../../permissions";
import { useWholeSchoolAccess } from "@/components/finance-ui/whole-school-access";
import {
  useGetFinanceDocumentSettingsQuery, useUpdateFinanceDocumentSettingsMutation,
} from "@/redux/services/finance/setup-api";
import type { FinanceDocumentSettingsPayload } from "@/redux/services/finance/setup-types";
import {
  useGetReceivablesSettingsQuery, useUpdateReceivablesSettingsMutation,
} from "@/redux/services/finance/fees-api";
import type {
  PayerPaymentSplit, PayerPaymentSurplus, ReceivablesSettingsPayload, ReceivablesSettingsUpdate, RevenueRecognition,
} from "@/redux/services/finance/fees-types";
import { MAX_PROVISION_BANDS, bandDrafts, parseBands, sameBands, type BandDraft } from "./receivables-settings-model";

const label = "font-mont text-xs font-semibold text-gray-01";
const hint = "mt-1 block font-normal leading-5 text-gray-05";

/** Who may change these settings: the update key and the whole school. */
export function useReceivablesSettingsAccess() {
  const { hasPermission } = usePermissions();
  const { canWholeSchool, heldWithoutReach } = useWholeSchoolAccess();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  return {
    canView,
    canUpdate: canWholeSchool(P.FIN_UPDATE_SETTINGS),
    branchBound: heldWithoutReach(P.FIN_UPDATE_SETTINGS),
  };
}

/**
 * What each release method does, under the choice that picks one. The two are
 * named by the options' own labels, so the hint and the dropdown above it never
 * word one method two ways.
 */
export function recognitionHint(options: { value: string; label: string }[]): string {
  const name = (value: string) => options.find((o) => o.value === value)?.label ?? value;
  return `${name("SPREAD_MONTHLY")}: an equal share is released each month of the term, the last month taking any odd kobo. ${name("AT_PERIOD_START")}: the whole fee is released in the term's first month.`;
}

export function ReceivablesSettings({ entityCode }: { entityCode: string | null }) {
  const { canView, canUpdate, branchBound } = useReceivablesSettingsAccess();
  const docs = useGetFinanceDocumentSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const policy = useGetReceivablesSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  if (!canView) return null;

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="Receivables"
        description="How credit, concessions, fees billed ahead, doubtful debts, deposits and payments from a payer are handled. These apply to every branch."
      />
      {!entityCode ? (
        <SettingsPanel><SettingsRow label="Select an entity" description="Choose an entity to read its receivables policy." /></SettingsPanel>
      ) : (
        <>
          {branchBound ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-900">
              These settings apply to every branch, so only someone who covers the whole school can change them. You can read them here.
            </p>
          ) : null}
          {docs.isLoading || !docs.data ? (
            <SettingsPanel><SettingsRow label="Loading" description="Reading credit and concession settings." /></SettingsPanel>
          ) : (
            <CreditForm key={`credit-${entityCode}-${docs.data.data.settings.updated_at}`} entityCode={entityCode} payload={docs.data.data} canUpdate={canUpdate} />
          )}
          {policy.isLoading || !policy.data ? (
            <SettingsPanel><SettingsRow label="Loading" description="Reading the receivables policy." /></SettingsPanel>
          ) : (
            <PolicyForm key={`policy-${entityCode}-${JSON.stringify(policy.data.data.settings)}`} entityCode={entityCode} payload={policy.data.data} canUpdate={canUpdate} />
          )}
        </>
      )}
    </div>
  );
}

function CreditForm({ entityCode, payload, canUpdate }: { entityCode: string; payload: FinanceDocumentSettingsPayload; canUpdate: boolean }) {
  const values = payload.settings;
  const startCredit = values.auto_apply_customer_credit ?? true;
  const startLimit = values.concession_second_person_threshold ?? 0;
  const [autoCredit, setAutoCredit] = useState(startCredit);
  const [limit, setLimit] = useState(startLimit);
  const [update, state] = useUpdateFinanceDocumentSettingsMutation();
  const dirty = autoCredit !== startCredit || limit !== startLimit;
  const save = async () => {
    try {
      const res = await update({
        entity: entityCode,
        ...(autoCredit !== startCredit ? { auto_apply_customer_credit: autoCredit } : {}),
        ...(limit !== startLimit ? { concession_second_person_threshold: limit } : {}),
      }).unwrap();
      toast.success(res.message || "Settings saved.");
    } catch { /* central */ }
  };
  return (
    <SettingsPanel title="Credit and concessions">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="font-mont text-sm font-medium text-gray-01">Apply customer credit to new bills automatically</p>
          <p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">When on, a customer&apos;s unused credit settles each new bill of theirs as it posts. When off, the bill stays fully due and the credit waits.</p>
          <SettingsConsumer consumer={payload.consumers.auto_apply_customer_credit} />
        </div>
        <Switch checked={autoCredit} onCheckedChange={setAutoCredit} disabled={!canUpdate} aria-label="Apply customer credit to new bills automatically" />
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
        <label className={label}>Concessions above this need a second person
          <div className="mt-2"><MoneyInput valueKobo={limit} onChangeKobo={setLimit} disabled={!canUpdate} /></div>
          <span className={hint}>Counted per bill: two {formatMoney(6_000_00)} discounts on one bill make {formatMoney(12_000_00)}. Above the limit the concession is submitted for approval.</span>
          <SettingsConsumer consumer={payload.consumers.concession_second_person_threshold} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <p className="font-mont text-xs text-gray-05">{canUpdate ? "Only changed values are written to audit history." : "Read only."}</p>
        <Button onClick={save} disabled={!canUpdate || !dirty || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save credit and concessions"}</Button>
      </div>
    </SettingsPanel>
  );
}

function PolicyForm({ entityCode, payload, canUpdate }: { entityCode: string; payload: ReceivablesSettingsPayload; canUpdate: boolean }) {
  const v = payload.settings;
  const access = useFieldAccess("finance.settings", v);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [recognition, setRecognition] = useState<RevenueRecognition>(v.revenue_recognition ?? "SPREAD_MONTHLY");
  const [bands, setBands] = useState<BandDraft[]>(() => bandDrafts(v.provision_bands ?? []));
  const [offset, setOffset] = useState(v.deposits_offset_unpaid_bills ?? false);
  const [years, setYears] = useState(String(v.unclaimed_deposit_years ?? ""));
  const [split, setSplit] = useState<PayerPaymentSplit>(v.payer_payment_split ?? "OLDEST_FIRST");
  const [surplus, setSurplus] = useState<PayerPaymentSurplus>(v.payer_payment_surplus ?? "MOST_RECENT_BILL");
  const [update, state] = useUpdateReceivablesSettingsMutation();

  const shown = (name: string) => !access.isHidden(name);
  const editable = (name: string) => canUpdate && !access.isReadOnly(name);
  const parsed = parseBands(bands);
  const yearsValue = Number(years);
  const yearsValid = years.trim() !== "" && Number.isInteger(yearsValue) && yearsValue >= 1 && yearsValue <= 50;
  const patch: ReceivablesSettingsUpdate = access.writableOnly({
    ...(shown("revenue_recognition") && recognition !== v.revenue_recognition ? { revenue_recognition: recognition } : {}),
    ...(shown("provision_bands") && !parsed.problem && !sameBands(parsed.bands, v.provision_bands ?? []) ? { provision_bands: parsed.bands } : {}),
    ...(shown("deposits_offset_unpaid_bills") && offset !== v.deposits_offset_unpaid_bills ? { deposits_offset_unpaid_bills: offset } : {}),
    ...(shown("unclaimed_deposit_years") && yearsValid && yearsValue !== v.unclaimed_deposit_years ? { unclaimed_deposit_years: yearsValue } : {}),
    ...(shown("payer_payment_split") && split !== v.payer_payment_split ? { payer_payment_split: split } : {}),
    ...(shown("payer_payment_surplus") && surplus !== v.payer_payment_surplus ? { payer_payment_surplus: surplus } : {}),
  });
  const bandsOk = !shown("provision_bands") || !editable("provision_bands") || !parsed.problem;
  const yearsOk = !shown("unclaimed_deposit_years") || !editable("unclaimed_deposit_years") || yearsValid;
  const valid = bandsOk && yearsOk;
  const dirty = Object.keys(patch).length > 0;
  const setBand = (i: number, change: Partial<BandDraft>) => setBands((rows) => rows.map((r, j) => (j === i ? { ...r, ...change } : r)));

  const save = async () => {
    try {
      const res = await update({ entity: entityCode, ...patch }).unwrap();
      setDenied(null);
      toast.success(res.message || "Receivables policy saved.");
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  const panels = {
    ahead: shown("revenue_recognition"),
    debts: shown("provision_bands"),
    deposits: access.anyVisible("deposits_offset_unpaid_bills", "unclaimed_deposit_years"),
    payer: access.anyVisible("payer_payment_split", "payer_payment_surplus"),
  };
  const lastPanel = (["payer", "deposits", "debts", "ahead"] as const).find((key) => panels[key]);
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
      <p className="font-mont text-xs text-gray-05">{!valid ? "Fix the values marked above." : canUpdate ? "Saves the panels above together. Only changed values are written to audit history." : "Read only."}</p>
      <Button onClick={save} disabled={!canUpdate || !dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save receivables policy"}</Button>
    </div>
  );
  const recognitionOptions = v.revenue_recognition_options ?? [];

  return (
    <>
      {panels.ahead ? (
        <SettingsPanel title="Fees billed ahead" description="A fee billed before the period it pays for is held as deferred income and released to revenue.">
          <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
            <AccessField access={access} name="revenue_recognition" errors={denied}>
              <label className={label}>Release method
                <NativeSelect className="mt-2" value={recognition} onChange={(e) => setRecognition(e.target.value as RevenueRecognition)} disabled={!editable("revenue_recognition")} aria-label="Release method">
                  {recognitionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
                <span className={hint}>{recognitionHint(recognitionOptions)}</span>
                <SettingsConsumer consumer={payload.consumers.revenue_recognition} />
              </label>
            </AccessField>
          </div>
          {lastPanel === "ahead" ? footer : null}
        </SettingsPanel>
      ) : null}

      {panels.debts ? (
        <SettingsPanel title="Doubtful debts" description="The share of each overdue balance the allowance for doubtful debts must cover, by how long it has been overdue.">
          <AccessField access={access} name="provision_bands" errors={denied}>
            <div className="space-y-2 px-4 py-4 sm:px-5">
              {bands.map((band, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <label className={`${label} w-32`}>Over (days)
                    <Input className="mt-1 bg-white" type="number" min="0" step="1" value={band.days} onChange={(e) => setBand(i, { days: e.target.value })} disabled={!editable("provision_bands")} aria-label={`Band ${i + 1} days`} />
                  </label>
                  <label className={`${label} w-32`}>Provide (%)
                    <Input className="mt-1 bg-white" type="number" min="0" max="100" step="0.01" value={band.percent} onChange={(e) => setBand(i, { percent: e.target.value })} disabled={!editable("provision_bands")} aria-label={`Band ${i + 1} rate`} />
                  </label>
                  {editable("provision_bands") && bands.length > 1 ? (
                    <Button variant="ghost" size="icon" aria-label={`Remove band ${i + 1}`} onClick={() => setBands((rows) => rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                  ) : null}
                </div>
              ))}
              {editable("provision_bands") && bands.length < MAX_PROVISION_BANDS ? (
                <Button variant="outline" size="sm" onClick={() => setBands((rows) => [...rows, { days: "", percent: "" }])} className="gap-1.5"><Plus className="size-3.5" /> Add band</Button>
              ) : null}
              {parsed.problem && editable("provision_bands") ? <p className="font-mont text-[11px] text-destructive">{parsed.problem}</p> : null}
              <SettingsConsumer consumer={payload.consumers.provision_bands} />
            </div>
          </AccessField>
          {lastPanel === "debts" ? footer : null}
        </SettingsPanel>
      ) : null}

      {panels.deposits ? (
        <SettingsPanel title="Deposits" description="Refundable deposits, such as a caution deposit, are held for the customer and never earned.">
          {shown("deposits_offset_unpaid_bills") ? (
            <AccessField access={access} name="deposits_offset_unpaid_bills" errors={denied}>
              <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="font-mont text-sm font-medium text-gray-01">Set a leaver&apos;s deposit against their unpaid bills</p>
                  <p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">When off, a leaver&apos;s deposit is returned whole as credit to refund, and their unpaid bills are chased as before.</p>
                  <SettingsConsumer consumer={payload.consumers.deposits_offset_unpaid_bills} />
                </div>
                <Switch checked={offset} onCheckedChange={setOffset} disabled={!editable("deposits_offset_unpaid_bills")} aria-label="Set a leaver's deposit against their unpaid bills" />
              </div>
            </AccessField>
          ) : null}
          {shown("unclaimed_deposit_years") ? (
            <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
              <AccessField access={access} name="unclaimed_deposit_years" errors={denied}>
                <label className={label}>Forfeit unclaimed deposits after (years)
                  <Input className="mt-2 bg-white" type="number" min="1" max="50" step="1" value={years} onChange={(e) => setYears(e.target.value)} disabled={!editable("unclaimed_deposit_years")} />
                  <span className={hint}>Counted from the day the customer left.</span>
                  {!yearsValid && editable("unclaimed_deposit_years") ? <span className="mt-1 block font-normal text-destructive">Use a whole number from 1 to 50.</span> : null}
                  <SettingsConsumer consumer={payload.consumers.unclaimed_deposit_years} />
                </label>
              </AccessField>
            </div>
          ) : null}
          {lastPanel === "deposits" ? footer : null}
        </SettingsPanel>
      ) : null}

      {panels.payer ? (
        <SettingsPanel title="Payments from a payer" description="How one payment from a parent or sponsor is shared among the customers they pay for. The bursar can always enter amounts by hand.">
          <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
            <AccessField access={access} name="payer_payment_split" errors={denied}>
              <label className={label}>Split the payment
                <NativeSelect className="mt-2" value={split} onChange={(e) => setSplit(e.target.value as PayerPaymentSplit)} disabled={!editable("payer_payment_split")} aria-label="Split the payment">
                  {(v.payer_payment_split_options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
                <SettingsConsumer consumer={payload.consumers.payer_payment_split} />
              </label>
            </AccessField>
            <AccessField access={access} name="payer_payment_surplus" errors={denied}>
              <label className={label}>What no bill takes becomes credit of
                <NativeSelect className="mt-2" value={surplus} onChange={(e) => setSurplus(e.target.value as PayerPaymentSurplus)} disabled={!editable("payer_payment_surplus")} aria-label="What no bill takes becomes credit of">
                  {(v.payer_payment_surplus_options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
                <span className={hint}>An amount entered for a customer above their bills always stays as that customer&apos;s credit.</span>
                <SettingsConsumer consumer={payload.consumers.payer_payment_surplus} />
              </label>
            </AccessField>
          </div>
          {lastPanel === "payer" ? footer : null}
        </SettingsPanel>
      ) : null}
      <SettingsAuditHistory rows={payload.history} />
    </>
  );
}
