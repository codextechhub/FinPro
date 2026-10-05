/**
 * Who may take an action the server keeps for a reader who covers the whole school.
 *
 * Some records have no branch: an account in the chart, a cost centre, a tax
 * code, a catalogue item, a finance setting. Every branch posts against them at
 * once, so changing one changes it for every branch. Some actions are the same
 * shape: a provision run or a deferred-income release writes every branch's
 * books in one go. For all of these the server wants two things, the key and a
 * reach that is the whole school (`caller_reaches_whole_tenant` in the backend's
 * `vs_rbac.scoping`), and refuses anyone else with a 403
 * `SHARED_RECORD_READ_ONLY` ("Only a school-wide administrator can change ...").
 * At a school with one branch, a reader pinned to that branch counts as
 * whole-school, and `useReaderReach().wholeSchool` already says so.
 *
 * Mrs Adeyemi is the bursar for Lekki only and holds the account create key.
 * Offered New account, she fills the form, saves and is refused. Asked here
 * first, the button is not there for her, while Bright Star's proprietor, who
 * covers every branch, still sees it. At Corona, which has one branch, its
 * bursar covers the whole school and sees it too.
 *
 * Every screen asks the question the same way, through `useWholeSchoolAccess`
 * (an action) or `useSettingsWriteAccess` (a settings panel, which stays visible
 * and turns read-only with a sentence saying why). `WHOLE_SCHOOL_KEYS` lists the
 * keys whose every write the server keeps for whole-school reach, and
 * `ungatedWholeSchoolUses` finds a screen that reads one of them any other way,
 * which the test beside this file runs over the whole package. A key that is
 * whole-school for only some of its routes is listed in
 * `PARTLY_WHOLE_SCHOOL_KEYS` with the route that needs it, and its screen asks
 * at that one site.
 *
 * Finding them in the backend: a view mixing in `WholeTenantWriteMixin` or
 * `WholeTenantSettingsMixin`, or calling `assert_caller_may_configure`,
 * `caller_reaches_whole_tenant` or `assert_caller_may_change` with an empty
 * branch set. A calendar view with `branch_calendar_action` (closing, reopening
 * or locking a month, closing a year) is a branch's own action and is not one.
 */

import { useCan } from "./can";
import { useReaderReach } from "../../host";
import { P, type PermissionCode } from "../../permissions";

/** A permission code as the host's permission check takes it. */
type HostCode = Parameters<ReturnType<typeof useCan>["can"]>[0];

/** One key whose every write the server keeps for whole-school reach. */
export interface WholeSchoolKey {
  code: PermissionCode;
  /** The dotted backend key, as `FINANCE_PERMISSION_REGISTRY` maps the code. */
  key: string;
  /** What the action is, in a few words. */
  action: string;
}

