/**
 * The host contract.
 *
 * Three things this package needs are real in BOTH products but implemented
 * differently in each, so they cannot live here and cannot be deleted:
 *
 *   branches   - stock locations sit at a branch, and every product that uses
 *                this package has branches. The console reads them from its
 *                tenant-admin service; a school app reads its own.
 *   directory  - approvals are shown against a person's name, so something has
 *                to answer "who works here".
 *   chrome     - the sidebar shows the application's own logo and reveals its
 *                own active item.
 *
 * Each consuming app provides one module satisfying `HostContract`, mapped to
 * the alias `@xvs-host` in its tsconfig, vite and vitest alias tables.
 *
 * `routes-path`, `card-surface`, `helpers` and the rest stay ordinary `@/`
 * imports: they are the same shape in both apps, so a path is contract enough.
 * These three are here because their SHAPE differs, not just their location.
 */

import type { ComponentType } from "react";

import type {
  FinanceSettingsSection, SetupSection,
} from "./pages/finance/console-sections";

/** The minimum a branch must expose. Apps may return richer rows. */
export interface HostBranch {
  id: string | number;
  name: string;
}

/** The minimum a person must expose to be named on an approval.
 *
 *  Every field here is one the screens actually read, discovered by the
 *  compiler rather than guessed: `role` is shown beside a name so an approver
 *  is identifiable, and `status` gates delegation, since only an active person
 *  may be handed somebody else's approvals. Apps may return richer rows.
 */
export interface HostPerson {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
}

/** The minimum an organogram seat must expose to be pointed at by an approval
 *  step.
 *
 *  ``code`` is what the engine resolves against, the way ``key`` is for a role.
 *  ``holders`` is the live headcount behind the seat, so picking one that
 *  currently reaches nobody is a visible choice rather than a surprise on the
 *  members list afterwards. */
export interface HostPosition {
  code: string;
  title: string;
  is_active: boolean;
  holders: number;
}

/** The minimum a role must expose to be pointed at by an approval step.
 *
 *  ``key`` is what the engine resolves against, and it is the reason this is in
 *  the contract at all rather than the package reading roles itself. Both apps
 *  already query the same endpoint - ``/rbac/tenants/{slug}/roles/`` - through
 *  their own RTK Query slices with their own tag types. A package that shipped a
 *  third slice over those routes would give an app two caches of one truth:
 *  approving a role change would invalidate one and not the other, and the roles
 *  table and an approver picker would disagree about what a role holds,
 *  intermittently, depending on which screen was opened first.
 *
 *  So the package asks the app it is running inside, which already knows.
 */
export interface HostRole {
  id: string | number;
  /** The slug an approval stage names. Not the display name. */
  key: string;
  name: string;
  /** ACTIVE / INACTIVE / ARCHIVED. A step must not be pointed at a role that
   *  is out of use, so the pickers filter on this rather than offering it. */
  status: string;
  /** How many people hold it. Shown beside the name so nobody points a step at
   *  a role nobody holds and waits for an approval that cannot come. */
  assigned_users_count: number;
}

/** One thing a reader opened, for a host that keeps a trail of them. */
export interface HostRecentEntry {
  kind: string;
  id: string;
  label: string;
  to: string;
}

export interface HostQueryResult<T> {
  /** The rows themselves, already unwrapped from whatever envelope the app uses. */
  data: T[] | undefined;
  isLoading: boolean;
  /** True when the read failed. A screen may legitimately treat "cannot read
   *  branches" as "this store is entity-wide" rather than as an error. */
  isError: boolean;
}

/** What a screen asks the host to export. `screen` names the export plan the
 *  backend holds; the rest narrow it. */
export interface HostExportProps {
  screen: string;
  /** Scalars only: these narrow the export and end up in a query string,
   *  so an object here would serialise to [object Object]. */
  params?: Record<string, string | number | boolean | undefined>;
  entity?: string;
  label?: string;
  defaultName?: string;
  className?: string;
  variant?: "white" | "outline" | "default";
  /** Which type family the control renders in, where a host has more than one.
   *  A host with a single typeface ignores it. */
  typeface?: "geist" | "app";
  /** When set, the control is disabled and this is its tooltip. A screen that
   *  cannot be exported yet says why, rather than offering a silent no-op. */
  disabledReason?: string;
}

