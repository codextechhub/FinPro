/**
 * Online payments: who holds the school's online money, and each branch's
 * collection account at the payment provider.
 *
 * Two places use this:
 *
 * - Finance Settings, Banking and cash: the Online payments panel. It reads the
 *   custody mode, a change waiting for its month, the settlement interval and
 *   the clearing warning days, and lists each branch the reader reaches with
 *   its collection account, whether that account is set up with the provider,
 *   and what the platform holds for the branch now. See custody-model.ts for
 *   the rules a change follows.
 * - Bank Accounts, a collection account's Settings tab: whether the account is
 *   set up with the provider, and the action that sets it up or refreshes it.
 *
 * Reading needs `payments.settings.view`. Changing either needs
 * `payments.settings.update` AND a reader who covers the whole school, because
 * the mode binds every branch and the subaccount decides where a branch's money
 * is paid: Mrs Adeyemi, bursar for Lekki only, sees the panel but changes
 * nothing, and is told why. The server enforces both.
 *
 * The provider issues a subaccount code when an account is set up; the screens
 * name it beside "Set up with Paystack" so a bursar can match it against the
 * provider's own dashboard. The custody settings carry it for their readers,
 * and a bank account carries it (with the bank's settlement code) for a
 * whole-school reader or a holder of `payments.settings.view`, so the Settings
 * tab shows it to whoever may read the route money takes.
 */

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Landmark, Save, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmActionModal, FormField } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { useCustodyReading } from "@/components/finance-ui/held-custody";
import { PolicyBadge, SettingsPanel, SettingsRow } from "@/components/settings/settings-layout";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import {
  useGetCustodySettingsQuery,
  useSaveCollectionSubaccountMutation,
  useUpdateCustodySettingsMutation,
} from "@/redux/services/payments/payments-api";
import type {
  CustodyBranch,
  CustodyCollectionAccount,
  CustodyMode,
  FullCustodyPayload,
  UpdateCustodyPayload,
} from "@/redux/services/payments/payments-types";
import type { BankAccount } from "@/redux/services/finance/ops-types";
import { P } from "../../permissions";
import { useReaderReach } from "../../host";
import { useDates } from "../../lib/display-prefs";
import { providerInfo } from "./payment-providers";
import {
  CLEARING_STALE_DAYS,
  CUSTODY_MODES,
  SETTLEMENT_INTERVAL_DAYS,
  branchesNotReady,
  isFullCustodyPayload,
  custodyChange,
  custodyModeLabel,
  wholeDaysIn,
} from "./custody-model";

const WHOLE_TENANT_ONLY = "Only someone who covers the whole school can change this.";

/** Whether the reader may change custody and subaccounts, and why not when they may not. */
function useCustodyWrite(): { may: boolean; why: string | null } {
  const { can } = useCan();
  const reach = useReaderReach();
  if (!can(P.PAY_UPDATE_PAYMENT_SETTINGS)) return { may: false, why: "You have read-only access." };
  if (!reach.wholeSchool) return { may: false, why: WHOLE_TENANT_ONLY };
  return { may: true, why: null };
}

/** The Online payments panel under Finance Settings, Banking and cash. */
export function OnlinePaymentsPanel({ entityCode }: { entityCode: string | null }) {
  const { can } = useCan();
  const canView = can(P.PAY_VIEW_PAYMENT_SETTINGS);
  const query = useGetCustodySettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const payload = query.data?.data;
  if (!canView || !entityCode) return null;
  return (
    <SettingsPanel title="Online payments" description="Who holds the school's online payments before they reach each branch's bank, and each branch's account at the payment provider.">
      {query.isLoading || !isFullCustodyPayload(payload) ? (
        <SettingsRow label={query.isError || payload ? "Could not read the online payments settings" : "Loading online payments"} description={query.isError || payload ? "Try again in a moment." : "Reading the custody setting and each branch's collection account."} />
      ) : (
        <CustodyForm key={payload.settings.updated_at ?? "default"} entity={entityCode} payload={payload} />
      )}
    </SettingsPanel>
  );
}

