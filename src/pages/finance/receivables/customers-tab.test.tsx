/**
 * Mr Okafor pays for Ada at Ikeja and Chidi at Lekki. His row on the customer
 * list is marked as a payer with the count the reader can see.
 *
 * The customers list for Mrs Bello, the bursar, under Field Access.
 *
 * A customer's code and name carry no switch. The contact column follows the
 * billing email and phone, the balance column and the receivable and in-credit
 * cards follow the balance, and the status column, the overdue card and the
 * status tabs follow the account status and the active flag. A tab filters on
 * the account status, so it is never offered, and its filter never sent, once
 * that status is hidden; the Inactive tab needs the active flag as well.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer, CustomerSummary } from "@/redux/services/finance/ar-types";

const mocks = vi.hoisted(() => ({
  access: {} as Record<string, unknown>,
  rows: [] as unknown[],
  summary: null as unknown,
  list: vi.fn(),
  exported: vi.fn(),
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
  QuickExportButton: (props: unknown) => { mocks.exported(props); return null; },
}));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetCustomersQuery: (args: unknown) => (mocks.list(args), {
    data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useGetCustomerSummaryQuery: () => ({ data: { data: mocks.summary } }),
}));
vi.mock("./new-customer-drawer", () => ({ NewCustomerDrawer: () => null }));
vi.mock("./opening-import-drawer", () => ({ OpeningImportDrawer: () => null }));
vi.mock("./customer-detail-drawer", () => ({ CustomerDetailDrawer: () => null }));

import { CustomersTab, payerLabel, statusOf, statusTabsFor } from "./customers-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADA: Customer = {
  id: 1, code: "C-001", name: "Ada Okafor", billing_email: "ada@example.com", billing_phone: "0803", billing_address: "1 Lekki Road",
  receivable_account_id: 12, receivable_account_code: "1200", receivable_account_name: "Accounts Receivable",
  opening_balance: 0, opening_balance_naira: "0.00", source_type: "", source_id: "", is_active: true,
  created_at: "2026-01-01T00:00:00Z", balance: 5_000_000, balance_naira: "50,000.00", account_status: "OVERDUE", pays_for_count: 2,
};
const EMEKA: Customer = { ...ADA, id: 2, code: "C-002", name: "Emeka Eze", balance: -100_000, account_status: "CREDIT", pays_for_count: 0 };
const SUMMARY: CustomerSummary = {
  total: 2, receivable: { kobo: 5_000_000, naira: "50,000.00" }, on_credit: 1, overdue: 1,
  status_counts: { ACTIVE: 0, OVERDUE: 1, CREDIT: 1, INACTIVE: 0 },
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocks.access = {}; mocks.rows = [ADA, EMEKA]; mocks.summary = SUMMARY;
  mocks.list.mockReset(); mocks.exported.mockReset();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const RESOURCE = "finance.customer";

/** Hides names for the role and sends the rows and totals the server would send it. */
const hide = (...names: string[]) => {
  mocks.access = { [RESOURCE]: { hidden: names } };
  const strip = <T extends object>(row: T) => Object.fromEntries(Object.entries(row).filter(([key]) => !names.includes(key)));
  mocks.rows = [ADA, EMEKA].map(strip);
  mocks.summary = strip(SUMMARY);
};
const mount = () => act(() => root.render(<MemoryRouter><CustomersTab entity="HOLYCROSS" currency="NGN" /></MemoryRouter>));
const headers = () => Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
const aligned = () => Array.from(container.querySelectorAll("tbody tr")).every((tr) => tr.querySelectorAll("td").length === container.querySelectorAll("thead th").length);
const tabLabels = () => Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim()).filter((t) => /^(All|Active|Overdue|In credit|Inactive)/.test(t ?? ""));
const cards = () => ["Total customers", "Total receivable", "Customers in credit", "Overdue accounts"].filter((label) => container.textContent?.includes(label));

