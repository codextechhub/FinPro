/**
 * Amaka's statement heading reads its range in the school's date format, the
 * same way its rows do, never as a raw "2026-10-05".
 *
 * Ada Okafor's customer record under Field Access.
 *
 * The server leaves out whatever the role may not read: the standing figures of
 * the summary (and the summary itself once nothing is left), each open bill's
 * balance, the statement's running balance and whole lists. The drawer shows
 * what arrives, drops the tab, stat card or column that has nothing to show,
 * and keeps the footer actions, which do not depend on the balance. The Contact
 * tab offers each editable value only while it can be read and changed, sends
 * only what may be written, and shows a refusal beside its field.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerDetail } from "@/redux/services/finance/ar-types";

const mocks = vi.hoisted(() => ({
  access: {} as Record<string, unknown>,
  detail: null as unknown,
  update: vi.fn(),
  updateFails: null as unknown,
  receipt: vi.fn(),
  permit: true,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => mocks.permit, hasAnyPermission: () => mocks.permit, hasAllPermissions: () => mocks.permit,
    hasModuleAccess: () => true, fieldAccess: mocks.access,
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveEntity: () => ({ code: "HOLYCROSS", currency: "NGN", entity: { name: "Holy Cross" }, isLoading: false }),
  DocumentEmailAction: () => <button type="button">Send to customer</button>,
}));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetCustomerDetailQuery: () => ({ data: { data: mocks.detail }, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateCustomerMutation: () => [(body: unknown) => {
    mocks.update(body);
    return { unwrap: () => (mocks.updateFails ? Promise.reject(mocks.updateFails) : Promise.resolve({ message: "Customer updated." })) };
  }, { isLoading: false }],
  useRemindCustomerMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("./customer-receipt-modal", () => ({
  CustomerReceiptModal: (props: { owedKobo: number }) => { mocks.receipt(props); return null; },
}));
vi.mock("../inter-branch/move-balance-drawer", () => ({ MoveBalanceDrawer: () => null }));
vi.mock("../inter-branch/use-inter-branch", () => ({
  useInterBranchReader: () => ({ applies: false, reach: { wholeSchool: false }, keys: { transfer: false }, branches: [] }),
}));
vi.mock("./payer-links-panel", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PayerLinksPanel: () => <div>payer-links</div>,
}));

import { CustomerDetailDrawer, customerSections, statementPeriodLabel } from "./customer-detail-drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: (kobo / 100).toFixed(2) });
const DETAIL: CustomerDetail = {
  customer: {
    id: 1, code: "C-001", name: "Ada Okafor", billing_email: "ada@example.com", billing_phone: "0803", billing_address: "1 Lekki Road",
    receivable_account_id: 12, receivable_account_code: "1200", receivable_account_name: "Accounts Receivable",
    opening_balance: 250_000, opening_balance_naira: "2,500.00", source_type: "", source_id: "", is_active: true,
    created_at: "2026-01-01T00:00:00Z", branch_id: 1, _read_only_fields: [],
  },
  summary: { current_balance: money(5_000_000), lifetime_paid: money(1_000_000), open_invoice_count: 1, account_status: "OVERDUE" },
  open_invoices: [{ document_number: "INV-0001", invoice_date: "2026-09-01", due_date: "2026-09-30", total: money(6_000_000), balance: money(5_000_000), status: "OVERDUE" }],
  open_debit_notes: [],
  transactions: [{ date: "2026-09-02", type: "INVOICE", reference: "INV-0001", amount: money(6_000_000), status: "POSTED" }],
  statement: [
    { date: "2026-09-01", description: "Invoice INV-0001", debit: money(6_000_000), credit: money(0), balance: money(6_000_000) },
    { date: "2026-09-05", description: "Receipt RC-0001", debit: money(0), credit: money(1_000_000), balance: money(5_000_000) },
  ],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocks.access = {}; mocks.detail = DETAIL; mocks.updateFails = null; mocks.permit = true;
  mocks.update.mockClear(); mocks.receipt.mockClear();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const mount = () => act(() => root.render(<CustomerDetailDrawer id={1} entity="HOLYCROSS" currency="NGN" onClose={() => undefined} />));
const drawer = () => document.body.querySelector("[role=dialog]") as HTMLElement;
const text = () => drawer()?.textContent ?? "";
const button = (label: string) => Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim().includes(label));
const tabs = () => Array.from(drawer().querySelectorAll("[role=tab], button")).map((b) => b.textContent?.trim()).filter((t) => /^(Open items|Transactions|Statement|Contact|Payers)/.test(t ?? ""));
const headers = () => Array.from(drawer().querySelectorAll("thead th")).map((th) => th.textContent?.trim());
const click = (el: Element | undefined) => act(() => (el as HTMLElement).click());
const withRecord = (patch: Partial<CustomerDetail>, customer: Record<string, unknown> = {}): CustomerDetail => ({
  ...DETAIL, ...patch, customer: { ...DETAIL.customer, ...customer },
});
const without = <T extends object>(source: T, ...keys: string[]) => Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key))) as T;

describe("the record with full access", () => {
  it("shows the standing figures, every tab with its size, and the footer actions", () => {
    mount();
    expect(text()).toContain("Ada Okafor");
    expect(text()).toContain("C-001 · ada@example.com");
    expect(text()).toContain("Current balance");
    expect(text()).toContain("Lifetime paid");
    expect(text()).toContain("Open invoices");
    expect(tabs()).toEqual(["Open items (1)", "Transactions (1)", "Statement (2)", "Contact", "Payers"]);
    expect(button("Record payment")).toBeDefined();
    expect(headers()).toEqual(["Date", "Description", "Debit", "Credit", "Balance"]);
  });
});

describe("the balance hidden", () => {
  beforeEach(() => {
    mocks.access = { "finance.customer": { hidden: ["balance", "current_balance"] } };
    mocks.detail = withRecord({
      summary: without(DETAIL.summary!, "current_balance"),
      open_invoices: DETAIL.open_invoices!.map((row) => without(row, "balance")),
      statement: DETAIL.statement!.map((line) => without(line, "balance")),
    });
  });

  it("leaves out the balance card and keeps the other figures", () => {
    mount();
    expect(text()).not.toContain("Current balance");
    expect(text()).toContain("Lifetime paid");
  });

  it("drops the statement's balance column, opening row and closing balance together", () => {
    mount();
    expect(headers()).toEqual(["Date", "Description", "Debit", "Credit"]);
    expect(text()).not.toContain("Opening balance");
    expect(text()).not.toContain("Closing balance due");
    const first = drawer().querySelector("tbody tr");
    expect(first?.querySelectorAll("td").length).toBe(4);
  });

  it("drops the open bills' balance column", () => {
    mount();
    click(Array.from(drawer().querySelectorAll("button")).find((b) => b.textContent?.startsWith("Open items")));
    expect(headers()).toEqual(["Type", "Reference", "Due", "Total"]);
  });

  it("keeps Record payment, with no prefilled amount, since owing is unknown", () => {
    mount();
    expect(button("Record payment")).toBeDefined();
    expect(button("Run reminders")).toBeDefined();
    expect(mocks.receipt.mock.calls.at(-1)?.[0]).toMatchObject({ owedKobo: 0 });
  });
});

describe("the standing figures", () => {
  it("renders the record, with no stat cards or pill, once the whole summary is dropped", () => {
    mocks.detail = without(DETAIL, "summary");
    mount();
    expect(text()).toContain("Ada Okafor");
    expect(text()).not.toContain("Lifetime paid");
    expect(text()).not.toContain("Overdue");
    expect(tabs()).toContain("Statement (2)");
  });

  it("leaves out only the cards whose figure is missing", () => {
    mocks.detail = withRecord({ summary: { account_status: "OVERDUE", open_invoice_count: 1 } });
    mount();
    expect(text()).not.toContain("Current balance");
    expect(text()).not.toContain("Lifetime paid");
    expect(text()).toContain("Open invoices");
  });
});

describe("the account history lists", () => {
  it("drops a tab whose list is hidden and opens the first that remains", () => {
    mocks.detail = without(DETAIL, "statement", "transactions");
    mount();
    expect(tabs()).toEqual(["Open items (1)", "Contact", "Payers"]);
    expect(headers()).toEqual(["Type", "Reference", "Due", "Total", "Balance"]);
  });

  it("offers either list of open bills under Open items", () => {
    expect(customerSections(without(DETAIL, "open_invoices"), { showPayers: false, showContact: true })).toContain("open");
    expect(customerSections(without(DETAIL, "open_invoices", "open_debit_notes"), { showPayers: false, showContact: true })).not.toContain("open");
  });

  it("shows no tab strip when only the Contact tab is left", () => {
    mocks.access = { "finance.payer_link": { hidden: ["payer"] } };
    mocks.detail = without(DETAIL, "statement", "transactions", "open_invoices", "open_debit_notes");
    mount();
    expect(tabs()).toEqual([]);
    expect(text()).toContain("Billing email");
  });
});

describe("the contact tab", () => {
  const openContact = () => click(Array.from(drawer().querySelectorAll("button")).find((b) => b.textContent?.startsWith("Contact")));
  const field = (name: string) => drawer().querySelector(`[data-field="${name}"]`);
  const input = (name: string) => field(name)?.querySelector("input") as HTMLInputElement;
  const type = (el: HTMLInputElement, value: string) => act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

  it("offers every value and sends them all on save", () => {
    mount(); openContact();
    type(input("billing_phone"), "08099999999");
    click(button("Save changes"));
    expect(mocks.update).toHaveBeenCalledWith({
      entity: "HOLYCROSS", id: 1, name: "Ada Okafor", billing_email: "ada@example.com", billing_phone: "08099999999",
      billing_address: "1 Lekki Road", is_active: true,
    });
    expect(text()).toContain("Receivable a/c");
    expect(text()).toContain("Opening balance");
  });

  it("removes a hidden value and its field, and never sends it", () => {
    mocks.access = { "finance.customer": { hidden: ["billing_email", "receivable_account_code", "receivable_account_name", "opening_balance"] } };
    mocks.detail = withRecord({}, { billing_email: undefined, receivable_account_code: undefined, receivable_account_name: undefined, opening_balance: undefined });
    mocks.detail = { ...(mocks.detail as CustomerDetail), customer: without((mocks.detail as CustomerDetail).customer, "billing_email", "receivable_account_code", "receivable_account_name", "opening_balance", "opening_balance_naira", "receivable_account_id") };
    mount(); openContact();
    expect(field("billing_email")).toBeNull();
    expect(field("billing_phone")).not.toBeNull();
    expect(text()).not.toContain("Receivable a/c");
    expect(text()).not.toContain("Opening balance");
    expect(text()).not.toContain("ada@example.com");
    type(input("billing_phone"), "0811");
    click(button("Save changes"));
    expect(mocks.update.mock.calls.at(-1)?.[0]).not.toHaveProperty("billing_email");
    expect(mocks.update.mock.calls.at(-1)?.[0]).toMatchObject({ billing_phone: "0811" });
  });

  it("greys a read-only value, lists it as locked and leaves it out of the body", () => {
    mocks.detail = withRecord({}, { _read_only_fields: ["billing_email", "is_active"] });
    mount(); openContact();
    expect(field("billing_email")?.getAttribute("data-read-only")).toBe("true");
    expect(input("billing_email").closest("fieldset")?.disabled).toBe(true);
    expect(field("is_active")?.getAttribute("data-read-only")).toBe("true");
    type(input("billing_address"), "2 Yaba Road");
    click(button("Save changes"));
    const body = mocks.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("billing_email");
    expect(body).not.toHaveProperty("is_active");
    expect(body).toMatchObject({ billing_address: "2 Yaba Road", billing_phone: "0803" });
  });

  it("shows a refusal beside the field it names", async () => {
    mocks.updateFails = { status: 403, data: { error: { code: "field_write_denied", detail: { billing_phone: ["You may not change the billing phone."] } } } };
    mount(); openContact();
    type(input("billing_phone"), "0811");
    await act(async () => { (button("Save changes") as HTMLElement).click(); });
    expect(field("billing_phone")?.textContent).toContain("You may not change the billing phone.");
  });

  it("lists only the readable values for a role that cannot change customers", () => {
    mocks.permit = false;
    mocks.access = { "finance.customer": { hidden: ["billing_phone"] } };
    mocks.detail = { ...DETAIL, customer: without(DETAIL.customer, "billing_phone") };
    mount();
    click(Array.from(drawer().querySelectorAll("button")).find((b) => b.textContent?.startsWith("Contact")));
    expect(text()).toContain("Email:");
    expect(text()).toContain("Address:");
    expect(text()).not.toContain("Phone:");
  });
});

const day = (iso: string) => ({ "2026-09-01": "1 Sep 2026", "2026-10-05": "5 Oct 2026" } as Record<string, string>)[iso] ?? iso;

describe("statementPeriodLabel", () => {
  it("reads an open-ended statement as up to its last day", () => {
    expect(statementPeriodLabel("", "2026-10-05", day)).toBe("Up to 5 Oct 2026");
  });

  it("reads a dated range from its first day to its last", () => {
    expect(statementPeriodLabel("2026-09-01", "2026-10-05", day)).toBe("1 Sep 2026 - 5 Oct 2026");
  });
});