function CustodyForm({ entity, payload }: { entity: string; payload: FullCustodyPayload }) {
  const dates = useDates();
  const write = useCustodyWrite();
  const { settings, branches } = payload;
  const [mode, setMode] = useState<CustodyMode>(settings.pending_mode ?? settings.stored_mode);
  const [intervalDays, setIntervalDays] = useState(String(settings.settlement_interval_days));
  const [staleDays, setStaleDays] = useState(String(settings.clearing_stale_days));
  const [confirming, setConfirming] = useState(false);
  const [settingUp, setSettingUp] = useState<CustodyBranch | null>(null);
  const [update, { isLoading }] = useUpdateCustodySettingsMutation();

  const intervalValue = wholeDaysIn(intervalDays, SETTLEMENT_INTERVAL_DAYS.low, SETTLEMENT_INTERVAL_DAYS.high);
  const staleValue = wholeDaysIn(staleDays, CLEARING_STALE_DAYS.low, CLEARING_STALE_DAYS.high);
  const notReady = useMemo(() => branchesNotReady(branches), [branches]);
  const change = custodyChange(settings, mode, dates.today());
  const modeChanges = change.kind === "schedule" || change.kind === "cancel";
  const directBlocked = change.kind === "schedule" && change.to === "DIRECT" && notReady.length > 0;

  const body: Omit<UpdateCustodyPayload, "entity"> = {
    ...(modeChanges ? { mode } : {}),
    ...(intervalValue !== null && intervalValue !== settings.settlement_interval_days ? { settlement_interval_days: intervalValue } : {}),
    ...(staleValue !== null && staleValue !== settings.clearing_stale_days ? { clearing_stale_days: staleValue } : {}),
  };
  const valid = intervalValue !== null && staleValue !== null && !directBlocked;
  const dirty = Object.keys(body).length > 0;

  const save = async () => {
    try {
      const res = await update({ entity, ...body }).unwrap();
      toast.success(res.message || "Online payments settings saved.");
      setConfirming(false);
    } catch { /* central */ }
  };

  const changeSentence = change.kind === "schedule"
    ? `Online payments change to "${custodyModeLabel(change.to)}" from ${dates.day(change.from)}.${change.to === "DIRECT" ? " A move to direct also waits until nothing is held for the school." : ""}`
    : change.kind === "cancel"
    ? `The waiting change to "${custodyModeLabel(change.pending)}" is cancelled. Payments stay "${custodyModeLabel(settings.stored_mode)}".`
    : null;

  return (
    <>
      <SettingsRow
        icon={Wallet}
        label="Who holds online payments"
        description={settings.pending_mode
          ? `Changing to "${custodyModeLabel(settings.pending_mode)}"${settings.pending_from ? ` from ${dates.day(settings.pending_from)}` : ""}.${settings.pending_note ? ` ${settings.pending_note}` : ""}`
          : settings.effective_from ? `In force since ${dates.day(settings.effective_from)}.` : "The school has not changed this; payments are held, then paid to each branch."}
        value={custodyModeLabel(settings.mode)}
        badge={<PolicyBadge kind={settings.updated_at ? "configured" : "default"} />}
      />

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <fieldset className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <legend className="sr-only">Who holds online payments</legend>
          {CUSTODY_MODES.map((m) => (
            <label key={m.value} className={cn("flex cursor-pointer gap-3 rounded-md border p-3 font-mont", mode === m.value ? "border-primary bg-pry-01/40" : "border-white-02 bg-white", !write.may && "cursor-default opacity-80")}>
              <input type="radio" name="custody-mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} disabled={!write.may} className="mt-0.5 accent-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-01">{m.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-gray-05">{m.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {directBlocked ? (
          <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 font-mont text-xs text-amber-800">
            Every branch&rsquo;s collection account must be set up with the payment provider first. Not yet: {notReady.join(", ")}.
          </p>
        ) : changeSentence ? (
          <p className="font-mont text-xs text-gray-05">{changeSentence}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="font-mont text-xs font-semibold text-gray-01">
            Settlement interval (days)
            <Input className="mt-2 bg-white" type="number" min={SETTLEMENT_INTERVAL_DAYS.low} max={SETTLEMENT_INTERVAL_DAYS.high} step="1" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} disabled={!write.may} />
            <span className="mt-1 block font-normal leading-5 text-gray-05">While payments are held, each branch is paid every this many days (1 to 7).</span>
          </label>
          <label className="font-mont text-xs font-semibold text-gray-01">
            Clearing warning (days)
            <Input className="mt-2 bg-white" type="number" min={CLEARING_STALE_DAYS.low} max={CLEARING_STALE_DAYS.high} step="1" value={staleDays} onChange={(e) => setStaleDays(e.target.value)} disabled={!write.may} />
            <span className="mt-1 block font-normal leading-5 text-gray-05">The month-end checklist warns about online payments waiting in gateway clearing longer than this (1 to 60).</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mont text-xs text-gray-05">
            {write.why ?? (intervalValue === null || staleValue === null ? "Use 1 to 7 days for the interval and 1 to 60 for the warning." : "A change of who holds payments takes effect from the first day of next month.")}
          </p>
          {write.may ? (
            <Button disabled={!dirty || !valid || isLoading} onClick={() => (modeChanges ? setConfirming(true) : save())}>
              <Save className="mr-2 size-4" />{isLoading ? "Saving" : "Save online payments"}
            </Button>
          ) : null}
        </div>
      </div>

      <BranchAccounts branches={branches} canSetUp={write.may} onSetUp={setSettingUp} />

      {confirming ? (
        <ConfirmActionModal open onOpenChange={(open) => (open ? undefined : setConfirming(false))}
          title="Change who holds online payments?" description={changeSentence ?? undefined}
          confirmText="Save" loading={isLoading} onConfirm={save}>
          <p className="font-mont text-xs leading-5 text-gray-05">
            {mode === "DIRECT"
              ? "In direct mode there are no online payouts or online refunds. Pay suppliers and refund payers from each branch's bank."
              : "In held mode the school's online payments are held and paid into each branch's bank on its settlement interval."}
          </p>
        </ConfirmActionModal>
      ) : null}
      {settingUp?.collection_account ? (
        <SubaccountSetupModal entity={entity} account={settingUp.collection_account} branchName={settingUp.branch_name} onClose={() => setSettingUp(null)} />
      ) : null}
    </>
  );
}

function BranchAccounts({ branches, canSetUp, onSetUp }: { branches: CustodyBranch[]; canSetUp: boolean; onSetUp: (b: CustodyBranch) => void }) {
  const several = branches.length > 1;
  return (
    <div className="px-4 pb-4 sm:px-5">
      <p className="mb-2 font-mont text-xs font-semibold text-gray-01">{several ? "Each branch's collection account" : "Collection account"}</p>
      <ul className="divide-y divide-white-02 rounded-md border border-white-02 bg-white">
        {branches.map((b) => {
          const account = b.collection_account;
          return (
            <li key={b.branch} className="flex flex-col gap-2 px-3 py-3 font-mont text-xs sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                {several ? <p className="font-medium text-gray-01">{b.branch_name}</p> : null}
                <p className={cn(several ? "text-gray-05" : "font-medium text-gray-01")}>
                  {account ? `${account.name}${account.bank_name ? ` · ${account.bank_name}` : ""}` : "No collection account. Tick Collection on one of this branch's bank accounts."}
                </p>
                {b.held_balance ? <p className="text-gray-05">Held for this branch now: <span className="tabular-nums">{formatMoney(b.held_balance)}</span></p> : null}
              </div>
              {account ? <SubaccountStatus account={account} /> : null}
              {account && canSetUp ? (
                <Button size="sm" variant="outline" onClick={() => onSetUp(b)}>{account.subaccount_ready ? "Refresh subaccount" : "Create subaccount"}</Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SubaccountStatus({ account }: { account: CustodyCollectionAccount }) {
  if (!account.subaccount_ready) return <PolicyBadge kind="default">Not set up with the provider</PolicyBadge>;
  return (
    <span className="inline-flex flex-col items-start gap-0.5 sm:items-end">
      <PolicyBadge kind="configured">Set up with {providerInfo(account.subaccount_provider ?? "PAYSTACK").label}</PolicyBadge>
      {account.subaccount_code ? <span className="font-mont text-[11px] tabular-nums text-gray-05">Subaccount {account.subaccount_code}</span> : null}
    </span>
  );
}

/**
 * "Subaccount ACCT_8f4k2m, bank code 058": the provider's handles for a
 * collection account, from whichever read carries them; null when neither does.
 */
export function subaccountDetail(code: string | null | undefined, bankCode: string | null | undefined): string | null {
  if (!code) return null;
  return bankCode ? `Subaccount ${code}, bank code ${bankCode}.` : `Subaccount ${code}.`;
}

/**
 * Create a branch collection account's provider subaccount, or point an
 * existing one at the account's current details. The provider needs the bank's
 * own code (058 for GTBank, 057 for Zenith); the bank account keeps only a bank
 * name, so the reader supplies it.
 */
export function SubaccountSetupModal({ entity, account, branchName, onClose }: {
  entity: string;
  account: Pick<CustodyCollectionAccount, "id" | "name" | "subaccount_ready">;
  branchName?: string;
  onClose: () => void;
}) {
  const [bankCode, setBankCode] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [save, { isLoading }] = useSaveCollectionSubaccountMutation();
  const codeValid = /^\d{1,10}$/.test(bankCode.trim());
  const submit = async () => {
    try {
      const res = await save({
        entity, bank_account: account.id, settlement_bank_code: bankCode.trim(),
        ...(businessName.trim() ? { business_name: businessName.trim() } : {}),
      }).unwrap();
      toast.success(res.message || "Collection subaccount saved.");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal open onOpenChange={(open) => (open ? undefined : onClose())}
      title={account.subaccount_ready ? "Refresh the provider subaccount" : "Create the provider subaccount"}
      description={`${account.name}${branchName ? ` · ${branchName}` : ""}. Online payments for this branch settle into this account when the school takes them directly.`}
      confirmText={account.subaccount_ready ? "Refresh" : "Create"} loading={isLoading} confirmDisabled={!codeValid} onConfirm={submit}>
      <div className="space-y-3">
        <FormField label="Bank code at the provider" required>
          <Input inputMode="numeric" value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="058" className="bg-white font-mont" aria-label="Bank code at the provider" />
          <span className="mt-1 block font-mont text-[11px] text-gray-05">Digits only, for example 058 for GTBank or 057 for Zenith.</span>
        </FormField>
        <FormField label="Business name (optional)">
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="The school and branch name" className="bg-white font-mont" aria-label="Business name" />
        </FormField>
      </div>
    </ConfirmActionModal>
  );
}

/**
 * A collection account's line in its Settings tab: whether it is set up with
 * the provider, under which subaccount code, and the action that sets it up.
 * Absent on an account that is not a branch's collection account, and for a
 * reader who may read neither the payment settings nor the account's route.
 */
export function CollectionSubaccountBlock({ entity, account }: { entity: string; account: BankAccount }) {
  const { can } = useCan();
  const readsSettings = can(P.PAY_VIEW_PAYMENT_SETTINGS);
  const readsRoute = "gateway_subaccount_code" in account;
  if (!account.is_primary_collection || !(readsSettings || readsRoute)) return null;
  return <CollectionSubaccountLine entity={entity} account={account} readsSettings={readsSettings} />;
}

function CollectionSubaccountLine({ entity, account, readsSettings }: { entity: string; account: BankAccount; readsSettings: boolean }) {
  const write = useCustodyWrite();
  const [open, setOpen] = useState(false);
  const query = useGetCustodySettingsQuery({ entity }, { skip: !readsSettings });
  const row = (query.data?.data?.branches ?? []).find((b) => b.collection_account?.id === account.id);
  const known = row?.collection_account;
  const ready = known ? known.subaccount_ready : !!account.gateway_subaccount_code;
  const provider = known?.subaccount_provider || account.gateway_subaccount_provider || "PAYSTACK";
  const detail = subaccountDetail(account.gateway_subaccount_code || known?.subaccount_code, account.settlement_bank_code);
  return (
    <div className="rounded-md border border-white-02 bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Landmark className="mt-0.5 size-4 shrink-0 text-gray-05" />
          <div className="min-w-0 font-mont text-xs">
            <p className="font-medium text-gray-01">Online payments</p>
            <p className="mt-0.5 leading-5 text-gray-05">
              {query.isLoading ? "Reading the provider setup." : ready
                ? `Set up with ${providerInfo(provider).label}. When the school takes payments directly, ${row?.branch_name ?? "this branch"}'s online payments settle into this account.`
                : "Not set up with the payment provider. A branch must be set up before the school can take payments directly."}
            </p>
            {ready && detail ? <p className="mt-0.5 tabular-nums text-gray-01">{detail}</p> : null}
          </div>
        </div>
        {write.may ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{ready ? "Refresh subaccount" : "Create subaccount"}</Button>
        ) : (
          <span className="inline-flex items-center gap-1 font-mont text-[11px] text-gray-05"><ShieldCheck className="size-3.5" />{write.why === WHOLE_TENANT_ONLY ? "Whole school only" : "Read only"}</span>
        )}
      </div>
      {open ? (
        <SubaccountSetupModal entity={entity} account={{ id: account.id, name: account.name, subaccount_ready: ready }} branchName={row?.branch_name} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * A payout screen's body, or a notice in its place where the school's online
 * payments settle straight to each branch's bank (custody DIRECT).
 *
 * A school app's menu leaves Payouts and Batches out at such a school, so this
 * is met only through a bookmark or a pasted address. A reader who cannot read
 * the custody setting is shown the screen, and the server's refusal of a
 * payout says the same thing.
 */
export function HeldCustodyScreen({ entity, children }: { entity: string; children: ReactNode }) {
  const custody = useCustodyReading(entity);
  if (custody === "DIRECT") return <DirectModePayoutsNote />;
  return <>{children}</>;
}

/** The note shown in place of a payout screen while payments settle directly. */
export function DirectModePayoutsNote() {
  return (
    <p role="status" className="rounded-md bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-800">
      Online payouts are not available while online payments go straight to each branch&rsquo;s bank. Pay suppliers from the bank and record the payment. Earlier payouts are listed in the Transactions Log.
    </p>
  );
}
