/**
 * Bank accounts at Bright Star. Bola, the bursar, saves her cousin's number for
 * Tunde Adeyemi; Paystack names Bola Okafor, so the account needs a second
 * person. Mr Eze, who holds the confirm key and did not make the change,
 * confirms it. Bola holds the same key and is not offered it for her own change,
 * and Tunde is not offered it for his own account. Ngozi's account could not be
 * found; Mrs Adeyemi checks it again after Paystack comes back.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  fieldAccess: {} as Record<string, unknown>,
  rows: [] as unknown[],
  asked: [] as unknown[],
  user: { id: 7, first_name: "Chidi", last_name: "Eze", email: "eze@bss.test" } as Record<string, unknown>,
  save: vi.fn(),
  verify: vi.fn(),
  confirm: vi.fn(),
  roster: [] as unknown[],
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: (...codes: string[]) => codes.some((c) => mocks.held.has(c)),
    hasAllPermissions: (...codes: string[]) => codes.every((c) => mocks.held.has(c)),
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { user: mocks.user } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/redux/services/finance/payroll-paystack-api", () => ({
  useGetStaffBankAccountsQuery: (args: unknown) => {
    mocks.asked.push(args);
    return { data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() };
  },
  useGetStaffBankBanksQuery: () => ({ data: { data: [{ code: "058", name: "GTBank" }, { code: "044", name: "Access Bank" }] }, isLoading: false }),
  useSaveStaffBankAccountMutation: () => [mocks.save, { isLoading: false }],
  useVerifyStaffBankAccountMutation: () => [mocks.verify, { isLoading: false }],
  useConfirmStaffBankAccountMutation: () => [mocks.confirm, { isLoading: false }],
}));
vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetEmployeeSalariesQuery: () => ({ data: { data: mocks.roster }, isLoading: false }),
}));
vi.mock("@/components/custom/search-select", () => ({
  SearchSelect: (props: { options: { value: string; label: string }[]; value?: string; onChange?: (e: { target: { value: string } }) => void; placeholder?: string }) => (
    <select aria-label={props.placeholder} value={props.value ?? ""} onChange={(e) => props.onChange?.({ target: { value: e.target.value } })}>
      <option value="">-</option>
      {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));
vi.mock("../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => String(v).slice(0, 10) }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { P } from "../../permissions";
import { StaffBankAccountsTab } from "./staff-bank-accounts-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const account = (over: Record<string, unknown>) => ({
  id: 1, employee_id: 40, employee_name: "Tunde Adeyemi", bank_code: "058", bank_name: "GTBank", account_number: "0123456789",
  resolved_account_name: "BOLA OKAFOR", verification_state: "NEEDS_CONFIRMATION", verification_state_label: "Needs a second person to confirm",
  verification_note: "The account holder's name does not match the staff member's.", is_payable: false,
  changed_by_name: "Bola Okafor", confirmed_by_name: null, confirmed_at: null, updated_at: "2027-01-05T10:00:00Z", ...over,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.held = new Set([P.FIN_VIEW_STAFF_BANK, P.FIN_UPDATE_STAFF_BANK, P.FIN_CONFIRM_STAFF_BANK, P.FIN_VIEW_SALARIES]);
  mocks.fieldAccess = {};
  mocks.asked = [];
  mocks.user = { id: 7, first_name: "Chidi", last_name: "Eze", email: "eze@bss.test" };
  mocks.rows = [
    account({}),
    account({ id: 2, employee_id: 41, employee_name: "Aisha Bello", account_number: "2222222222", resolved_account_name: "BELLO AISHA", verification_state: "VERIFIED", verification_note: "", changed_by_name: "Bola Okafor" }),
    account({ id: 3, employee_id: 42, employee_name: "Ngozi Okafor", account_number: "3333333333", resolved_account_name: "", verification_state: "FAILED", verification_note: "The provider could not find this account: x" }),
  ];
  mocks.roster = [
    { id: 1, name: "Tunde Adeyemi", employee_id: 40 }, { id: 2, name: "Femi Ojo", employee_id: 50 }, { id: 3, name: "Contractor", employee_id: null },
  ];
  for (const fn of [mocks.save, mocks.verify, mocks.confirm]) {
    fn.mockReset();
    fn.mockReturnValue({ unwrap: async () => ({ message: "Done.", data: account({ verification_state: "VERIFIED" }) }) });
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = () => act(() => root.render(<MemoryRouter><StaffBankAccountsTab entity="BSS" /></MemoryRouter>));
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
const openRow = (name: string) => {
  const cell = [...container.querySelectorAll("td, [class*=font-semibold]")].find((el) => el.textContent === name) as HTMLElement;
  act(() => cell.click());
};
const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
};

describe("the staff bank accounts", () => {
  it("lists name, bank, account number, the name Paystack returned and the check in plain words", () => {
    render();
    const text = container.textContent ?? "";
    for (const word of ["Tunde Adeyemi", "GTBank", "0123456789", "BOLA OKAFOR", "Needs a second person", "Checked", "Could not check"]) expect(text).toContain(word);
  });

  it("filters by the state the server takes", () => {
    render();
    const select = container.querySelector("select[aria-label='Show accounts']") as HTMLSelectElement;
    setValue(select, "NEEDS_CONFIRMATION");
    expect(mocks.asked.at(-1)).toEqual({ entity: "BSS", page: 1, state: "NEEDS_CONFIRMATION" });
  });

  it("leaves out a column the reader's role may not read", () => {
    mocks.fieldAccess = { "finance.staff_bank": { hidden: ["account_number", "resolved_account_name"], read_only: [], open_on_create: [] } };
    mocks.rows = mocks.rows.map((r) => { const { account_number: _a, resolved_account_name: _n, ...rest } = r as Record<string, unknown>; return rest; });
    render();
    const headers = [...container.querySelectorAll("th")].map((th) => th.textContent);
    expect(headers).not.toContain("Account number");
    expect(headers).not.toContain("Name Paystack returned");
    expect(headers).toContain("Check");
    expect(container.textContent).not.toContain("0123456789");
  });
});

describe("confirming an account that needs a second person", () => {
  it("offers Confirm to Mr Eze, who did not make the change, and confirms", async () => {
    render();
    openRow("Tunde Adeyemi");
    expect(document.body.querySelector("[data-testid=staff-bank-state]")?.textContent).toContain("Needs a second person");
    await act(async () => { button("Confirm")!.click(); });
    const confirm = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Confirm account") as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    expect(mocks.confirm).toHaveBeenCalledWith({ entity: "BSS", employee: 40 });
  });

  it("does not offer it to Bola, who made the change, and says why", () => {
    mocks.user = { id: 8, first_name: "Bola", last_name: "Okafor", email: "bola@bss.test" };
    render();
    openRow("Tunde Adeyemi");
    expect(button("Confirm")).toBeUndefined();
    expect(document.body.querySelector("[data-testid=staff-bank-confirm-hint]")?.textContent).toContain("You made the last change");
  });

  it("does not offer it to Tunde for his own account", () => {
    mocks.user = { id: 40, first_name: "Tunde", last_name: "Adeyemi", email: "tunde@bss.test" };
    render();
    openRow("Tunde Adeyemi");
    expect(button("Confirm")).toBeUndefined();
    expect(document.body.querySelector("[data-testid=staff-bank-confirm-hint]")?.textContent).toContain("your own bank account");
  });

  it("does not offer it without the confirm key", () => {
    mocks.held = new Set([P.FIN_VIEW_STAFF_BANK, P.FIN_UPDATE_STAFF_BANK]);
    render();
    openRow("Tunde Adeyemi");
    expect(button("Confirm")).toBeUndefined();
  });

  it("does not offer it on an account that is already checked", () => {
    render();
    openRow("Aisha Bello");
    expect(button("Confirm")).toBeUndefined();
  });
});

describe("checking and changing an account", () => {
  it("checks an account Paystack could not find again", async () => {
    render();
    openRow("Ngozi Okafor");
    await act(async () => { button("Check again")!.click(); });
    expect(mocks.verify).toHaveBeenCalledWith({ entity: "BSS", employee: 42 });
  });

  it("offers Check again only where it does something", () => {
    render();
    openRow("Aisha Bello");
    expect(button("Check again")).toBeUndefined();
  });

  it("sends only the account number that changed", async () => {
    render();
    openRow("Aisha Bello");
    act(() => button("Edit")!.click());
    const number = document.body.querySelector<HTMLInputElement>('input[aria-label="Account number"]')!;
    setValue(number, "2222222223");
    await act(async () => { button("Save and check")!.click(); });
    expect(mocks.save).toHaveBeenCalledWith({ entity: "BSS", employee: 41, account_number: "2222222223" });
  });

  it("refuses an account number that is not ten digits before sending anything", () => {
    render();
    openRow("Aisha Bello");
    act(() => button("Edit")!.click());
    setValue(document.body.querySelector<HTMLInputElement>('input[aria-label="Account number"]')!, "222");
    expect(button("Save and check")!.disabled).toBe(true);
  });

  it("offers no Edit or Check again to a reader who may only read", () => {
    mocks.held = new Set([P.FIN_VIEW_STAFF_BANK]);
    render();
    openRow("Ngozi Okafor");
    expect(button("Edit")).toBeUndefined();
    expect(button("Check again")).toBeUndefined();
    expect(button("Add a staff account")).toBeUndefined();
  });

  it("greys nothing it cannot send: a read-only number leaves the form with nothing to save", () => {
    mocks.fieldAccess = { "finance.staff_bank": { hidden: [], read_only: ["bank_code", "bank_name", "account_number"], open_on_create: [] } };
    mocks.rows = mocks.rows.map((r) => ({ ...(r as object), _read_only_fields: ["bank_code", "bank_name", "account_number"] }));
    render();
    openRow("Aisha Bello");
    expect(button("Edit")).toBeUndefined();
  });
});

describe("adding an account for staff who have none", () => {
  it("chooses from the roster, leaving out staff with an account and people with no sign-in", async () => {
    render();
    act(() => button("Add a staff account")!.click());
    const options = [...document.body.querySelectorAll("select[aria-label='Search the payroll roster'] option")].map((o) => o.textContent);
    expect(options).toEqual(["-", "Femi Ojo"]);
    setValue(document.body.querySelector("select[aria-label='Search the payroll roster']") as HTMLSelectElement, "50");
    act(() => button("Continue")!.click());
    setValue(document.body.querySelector("select[aria-label='Choose the bank']") as HTMLSelectElement, "044");
    setValue(document.body.querySelector<HTMLInputElement>('input[aria-label="Account number"]')!, "0123 456 789");
    await act(async () => { button("Save and check")!.click(); });
    expect(mocks.save).toHaveBeenCalledWith({ entity: "BSS", employee: 50, bank_code: "044", bank_name: "Access Bank", account_number: "0123456789" });
  });

  it("is not offered without the roster key", () => {
    mocks.held = new Set([P.FIN_VIEW_STAFF_BANK, P.FIN_UPDATE_STAFF_BANK]);
    render();
    expect(button("Add a staff account")).toBeUndefined();
  });
});
