/**
 * Finance Settings -> Banking and cash: the defaults bank matching, receipt
 * allocation, bank transfers and petty cash fall back on.
 *
 * Each value is a `finance.settings` Field Access field with its own Read and
 * Write switch. A value the role may not read is absent from the payload and
 * from the screen; a value it may read and not change is greyed and left out
 * of the saved body, because the server refuses a change to it before saving
 * anything. Only values that changed are sent, so saving one field never
 * rewrites another the reader cannot see. A refusal names its field, and is
 * shown under it.
 *
 * "Apply bank transfers to open bills automatically" decides what happens to
 * money a family transfers into their account number: on, it settles their
 * open bills as it is booked, in the receipt allocation order set here; off,
 * it waits as credit for somebody to allocate.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  AccessField, HintedPanel, SettingField, SettingToggle, fieldWriteErrors, useFieldAccess, type FieldErrors,
} from "@/components/finance-ui";
import { useUpdateFinanceBankingSettingsMutation } from "@/redux/services/finance/setup-api";
import type {
  FinanceBankingSettingsUpdate, FinanceBankingSettingsValues, SettingConsumer,
} from "@/redux/services/finance/setup-types";

type Strategy = NonNullable<FinanceBankingSettingsValues["default_receipt_allocation_strategy"]>;

export function BankingCashForm({ entityCode, values, consumers, canUpdate, readOnlyNote }: {
  entityCode: string;
  values: FinanceBankingSettingsValues;
  consumers: Record<string, SettingConsumer>;
  canUpdate: boolean;
  readOnlyNote: string | null;
}) {
  const access = useFieldAccess("finance.settings", values);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [toleranceDays, setToleranceDays] = useState(String(values.default_bank_reconciliation_tolerance_days ?? ""));
  const [groupMatches, setGroupMatches] = useState(values.default_group_reconciliation_matches ?? false);
  const [allocationStrategy, setAllocationStrategy] = useState<Strategy>(values.default_receipt_allocation_strategy ?? "oldest");
  const [applyTransfers, setApplyTransfers] = useState(values.apply_transfers_automatically ?? true);
  const [pettyCashThreshold, setPettyCashThreshold] = useState(
    values.petty_cash_low_balance_threshold_bps === undefined ? "" : String(values.petty_cash_low_balance_threshold_bps / 100),
  );
  const [update, state] = useUpdateFinanceBankingSettingsMutation();

  const shown = (name: keyof FinanceBankingSettingsUpdate) => !access.isHidden(name);
  const editable = (name: keyof FinanceBankingSettingsUpdate) => canUpdate && !access.isReadOnly(name);

  const toleranceValue = Number(toleranceDays);
  const toleranceValid = toleranceDays.trim() !== "" && Number.isInteger(toleranceValue) && toleranceValue >= 0 && toleranceValue <= 30;
  const pettyCashBps = Math.round(Number(pettyCashThreshold) * 100);
  const pettyCashValid = pettyCashThreshold.trim() !== "" && Number.isFinite(pettyCashBps) && pettyCashBps >= 0 && pettyCashBps <= 10000;

  const patch: FinanceBankingSettingsUpdate = access.writableOnly({
    ...(shown("default_bank_reconciliation_tolerance_days") && toleranceValid && toleranceValue !== values.default_bank_reconciliation_tolerance_days
      ? { default_bank_reconciliation_tolerance_days: toleranceValue } : {}),
    ...(shown("default_group_reconciliation_matches") && groupMatches !== values.default_group_reconciliation_matches
      ? { default_group_reconciliation_matches: groupMatches } : {}),
    ...(shown("default_receipt_allocation_strategy") && allocationStrategy !== values.default_receipt_allocation_strategy
      ? { default_receipt_allocation_strategy: allocationStrategy } : {}),
    ...(shown("apply_transfers_automatically") && applyTransfers !== values.apply_transfers_automatically
      ? { apply_transfers_automatically: applyTransfers } : {}),
    ...(shown("petty_cash_low_balance_threshold_bps") && pettyCashValid && pettyCashBps !== values.petty_cash_low_balance_threshold_bps
      ? { petty_cash_low_balance_threshold_bps: pettyCashBps } : {}),
  });
  const toleranceOk = !shown("default_bank_reconciliation_tolerance_days") || !editable("default_bank_reconciliation_tolerance_days") || toleranceValid;
  const pettyCashOk = !shown("petty_cash_low_balance_threshold_bps") || !editable("petty_cash_low_balance_threshold_bps") || pettyCashValid;
  const valid = toleranceOk && pettyCashOk;
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    try {
      const response = await update({ entity: entityCode, ...patch }).unwrap();
      setDenied(null);
      toast.success(response.message || "Finance banking policy saved.");
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  const anyShown = access.anyVisible(
    "default_bank_reconciliation_tolerance_days", "default_group_reconciliation_matches",
    "default_receipt_allocation_strategy", "apply_transfers_automatically", "petty_cash_low_balance_threshold_bps",
  );
  if (!anyShown) return null;

  return (
    <HintedPanel title="Banking and cash defaults" hint="Each value is used only when an operation or report does not supply its own choice.">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-3">
        <AccessField access={access} name="default_bank_reconciliation_tolerance_days" errors={denied}>
          <SettingField label="Reconciliation date tolerance (days)" hint="A statement line and a journal this many days apart can still match automatically. From 0 to 30." consumer={consumers.default_bank_reconciliation_tolerance_days}>
            {(id) => <Input id={id} className="bg-white" type="number" min="0" max="30" step="1" value={toleranceDays} onChange={(event) => setToleranceDays(event.target.value)} disabled={!editable("default_bank_reconciliation_tolerance_days")} aria-label="Reconciliation date tolerance (days)" />}
          </SettingField>
        </AccessField>
        <AccessField access={access} name="default_receipt_allocation_strategy" errors={denied}>
          <SettingField label="Default receipt allocation" consumer={consumers.default_receipt_allocation_strategy}>
            {(id) => (
              <NativeSelect id={id} value={allocationStrategy} onChange={(event) => setAllocationStrategy(event.target.value as Strategy)} disabled={!editable("default_receipt_allocation_strategy")} aria-label="Default receipt allocation">
                {(values.default_receipt_allocation_strategy_options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </NativeSelect>
            )}
          </SettingField>
        </AccessField>
        <AccessField access={access} name="petty_cash_low_balance_threshold_bps" errors={denied}>
          <SettingField label="Petty cash low-balance threshold (%)" hint="A share of each fund's float, from 0 to 100%. A fund whose cash on hand reaches or falls below it is flagged." consumer={consumers.petty_cash_low_balance_threshold_bps}>
            {(id) => <Input id={id} className="bg-white" type="number" min="0" max="100" step="0.01" value={pettyCashThreshold} onChange={(event) => setPettyCashThreshold(event.target.value)} disabled={!editable("petty_cash_low_balance_threshold_bps")} aria-label="Petty cash low-balance threshold (%)" />}
          </SettingField>
        </AccessField>
      </div>
      <AccessField access={access} name="apply_transfers_automatically" errors={denied}>
        <SettingToggle label="Apply bank transfers to open bills automatically" hint="A transfer into a family's account number settles their open bills as it is booked. Anything left over waits as their credit." consumer={consumers.apply_transfers_automatically} checked={applyTransfers} onCheckedChange={setApplyTransfers} disabled={!editable("apply_transfers_automatically")} />
      </AccessField>
      <AccessField access={access} name="default_group_reconciliation_matches" errors={denied}>
        <SettingToggle label="Allow grouped automatic matches" hint="The ledger lines in the group must add up to the statement line's amount." consumer={consumers.default_group_reconciliation_matches} checked={groupMatches} onCheckedChange={setGroupMatches} disabled={!editable("default_group_reconciliation_matches")} />
      </AccessField>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <p className="font-mont text-xs text-gray-05">{!valid ? "Use 0 to 30 days and a threshold from 0 to 100%." : readOnlyNote}</p>
        {canUpdate ? <Button onClick={save} disabled={!dirty || !valid || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save banking policy"}</Button> : null}
      </div>
    </HintedPanel>
  );
}
