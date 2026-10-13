/**
 * Provisioning a dedicated virtual account names the issuing bank by its slug.
 *
 * Mrs Bello provisions an account for the Okafor family and asks for Wema Bank.
 * The payment provider identifies a bank by its slug (wema-bank), not by its
 * bank code (035), so the request carries `preferred_bank` and never `bank_code`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true, hasModuleAccess: () => true, fieldAccess: {},
  }),
}));
vi.mock("@/redux/services/payments/payments-api", () => ({
  useGetVirtualAccountsQuery: () => ({ data: undefined }),
  useCreateVirtualAccountMutation: () => [mocks.create, { isLoading: false }],
  useUpdateVirtualAccountMutation: () => [vi.fn(), { isLoading: false }],
  useGetCollectionsQuery: () => ({ data: undefined }),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CustomerPicker: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" onClick={() => onChange("C-007")}>Pick Okafor</button>,
  AccountPicker: () => null,
}));
vi.mock("../../../host", () => ({ hostBranchLens: undefined, useBranches: () => ({ data: [], isLoading: false, isError: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ProvisionDrawer } from "./virtual-accounts-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.create.mockReset();
  mocks.create.mockReturnValue({ unwrap: async () => ({ message: "Virtual account created." }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
const setValue = (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
};

describe("the new virtual account form", () => {
  it("sends the bank's slug as preferred_bank and no bank_code", async () => {
    act(() => root.render(<ProvisionDrawer open onClose={vi.fn()} entity="BSS" />));
    act(() => button("Pick Okafor").click());
    setValue(document.body.querySelector('input[placeholder^="The bank"]') as HTMLInputElement, " Wema-Bank ");
    await act(async () => { button("Provision account").click(); });
    const body = mocks.create.mock.calls[0][0];
    expect(body).toEqual({ entity: "BSS", customer: "C-007", provider: "PAYSTACK", deposit_account: undefined, preferred_bank: "wema-bank" });
    expect(body).not.toHaveProperty("bank_code");
  });

  it("sends no bank at all when left blank", async () => {
    act(() => root.render(<ProvisionDrawer open onClose={vi.fn()} entity="BSS" />));
    act(() => button("Pick Okafor").click());
    await act(async () => { button("Provision account").click(); });
    expect(mocks.create.mock.calls[0][0].preferred_bank).toBeUndefined();
  });

  it("explains that the bank is named by slug, not code", () => {
    act(() => root.render(<ProvisionDrawer open onClose={vi.fn()} entity="BSS" />));
    expect(document.body.textContent).toContain("Name the bank by its slug, not its bank code.");
  });
});
