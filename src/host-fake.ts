/**
 * A stand-in for `host.ts`, for tests that mock the host contract.
 *
 * A test that mocks `host` with `importOriginal` loads the real host inside
 * its own mock factory. The real host imports the application's `@xvs-host`,
 * and the application imports the package back, so a package module reached
 * during that load (raising-branch, the pickers) receives the unmocked host.
 * Whether that happens depends only on which module first asks for `host`,
 * so an unrelated new import can switch a passing suite to a failing one.
 *
 * This module imports nothing from the package or the application, so a mock
 * built from it is the same whichever module loads first:
 *
 *     vi.mock("../../host", async () =>
 *       (await import("../../host-fake")).fakeHost({ useBranches: ... }));
 *
 * Every member of the contract is present, so a screen that reaches one the
 * test did not think about gets a quiet default rather than a missing export.
 */
import type { ComponentType } from "react";

const Nothing: ComponentType<unknown> = () => null;
const empty = { data: [], isLoading: false, isError: false };

export function fakeHost(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    useBranches: () => empty,
    useDirectory: () => empty,
    useRoles: () => empty,
    usePositions: () => empty,
    useCanUseOrganogram: () => false,
    useReaderReach: () => ({ wholeSchool: true, branchIds: null, covers: () => true }),
    useLogRecentOpen: () => undefined,
    useDashboardTitle: () => undefined,
    useFinanceSettingsSectionAccess: () => () => true,
    AppLogo: Nothing,
    QuickExportButton: Nothing,
    UserAvatar: Nothing,
    PlatformLedgerInventory: Nothing,
    FeeDuePolicyPanel: Nothing,
    financeSettingsSections: [],
    setupSections: [],
    createsWorkflowTemplates: false,
    platformName: "XVS",
    FeeGenerationPanel: undefined,
    hostBranchLens: undefined,
    HostLoadingMark: undefined,
    HostConsoleSidebarFooter: undefined,
    ...overrides,
  };
}
