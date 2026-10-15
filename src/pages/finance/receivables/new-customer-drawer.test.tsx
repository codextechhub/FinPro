/**
 * Who is asked which branch a new customer belongs to.
 *
 * Corona runs Ikeja, Lekki and Yaba. Mrs Okafor covers Ikeja and Lekki: they
 * must file the Adeyemi family under one of theirs, since the server asks them
 * which. Mr Eze covers the whole school: they may file them under a branch or
 * leave them shared. Mrs Bello, posted to Ikeja alone, and anyone at a school
 * with one branch are not asked.
 *
 * The New customer form for Mrs Bello, under Field Access.
 *
 * The name carries no switch. The billing email, phone and opening balance are
 * open on create: a role that may not read or change them afterwards can still
 * give them here. The address, receivable account and active flag follow their
 * switches. The opening balance, its date and its branch answer to one switch,
 * so a role that may not set it sends none of the three. A refusal names its
 * fields and each message appears beside its control.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: {} as Record<string, unknown>,
  create: vi.fn(),
  createFails: null as unknown,
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
vi.mock("../../../host", async () => (await import("../../../host-fake")).fakeHost({
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }], isLoading: false, isError: false }),
  useReaderReach: () => ({ wholeSchool: true, branchIds: null, covers: () => true }),
  hostBranchLens: () => ({ applies: false, pinnedBranch: 1, branch: 1, choices: [{ id: 1, name: "Ikeja" }], isLoading: false }),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ReceivableAccountPicker: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" data-picker="receivable" onClick={() => onChange("1210")}>receivable-picker</button>,
  PostingDateField: ({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) => (
    <label>{label}<input aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></label>
  ),
}));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useCreateCustomerMutation: () => [(body: unknown) => {
    mocks.create(body);
    return { unwrap: () => (mocks.createFails ? Promise.reject(mocks.createFails) : Promise.resolve({ message: "Customer created." })) };
  }, { isLoading: false }],
}));

import { NewCustomerDrawer, customerBranchChoice } from "./new-customer-drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocks.access = {}; mocks.createFails = null; mocks.create.mockClear();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const RESOURCE = "finance.customer";
const mount = () => act(() => root.render(<NewCustomerDrawer open onOpenChange={() => undefined} entity="HOLYCROSS" />));
const drawer = () => document.body.querySelector("[role=dialog]") as HTMLElement;
const field = (name: string) => drawer().querySelector(`[data-field="${name}"]`) as HTMLElement | null;
const button = (label: string) => Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim().includes(label));
const type = (el: Element | null | undefined, value: string) => act(() => {
  const input = el as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const fill = () => {
  type(drawer().querySelector('input[placeholder="e.g. Acme Ltd"]'), "Okafor Family");
  type(field("billing_email")?.querySelector("input"), "okafor@example.com");
  type(field("billing_phone")?.querySelector("input"), "0803");
};
const submit = async () => { await act(async () => { (button("Create customer") as HTMLElement).click(); }); };

describe("the form with full access", () => {
  it("offers every field and sends them all", async () => {
    mount(); fill();
    type(field("billing_address")?.querySelector("input"), "1 Lekki Road");
    type(drawer().querySelector('input[type="number"]'), "2500");
    await submit();
    expect(mocks.create).toHaveBeenCalledWith({
      entity: "HOLYCROSS", name: "Okafor Family", billing_email: "okafor@example.com", billing_phone: "0803",
      billing_address: "1 Lekki Road", receivable_account: undefined, is_active: true, opening_balance: 250000, opening_date: undefined,
    });
  });
});

describe("hidden fields", () => {
  it("removes the address, receivable account and active flag with their labels, and never sends them", async () => {
    mocks.access = { [RESOURCE]: { hidden: ["billing_address", "receivable_account_id", "receivable_account_code", "receivable_account_name", "is_active"], read_only: ["receivable_account"] } };
    mount(); fill();
    expect(field("billing_address")).toBeNull();
    expect(drawer().textContent).not.toContain("Billing address");
    expect(drawer().textContent).not.toContain("Receivable account");
    expect(drawer().querySelector("[data-picker=receivable]")).toBeNull();
    expect(field("is_active")).toBeNull();
    await submit();
    const body = mocks.create.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    for (const key of ["billing_address", "receivable_account", "is_active"]) expect(body).not.toHaveProperty(key);
    expect(body).toMatchObject({ name: "Okafor Family", billing_email: "okafor@example.com" });
  });

  it("still asks for the billing email and phone when they are open on create", async () => {
    mocks.access = { [RESOURCE]: { hidden: ["billing_email", "billing_phone"], open_on_create: ["billing_email", "billing_phone"] } };
    mount(); fill();
    expect(field("billing_email")).not.toBeNull();
    expect(field("billing_phone")?.getAttribute("data-read-only")).toBeNull();
    await submit();
    expect(mocks.create.mock.calls.at(-1)?.[0]).toMatchObject({ billing_email: "okafor@example.com", billing_phone: "0803" });
  });
});

describe("read-only fields", () => {
  it("greys the address and active flag and leaves them out of the body", async () => {
    mocks.access = { [RESOURCE]: { read_only: ["billing_address", "is_active"] } };
    mount(); fill();
    expect(field("billing_address")?.getAttribute("data-read-only")).toBe("true");
    expect((field("is_active")?.querySelector("input") as HTMLInputElement).closest("fieldset")?.disabled).toBe(true);
    await submit();
    const body = mocks.create.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("billing_address");
    expect(body).not.toHaveProperty("is_active");
  });

  it("drops the opening balance, its date and its branch together when the balance may not be set", async () => {
    mocks.access = { [RESOURCE]: { read_only: ["opening_balance", "opening_balance_naira", "opening_date", "opening_branch"] } };
    mount(); fill();
    expect(field("opening_balance")?.getAttribute("data-read-only")).toBe("true");
    await submit();
    const body = mocks.create.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    for (const key of ["opening_balance", "opening_date", "opening_branch"]) expect(body).not.toHaveProperty(key);
  });

  it("sends the opening balance when it is open on create, though read-only afterwards", async () => {
    mocks.access = { [RESOURCE]: {
      read_only: ["opening_balance", "opening_balance_naira", "opening_date", "opening_branch"],
      open_on_create: ["opening_balance", "opening_balance_naira"],
    } };
    mount(); fill();
    expect(field("opening_balance")?.getAttribute("data-read-only")).toBeNull();
    type(drawer().querySelector('input[type="number"]'), "100");
    await submit();
    expect(mocks.create.mock.calls.at(-1)?.[0]).toMatchObject({ opening_balance: 10000 });
  });

  it("removes the opening block entirely when the balance is hidden", () => {
    mocks.access = { [RESOURCE]: { hidden: ["opening_balance", "opening_balance_naira"] } };
    mount();
    expect(field("opening_balance")).toBeNull();
    expect(drawer().textContent).not.toContain("Opening balance");
  });
});

describe("a refused save", () => {
  it("shows each reason beside the control it names, including a follower of another field", async () => {
    mocks.createFails = { status: 403, data: { error: { code: "field_write_denied", detail: {
      billing_address: ["You may not set the billing address."],
      opening_date: ["You may not set the opening balance."],
    } } } };
    mount(); fill();
    await submit();
    expect(field("billing_address")?.textContent).toContain("You may not set the billing address.");
    expect(field("opening_balance")?.textContent).toContain("You may not set the opening balance.");
  });
});

const IKEJA = { id: 10, name: "Ikeja Branch" };
const LEKKI = { id: 20, name: "Lekki Branch" };
const YABA = { id: 30, name: "Yaba Branch" };
const lens = (over: Record<string, unknown>) => ({
  applies: true, pinnedBranch: null, branch: "all" as const, choices: [IKEJA, LEKKI, YABA], isLoading: false, ...over,
});

describe("customerBranchChoice", () => {
  it("makes a reader covering two branches name one of theirs", () => {
    const c = customerBranchChoice(lens({ choices: [IKEJA, LEKKI] }), false);
    expect(c).toMatchObject({ ask: true, required: true, initial: "" });
    expect(c.choices.map((b) => b.name)).toEqual(["Ikeja Branch", "Lekki Branch"]);
  });

  it("lets a whole-school reader leave the customer shared, starting on their working branch", () => {
    expect(customerBranchChoice(lens({ branch: 20 }), true)).toMatchObject({ ask: true, required: false, initial: "20" });
  });

  it("asks nobody pinned to one branch, nor anyone at a one-branch school", () => {
    expect(customerBranchChoice(lens({ pinnedBranch: 10, choices: [IKEJA] }), false).ask).toBe(false);
    expect(customerBranchChoice(lens({ applies: false, choices: [IKEJA] }), true).ask).toBe(false);
  });
});