/** What a screen passes to the host's avatar. `fallbackClassName` styles the
 *  initials shown when there is no photograph - a host without photos ignores
 *  it, but must accept it rather than fail to compile. */
export interface HostAvatarProps {
  name?: string;
  userId?: string | number;
  className?: string;
  fallbackClassName?: string;
}

/** The fee structure a host's generation panel bills from. */
export interface HostFeeStructure {
  id: number;
  code: string;
  name: string;
  /** Per payer, tax included, in kobo. */
  total_with_tax: number;
  /** The branch whose price list this is. Null for one shared across the
   *  tenant; absent where the server does not send it. */
  branch_id?: number | null;
}

/** What a host's generation panel is given. It renders its own drawer and
 *  calls `onClose` when the reader leaves it, whether or not anything was
 *  billed. */
export interface HostFeeGenerationProps {
  structure: HostFeeStructure;
  entity: string;
  currency?: string | null;
  onClose: () => void;
}

export interface HostContract {
  /** The application's own export affordance.
   *
   *  In the contract rather than the package because exporting is bound to the
   *  host at every point: its permission codes, its export routes, its file
   *  download flow. The console's version reads console permission constants
   *  that a school app does not have, so copying it across imports a shadow of
   *  the console rather than a feature.
   *
   *  An app with no export story supplies a component that renders nothing.
   *  That is a real answer, and better than a screen offering a button that
   *  leads somewhere the app cannot go. */
  QuickExportButton: ComponentType<HostExportProps>;
  /** The application's own avatar. In the contract because the photo behind it
   *  is host-bound: the console reads staff photos from its media service, and
   *  a school app has its own people and its own source. A package that
   *  imported one app's photo query would carry that app's API into the other. */
  UserAvatar: ComponentType<HostAvatarProps>;
  /** Set the surrounding application's page title. Each app owns its own
   *  header, so the package asks rather than reaches. */
  useDashboardTitle(title: string): void;
  /** Every branch the signed-in caller may see. Scoped by the app, not here. */
  useBranches(): HostQueryResult<HostBranch>;
  /** Everyone the signed-in caller may name. Scoped by the app, not here. */
  useDirectory(): HostQueryResult<HostPerson>;
  /** Every role an approval step may be pointed at. Supplied by the app because
   *  both apps already read these rows; see :type:`HostRole`. */
  useRoles(): HostQueryResult<HostRole>;
  /** Every organogram seat an approval step may be pointed at.
   *
   *  In the contract because each application keeps its own organogram: the
   *  console reads CodeX's reporting structure from a platform endpoint, and the
   *  school app reads the school's own chart. A package that queried either
   *  directly would answer 403 in the other app.
   *
   *  An app with no organogram, or a reader who may not read it, gets an empty
   *  list, and the Positions tab disappears rather than standing there empty. */
  usePositions(): HostQueryResult<HostPosition>;
  /** Whether the reader may route an approval step through this app's
   *  organogram, which offers "Organogram" under "Decided by".
   *
   *  In the contract because the answer is a permission, and each app's chart
   *  is read under its own key: platform.organogram.view in the console,
   *  school.organogram.view in the school app. A package that asked either key
   *  itself would hide the option in the other app for everybody. */
  useCanUseOrganogram(): boolean;
  /** Note that the reader opened something, for the app's own "recently
   *  opened" trail. The console keeps one; an app that does not supplies a hook
   *  that ignores the call, which is a real answer rather than a gap. */
  useLogRecentOpen(entry: HostRecentEntry | null): void;
  /** Which Finance Settings sections and Setup pages this app actually mounts.
   *
   *  The package used to guess. Settings offered "Entities" whenever the caller
   *  held ``finance.entity.create``, and Reference data always offered all five
   *  of its cards - while the app's own route table mounted a different set. A
   *  school admin holding that permission therefore got an Entities link that
   *  404ed, and Dimensions and Currencies did the same, because two lists were
   *  answering one question and nothing reconciled them.
   *
   *  The router is the only thing that knows what it serves, so it says. A
   *  permission still decides whether a mounted section is *offered*; this
   *  decides whether it exists here at all, and the two are different questions.
   *
   *  Both apps build their route tables from these same arrays, so a section
   *  cannot be advertised without being routable. */
  financeSettingsSections: readonly FinanceSettingsSection[];
  setupSections: readonly SetupSection[];
  /** When this school's fee bills fall due, for the "fees" settings section.
   *
   *  School-only: the endpoint is the FAL's, and the console does not bill
   *  school fees. An app that omits "fees" from `financeSettingsSections`
   *  supplies a component that renders nothing and it is never reached. */
  FeeDuePolicyPanel: ComponentType;
  /** Who a fee structure bills, and the run that bills them.
   *
   *  Optional, and the only member that is. Without it, Generate invoices on a
   *  fee structure and Batch generate on the invoice list raise one invoice for
   *  every active customer in the entity, which is right for a business with a
   *  customer list and wrong for a school, where the customers are pupils and a
   *  structure has no class. A "JSS 1 First Term" structure billed that way
   *  bills every child in the school.
   *
   *  A host that knows who a structure is for supplies a panel that names the
   *  payers itself, and both entry points render it in place of the all-active
   *  run. The school app's panel picks classes, previews the run and bills
   *  through the school's own route, which also applies the school's due-date
   *  rule. A host that omits it keeps the all-active run unchanged. */
  FeeGenerationPanel?: ComponentType<HostFeeGenerationProps>;
  /** Whether this app creates approval templates from nothing.
   *
   *  CodeX does: the shared paths every tenant starts on are authored in the
   *  console. A tenant does not. Its templates arrive already published, and
   *  what it does is adjust one - "each starts as the Codex version; adjust one
   *  and this school runs your version from then on". Offering "New Template"
   *  there invites somebody to author a path from scratch alongside the seeded
   *  ones, which is a second answer to a question that already has one.
   *
   *  Not a permission. A tenant admin holds ``workflow.template.update`` and
   *  needs it, because adjusting a template is what that key is for; this says
   *  the *product* has no create story here, which no permission can express. */
  createsWorkflowTemplates: boolean;
  /** What this application calls the party that publishes shared templates.
   *
   *  The two products use different names for the same body. Staff know it as
   *  CodeX, the company; a school knows only the product, XVS. "This school
   *  runs the CodeX version" is correct in the console and wrong in front of a
   *  school, which has no reason to learn the company's name to read a sentence
   *  about its own approval path. The name therefore comes from the host rather
   *  than being written into shared copy. */
  platformName: string;
  /** The application's own logo. */
  AppLogo: ComponentType<{ animate?: boolean; className?: string }>;
  /** An extra section on Setup -> Entities, below the caller's own books.
   *
   *  The platform console shows a roll-call there: every tenant on the
   *  platform and whether its books exist. A product built for ONE tenant has
   *  no such view and supplies a component that renders nothing.
   *
   *  In the contract rather than the package because the gate is host-bound.
   *  The key is `platform.schools.view`, and its frontend code is 100101 in
   *  the console and 100101 in the school app too - pointing at a completely
   *  different permission. A package that hard-coded the number would gate the
   *  console correctly and the school app on its dashboard permission. */
  PlatformLedgerInventory: ComponentType;
}

import * as host from "@xvs-host";

// Compile-time proof that the consuming app satisfies the contract. If an app
// is missing a member or has the wrong shape, this line fails at build rather
// than the screen failing at runtime.
const _satisfies: HostContract = host;
void _satisfies;

export const {
  useBranches, useDirectory, useRoles, usePositions, useCanUseOrganogram, AppLogo, QuickExportButton, UserAvatar,
  useDashboardTitle, PlatformLedgerInventory, useLogRecentOpen,
  financeSettingsSections, setupSections, FeeDuePolicyPanel, createsWorkflowTemplates,
  platformName,
} = host;

// Read through the contract type, not the module: an optional member a host
// leaves out is not an export of its module at all.
export const FeeGenerationPanel = _satisfies.FeeGenerationPanel;