/** Keys whose every write needs whole-school reach. Read them only through this module. */
export const WHOLE_SCHOOL_KEYS: readonly WholeSchoolKey[] = [
  { code: P.FIN_CREATE_ACCOUNT, key: "finance.account.create", action: "Add an account to the chart of accounts" },
  { code: P.FIN_CREATE_CURRENCY, key: "finance.currency.create", action: "Add a currency" },
  { code: P.FIN_CREATE_FX_RATE, key: "finance.fxrate.create", action: "Record an exchange rate" },
  { code: P.FIN_CREATE_TAX_CODE, key: "finance.taxcode.create", action: "Add or change a tax code" },
  { code: P.FIN_CREATE_COST_CENTER, key: "finance.costcenter.create", action: "Add or change a cost centre" },
  { code: P.FIN_CREATE_DIMENSION, key: "finance.dimension.create", action: "Add or change a dimension" },
  { code: P.FIN_CREATE_PERIOD, key: "finance.period.create", action: "Open a new fiscal year" },
  { code: P.FIN_REOPEN_FISCAL_YEAR, key: "finance.fiscalyear.reopen", action: "Re-open a closed year" },
  { code: P.FIN_ARCHIVE_FISCAL_YEAR, key: "finance.fiscalyear.archive", action: "Archive or restore a closed year" },
  { code: P.FIN_UPDATE_SETTINGS, key: "finance.settings.update", action: "Change the finance settings" },
  { code: P.FIN_CREATE_DUNNING, key: "finance.dunning.create", action: "Add a reminder ladder" },
  { code: P.FIN_UPDATE_DUNNING, key: "finance.dunning.update", action: "Change a reminder ladder" },
  { code: P.FIN_CREATE_TAX, key: "finance.tax.create", action: "Add a tax obligation" },
  { code: P.FIN_UPDATE_TAX, key: "finance.tax.update", action: "Change a tax obligation" },
  { code: P.FIN_CREATE_PROVISION, key: "finance.provision.create", action: "Raise a doubtful-debt provision run" },
  { code: P.FIN_SUBMIT_PROVISION, key: "finance.provision.submit", action: "Submit a provision run" },
  { code: P.FIN_POST_PROVISION, key: "finance.provision.post", action: "Post a provision run" },
  { code: P.FIN_RELEASE_DEFERRED_INCOME, key: "finance.deferredincome.run", action: "Release deferred income" },
  { code: P.FIN_REVERSE_DEFERRED_INCOME, key: "finance.deferredincome.reverse", action: "Undo a deferred-income release" },
  { code: P.FIN_FORFEIT_DEPOSITS, key: "finance.deposit.run", action: "Forfeit unclaimed deposits" },
  { code: P.PROC_CREATE_CATALOG_ITEM, key: "procurement.catalog_item.create", action: "Add a catalogue item" },
  { code: P.PROC_UPDATE_CATALOG_ITEM, key: "procurement.catalog_item.update", action: "Change a catalogue item" },
  { code: P.PROC_CREATE_CATEGORY, key: "procurement.category.create", action: "Add a vendor category" },
  { code: P.PROC_UPDATE_CATEGORY, key: "procurement.category.update", action: "Change a vendor category" },
  { code: P.PROC_UPDATE_SETTINGS, key: "procurement.settings.update", action: "Change the procurement settings" },
  { code: P.PAY_UPDATE_PAYMENT_SETTINGS, key: "payments.settings.update", action: "Change custody or a branch's collection account" },
];

/** A key the server keeps for whole-school reach on some of its routes only. */
export interface PartlyWholeSchoolKey {
  key: string;
  /** The route that needs whole-school reach, and the rule for the others. */
  wholeSchoolWhen: string;
}

/** Keys that are whole-school on one route; each screen asks at that route's action. */
export const PARTLY_WHOLE_SCHOOL_KEYS: readonly PartlyWholeSchoolKey[] = [
  { key: "finance.account.update", wholeSchoolWhen: "Editing an account no bank account backs. A branch reader edits the ledger account of their own branch's bank." },
  { key: "finance.salary.create", wholeSchoolWhen: "Adding a payroll deduction type. Salaries and structures follow the reader's branch." },
  { key: "finance.salary.update", wholeSchoolWhen: "Changing a payroll deduction type. Salaries and structures follow the reader's branch." },
  { key: "finance.bankaccount.update", wholeSchoolWhen: "Splitting a bank account several branches share. Other bank edits do not." },
  { key: "finance.interbranch.transfer", wholeSchoolWhen: "Moving where a customer's open balance is kept. A transfer follows its two branches." },
  { key: "finance.interbranch.recharge", wholeSchoolWhen: "Adding or changing a shared cost rule. A recharge follows its branches." },
  { key: "finance.tax.file", wholeSchoolWhen: "Opening a tax return. Filing one follows the return's branch." },
  { key: "finance.payrollrun.create", wholeSchoolWhen: "A payroll run for all staff. A branch's own run is the branch's." },
  { key: "workflow.template.publish", wholeSchoolWhen: "Adopting the ready-made petty cash return route. A branch publishes its own approval steps." },
  { key: "workflow.template.update", wholeSchoolWhen: "Switching approval notifications on or off. A branch changes its own approval steps." },
  { key: "workflow.group.create", wholeSchoolWhen: "Adding a Dynamic Role. A branch adds its own approver groups." },
  { key: "workflow.group.update", wholeSchoolWhen: "Changing a Dynamic Role. An approver group follows its branches." },
  { key: "workflow.group.delete", wholeSchoolWhen: "Deleting a Dynamic Role. An approver group follows its branches." },
];

/** The reader may take a whole-school action: they hold the key and cover the whole school. */
export function wholeSchoolMay(holdsKey: boolean, wholeSchool: boolean): boolean {
  return holdsKey && wholeSchool;
}

