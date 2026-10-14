/**
 * The primary collection account on Documents and collections.
 *
 * Mrs Bello names Ikeja Collections as the account invoices print for payment.
 * Naming it writes that account's collection flag, so the choice follows the
 * bank account switch for that flag: a role that may not change it sees the
 * choice greyed and the account's bank and currency only if it may read them,
 * and the saved policy leaves the account out.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinanceDocumentSettingsValues } from "@/redux/services/finance/setup-types";

const mocks = vi.hoisted(() => ({
  access: {} as Record<string, unknown>,
  update: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: mocks.access,
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/redux/services/finance/setup-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUpdateFinanceDocumentSettingsMutation: () => [(body: unknown) => {
    mocks.update(body);
    return { unwrap: () => Promise.resolve({ message: "Saved." }) };
  }, { isLoading: false }],
}));

import { FinanceDocumentForm } from "./settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VALUES: FinanceDocumentSettingsValues = {
  default_invoice_due_days: 14, default_invoice_narration: "", auto_post_manual_invoices: true, allow_customer_opening_balances: true,
  term_collection_target_pct: 90,
  primary_collection_bank_account: { id: 7, name: "Ikeja Collections", bank_name: "GTBank", currency: "NGN" },
  bank_account_options: [
    { id: 7, name: "Ikeja Collections", bank_name: "GTBank", currency: "NGN" },
    { id: 8, name: "Lekki Collections", bank_name: "Zenith", currency: "NGN" },
  ],
  updated_at: null, updated_by: null,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocks.access = {}; mocks.update.mockClear();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const mount = (values = VALUES) => act(() => root.render(
  <MemoryRouter><FinanceDocumentForm entityCode="HOLYCROSS" values={values} consumers={{}} canUpdate readOnlyNote={null} /></MemoryRouter>,
));
const picker = () => container.querySelector("select") as HTMLSelectElement;
const dueDays = () => container.querySelector('input[type="number"]') as HTMLInputElement;
const type = (el: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
const save = () => act(async () => { (Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Save document policy")) as HTMLElement).click(); });

describe("the primary collection account", () => {
  it("lists each account with its bank and currency and sends the choice", async () => {
    mount();
    expect(Array.from(picker().options).map((o) => o.textContent)).toEqual(["Automatic fallback", "Ikeja Collections · GTBank · NGN", "Lekki Collections · Zenith · NGN"]);
    expect(picker().disabled).toBe(false);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(picker(), "8");
      picker().dispatchEvent(new Event("change", { bubbles: true }));
    });
    await save();
    expect(mocks.update.mock.calls.at(-1)?.[0]).toMatchObject({ primary_collection_bank_account: 8 });
  });

  it("names an account by its own name alone when its bank and currency are hidden", () => {
    mocks.access = { "finance.bankaccount": { hidden: ["bank_name", "currency"] } };
    mount({
      ...VALUES,
      primary_collection_bank_account: { id: 7, name: "Ikeja Collections" },
      bank_account_options: [{ id: 7, name: "Ikeja Collections" }, { id: 8, name: "Lekki Collections" }],
    });
    expect(Array.from(picker().options).map((o) => o.textContent)).toEqual(["Automatic fallback", "Ikeja Collections", "Lekki Collections"]);
  });

  it("greys the choice and leaves it out of the saved policy when the collection flag is read-only", async () => {
    mocks.access = { "finance.bankaccount": { read_only: ["is_primary_collection"] } };
    mount();
    expect(picker().disabled).toBe(true);
    type(dueDays(), "21");
    await save();
    const body = mocks.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({ default_invoice_due_days: 21 });
    expect(body).not.toHaveProperty("primary_collection_bank_account");
  });
});
