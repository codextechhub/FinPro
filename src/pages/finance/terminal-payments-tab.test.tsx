/**
 * Terminal Payments.
 *
 * A parent pays N45,000 at Lekki's terminal from an email two Lekki families
 * share, so it cannot be matched by itself and waits with that reason. Mrs
 * Adeyemi, who keeps Lekki's books, matches it to the family she chooses; she
 * can choose only a Lekki family or one every branch shares. The list opens on
 * what is waiting and offers Matched and All. Mrs Bello, who covers both
 * branches, sees a Branch column; a one-branch school never does.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  fieldAccess: {} as Record<string, unknown>,
  rows: [] as unknown[],
  total: 0,
  asked: [] as Record<string, unknown>[],
  customers: [] as unknown[],
  customersAsked: [] as unknown[],
  match: vi.fn(),
  unmatch: vi.fn(),
  applies: true,
  pinned: null as number | null,
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

vi.mock("@/redux/services/payments/payments-api", () => ({
  useGetTerminalPaymentsQuery: (args: Record<string, unknown>) => {
    mocks.asked.push(args);
    return {
      data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1, totalItems: mocks.total } },
      isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
    };
  },
  useMatchTerminalPaymentMutation: () => [mocks.match, { isLoading: false }],
  useUnmatchTerminalPaymentMutation: () => [mocks.unmatch, { isLoading: false }],
}));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetCustomersQuery: (args: unknown) => { mocks.customersAsked.push(args); return { data: { data: mocks.customers }, isFetching: false }; },
}));

vi.mock("../../host", () => ({
  hostBranchLens: () => ({
    applies: mocks.applies, pinnedBranch: mocks.pinned, branch: "all",
    choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false,
  }),
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false, isError: false }),
  useReaderReach: () => ({ wholeSchool: mocks.pinned === null, branchIds: null, covers: () => true }),
}));
vi.mock("../../lib/display-prefs", () => ({
  useDates: () => ({ day: (v: string) => v, dateTime: (v: string) => String(v).slice(0, 16).replace("T", " "), today: () => "2026-10-13" }),
}));
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: <T,>(v: T) => v }));
vi.mock("@/components/custom/search-select", () => ({
  SearchSelect: ({ options, value, onChange }: { options: { value: string; label: string }[]; value?: string; onChange?: React.ChangeEventHandler<HTMLSelectElement> }) => (
    <select aria-label="customer" value={value ?? ""} onChange={onChange}>
      <option value="">-</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "../../permissions";
import { TerminalPaymentsTab } from "./terminal-payments-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WAITING = {
  id: 11, collection_id: 40, branch: 2, branch_name: "Lekki", terminal: 2, terminal_name: "Lekki desk", reference: "T-40", provider_reference: "ps_40",
  amount: 4_500_000, amount_naira: "45,000.00", fee: 67_500, status: "UNMATCHED", match_method: "", match_note: "More than one customer has the payer's email.",
  payer_email: "adaokeye@gmail.com", sender_name: "A. OKEYE", sender_bank: "GTBank", matched_customer: null, matched_customer_code: null, matched_customer_name: null,
  matched_by: null, matched_by_name: null, matched_at: null, unmatched_by_name: null, unmatched_at: null, receipt_id: null,
  paid_at: "2026-10-13T09:30:00Z", booked_on: "2026-10-13", created_at: "2026-10-13T09:31:00Z",
  suggestions: [
    { customer: 71, code: "C-071", name: "Okeye Tunde", open_balance: 4_500_000, email_match: true, reasons: ["email", "amount"] },
    { customer: 72, code: "C-072", name: "Okeye Ada", open_balance: 0, email_match: true, reasons: ["email"] },
  ],
};
const MATCHED = {
  ...WAITING, id: 12, reference: "T-41", status: "MATCHED", match_method: "MANUAL", match_note: "", suggestions: [],
  matched_customer: 71, matched_customer_code: "C-071", matched_customer_name: "Okeye Tunde", matched_by: 4, matched_by_name: "Mrs Adeyemi",
  matched_at: "2026-10-13T10:00:00Z", receipt_id: 88,
};
const customer = (id: number, branch_id: number | null) => ({ id, code: `C-0${id}`, name: `Family ${id}`, branch_id });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.held = new Set([P.PAY_VIEW_TERMINAL_PAYMENTS, P.PAY_MATCH_TERMINAL_PAYMENT, P.PAY_REVERSE_TERMINAL_PAYMENT]);
  mocks.fieldAccess = {};
  mocks.rows = [WAITING];
  mocks.total = 1;
  mocks.asked = [];
  mocks.applies = true;
  mocks.pinned = null;
  mocks.customers = [customer(1, 1), customer(2, 2), customer(3, null)];
  mocks.customersAsked = [];
  mocks.match.mockReset();
  mocks.match.mockReturnValue({ unwrap: async () => ({ message: "Terminal payment matched.", data: MATCHED }) });
  mocks.unmatch.mockReset();
  mocks.unmatch.mockReturnValue({ unwrap: async () => ({ message: "Terminal payment unmatched.", data: WAITING }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = (path = "/") => act(() => root.render(<MemoryRouter initialEntries={[path]}><TerminalPaymentsTab entity="BSS" currency="NGN" /></MemoryRouter>));
/** A button by its words, or by its accessible name; a label ending in "!" must match exactly. */
const button = (label: string) => {
  const exact = label.endsWith("!");
  const wanted = exact ? label.slice(0, -1) : label;
  return [...document.body.querySelectorAll("button")].find((b) => {
    const words = b.textContent?.trim() ?? "";
    const name = b.getAttribute("aria-label") ?? "";
    return exact ? words === wanted : words.includes(wanted) || name.includes(wanted);
  }) as HTMLButtonElement | undefined;
};
const headers = () => [...container.querySelectorAll("thead th")].map((th) => th.textContent);
const openRow = () => act(() => (container.querySelector("tbody tr") as HTMLElement).click());

