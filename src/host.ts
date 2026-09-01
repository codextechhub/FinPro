// The host contract.
//
// Three things this package needs are real in BOTH products but implemented
// differently in each, so they cannot live here and cannot be deleted:
//
//   branches   - stock locations sit at a branch, and every product that uses
//                this package has branches. The console reads them from its
//                tenant-admin service; a school app reads its own.
//   directory  - approvals are shown against a person's name, so something has
//                to answer "who works here".
//   chrome     - the sidebar shows the application's own logo and reveals its
//                own active item.
//
// Each consuming app provides one module satisfying `HostContract`, mapped to
// the alias `@xvs-host` in its tsconfig, vite and vitest alias tables.
//
// `routes-path`, `card-surface`, `helpers` and the rest stay ordinary `@/`
// imports: they are the same shape in both apps, so a path is contract enough.
// These three are here because their SHAPE differs, not just their location.

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

export interface HostQueryResult<T> {
  /** The rows themselves, already unwrapped from whatever envelope the app uses. */
  data: T[] | undefined;
  isLoading: boolean;
  /** True when the read failed. A screen may legitimately treat "cannot read
   *  branches" as "this store is entity-wide" rather than as an error. */
  isError: boolean;
}

export interface HostContract {
  /** Every branch the signed-in caller may see. Scoped by the app, not here. */
  useBranches(): HostQueryResult<HostBranch>;
  /** Everyone the signed-in caller may name. Scoped by the app, not here. */
  useDirectory(): HostQueryResult<HostPerson>;
  /** The application's own logo. */
  AppLogo: ComponentType<{ animate?: boolean; className?: string }>;
  /** Scroll the sidebar so the active item is visible. */
  revealActiveSidebarItem(el: HTMLElement, rememberedScroll: number | null | undefined): void;
}

import * as host from "@xvs-host";

// Compile-time proof that the consuming app satisfies the contract. If an app
// is missing a member or has the wrong shape, this line fails at build rather
// than the screen failing at runtime.
const _satisfies: HostContract = host;
void _satisfies;

export const { useBranches, useDirectory, AppLogo, revealActiveSidebarItem } = host;
