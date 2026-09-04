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
  /** Note that the reader opened something, for the app's own "recently
   *  opened" trail. The console keeps one; an app that does not supplies a hook
   *  that ignores the call, which is a real answer rather than a gap. */
  useLogRecentOpen(entry: HostRecentEntry | null): void;
  /** Where this app lists who holds which role. The workflow screens link to it
   *  from the approval-roles tab, and the two apps put it in different places -
   *  the console under its roles console, the school app under Administration. */
  rolesHref: string;
  /** The approval-roles tab, where one exists.
   *
   *  The console shows which approval roles are unstaffed across the platform,
   *  reading its own RBAC surface to do it. A product built for one school has
   *  no platform-wide view and supplies a component that renders nothing -
   *  the same answer PlatformLedgerInventory gives, for the same reason. */
  ApprovalRolesTab: ComponentType;
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
  useBranches, useDirectory, useRoles, AppLogo, QuickExportButton, UserAvatar,
  useDashboardTitle, PlatformLedgerInventory, useLogRecentOpen, rolesHref,
  ApprovalRolesTab,
} = host;