describe("the list", () => {
  it("opens on the payments waiting for a customer, with their count and the reason", () => {
    render();
    expect(mocks.asked.at(-1)).toMatchObject({ entity: "BSS", status: "UNMATCHED", page: 1 });
    expect(button("Unmatched (1)")).toBeDefined();
    expect(container.textContent).toContain("More than one customer has the payer's email.");
    expect(container.textContent).toContain("adaokeye@gmail.com");
    expect(container.textContent).toContain("A. OKEYE · GTBank");
    expect(headers()).toEqual(["Paid", "Amount", "Payer", "Branch", "Why it is waiting"]);
  });

  it("switches to Matched and to All", () => {
    render();
    act(() => button("Matched!")!.click());
    expect(mocks.asked.at(-1)).toMatchObject({ status: "MATCHED" });
    act(() => button("All!")!.click());
    expect(mocks.asked.at(-1)).toMatchObject({ status: "ALL" });
  });

  it("shows who matched a matched row", () => {
    mocks.rows = [MATCHED];
    render();
    act(() => button("Matched!")!.click());
    expect(container.textContent).toContain("Matched to Okeye Tunde by Mrs Adeyemi");
    expect(headers().at(-1)).toBe("Match");
  });

  it("names no branch at a school with one", () => {
    mocks.applies = false;
    render();
    expect(headers()).not.toContain("Branch");
    expect(container.querySelector('select[aria-label="Branch"]')).toBeNull();
  });

  it("names no branch for someone pinned to one", () => {
    mocks.pinned = 2;
    render();
    expect(headers()).not.toContain("Branch");
  });

  it("asks only for the branch picked, and reads 'No branch yet' in the address as every branch", () => {
    render("/?branch=2");
    expect(mocks.asked.at(-1)).toMatchObject({ branch: 2 });
    expect(headers()).not.toContain("Branch");
    act(() => root.unmount());
    root = createRoot(container);
    mocks.asked = [];
    render("/?branch=unassigned");
    expect(mocks.asked.at(-1)).not.toHaveProperty("branch");
    expect([...container.querySelectorAll('select[aria-label="Branch"] option')].map((o) => o.textContent)).not.toContain("No branch yet");
  });

  it("drops the payer column and its header where Field Access hides the payer", () => {
    mocks.fieldAccess = { "payments.terminal_payment": { hidden: ["payer_email", "sender_name"], read_only: [], open_on_create: [] } };
    const { payer_email: _e, sender_name: _s, sender_bank: _b, ...bare } = WAITING;
    mocks.rows = [bare];
    render();
    expect(headers()).not.toContain("Payer");
    expect(container.textContent).not.toContain("adaokeye@gmail.com");
  });
});

