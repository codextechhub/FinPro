/**
 * Finance Settings > Fiscal calendar: how the calendar keeps running, and how
 * long the books are kept.
 *
 * Opening the next year. A fiscal calendar is opened a year at a time, and once
 * the last year ends nothing can post. The school chooses what happens as the
 * end comes near: the next year opens by itself, contiguous with the last and
 * on the same months (the default), or the people who may open a year are only
 * warned. "Days ahead" is how early, from 7 to 180 days; the same window is the
 * one the dashboard warns in.
 *
 * Closing months in order. On by default: a month closes once every earlier
 * month is closed, and reopens once every later month is open, across the year
 * boundary too. A school that turns it off may close and reopen months in any
 * order.
 *
 * Record keeping. Books are kept for the statutory floor CodeX sets (read-only
 * here) or longer if the school chooses, counted from the end of each fiscal
 * year; a kept record cannot be deleted. The archive age says how long after
 * its end a closed year may be archived.
 *
 * Both bind every branch, so a reader who holds the update key but covers only
 * some branches reads the panels without a Save (see `whole-school-access.ts`).
 *
 * Every value here except the statutory floor is a `finance.settings` Field
 * Access field with its own Read and Write switch. A hidden value leaves its
 * panel, and a panel goes when all of its values are hidden; a read-only one
 * is greyed and never sent, and a refusal is shown under the field it names.
 */

import { useState } from "react";
import { Archive, Landmark, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  PolicyBadge,
  SettingsConsumer,
  SettingsPanel,
  SettingsRow,
} from "@/components/settings/settings-layout";
import { usePermissions } from "@/hooks/use-permissions";
import { useSettingsWriteAccess } from "@/components/finance-ui/whole-school-access";
import { AccessField, fieldWriteErrors, useFieldAccess, type FieldErrors } from "@/components/finance-ui";
import {
  useGetFinanceCalendarSettingsQuery,
  useGetRecordRetentionSettingsQuery,
  useUpdateFinanceCalendarSettingsMutation,
  useUpdateRecordRetentionSettingsMutation,
} from "@/redux/services/finance/records-api";
import type {
  FinanceCalendarSettingsPayload,
  NextYearMode,
  RecordRetentionSettings,
} from "@/redux/services/finance/records-types";
import { P } from "../../permissions";

/** The lead the server accepts, in days. */
export const LEAD_DAYS_MIN = 7;
export const LEAD_DAYS_MAX = 180;

/**
 * What each next-year mode does, written beside the option. The option's name
 * comes from the server (`next_year_mode_options`) so the form, the history line
 * and every refusal use the same words.
 */
const MODE_DESCRIPTION: Record<NextYearMode, string> = {
  AUTO_OPEN: "The next fiscal year opens by itself, starting the day after the last one ends, with the same months.",
  WARN_ONLY: "Nothing opens by itself. Whoever may open a fiscal year for the whole school is warned in the app and by email, weekly and then daily in the last week.",
};

/** Whether `text` is a whole number of days the server accepts as a lead. */
export function validLeadDays(text: string): boolean {
  const value = Number(text);
  return text.trim() !== "" && Number.isInteger(value) && value >= LEAD_DAYS_MIN && value <= LEAD_DAYS_MAX;
}

/**
 * Whether `text` is a retention period the server accepts: blank keeps the
 * floor, otherwise a whole number of years no shorter than it.
 */
export function validRetentionYears(text: string, floor: number): boolean {
  if (text.trim() === "") return true;
  const value = Number(text);
  return Number.isInteger(value) && value >= floor && value <= 100;
}

export function CalendarRulePanel({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const query = useGetFinanceCalendarSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const payload = query.data?.data;
  if (!canView) return null;
  if (!entityCode) return <SettingsPanel><SettingsRow label="Select an entity" description="Choose an entity to read its fiscal calendar rule." /></SettingsPanel>;
  if (query.isLoading || !payload) return <SettingsPanel><SettingsRow label="Loading the calendar rule" description="Reading how the next fiscal year is opened." /></SettingsPanel>;
  return <CalendarRuleForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode} payload={payload} />;
}

