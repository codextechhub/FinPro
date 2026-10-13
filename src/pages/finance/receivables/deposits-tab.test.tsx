/**
 * A deposit reads with one word per state wherever it appears.
 *
 * Tunde's caution deposit was returned when he left. The status filter, the
 * row pill and the drawer all call that "Returned", after the Return deposits
 * action that put it there, so filtering on Returned finds rows that say so.
 *
 * Field Access: every column and filter is a read-only `finance.deposit` field.
 * A role that may not read one sees the list without it and its filter, and the
 * filter is never sent; a role that may not read the customer is not offered
 * Return deposits, which names the customer by code.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerDeposit } from "@/redux/services/finance/fees-types";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  access: {} as Record<string, unknown>,
  permit: false,
  query: vi.fn(),
  release: vi.fn(),
  forfeit: vi.fn(),
  settings: undefined as unknown,
  mutation: () => [() => ({ unwrap: async () => ({}) }), { isLoading: false }],
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => mocks.permit,
    hasAnyPermission: () => mocks.permit,
    hasAllPermissions: () => mocks.permit,
    hasModuleAccess: () => true,
    fieldAccess: mocks.access,
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false, isError: false }),
  useReaderReach: () => ({ wholeSchool: true, branchIds: null, covers: () => true }),
  hostBranchLens: () => ({ applies: true, pinnedBranch: null, branch: "all", choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false }),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CustomerPicker: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" onClick={() => onChange("C-001")}>customer-picker</button>,
  PostingDateField: ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <label>{label}<input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} /></label>
  ),
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useGetDepositsQuery: (args: unknown) => (mocks.query(args), { data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetReceivablesSettingsQuery: () => ({ data: mocks.settings ? { data: { settings: mocks.settings } } : undefined }),
  useForfeitDepositsMutation: () => [mocks.forfeit, { isLoading: false }],
  useReleaseDepositsMutation: () => [mocks.release, { isLoading: false }],
}));

import { DEPOSIT_STATUS, DepositsTab } from "./deposits-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEPOSIT: CustomerDeposit = {
  id: 3, customer_id: 1, customer_code: "C-001", customer_name: "Tunde Okafor", branch_id: 1, branch_name: "Ikeja",
  invoice_id: 9, invoice_number: "INV-0009", amount: 5_000_000, amount_naira: "50,000.00", status: "RELEASED",
  claim_opened_on: "2026-07-31", release_note_number: "CN-0012", forfeiture_id: null,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocks.access = {};
  mocks.permit = false;
  mocks.settings = undefined;
  mocks.query.mockReset();
  mocks.release.mockReset().mockReturnValue({ unwrap: async () => ({ message: "Released.", data: { credit_notes: [] } }) });
  mocks.forfeit.mockReset().mockReturnValue({ unwrap: async () => ({ message: "Forfeited.", data: { forfeitures: [], skipped: [] } }) });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("deposit states", () => {
  it("calls a released deposit Returned in the filter, the row and the drawer", () => {
    mocks.rows = [DEPOSIT];
    act(() => root.render(<MemoryRouter><DepositsTab entity="BSS" currency="NGN" /></MemoryRouter>));

    const options = [...container.querySelectorAll('select[aria-label="Status"] option')].map((o) => o.textContent);
    expect(options).toEqual(["All", "Held", "Returned", "Forfeited", "Cancelled"]);

    const row = container.querySelector("tbody tr") as HTMLElement;
    expect(row.textContent).toContain("Returned");
    expect(container.textContent).not.toContain("Released");

    act(() => row.click());
    expect(document.body.textContent).toContain("Returned by");
    expect(document.body.textContent).not.toContain("Released");
  });

  it("has a word for every state the backend gives a deposit", () => {
    expect(Object.keys(DEPOSIT_STATUS)).toEqual(["HELD", "RELEASED", "FORFEITED", "CANCELLED"]);
  });
});

const RESOURCE = "finance.deposit";
const HELD: CustomerDeposit = { ...DEPOSIT, status: "HELD", claim_opened_on: null, release_note_number: null };

/** Restricts the role and feeds the list the deposits the server would send it. */
const restrict = (restrictions: { hidden?: string[] }, rows: CustomerDeposit[] = [HELD]) => {
  mocks.access = { [RESOURCE]: restrictions };
  const hidden = restrictions.hidden ?? [];
  mocks.rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([key]) => !hidden.includes(key))));
};
const mount = (path = "/finance/receivables/deposits") => {
  act(() => root.render(<MemoryRouter initialEntries={[path]}><DepositsTab entity="BSS" currency="NGN" /></MemoryRouter>));
};
const headers = () => Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
const aligned = () => {
  const first = container.querySelector("tbody tr");
  return !first || first.querySelectorAll("td").length === container.querySelectorAll("thead th").length;
};
const button = (label: string) => Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim().includes(label));
const openDrawer = () => { act(() => (container.querySelector("tbody tr") as HTMLElement).click()); return document.body.querySelector("[role=dialog]")?.textContent ?? ""; };