describe("the customers list with full access", () => {
  it("shows every column, card and status tab, with the counts", () => {
    mount();
    expect(headers()).toEqual(["Code", "Customer", "Contact", "Balance", "Status"]);
    expect(aligned()).toBe(true);
    expect(cards()).toEqual(["Total customers", "Total receivable", "Customers in credit", "Overdue accounts"]);
    expect(tabLabels()).toEqual(["All2", "Active0", "Overdue1", "In credit1", "Inactive0"]);
    expect(container.textContent).toContain("Pays for 2");
  });

  it("sends the status filter of the tab picked, and exports with it", () => {
    mount();
    act(() => (Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Overdue")) as HTMLElement).click());
    expect(mocks.list.mock.calls.at(-1)?.[0]).toMatchObject({ status: "OVERDUE" });
    expect(mocks.exported.mock.calls.at(-1)?.[0]).toMatchObject({ params: { status: "OVERDUE" } });
  });
});

describe("the contact column", () => {
  it("goes when both the billing email and the phone are hidden", () => {
    hide("billing_email", "billing_phone");
    mount();
    expect(headers()).toEqual(["Code", "Customer", "Balance", "Status"]);
    expect(aligned()).toBe(true);
    expect(container.textContent).not.toContain("ada@example.com");
  });

  it("falls back to the phone when only the email is hidden", () => {
    hide("billing_email");
    mount();
    expect(headers()).toContain("Contact");
    expect(container.textContent).toContain("0803");
    expect(container.textContent).not.toContain("ada@example.com");
  });
});

describe("the balance", () => {
  it("removes the column and the receivable and in-credit cards together", () => {
    hide("balance", "balance_naira", "receivable", "on_credit");
    mount();
    expect(headers()).toEqual(["Code", "Customer", "Contact", "Status"]);
    expect(aligned()).toBe(true);
    expect(cards()).toEqual(["Total customers", "Overdue accounts"]);
  });

  it("keeps the header over the balance cells, right aligned, while it is readable", () => {
    mount();
    const balanceHeader = Array.from(container.querySelectorAll("thead th")).find((th) => th.textContent === "Balance");
    expect(balanceHeader?.className).toContain("text-right");
    expect(container.querySelector("tbody tr td:nth-child(4)")?.textContent).toContain("50,000.00");
  });
});

describe("the account status", () => {
  it("removes the tabs, the overdue card and the filter, and the status column keeps the active flag", () => {
    hide("account_status", "overdue", "status_counts");
    mount();
    expect(tabLabels()).toEqual([]);
    expect(cards()).not.toContain("Overdue accounts");
    expect(headers()).toContain("Status");
    expect(container.querySelector("tbody tr td:last-child")?.textContent).toBe("Active");
    expect(mocks.list.mock.calls.every(([args]) => !("status" in (args as object)))).toBe(true);
  });

  it("removes the status column when the active flag is hidden as well", () => {
    hide("account_status", "overdue", "status_counts", "is_active");
    mount();
    expect(headers()).toEqual(["Code", "Customer", "Contact", "Balance"]);
    expect(aligned()).toBe(true);
  });
});

describe("the active flag", () => {
  it("drops the Inactive tab and the counts, and does not read a missing flag as inactive", () => {
    hide("is_active", "status_counts");
    mount();
    expect(tabLabels()).toEqual(["All2", "Active", "Overdue", "In credit"]);
    expect(container.querySelector("tbody tr td:last-child")?.textContent).toBe("Overdue");
    expect(container.textContent).not.toContain("Inactive");
  });
});

describe("the payer mark", () => {
  it("goes with the count of customers a payer pays for", () => {
    hide("pays_for_count");
    mount();
    expect(container.textContent).not.toContain("Pays for");
    expect(payerLabel(undefined)).toBeNull();
  });
});

describe("statusOf and statusTabsFor", () => {
  it("lets the readable one of the two answer", () => {
    expect(statusOf({ ...ADA, is_active: false })).toBe("INACTIVE");
    expect(statusOf({ ...ADA, is_active: undefined })).toBe("OVERDUE");
    expect(statusOf({ ...ADA, account_status: undefined })).toBe("ACTIVE");
    expect(statusOf({ ...ADA, account_status: undefined, is_active: undefined })).toBeNull();
  });

  it("offers no tabs without the account status and no Inactive tab without the active flag", () => {
    expect(statusTabsFor(false, true)).toEqual([]);
    expect(statusTabsFor(true, false).map((t) => t.key)).toEqual(["", "ACTIVE", "OVERDUE", "CREDIT"]);
    expect(statusTabsFor(true, true)).toHaveLength(5);
  });
});

describe("a payer's mark on the customer list", () => {
  it("counts the customers the account pays for", () => {
    expect(payerLabel(2)).toBe("Pays for 2");
    expect(payerLabel(1)).toBe("Pays for 1");
  });

  it("is absent for a customer who pays for nobody, and from an older server", () => {
    expect(payerLabel(0)).toBeNull();
    expect(payerLabel(undefined)).toBeNull();
  });
});
