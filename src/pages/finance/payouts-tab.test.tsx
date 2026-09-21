/**
 * A payout's beneficiary follows Field Access on `payments.payout`. No role may
 * write it: the backend copies it from the vendor's verified record. So on the
 * New payout form:
 *
 *   1. the beneficiary is shown greyed, filled from the vendor's own record;
 *   2. it is never sent, and the payout can go without anybody typing it;
 *   3. a beneficiary field the user cannot read is not on the form at all.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  initiate: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));

vi.mock("@/redux/services/payments/payments-api", () => ({
  useInitiatePayoutMutation: () => [mocks.initiate, { isLoading: false }],
}));

vi.mock("@/redux/services/procurement/procurement-api", () => ({
  useGetVendorsQuery: () => ({ data: { data: [{ id: 4, code: "ADE", name: "Ade Stationers" }] } }),
  useGetVendorQuery: (_: unknown, options?: { skip?: boolean }) => (options?.skip ? {} : {
    data: {
      data: {
        id: 4, code: "ADE", name: "Ade Stationers", bank_name: "GTBank",
        bank_account_number: "0123456789", bank_account_name: "Ade Stationers Ltd",
        _read_only_fields: [],
      },
    },
  }),
}));

vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetAccountsQuery: () => ({ data: { data: [] } }),
}));

vi.mock("../../host", () => ({ QuickExportButton: () => null }));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AccountPicker: () => null,
  PostingRecap: () => null,
  VendorPicker: ({ onChange }: { onChange: (code: string) => void }) => (
    <button type="button" onClick={() => onChange("ADE")}>Pick Ade</button>
  ),
  MoneyInput: ({ onChangeKobo }: { onChangeKobo: (kobo: number) => void }) => (
    <input aria-label="amount" onChange={(event) => onChangeKobo(Number(event.target.value))} />
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { NewPayoutDrawer } from "./payouts-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Every role's map for payouts: the beneficiary is readable and never writable. */
const PAYOUT_READ_ONLY = {
  read_only: ["beneficiary_account_number", "beneficiary_bank_code", "beneficiary_name"],
  hidden: [],
  open_on_create: [],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.initiate.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const field = (name: string) => document.body.querySelector<HTMLFieldSetElement>(`fieldset[data-field=${name}]`);
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("NewPayoutDrawer under Field Access", () => {
  it("shows the vendor's beneficiary greyed and never sends it", async () => {
    mocks.fieldAccess = {
      "payments.payout": PAYOUT_READ_ONLY,
      "procurement.vendor": { hidden: ["bank_code"], read_only: [], open_on_create: [] },
    };
    mocks.initiate.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Sent." }) });
    act(() => root.render(<NewPayoutDrawer open onClose={() => undefined} entity="COD" />));

    act(() => button("Pick Ade").click());
    expect(field("beneficiary_name")!.disabled).toBe(true);
    expect(field("beneficiary_name")!.querySelector("input")!.value).toBe("Ade Stationers Ltd");
    expect(field("beneficiary_account_number")!.disabled).toBe(true);
    expect(field("beneficiary_account_number")!.querySelector("input")!.value).toBe("0123456789");
    // The vendor's bank code is hidden from this user, so the payout's copy of it is not offered.
    expect(field("beneficiary_bank_code")).toBeNull();

    act(() => type(document.body.querySelector<HTMLInputElement>("input[aria-label=amount]")!, "500000"));
    await act(async () => { button("Send payout").click(); });

    const body = mocks.initiate.mock.calls[0][0];
    expect(body).toMatchObject({ entity: "COD", vendor: "ADE", amount: 500000 });
    expect(body).not.toHaveProperty("beneficiary_name");
    expect(body).not.toHaveProperty("beneficiary_account_number");
    expect(body).not.toHaveProperty("beneficiary_bank_code");
  });

  it("leaves out a beneficiary field the user cannot read", () => {
    mocks.fieldAccess = {
      "payments.payout": { ...PAYOUT_READ_ONLY, hidden: ["beneficiary_account_number"], read_only: ["beneficiary_bank_code", "beneficiary_name"] },
    };
    act(() => root.render(<NewPayoutDrawer open onClose={() => undefined} entity="COD" />));
    act(() => button("Pick Ade").click());
    expect(field("beneficiary_account_number")).toBeNull();
    expect(document.body.textContent).not.toContain("Account number");
    expect(field("beneficiary_name")).not.toBeNull();
  });
});