/** What the signed-in reader may take of the actions that need whole-school reach. */
export interface WholeSchoolAccess {
  /** The reader covers the whole school, as the server counts it. */
  wholeSchool: boolean;
  /** Offer the action: the reader holds `code` and covers the whole school. */
  canWholeSchool(code: HostCode): boolean;
  /** The reader holds `code` but covers only some branches, so a screen may say why it is withheld. */
  heldWithoutReach(code: HostCode): boolean;
  /**
   * Offer a change to a row that belongs to `branchIds`: the reader holds `code`
   * and covers every one of them. An empty list (a null branch) is a row every
   * branch shares, which only a whole-school reader may change, the backend's
   * `caller_may_change`.
   */
  canChange(code: HostCode, branchIds: readonly (number | null | undefined)[]): boolean;
}

/** The signed-in reader's access to whole-school actions. */
export function useWholeSchoolAccess(): WholeSchoolAccess {
  const { can } = useCan();
  const reach = useReaderReach();
  return {
    wholeSchool: reach.wholeSchool,
    canWholeSchool: (code) => wholeSchoolMay(can(code), reach.wholeSchool),
    heldWithoutReach: (code) => can(code) && !reach.wholeSchool,
    canChange: (code, branchIds) =>
      can(code) && reach.covers(branchIds.filter((id): id is number => id != null)),
  };
}

/** Why a settings panel is read-only for a reader who holds its update key. */
export const WHOLE_TENANT_SETTINGS_NOTE =
  "Only a school-wide administrator can change these settings, because they apply to every branch. You can read them.";

/** A settings panel's access: it stays readable, and says why it cannot be saved. */
export interface SettingsWriteAccess {
  /** The reader may save: they hold the key and cover the whole school. */
  canUpdate: boolean;
  /** The sentence beside a read-only panel, or null when nothing needs saying. */
  readOnlyNote: string | null;
}

/** The settings form of the whole-school rule, for tests. */
export function settingsWriteAccess(holdsKey: boolean, wholeTenant: boolean): SettingsWriteAccess {
  if (!holdsKey) return { canUpdate: false, readOnlyNote: "You have read-only access." };
  if (!wholeTenant) return { canUpdate: false, readOnlyNote: WHOLE_TENANT_SETTINGS_NOTE };
  return { canUpdate: true, readOnlyNote: null };
}

/** The signed-in reader's access to a settings screen gated on `updateCode`. */
export function useSettingsWriteAccess(updateCode: HostCode): SettingsWriteAccess {
  const { can } = useCan();
  const { wholeSchool } = useReaderReach();
  return settingsWriteAccess(can(updateCode), wholeSchool);
}

/** The calls through which a screen may read a whole-school key. */
const GATES = ["canWholeSchool", "heldWithoutReach", "canChange", "useSettingsWriteAccess"];
const GATED = new RegExp(`\\b(?:${GATES.join("|")})\\(\\s*$`);

/** Files that name a code without gating a screen: the tables themselves. */
const NOT_SCREENS = /(?:^|\/)(?:permissions|backend-key-catalogue|whole-school-access)\.ts$/;

/**
 * Every place in `sources` that reads a key from `WHOLE_SCHOOL_KEYS` other than
 * through this module, as `file:line P.NAME`.
 *
 * `sources` maps a file path to its text, the shape `import.meta.glob` with
 * `?raw` returns. A `P.NAME` that is not the first argument of one of the gate
 * calls is reported: a `can(...)`, a `<Can permission={...}>` or a
 * `hasPermission(...)` on one of these keys offers a branch-only reader an
 * action the server will refuse.
 */
export function ungatedWholeSchoolUses(sources: Record<string, string>): string[] {
  const codes = new Set<string>(WHOLE_SCHOOL_KEYS.map((k) => k.code));
  const names = new Set(Object.entries(P).filter(([, code]) => codes.has(code)).map(([name]) => name));
  const found: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    if (NOT_SCREENS.test(file)) continue;
    for (const match of text.matchAll(/\bP\.([A-Z0-9_]+)\b/g)) {
      if (!names.has(match[1])) continue;
      const at = match.index ?? 0;
      if (GATED.test(text.slice(Math.max(0, at - 60), at))) continue;
      found.push(`${file}:${text.slice(0, at).split("\n").length} P.${match[1]}`);
    }
  }
  return found;
}