describe("the deposit list under Field Access", () => {
  it("shows every column and filter when nothing is restricted", () => {
    mocks.rows = [HELD];
    mount();
    expect(headers()).toEqual(["Customer", "Branch", "Invoice", "Amount", "Left on", "Status"]);
    expect(container.querySelector('select[aria-label="Status"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Branch"]')).not.toBeNull();
    expect(container.textContent).toContain("customer-picker");
    expect(aligned()).toBe(true);
  });

  it("asks for the held deposits by default and for a customer once one is picked", () => {
    mocks.rows = [HELD];
    mount();
    expect(mocks.query).toHaveBeenLastCalledWith({ entity: "BSS", page: 1, status: "HELD" });
    act(() => (Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "customer-picker") as HTMLElement).click());
    expect(mocks.query).toHaveBeenLastCalledWith({ entity: "BSS", page: 1, status: "HELD", customer: "C-001" });
  });

  it("leaves out the status column and filter and does not send the default status when the status is hidden", () => {
    restrict({ hidden: ["status"] });
    mount();
    expect(headers()).toEqual(["Customer", "Branch", "Invoice", "Amount", "Left on"]);
    expect(container.querySelector('select[aria-label="Status"]')).toBeNull();
    expect(mocks.query).toHaveBeenLastCalledWith({ entity: "BSS", page: 1 });
    expect(aligned()).toBe(true);
  });

  it("leaves out the customer column and picker, and sends no customer, when the customer is hidden", () => {
    restrict({ hidden: ["customer_id", "customer_code", "customer_name", "customer"] });
    mount();
    expect(headers()).toEqual(["Branch", "Invoice", "Amount", "Left on", "Status"]);
    expect(container.textContent).not.toContain("customer-picker");
    expect(container.textContent).not.toContain("Tunde");
    expect(aligned()).toBe(true);
  });

  it("shows only the part of the customer cell the role may read", () => {
    restrict({ hidden: ["customer_code"] });
    mount();
    const cell = container.querySelector("tbody tr td")!;
    expect(cell.textContent).toBe("Tunde Okafor");
    restrict({ hidden: ["customer_name"] });
    mount();
    expect(container.querySelector("tbody tr td")!.textContent).toBe("C-001");
  });

  it("keeps the branch column and picker whatever the map lists", () => {
    restrict({ hidden: ["branch_id", "branch_name"] });
    mount();
    expect(headers()).toEqual(["Customer", "Branch", "Invoice", "Amount", "Left on", "Status"]);
    expect(container.querySelector('select[aria-label="Branch"]')).not.toBeNull();
  });

  it("drops the invoice, amount and date columns that are hidden", () => {
    restrict({ hidden: ["invoice_id", "invoice_number", "amount", "amount_naira", "claim_opened_on"] });
    mount();
    expect(headers()).toEqual(["Customer", "Branch", "Status"]);
    expect(aligned()).toBe(true);
  });

  it("leaves only the branch column when every other column is hidden", () => {
    restrict({ hidden: ["customer_id", "customer_code", "customer_name", "invoice_id", "invoice_number", "amount", "amount_naira", "claim_opened_on", "status"] });
    mount();
    expect(headers()).toEqual(["Branch"]);
  });
});

