/**
 * Documents and collections, and the posting account map.
 *
 * Each document default is a `finance.settings` field with its own Read and
 * Write switch: a hidden default leaves the form, a read-only one is greyed
 * and left out of the saved body, and a refusal shows under the field it
 * names. Each account mapping travels under its role key: a role the reader may
 * not read never arrives, and one in `read_only_keys` is greyed and never sent.
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
  refuse: null as unknown,
  accounts: null as unknown,
  updateMappings: vi.fn(),
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
    return { unwrap: () => (mocks.refuse ? Promise.reject(mocks.refuse) : Promise.resolve({ message: "Saved." })) };
  }, { isLoading: false }],
  useGetFinanceAccountSettingsQuery: () => ({ data: { data: mocks.accounts }, isLoading: false }),
  useUpdateFinanceAccountSettingsMutation: () => [(body: unknown) => {
    mocks.updateMappings(body);
    return { unwrap: () => (mocks.refuse ? Promise.reject(mocks.refuse) : Promise.resolve({ message: "Saved." })) };
  }, { isLoading: false }],
}));
vi.mock("../../host", async () => (await import("../../host-fake")).fakeHost());

import { AccountingDefaults, FinanceDocumentForm } from "./settings";

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
  mocks.access = {}; mocks.update.mockClear(); mocks.updateMappings.mockClear(); mocks.refuse = null;
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

const refusal = (detail: Record<string, string[]>) => ({ status: 403, data: { error: { code: "field_write_denied", detail } } });
const field = (name: string) => container.querySelector(`[data-field="${name}"]`);
const without = (...names: (keyof FinanceDocumentSettingsValues)[]) =>
  Object.fromEntries(Object.entries(VALUES).filter(([name]) => !names.includes(name as keyof FinanceDocumentSettingsValues))) as unknown as FinanceDocumentSettingsValues;

describe("document defaults under Field Access", () => {
  it("sends only the default that changed", async () => {
    mount();
    type(dueDays(), "21");
    await save();
    expect(mocks.update.mock.calls.at(-1)?.[0]).toEqual({ entity: "HOLYCROSS", default_invoice_due_days: 21 });
  });

  it("removes a hidden default completely", () => {
    mocks.access = { "finance.settings": { hidden: ["term_collection_target_pct", "auto_post_manual_invoices"] } };
    mount(without("term_collection_target_pct", "auto_post_manual_invoices"));
    expect(field("term_collection_target_pct")).toBeNull();
    expect(field("auto_post_manual_invoices")).toBeNull();
    expect(container.textContent).not.toContain("Term collection target");
    expect(container.textContent).not.toContain("Post manual invoices immediately");
    expect(field("default_invoice_due_days")).not.toBeNull();
  });

  it("does not demand a valid value for a hidden default", async () => {
    mocks.access = { "finance.settings": { hidden: ["term_collection_target_pct"] } };
    mount(without("term_collection_target_pct"));
    type(dueDays(), "30");
    await save();
    expect(mocks.update.mock.calls.at(-1)?.[0]).toEqual({ entity: "HOLYCROSS", default_invoice_due_days: 30 });
  });

  it("greys a read-only default and never sends it", async () => {
    mount({ ...VALUES, _read_only_fields: ["default_invoice_due_days"] });
    expect(field("default_invoice_due_days")?.getAttribute("data-read-only")).toBe("true");
    expect(dueDays().disabled).toBe(true);
    const target = field("term_collection_target_pct")!.querySelector("input") as HTMLInputElement;
    type(target, "80");
    await save();
    const body = mocks.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body).toEqual({ entity: "HOLYCROSS", term_collection_target_pct: 80 });
  });

  it("shows a refusal under the default it names", async () => {
    mocks.refuse = refusal({ default_invoice_due_days: ["You may not change the days until an invoice is due."] });
    mount();
    type(dueDays(), "21");
    await save();
    expect(field("default_invoice_due_days")?.querySelector("[role=alert]")?.textContent).toBe("You may not change the days until an invoice is due.");
  });
});

const mapping = (key: string, label: string) => ({
  key, label, expected_account_type: "ASSET", default_code: "1000", source: "DEFAULT" as const,
  account: { id: 1, code: "1000", name: "Cash at bank", account_type: "ASSET", is_active: true, is_postable: true }, is_valid: true,
});
const ACCOUNTS = {
  mappings: [mapping("CASH_BANK", "Cash and bank"), mapping("ACCOUNTS_RECEIVABLE", "Accounts receivable")],
  read_only_keys: [] as string[],
  consumers: {},
  account_options: [{ id: 1, code: "1000", name: "Cash at bank", account_type: "ASSET" }, { id: 2, code: "1010", name: "Ikeja bank", account_type: "ASSET" }],
  history: [],
};
const mountMappings = (payload: unknown = ACCOUNTS) => {
  mocks.accounts = payload;
  act(() => root.render(<MemoryRouter><AccountingDefaults entityCode="HOLYCROSS" /></MemoryRouter>));
};
const roleSelect = (label: string) => container.querySelector(`select[aria-label="${label} account"]`) as HTMLSelectElement;
const choose = (el: HTMLSelectElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
const saveMappings = () => act(async () => { (Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Save changes")) as HTMLElement).click(); });

describe("account mappings under Field Access", () => {
  it("sends the role that changed", async () => {
    mountMappings();
    choose(roleSelect("Cash and bank"), "2");
    await saveMappings();
    expect(mocks.updateMappings).toHaveBeenCalledWith({ entity: "HOLYCROSS", mappings: { CASH_BANK: "2" } });
  });

  it("has no row for a role the server left out", () => {
    mountMappings({ ...ACCOUNTS, mappings: [ACCOUNTS.mappings[1]] });
    expect(roleSelect("Cash and bank")).toBeNull();
    expect(container.textContent).not.toContain("Cash and bank");
    expect(roleSelect("Accounts receivable")).not.toBeNull();
  });

  it("greys a read-only role and has nothing to save", () => {
    mountMappings({ ...ACCOUNTS, read_only_keys: ["CASH_BANK"] });
    expect(roleSelect("Cash and bank").disabled).toBe(true);
    expect(container.querySelector('[data-field="CASH_BANK"]')?.getAttribute("data-read-only")).toBe("true");
    expect(roleSelect("Accounts receivable").disabled).toBe(false);
    const saveButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Save changes")) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("says so when no role may be read", () => {
    mountMappings({ ...ACCOUNTS, mappings: [] });
    expect(container.textContent).toContain("Your role cannot read any of this entity's account mappings.");
  });

  it("shows a refusal on the role it names", async () => {
    mocks.refuse = refusal({ CASH_BANK: ["You may not change Cash and bank."] });
    mountMappings();
    choose(roleSelect("Cash and bank"), "2");
    await saveMappings();
    expect(container.querySelector('[data-field="CASH_BANK"] [role=alert]')?.textContent).toBe("You may not change Cash and bank.");
  });
});