/**
 * When the next fiscal year opens, and how far ahead.
 *
 * Both are `finance.settings` fields with their own Read and Write switch: a
 * hidden one leaves the panel, a read-only one is greyed and never sent, and
 * the panel goes when both are hidden. The close-order switch below follows
 * its own switch on its own.
 */
function CalendarRuleForm({ entityCode, payload }: { entityCode: string; payload: FinanceCalendarSettingsPayload }) {
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.FIN_UPDATE_SETTINGS);
  const values = payload.settings;
  const access = useFieldAccess("finance.settings", values);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [mode, setMode] = useState<NextYearMode>(values.next_year_mode ?? "AUTO_OPEN");
  const [leadDays, setLeadDays] = useState(String(values.next_year_lead_days ?? ""));
  const [update, state] = useUpdateFinanceCalendarSettingsMutation();
  const shown = (name: "next_year_mode" | "next_year_lead_days") => !access.isHidden(name);
  const editable = (name: "next_year_mode" | "next_year_lead_days") => canUpdate && !access.isReadOnly(name);
  const leadValid = validLeadDays(leadDays);
  const valid = !shown("next_year_lead_days") || !editable("next_year_lead_days") || leadValid;
  const patch = access.writableOnly({
    ...(shown("next_year_mode") && mode !== values.next_year_mode ? { next_year_mode: mode } : {}),
    ...(shown("next_year_lead_days") && leadValid && Number(leadDays) !== values.next_year_lead_days ? { next_year_lead_days: Number(leadDays) } : {}),
  });
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    try {
      const response = await update({ entity: entityCode, ...patch }).unwrap();
      setDenied(null);
      toast.success(response.message || "Fiscal calendar settings saved.");
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  return (
    <>
      {access.anyVisible("next_year_mode", "next_year_lead_days") ? (
        <SettingsPanel title="Opening the next year" description="What happens as the last fiscal year comes to its end. After that day nothing can post until a new year is open.">
          <AccessField access={access} name="next_year_mode" errors={denied}>
            <fieldset className="space-y-2 px-4 py-4 sm:px-5" disabled={!editable("next_year_mode")}>
              <legend className="sr-only">When the calendar nears its end</legend>
              {(values.next_year_mode_options ?? []).map((option) => (
                <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-md border border-white-02 bg-white p-3 has-[:checked]:border-primary has-[:disabled]:cursor-default">
                  <input
                    type="radio"
                    name="next-year-mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={() => setMode(option.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block font-mont text-sm font-medium text-gray-01">
                      {option.label}{option.value === "AUTO_OPEN" ? <span className="ml-1.5 font-normal text-gray-05">(default)</span> : null}
                    </span>
                    <span className="mt-0.5 block font-mont text-xs leading-5 text-gray-05">{MODE_DESCRIPTION[option.value]}</span>
                  </span>
                </label>
              ))}
              <SettingsConsumer consumer={payload.consumers.next_year_mode} />
            </fieldset>
          </AccessField>
          <AccessField access={access} name="next_year_lead_days" errors={denied}>
            <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
              <label className="font-mont text-xs font-semibold text-gray-01">
                Days ahead
                <Input
                  className="mt-2 bg-white"
                  type="number"
                  min={LEAD_DAYS_MIN}
                  max={LEAD_DAYS_MAX}
                  step="1"
                  value={leadDays}
                  onChange={(event) => setLeadDays(event.target.value)}
                  disabled={!editable("next_year_lead_days")}
                  aria-invalid={!valid}
                />
                <span className="mt-1 block font-normal leading-5 text-gray-05">
                  How many days before the calendar ends the next year opens, or the warning starts. From {LEAD_DAYS_MIN} to {LEAD_DAYS_MAX} days.
                </span>
                <SettingsConsumer consumer={payload.consumers.next_year_lead_days} />
              </label>
            </div>
          </AccessField>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <p className="font-mont text-xs text-gray-05">
              {!valid ? `Use a whole number from ${LEAD_DAYS_MIN} to ${LEAD_DAYS_MAX} days.` : readOnlyNote ?? "Only changed values are written to audit history."}
            </p>
            {canUpdate ? (
              <Button onClick={save} disabled={!dirty || !valid || state.isLoading}>
                <Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save calendar rule"}
              </Button>
            ) : null}
          </div>
        </SettingsPanel>
      ) : null}
      {access.anyVisible("periods_close_in_order") ? <div className="mt-5"><CloseOrderPanel entityCode={entityCode} payload={payload} /></div> : null}
    </>
  );
}