describe("a deposit's drawer under Field Access", () => {
  it("lists the facts the role may read and offers Return deposits", () => {
    mocks.permit = true;
    mocks.rows = [DEPOSIT];
    mount();
    const text = openDrawer();
    expect(text).toContain("Tunde Okafor's deposit");
    expect(text).toContain("Billed on");
    expect(text).toContain("Returned by");
  });

  it("drops the hidden facts, and the title and description fall back to plain words", () => {
    mocks.permit = true;
    restrict({ hidden: ["customer_name", "customer_code", "invoice_number", "invoice_id", "release_note_number", "amount", "amount_naira"] }, [DEPOSIT]);
    mount();
    const text = openDrawer();
    expect(text).not.toContain("Tunde");
    expect(text).not.toContain("INV-0009");
    expect(text).not.toContain("Billed on");
    expect(text).not.toContain("Returned by");
    expect(text).not.toContain("Amount");
    expect(text).toContain("Status");
    expect(button("Return deposits")).toBeUndefined();
  });

  it("offers Return deposits to a role that cannot read the status, and sends the customer's code", async () => {
    mocks.permit = true;
    restrict({ hidden: ["status"] }, [HELD]);
    mount();
    openDrawer();
    await act(async () => { button("Return deposits")?.click(); });
    await act(async () => { Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).filter((b) => b.textContent?.trim() === "Return deposits").at(-1)?.click(); });
    expect(mocks.release).toHaveBeenCalledWith({ entity: "BSS", customer: "C-001", offset: false });
  });

  it("offers no Return deposits when the customer is hidden", () => {
    mocks.permit = true;
    restrict({ hidden: ["customer_code"] }, [HELD]);
    mount();
    openDrawer();
    expect(button("Return deposits")).toBeUndefined();
  });

  it("names the customer in the confirmation only when it may be read", async () => {
    mocks.permit = true;
    restrict({ hidden: ["customer_name"] }, [HELD]);
    mount();
    openDrawer();
    await act(async () => { button("Return deposits")?.click(); });
    expect(document.body.textContent).toContain("Return this customer's deposits?");
    expect(document.body.textContent).not.toContain("Tunde");
  });
});

describe("the deposit note and the forfeit run under Field Access", () => {
  const SETTINGS = { deposits_offset_unpaid_bills: true, unclaimed_deposit_years: 6 };

  it("states the policy when the role may read both settings", () => {
    mocks.permit = true;
    mocks.settings = SETTINGS;
    mocks.rows = [HELD];
    mount();
    expect(container.textContent).toContain("set against their unpaid bills first");
    expect(container.textContent).toContain("unclaimed 6 years after");
  });

  it("says only what the role may read of the policy", () => {
    mocks.permit = true;
    mocks.access = { "finance.settings": { hidden: ["deposits_offset_unpaid_bills", "unclaimed_deposit_years"] } };
    mocks.settings = {};
    mocks.rows = [HELD];
    mount();
    expect(container.textContent).not.toContain("set against their unpaid bills first");
    expect(container.textContent).toContain("unclaimed past the school's limit after");
  });

  it("offers the offset choice only to a role that can read that the school allows it", async () => {
    mocks.permit = true;
    mocks.settings = SETTINGS;
    mocks.rows = [HELD];
    mount();
    openDrawer();
    await act(async () => { button("Return deposits")?.click(); });
    expect(document.body.textContent).toContain("Set against unpaid bills first");
  });

  it("sends the forfeit date", async () => {
    mocks.permit = true;
    mocks.rows = [HELD];
    mount();
    await act(async () => { button("Forfeit unclaimed")?.click(); });
    await act(async () => { Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((b) => b.textContent?.trim() === "Forfeit")?.click(); });
    expect(mocks.forfeit).toHaveBeenCalledWith({ entity: "BSS", as_of: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });
});