describe("matching a waiting payment", () => {
  it("shows up to five suggestions with their reasons and matches the one chosen", async () => {
    render();
    openRow();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Okeye Tunde");
    expect(text).toContain("Same email as the payer · Owes exactly this amount");
    expect(text).toContain("owes");
    await act(async () => { button("Match to Okeye Tunde")!.click(); });
    expect(mocks.match).toHaveBeenCalledWith({ id: 11, entity: "BSS", customer: 71 });
    expect(document.body.textContent).toContain("Matched to Okeye Tunde by Mrs Adeyemi");
    expect(button("Unmatch!")).toBeDefined();
  });

  it("offers only customers of the payment's branch and those every branch shares", () => {
    render();
    openRow();
    const options = [...document.body.querySelectorAll("select[aria-label=customer] option")].map((o) => o.textContent);
    expect(options).toEqual(["-", "C-02 - Family 2", "C-03 - Family 3"]);
  });

  it("asks the server for the customers of the payment's own branch", () => {
    render();
    openRow();
    expect(mocks.customersAsked).toContainEqual(expect.objectContaining({ entity: "BSS", branch: 2 }));
  });

  it("matches to a customer picked from the list", async () => {
    render();
    openRow();
    const select = document.body.querySelector("select[aria-label=customer]") as HTMLSelectElement;
    await act(async () => { select.value = "C-02"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { button("Match to this customer")!.click(); });
    expect(mocks.match).toHaveBeenCalledWith({ id: 11, entity: "BSS", customer: "C-02" });
  });

  it("shows the server's words when it refuses a customer of another branch", async () => {
    mocks.match.mockReturnValue({ unwrap: async () => {
      throw { status: 400, data: { message: "Validation error", error: { detail: { customer: ["No such customer for this payment's branch. A payment can only be matched to a customer of its own branch."] } } } };
    } });
    render();
    openRow();
    await act(async () => { button("Match to Okeye Tunde")!.click(); });
    expect(document.body.querySelector("[data-testid=terminal-payment-notice]")?.textContent).toContain("A payment can only be matched to a customer of its own branch.");
  });

  it("offers no Match to someone who may only read", () => {
    mocks.held = new Set([P.PAY_VIEW_TERMINAL_PAYMENTS]);
    render();
    openRow();
    expect(button("Match to Okeye Tunde")).toBeUndefined();
    expect(button("Match to this customer")).toBeUndefined();
    expect(document.body.textContent).toContain("You can read this payment but not match it.");
  });

  it("shows no suggestions where Field Access hides them", () => {
    const { suggestions: _suggestions, ...bare } = WAITING;
    mocks.rows = [bare];
    render();
    openRow();
    expect(document.body.textContent).not.toContain("Likely customers");
    expect(button("Match to this customer")).toBeDefined();
  });
});

describe("unmatching a matched payment", () => {
  beforeEach(() => { mocks.rows = [MATCHED]; });

  it("asks first, then puts the payment back on the waiting list", async () => {
    render();
    act(() => button("Matched!")!.click());
    openRow();
    expect(document.body.textContent).toContain("Receipt #88");
    act(() => button("Unmatch!")!.click());
    expect(document.body.textContent).toContain("The receipt that applied it to the customer is voided");
    expect(mocks.unmatch).not.toHaveBeenCalled();
    const confirm = [...document.body.querySelectorAll("button")].filter((b) => b.textContent === "Unmatch").at(-1)!;
    await act(async () => { confirm.click(); });
    expect(mocks.unmatch).toHaveBeenCalledWith({ id: 12, entity: "BSS" });
    expect(document.body.textContent).toContain("Likely customers");
  });

  it("offers no Unmatch without the reverse key", () => {
    mocks.held = new Set([P.PAY_VIEW_TERMINAL_PAYMENTS]);
    render();
    openRow();
    expect(button("Unmatch!")).toBeUndefined();
    expect(document.body.textContent).toContain("You can read this match but not undo it.");
  });
});
