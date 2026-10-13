/**
 * A vendor's contact, banking, category, terms and compliance fields follow
 * Field Access on `procurement.vendor`. Mr. Bello, a storekeeper, may see a
 * vendor's phone but not change it, and may not see its bank details at all:
 *
 *   1. the form has no bank section and no hint that one exists;
 *   2. the phone is shown greyed and is never sent, on edit or on Add;
 *   3. a refused save shows its message under the field it names.
 *
 * The category is read as `category_id` and `category_code` and written as
 * `category`, so it is hidden by the first pair and greyed by the second name.
 * The people at the vendor follow `procurement.vendor_contact`: Mrs Okoro, a
 * clerk, corrects a contact's name and email without sending a phone number or
 * routing she cannot change.
 *
 * The list and the drawer follow the same switches. Mrs Okoro, the storekeeper
 * at Bright Star School, has no switch on a vendor's category, payment terms,
 * KYC status or hold, and may not read the contact people's phone numbers or
 * routing:
 *
 *   1. the list has no Category, Terms or KYC column, no On Hold tab, no KYC
 *      filter, and no summary card for the hold, KYC or terms figures;
 *   2. the filters she cannot see are never sent, because the server refuses a
 *      list filtered by a field it hides;
 *   3. the drawer has no category, terms, KYC, risk or hold, and a contact's
 *      card shows only the details and flags that came back with it;
 *   4. a role with every switch on sees all of it, header over the right cells.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  create: vi.fn(),
  update: vi.fn(),
  vendors: vi.fn(),
  vendor: undefined as unknown,
  summary: {} as Record<string, unknown>,
  exportParams: vi.fn(),
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

vi.mock("@/redux/services/procurement/procurement-api", () => ({
  useCreateVendorMutation: () => [mocks.create, { isLoading: false }],
  useUpdateVendorMutation: () => [mocks.update, { isLoading: false }],
  useGetVendorsQuery: (params: unknown) => {
    mocks.vendors(params);
    return { currentData: ROWS_RESPONSE, isLoading: false, isFetching: false, isError: false, error: undefined, refetch: vi.fn() };
  },
  useGetVendorSummaryQuery: () => ({ data: { data: mocks.summary }, isLoading: false, error: undefined }),
  useGetVendorQuery: (_args: unknown, options: { skip?: boolean }) => ({
    data: options?.skip ? undefined : { data: mocks.vendor }, isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useGetVendorInsightsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useGetVendorInvoicesQuery: () => ({ data: undefined, isLoading: false }),
  useGetPurchaseOrdersQuery: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/redux/services/procurement/procurement-ext-api", () => ({
  useGetContractsQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("../../../host", () => ({
  QuickExportButton: (props: { params: unknown }) => { mocks.exportParams(props.params); return null; },
  hostBranchLens: undefined,
}));
vi.mock("../pickers", () => ({ CategoryPicker: () => null }));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AccountPicker: () => null,
  TaxCodePicker: () => null,
  DetailDrawer: ({ children, title, description, open }: { children: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; open: boolean }) => (
    open ? <div data-drawer><h2>{title}</h2><p data-description>{description}</p>{children}</div> : null
  ),
}));
vi.mock("../../../lib/display-prefs", () => ({
  useDates: () => ({ today: () => "2026-10-06", day: (v: string) => v, dateTime: (v: string) => v }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MemoryRouter } from "react-router";
import { VendorForm, VendorsTab } from "./vendors-tab";
import type { Vendor } from "@/redux/services/procurement/procurement-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STOREKEEPER = {
  "procurement.vendor": {
    hidden: ["bank_account_name", "bank_account_number", "bank_code", "bank_name"],
    read_only: ["phone"],
    open_on_create: [],
  },
};

/** Ade Stationers as the storekeeper receives it: no bank keys, phone read-only. */
const ADE: Vendor = {
  id: 4, code: "ADE", name: "Ade Stationers", category_id: null, category_code: null,
  email: "sales@ade.test", phone: "08030000000", address: "2 Allen Avenue, Ikeja", tax_id: "TIN-4",
  payment_terms: "NET_30", kyc_status: "VERIFIED", risk: "LOW", on_hold: false, is_active: true,
  contacts: [], _read_only_fields: ["phone"],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.fieldAccess = STOREKEEPER;
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.vendors.mockReset();
  mocks.exportParams.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const field = (name: string) => document.body.querySelector<HTMLFieldSetElement>(`fieldset[data-field=${name}]`);
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("VendorForm under Field Access", () => {
  it("leaves out the bank section and greys the phone on edit", async () => {
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor updated." }) });
    act(() => root.render(<VendorForm entity="COD" initial={ADE} canManage={false} onClose={() => undefined} />));

    expect(document.body.textContent).not.toContain("Bank details");
    expect(field("bank_account_number")).toBeNull();
    expect(field("phone")!.disabled).toBe(true);
    expect(field("email")!.disabled).toBe(false);

    act(() => type(field("email")!.querySelector("input")!, "orders@ade.test"));
    await act(async () => { button("Save Changes").click(); });

    expect(mocks.update).toHaveBeenCalledTimes(1);
    const body = mocks.update.mock.calls[0][0];
    expect(body).toMatchObject({ id: 4, email: "orders@ade.test" });
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("bank_account_number");
  });

  it("never sends a read-only or hidden field from the Add form", async () => {
    mocks.create.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor created." }) });
    act(() => root.render(<VendorForm entity="COD" canManage={false} onClose={() => undefined} />));

    expect(document.body.textContent).not.toContain("Bank details");
    expect(field("phone")!.disabled).toBe(true);

    const company = [...document.body.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Company name"))!.querySelector("input")!;
    act(() => type(company, "Bright Office Supplies"));
    await act(async () => { button("Create Vendor").click(); });

    const body = mocks.create.mock.calls[0][0];
    expect(body).toMatchObject({ name: "Bright Office Supplies", email: "" });
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("bank_account_number");
    expect(body).not.toHaveProperty("bank_name");
  });

  it("shows a field_write_denied refusal under the field it names", async () => {
    mocks.update.mockReturnValue({
      unwrap: () => Promise.reject({
        status: 403,
        data: {
          success: false,
          message: "You do not have permission to change: email.",
          error: { code: "field_write_denied", detail: { email: ["You do not have permission to change this field."] } },
        },
      }),
    });
    act(() => root.render(<VendorForm entity="COD" initial={ADE} canManage={false} onClose={() => undefined} />));
    act(() => type(field("email")!.querySelector("input")!, "orders@ade.test"));
    await act(async () => { button("Save Changes").click(); });

    expect(field("email")!.querySelector("[role=alert]")?.textContent).toBe("You do not have permission to change this field.");
    expect(field("phone")!.querySelector("[role=alert]")).toBeNull();
  });
});

const VENDOR_KEY = "procurement.vendor";
const CONTACT_KEY = "procurement.vendor_contact";
const ALL_CONTACT_FIELDS = ["name", "email", "phone", "is_primary", "receives_rfqs", "receives_purchase_orders", "is_active"];

const NGOZI = { id: 11, name: "Ngozi Eze", email: "ngozi@ade.test", phone: "08031112222", is_primary: true, receives_rfqs: true, receives_purchase_orders: true, is_active: true };
const TUNDE = { id: 12, name: "Tunde Bello", email: "tunde@ade.test", phone: "08033334444", is_primary: false, receives_rfqs: true, receives_purchase_orders: false, is_active: true };
/** Ade Stationers with two contact people, every field readable. */
const ADE_WITH_PEOPLE: Vendor = { ...ADE, category_id: 3, category_code: "STAT", contacts: [NGOZI, TUNDE], _read_only_fields: [] };

const rows = () => [...document.body.querySelectorAll<HTMLElement>("[data-contact-row]")];
const rowInput = (row: HTMLElement, label: string) => row.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

describe("VendorForm category and terms under Field Access", () => {
  it("leaves out a hidden category and sends neither it nor a hidden term", async () => {
    mocks.fieldAccess = {
      [VENDOR_KEY]: { hidden: ["category_id", "category_code", "payment_terms"], read_only: ["category", "payment_terms"], open_on_create: [] },
    };
    mocks.create.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor created." }) });
    act(() => root.render(<VendorForm entity="COD" canManage={false} onClose={() => undefined} />));

    expect(field("category")).toBeNull();
    expect(field("payment_terms")).toBeNull();
    expect(document.body.textContent).not.toContain("Payment terms");

    const company = [...document.body.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Company name"))!.querySelector("input")!;
    act(() => type(company, "Bright Office Supplies"));
    await act(async () => { button("Create Vendor").click(); });

    const body = mocks.create.mock.calls[0][0];
    expect(body).toMatchObject({ name: "Bright Office Supplies" });
    expect(body).not.toHaveProperty("category");
    expect(body).not.toHaveProperty("payment_terms");
  });

  it("greys a read-only category and term on edit and never sends them", async () => {
    mocks.fieldAccess = { [VENDOR_KEY]: { read_only: ["category", "payment_terms"], open_on_create: [] } };
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor updated." }) });
    const vendor: Vendor = { ...ADE, category_id: 3, category_code: "STAT", _read_only_fields: ["category", "payment_terms"] };
    act(() => root.render(<VendorForm entity="COD" initial={vendor} canManage={false} onClose={() => undefined} />));

    expect(field("category")!.disabled).toBe(true);
    expect(field("payment_terms")!.disabled).toBe(true);

    act(() => type(field("email")!.querySelector("input")!, "orders@ade.test"));
    await act(async () => { button("Save Changes").click(); });

    const body = mocks.update.mock.calls[0][0];
    expect(body).toMatchObject({ id: 4, email: "orders@ade.test" });
    expect(body).not.toHaveProperty("category");
    expect(body).not.toHaveProperty("payment_terms");
  });

  it("offers a writable category and term and sends a changed term", async () => {
    mocks.fieldAccess = {};
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor updated." }) });
    const vendor: Vendor = { ...ADE, category_id: 3, category_code: "STAT", _read_only_fields: [] };
    act(() => root.render(<VendorForm entity="COD" initial={vendor} canManage={false} onClose={() => undefined} />));

    expect(field("category")!.disabled).toBe(false);
    const terms = field("payment_terms")!.querySelector("select")!;
    expect(terms.disabled).toBe(false);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(terms, "NET_60");
      terms.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { button("Save Changes").click(); });

    expect(mocks.update.mock.calls[0][0]).toMatchObject({ id: 4, payment_terms: "NET_60" });
  });
});

describe("VendorForm compliance under Field Access", () => {
  it("leaves out a hidden KYC status and a hidden hold, and keeps the risk", () => {
    mocks.fieldAccess = { [VENDOR_KEY]: { hidden: ["kyc_status", "on_hold"], read_only: ["kyc_status", "on_hold"], open_on_create: [] } };
    const vendor: Vendor = { ...ADE, risk: "LOW", _read_only_fields: ["kyc_status", "on_hold"] };
    delete (vendor as Partial<Vendor>).kyc_status;
    delete (vendor as Partial<Vendor>).on_hold;
    act(() => root.render(<VendorForm entity="COD" initial={vendor} canManage onClose={() => undefined} />));

    expect(field("kyc_status")).toBeNull();
    expect(field("on_hold")).toBeNull();
    expect(field("risk")!.disabled).toBe(false);
    expect(document.body.textContent).not.toContain("KYC status");
    expect(document.body.textContent).not.toContain("On hold");
  });

  it("greys a read-only risk and sends only what the role may change", async () => {
    mocks.fieldAccess = { [VENDOR_KEY]: { read_only: ["risk"], open_on_create: [] } };
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor updated." }) });
    const vendor: Vendor = { ...ADE, _read_only_fields: ["risk"] };
    act(() => root.render(<VendorForm entity="COD" initial={vendor} canManage onClose={() => undefined} />));

    expect(field("risk")!.disabled).toBe(true);
    const holdBox = field("on_hold")!.querySelector("input")!;
    act(() => holdBox.click());
    await act(async () => { button("Save Changes").click(); });

    const body = mocks.update.mock.calls[0][0];
    expect(body).toMatchObject({ id: 4, on_hold: true });
    expect(body).not.toHaveProperty("risk");
  });
});

describe("VendorForm contact people under Field Access", () => {
  it("shows no list when the vendor came without contacts", () => {
    mocks.fieldAccess = {};
    act(() => root.render(<VendorForm entity="COD" initial={{ ...ADE, contacts: undefined, _read_only_fields: [] }} canManage={false} onClose={() => undefined} />));
    expect(document.body.querySelector("[data-field=contacts]")).toBeNull();
  });

  it("sends the clerk's corrected email with the id and nothing she cannot change", async () => {
    mocks.fieldAccess = { [CONTACT_KEY]: { read_only: ["phone", "is_primary", "receives_rfqs", "receives_purchase_orders", "is_active"], open_on_create: [] } };
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor updated." }) });
    act(() => root.render(<VendorForm entity="COD" initial={ADE_WITH_PEOPLE} canManage={false} onClose={() => undefined} />));

    expect(rows()).toHaveLength(2);
    const first = rows()[0];
    expect(first.querySelector<HTMLFieldSetElement>("fieldset[data-field=phone]")!.disabled).toBe(true);
    expect(first.querySelector<HTMLFieldSetElement>("fieldset[data-field=receives_rfqs]")!.disabled).toBe(true);
    expect(first.querySelector<HTMLFieldSetElement>("fieldset[data-field=email]")!.disabled).toBe(false);

    act(() => type(rowInput(first, "Contact email"), "ngozi.eze@ade.test"));
    await act(async () => { button("Save Changes").click(); });

    expect(mocks.update.mock.calls[0][0].contacts).toEqual([
      { id: 11, name: "Ngozi Eze", email: "ngozi.eze@ade.test" },
      { id: 12, name: "Tunde Bello", email: "tunde@ade.test" },
    ]);
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("email");
  });

  it("leaves out the details and flags a role may not read, per row", () => {
    mocks.fieldAccess = { [CONTACT_KEY]: { hidden: ["phone", "receives_purchase_orders"], read_only: ["phone", "receives_purchase_orders"], open_on_create: [] } };
    const people = [NGOZI, TUNDE].map(({ phone: _phone, receives_purchase_orders: _orders, ...rest }) => { void [_phone, _orders]; return rest; });
    act(() => root.render(<VendorForm entity="COD" initial={{ ...ADE, contacts: people, _read_only_fields: [] }} canManage={false} onClose={() => undefined} />));

    const first = rows()[0];
    expect(first.querySelector("fieldset[data-field=phone]")).toBeNull();
    expect(first.querySelector("fieldset[data-field=receives_purchase_orders]")).toBeNull();
    expect(first.querySelector("fieldset[data-field=receives_rfqs]")).not.toBeNull();
    expect(first.textContent).not.toContain("Receives purchase orders");
  });

  it("offers neither Add contact nor Remove when the email is read-only", async () => {
    mocks.fieldAccess = { [CONTACT_KEY]: { read_only: ["email"], open_on_create: [] } };
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor updated." }) });
    act(() => root.render(<VendorForm entity="COD" initial={ADE_WITH_PEOPLE} canManage={false} onClose={() => undefined} />));

    expect(button("Add contact")).toBeUndefined();
    expect(document.body.querySelector("button[aria-label='Remove contact']")).toBeNull();

    act(() => type(rowInput(rows()[1], "Contact name"), "Tunde B."));
    await act(async () => { button("Save Changes").click(); });
    expect(mocks.update.mock.calls[0][0].contacts).toEqual([
      { id: 11, name: "Ngozi Eze", phone: "08031112222", is_primary: true, receives_rfqs: true, receives_purchase_orders: true, is_active: true },
      { id: 12, name: "Tunde B.", phone: "08033334444", is_primary: false, receives_rfqs: true, receives_purchase_orders: false, is_active: true },
    ]);
  });

  it("sends no contacts at all when the role may change none of their fields", async () => {
    mocks.fieldAccess = { [CONTACT_KEY]: { read_only: ALL_CONTACT_FIELDS, open_on_create: [] } };
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor updated." }) });
    act(() => root.render(<VendorForm entity="COD" initial={ADE_WITH_PEOPLE} canManage={false} onClose={() => undefined} />));

    expect(button("Add contact")).toBeUndefined();
    act(() => type(field("email")!.querySelector("input")!, "orders@ade.test"));
    await act(async () => { button("Save Changes").click(); });
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("contacts");
  });

  it("removes a person with the remove control and sends the shorter list", async () => {
    mocks.fieldAccess = {};
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor updated." }) });
    act(() => root.render(<VendorForm entity="COD" initial={ADE_WITH_PEOPLE} canManage={false} onClose={() => undefined} />));

    act(() => rows()[1].querySelector<HTMLButtonElement>("button[aria-label='Remove contact']")!.click());
    await act(async () => { button("Save Changes").click(); });
    expect(mocks.update.mock.calls[0][0].contacts).toEqual([NGOZI]);
  });

  it("offers no list on Add to a role that may not write the email, and a list to one that may", async () => {
    mocks.fieldAccess = { [CONTACT_KEY]: { hidden: ["email"], read_only: ["email"], open_on_create: [] } };
    act(() => root.render(<VendorForm entity="COD" canManage={false} onClose={() => undefined} />));
    expect(document.body.querySelector("[data-field=contacts]")).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);

    mocks.fieldAccess = {};
    mocks.create.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor created." }) });
    act(() => root.render(<VendorForm entity="COD" canManage={false} onClose={() => undefined} />));
    act(() => button("Add contact").click());
    const company = [...document.body.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Company name"))!.querySelector("input")!;
    act(() => type(company, "Bright Office Supplies"));
    act(() => type(rowInput(rows()[0], "Contact email"), "kemi@bright.test"));
    await act(async () => { button("Create Vendor").click(); });

    expect(mocks.create.mock.calls[0][0].contacts).toEqual([
      { name: "", email: "kemi@bright.test", phone: "", is_primary: true, receives_rfqs: true, receives_purchase_orders: false, is_active: true },
    ]);
  });

  it("shows a refused contacts save beside the list", async () => {
    mocks.fieldAccess = {};
    mocks.update.mockReturnValue({
      unwrap: () => Promise.reject({
        status: 403,
        data: { success: false, message: "refused", error: { code: "field_write_denied", detail: { phone: ["You do not have permission to change this field."] } } },
      }),
    });
    act(() => root.render(<VendorForm entity="COD" initial={ADE_WITH_PEOPLE} canManage={false} onClose={() => undefined} />));
    act(() => type(rowInput(rows()[0], "Contact name"), "Ngozi E."));
    await act(async () => { button("Save Changes").click(); });

    expect(document.body.querySelector("[data-field=contacts] [role=alert]")?.textContent).toBe("You do not have permission to change this field.");
  });
});

/* ---- the vendor list and drawer ---- */

const ADE_FULL: Vendor = {
  id: 4, code: "ADE", name: "Ade Stationers", category_id: 3, category_code: "STATIONERY",
  email: "sales@ade.test", phone: "08030000000", address: "2 Allen Avenue, Ikeja", tax_id: "TIN-4",
  bank_name: "GT Bank", bank_account_number: "0123456789", bank_account_name: "Ade Stationers Ltd",
  payment_terms: "NET_30", kyc_status: "VERIFIED", risk: "LOW", on_hold: false, is_active: true, active_po_count: 2,
  contacts: [
    { id: 11, name: "Ngozi Eze", email: "ngozi@ade.test", phone: "08031112222", is_primary: true, receives_rfqs: true, receives_purchase_orders: true, is_active: true },
  ],
  _read_only_fields: [],
};
const { category_id: _c1, category_code: _c2, payment_terms: _t, kyc_status: _k, risk: _r, on_hold: _h, ...ADE_BARE } = ADE_FULL;
void [_c1, _c2, _t, _k, _r, _h];
/** What Mrs Okoro receives: no category, terms, KYC, risk or hold, and contacts without phone or routing. */
const ADE_MRS_OKORO: Vendor = {
  ...ADE_BARE,
  contacts: [{ id: 11, name: "Ngozi Eze", email: "ngozi@ade.test" }],
};

let ROWS_RESPONSE: { data: Vendor[]; pagination: { currentPage: number; totalPages: number } };

const FULL_SUMMARY = { active: 7, inactive: 1, on_hold: 2, kyc_pending: 3, total_spend_ytd: 1_200_000, average_payment_days: 30 };
const OKORO_SUMMARY = { active: 9, inactive: 1, total_spend_ytd: 1_200_000 };

const OKORO_MAP = {
  "procurement.vendor": {
    hidden: ["category_id", "category_code", "payment_terms", "kyc_status", "risk", "on_hold"],
    read_only: ["category", "payment_terms", "kyc_status", "risk", "on_hold"],
    open_on_create: [],
  },
  "procurement.vendor_contact": {
    hidden: ["phone", "is_primary", "receives_rfqs", "receives_purchase_orders", "is_active"],
    read_only: ["phone", "is_primary", "receives_rfqs", "receives_purchase_orders", "is_active"],
    open_on_create: [],
  },
};

function renderList() {
  act(() => root.render(<MemoryRouter><VendorsTab entity="COD" currency="NGN" /></MemoryRouter>));
}
const headers = () => [...container.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
const firstRowCells = () => [...container.querySelectorAll("tbody tr")[0].querySelectorAll("td")];
const tabLabels = () => [...container.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter(Boolean);
const lastParams = () => mocks.vendors.mock.calls.at(-1)![0] as Record<string, unknown>;

function openDrawer() {
  act(() => { (container.querySelectorAll("tbody tr")[0] as HTMLElement).click(); });
}
const drawerTab = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>("[data-drawer] button")].find((b) => b.textContent?.trim() === label);
const drawer = () => document.body.querySelector("[data-drawer]")!;

describe("the vendor list under a role with every switch on", () => {
  beforeEach(() => {
    mocks.fieldAccess = {};
    mocks.summary = FULL_SUMMARY;
    mocks.vendor = ADE_FULL;
    ROWS_RESPONSE = { data: [ADE_FULL], pagination: { currentPage: 1, totalPages: 1 } };
  });

  it("shows every column with each header over its own cell", () => {
    renderList();
    expect(headers()).toEqual(["Vendor", "Category", "Terms", "Active POs", "KYC", "Status", ""]);
    const cells = firstRowCells();
    expect(cells).toHaveLength(headers().length);
    expect(cells[0].textContent).toContain("Ade Stationers");
    expect(cells[1].textContent).toBe("STATIONERY");
    expect(cells[2].textContent).toBe("Net 30 days");
    expect(cells[3].textContent).toBe("2");
  });

  it("offers the On Hold tab and the KYC filter, and sends the filters it is given", () => {
    renderList();
    expect(tabLabels()).toContain("On Hold");
    expect(container.textContent).toContain("All KYC states");
    act(() => { [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Active")!.click(); });
    expect(lastParams()).toMatchObject({ is_active: true, on_hold: false });
    expect(mocks.exportParams.mock.calls.at(-1)![0]).toMatchObject({ is_active: true, on_hold: false });
  });

  it("shows all four summary cards", () => {
    renderList();
    expect(container.textContent).toContain("Average Terms");
    expect(container.textContent).toContain("3 KYC pending");
    expect(container.textContent).toContain("On Hold");
  });
});

describe("the vendor list under Mrs Okoro", () => {
  beforeEach(() => {
    mocks.fieldAccess = OKORO_MAP;
    mocks.summary = OKORO_SUMMARY;
    mocks.vendor = ADE_MRS_OKORO;
    ROWS_RESPONSE = { data: [ADE_MRS_OKORO], pagination: { currentPage: 1, totalPages: 1 } };
  });

  it("has no Category, Terms or KYC column and the cells line up with the headers", () => {
    renderList();
    expect(headers()).toEqual(["Vendor", "Active POs", "Status", ""]);
    const cells = firstRowCells();
    expect(cells).toHaveLength(4);
    expect(cells[0].textContent).toContain("Ade Stationers");
    expect(cells[1].textContent).toBe("2");
    expect(container.textContent).not.toContain("Uncategorised");
    expect(container.textContent).not.toContain("STATIONERY");
  });

  it("has no On Hold tab, no KYC filter, and sends no filter on a hidden field", () => {
    renderList();
    expect(tabLabels()).not.toContain("On Hold");
    expect(container.textContent).not.toContain("All KYC states");
    act(() => { [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Active")!.click(); });
    const params = lastParams();
    expect(params).toMatchObject({ is_active: true });
    expect(params).not.toHaveProperty("on_hold");
    expect(params).not.toHaveProperty("kyc_status");
    expect(mocks.exportParams.mock.calls.at(-1)![0]).not.toHaveProperty("on_hold");
    expect(mocks.exportParams.mock.calls.at(-1)![0]).not.toHaveProperty("kyc_status");
  });

  it("drops the hold, KYC and terms cards the server left out", () => {
    renderList();
    expect(container.textContent).toContain("Active Vendors");
    expect(container.textContent).toContain("Total Spend YTD");
    expect(container.textContent).not.toContain("Average Terms");
    expect(container.textContent).not.toContain("KYC pending");
    expect(container.textContent).not.toContain("On Hold");
  });

  it("keeps the KYC card when only the terms figure is withheld", () => {
    mocks.summary = { ...OKORO_SUMMARY, kyc_pending: 3 };
    renderList();
    expect(container.textContent).toContain("KYC Pending");
    expect(container.textContent).not.toContain("Average Terms");
  });

  it("shows a vendor drawer without category, terms, KYC, risk or hold", () => {
    renderList();
    openDrawer();
    expect(drawer().querySelector("[data-description]")!.textContent).toBe("ADE");
    expect(drawer().textContent).not.toContain("Category");
    expect(drawer().textContent).not.toContain("Payment terms");
    expect(drawer().textContent).toContain("Vendor code");
    expect(drawer().textContent).toContain("Payable account");

    act(() => drawerTab("Bank & Compliance")!.click());
    expect(drawer().textContent).toContain("Compliance status");
    expect(drawer().textContent).not.toContain("KYC status");
    expect(drawer().textContent).not.toContain("Risk level");
    expect(drawer().textContent).not.toContain("Purchasing status");
    expect(drawer().textContent).toContain("Account status");
    expect(drawer().textContent).not.toContain("Verification documents");
  });

  it("shows a contact card with only the details and flags that came back", () => {
    renderList();
    openDrawer();
    act(() => drawerTab("Contacts")!.click());
    const card = drawer().querySelector("[data-contact-card]")!;
    expect(card.textContent).toContain("Ngozi Eze");
    expect(card.textContent).toContain("ngozi@ade.test");
    expect(card.textContent).not.toContain("Phone");
    expect(card.textContent).not.toContain("08031112222");
    expect(card.textContent).not.toContain("Receives RFQs");
    expect(card.textContent).not.toContain("Receives purchase orders");
    expect(card.textContent).not.toContain("Active");
  });
});

describe("the vendor drawer under a role with every switch on", () => {
  beforeEach(() => {
    mocks.fieldAccess = {};
    mocks.summary = FULL_SUMMARY;
    mocks.vendor = ADE_FULL;
    ROWS_RESPONSE = { data: [ADE_FULL], pagination: { currentPage: 1, totalPages: 1 } };
  });

  it("shows category, terms, compliance and the contact's flags", () => {
    renderList();
    openDrawer();
    expect(drawer().querySelector("[data-description]")!.textContent).toBe("ADE · STATIONERY");
    expect(drawer().textContent).toContain("Category");
    expect(drawer().textContent).toContain("Payment terms");

    act(() => drawerTab("Bank & Compliance")!.click());
    expect(drawer().textContent).toContain("KYC status");
    expect(drawer().textContent).toContain("Risk level");
    expect(drawer().textContent).toContain("Purchasing status");

    act(() => drawerTab("Contacts")!.click());
    expect(drawer().textContent).toContain("08031112222");
    expect(drawer().textContent).toContain("Receives RFQs");
    expect(drawer().textContent).toContain("Receives purchase orders");
  });

  it("has no Contacts tab when no contact detail and no vendor contact field came back", () => {
    const { email: _e, phone: _p, address: _a, contacts: _c, ...bare } = ADE_FULL;
    void [_e, _p, _a, _c];
    mocks.vendor = bare;
    mocks.fieldAccess = { "procurement.vendor": { hidden: ["email", "phone", "address"], read_only: ["email", "phone", "address"], open_on_create: [] } };
    renderList();
    openDrawer();
    expect(drawerTab("Contacts")).toBeUndefined();
    expect(drawerTab("Profile")).toBeDefined();
  });
});