/**
 * The switch that keeps a school's months closing in date order.
 *
 * Bright Star leaves it on: September cannot close while August is open, and
 * August cannot reopen while September is closed. A school that closes some
 * months out of turn turns it off. Saved on its own, so changing it never sends
 * the calendar rule above with it. Its own `finance.settings` switch decides
 * whether it is greyed.
 */
function CloseOrderPanel({ entityCode, payload }: { entityCode: string; payload: FinanceCalendarSettingsPayload }) {
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.FIN_UPDATE_SETTINGS);
  const access = useFieldAccess("finance.settings", payload.settings);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const saved = payload.settings.periods_close_in_order ?? true;
  const [inOrder, setInOrder] = useState(saved);
  const [update, state] = useUpdateFinanceCalendarSettingsMutation();
  const editable = canUpdate && !access.isReadOnly("periods_close_in_order");

  const save = async () => {
    try {
      const response = await update({ entity: entityCode, periods_close_in_order: inOrder }).unwrap();
      setDenied(null);
      toast.success(response.message || "Fiscal calendar settings saved.");
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  return (
    <SettingsPanel title="Closing months" description="Whether months must close one after another.">
      <AccessField access={access} name="periods_close_in_order" errors={denied}>
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="font-mont text-sm font-medium text-gray-01">
              Close months in order<span className="ml-1.5 font-normal text-gray-05">(default)</span>
            </p>
            <p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">
              A month closes only once every earlier month is closed, and reopens only while every later month is open. January cannot close while December of the year before is still open. Force close does not get past it.
            </p>
            <SettingsConsumer consumer={payload.consumers.periods_close_in_order} />
          </div>
          <Switch checked={inOrder} onCheckedChange={setInOrder} disabled={!editable} aria-label="Close months in order" />
        </div>
      </AccessField>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <p className="font-mont text-xs text-gray-05">{readOnlyNote ?? "Only changed values are written to audit history."}</p>
        {editable ? (
          <Button onClick={save} disabled={inOrder === saved || state.isLoading}>
            <Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save close order"}
          </Button>
        ) : null}
      </div>
    </SettingsPanel>
  );
}

export function RecordKeepingPanel({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const query = useGetRecordRetentionSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const payload = query.data?.data;
  if (!canView) return null;
  if (!entityCode) return <SettingsPanel><SettingsRow label="Select an entity" description="Choose an entity to read how long its records are kept." /></SettingsPanel>;
  if (query.isLoading || !payload) return <SettingsPanel><SettingsRow label="Loading record keeping" description="Reading how long the books are kept." /></SettingsPanel>;
  return <RecordKeepingForm key={`${entityCode}-${payload.retention_years}-${payload.archive_min_age_years}`} entityCode={entityCode} payload={payload} />;
}

const yearsText = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

/**
 * The school's retention period and the archive age.
 *
 * Each is a `finance.settings` field with its own Read and Write switch; the
 * period in force travels with the school's period, so a reader who may not
 * see one sees neither. The statutory floor is CodeX's and always shows.
 */
function RecordKeepingForm({ entityCode, payload }: { entityCode: string; payload: RecordRetentionSettings }) {
  const { canUpdate, readOnlyNote } = useSettingsWriteAccess(P.FIN_UPDATE_SETTINGS);
  const access = useFieldAccess("finance.settings", payload);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const floor = payload.statutory_years;
  const [years, setYears] = useState(payload.retention_years == null ? "" : String(payload.retention_years));
  const [archiveAge, setArchiveAge] = useState(payload.archive_min_age_years == null ? "" : String(payload.archive_min_age_years));
  const [update, state] = useUpdateRecordRetentionSettingsMutation();
  const shown = (name: "retention_years" | "archive_min_age_years") => !access.isHidden(name);
  const editable = (name: "retention_years" | "archive_min_age_years") => canUpdate && !access.isReadOnly(name);
  const yearsValid = validRetentionYears(years, floor);
  const ageValue = Number(archiveAge);
  const ageValid = archiveAge.trim() !== "" && Number.isInteger(ageValue) && ageValue >= 1 && ageValue <= 50;
  const nextYears = years.trim() === "" ? null : Number(years);
  const yearsOk = !shown("retention_years") || !editable("retention_years") || yearsValid;
  const ageOk = !shown("archive_min_age_years") || !editable("archive_min_age_years") || ageValid;
  const valid = yearsOk && ageOk;
  const patch = access.writableOnly({
    ...(shown("retention_years") && yearsValid && nextYears !== (payload.retention_years ?? null) ? { retention_years: nextYears } : {}),
    ...(shown("archive_min_age_years") && ageValid && ageValue !== payload.archive_min_age_years ? { archive_min_age_years: ageValue } : {}),
  });
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    try {
      const response = await update({ entity: entityCode, ...patch }).unwrap();
      setDenied(null);
      toast.success(response.message || "Record retention settings saved.");
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  const anyShown = shown("retention_years") || shown("archive_min_age_years");
  return (
    <>
      <SettingsPanel title="Record keeping" description="Financial records are kept from the end of each fiscal year for the period in force. A kept record cannot be deleted, whatever its screen offers.">
        <SettingsRow
          icon={Landmark}
          label="Statutory floor"
          description="Set by CodeX for every school. A school may keep its records longer, never shorter."
          value={yearsText(floor)}
          badge={<PolicyBadge kind="enforced">Read-only</PolicyBadge>}
        />
        {payload.effective_retention_years != null ? (
          <SettingsRow
            icon={ShieldCheck}
            label="Period in force"
            description="The longer of the floor and the school's own choice."
            value={yearsText(payload.effective_retention_years)}
          />
        ) : null}
        {anyShown ? (
          <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
            <AccessField access={access} name="retention_years" errors={denied}>
              <label className="font-mont text-xs font-semibold text-gray-01">
                The school's own period (years)
                <Input
                  className="mt-2 bg-white"
                  type="number"
                  min={floor}
                  step="1"
                  value={years}
                  placeholder={`Keep the floor (${yearsText(floor)})`}
                  onChange={(event) => setYears(event.target.value)}
                  disabled={!editable("retention_years")}
                  aria-invalid={!yearsOk}
                />
                <span className="mt-1 block font-normal leading-5 text-gray-05">
                  Leave blank to keep the statutory floor. It cannot be shorter than {yearsText(floor)}.
                </span>
              </label>
            </AccessField>
            <AccessField access={access} name="archive_min_age_years" errors={denied}>
              <label className="font-mont text-xs font-semibold text-gray-01">
                <span className="inline-flex items-center gap-1.5"><Archive className="size-3.5 text-gray-05" aria-hidden />Archive a closed year after (years)</span>
                <Input
                  className="mt-2 bg-white"
                  type="number"
                  min={1}
                  step="1"
                  value={archiveAge}
                  onChange={(event) => setArchiveAge(event.target.value)}
                  disabled={!editable("archive_min_age_years")}
                  aria-invalid={!ageOk}
                />
                <span className="mt-1 block font-normal leading-5 text-gray-05">
                  How long after its end a closed year may be archived. Archiving hides it from pickers and lists; nothing is deleted.
                </span>
              </label>
            </AccessField>
          </div>
        ) : null}
        {anyShown ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <p className="font-mont text-xs text-gray-05">
              {!yearsOk
                ? `Keep records for at least ${yearsText(floor)}, or leave the field blank.`
                : !ageOk
                  ? "Use a whole number of years, at least 1."
                  : readOnlyNote ?? "Only changed values are written to audit history."}
            </p>
            {canUpdate ? (
              <Button onClick={save} disabled={!valid || !dirty || state.isLoading}>
                <Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save record keeping"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </SettingsPanel>
    </>
  );
}
