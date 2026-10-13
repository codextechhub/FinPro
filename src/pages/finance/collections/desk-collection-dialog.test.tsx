/**
 * Collecting at the desk, from an invoice and from a customer's account.
 *
 * Mrs Adeyemi, at Lekki's desk, starts a N45,000 collection for Tunde's term
 * fees: the code appears, and the screen turns to Paid when the parent has paid
 * on their phone. A bursar who may start a collection but not read one gets the
 * code and no polling. A family every branch shares, at a school with two
 * branches, needs a bank account named before the code can be made.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  fieldAccess: {} as Record<string, unknown>,
  initiate: vi.fn(),
  pollArgs: [] as { args: unknown; options: Record<string, unknown> }[],
  pollData: undefined as unknown,
  pollError: false,
  refetch: vi.fn(),
  invalidated: [] as unknown[],
  applies: false,
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
  useAppDispatch: () => (action: unknown) => { mocks.invalidated.push(action); },
}));

vi.mock("@/redux/services/payments/payments-api", () => ({
  paymentsApi: { util: { invalidateTags: (tags: unknown) => ({ type: "invalidate", tags }) } },
  useInitiateCollectionMutation: () => [mocks.initiate, { isLoading: false }],
  usePollCollectionQuery: (args: unknown, options: Record<string, unknown>) => {
    mocks.pollArgs.push({ args, options });
    return { data: options.skip ? undefined : mocks.pollData, isError: mocks.pollError, isFetching: false, refetch: mocks.refetch };
  },
}));

vi.mock("../../../host", () => ({
  hostBranchLens: () => ({ applies: mocks.applies, pinnedBranch: null, branch: "all", choices: [], isLoading: false }),
  useBranches: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DepositAccountPicker: ({ onChange }: { onChange: (code: string) => void }) => (
    <button type="button" onClick={() => onChange("1010")}>Pick Lekki bank</button>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "../../../permissions";
import { DeskCollectionDialog, type DeskCollectionTarget } from "./desk-collection-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STARTED = {
  id: 31, reference: "COL-31", status: "PENDING", amount: 4_500_000, checkout_url: "https://checkout.paystack.com/abc123",
};
const INVOICE: DeskCollectionTarget = {
  customerCode: "C-001", customerName: "Tunde Bakare", customerEmail: "mum@example.com", customerBranchId: 2,
  invoice: { id: 9, documentNumber: "INV-0009", balanceKobo: 4_500_000 },
};
const ACCOUNT: DeskCollectionTarget = { customerCode: "C-007", customerName: "The Okafors", customerBranchId: null };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.held = new Set([P.PAY_CREATE_COLLECTION, P.PAY_VIEW_COLLECTIONS]);
  mocks.fieldAccess = {};
  mocks.pollArgs = [];
  mocks.pollData = undefined;
  mocks.pollError = false;
  mocks.invalidated = [];
  mocks.applies = false;
  mocks.refetch.mockReset();
  mocks.initiate.mockReset();
  mocks.initiate.mockReturnValue({ unwrap: async () => ({ message: "Collection initiated.", data: STARTED }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  vi.useRealTimers();
  act(() => root.unmount());
  container.remove();
});

const render = (target: DeskCollectionTarget) => act(() => root.render(
  <DeskCollectionDialog open onOpenChange={vi.fn()} entity="BSS" currency="NGN" target={target} />,
));
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
const input = (selector: string) => document.body.querySelector(selector) as HTMLInputElement;
const setValue = (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
};
const start = async () => { await act(async () => { button("Show payment code")!.click(); }); };
const lastPoll = () => mocks.pollArgs[mocks.pollArgs.length - 1];

describe("starting a desk collection from an invoice", () => {
  it("defaults the amount to the balance, posts it as a desk collection and shows the code and link", async () => {
    render(INVOICE);
    expect(document.body.textContent).toContain("INV-0009");
    expect(input('input[inputmode="decimal"]').value).toBe("45000");
    await start();
    expect(mocks.initiate).toHaveBeenCalledWith({
      entity: "BSS", amount: 4_500_000, customer: "C-001", invoice: 9, payer_email: "mum@example.com",
      narration: "Payment for INV-0009", origin: "DESK",
    });
    expect(document.body.querySelector("svg title")?.textContent).toBe("Payment code");
    expect((input('input[readonly]')).value).toBe("https://checkout.paystack.com/abc123");
    expect(document.body.textContent).toContain("Waiting for payment");
  });

  it("refuses more than the invoice balance", () => {
    render(INVOICE);
    setValue(input('input[inputmode="decimal"]'), "45001");
    expect(document.body.textContent).toContain("The amount cannot be more than the invoice balance.");
    expect(button("Show payment code")!.disabled).toBe(true);
  });

  it("refuses a malformed email and accepts a blank one", () => {
    render(INVOICE);
    setValue(input('input[type="email"]'), "mum@");
    expect(document.body.textContent).toContain("Enter a valid email address");
    expect(button("Show payment code")!.disabled).toBe(true);
    setValue(input('input[type="email"]'), "");
    expect(button("Show payment code")!.disabled).toBe(false);
  });
});

describe("watching the payment", () => {
  it("asks the server every three seconds with the verify read, and says Paid when it is", async () => {
    render(INVOICE);
    await start();
    expect(lastPoll().args).toEqual({ id: 31, entity: "BSS" });
    expect(lastPoll().options).toMatchObject({ pollingInterval: 3000, skip: false });
    mocks.pollData = { data: { ...STARTED, status: "SUCCEEDED" } };
    await act(async () => { root.render(<DeskCollectionDialog open onOpenChange={vi.fn()} entity="BSS" currency="NGN" target={INVOICE} />); });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Paid");
    expect(text).toContain("The payment has been received");
    expect(document.body.querySelector("svg title")).toBeNull();
    expect(mocks.invalidated).toHaveLength(1);
    expect(lastPoll().options.pollingInterval).toBe(0);
  });

  it("says Not paid on a failed answer, and offers to check again", async () => {
    mocks.pollData = { data: { ...STARTED, status: "ABANDONED" } };
    render(INVOICE);
    await start();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Not paid");
    expect(text).toContain("can still finish paying");
    expect(lastPoll().options.pollingInterval).toBe(0);
    await act(async () => { button("Check again")!.click(); });
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("stops asking after ten minutes and says so", async () => {
    vi.useFakeTimers();
    render(INVOICE);
    await act(async () => { button("Show payment code")!.click(); });
    expect(lastPoll().options.pollingInterval).toBe(3000);
    await act(async () => { vi.advanceTimersByTime(10 * 60 * 1000 + 10); });
    expect(lastPoll().options.pollingInterval).toBe(0);
    expect(document.body.textContent).toContain("We stopped checking after ten minutes");
  });

  it("stops asking once a read fails, instead of meeting the refusal every three seconds", async () => {
    mocks.pollError = true;
    render(INVOICE);
    await start();
    expect(lastPoll().options.pollingInterval).toBe(0);
    expect(document.body.textContent).toContain("We could not check just now.");
  });

  it("gives a role that may not read collections the code and no polling", async () => {
    mocks.held = new Set([P.PAY_CREATE_COLLECTION]);
    render(INVOICE);
    await start();
    expect(lastPoll().options).toMatchObject({ skip: true, pollingInterval: 0 });
    expect(document.body.textContent).toContain("You cannot check payments from this role.");
    expect(document.body.querySelector("svg title")?.textContent).toBe("Payment code");
    expect(button("Check again")).toBeUndefined();
  });
});

describe("starting from a customer's account", () => {
  it("asks for any amount and sends no invoice", async () => {
    render({ ...ACCOUNT, customerBranchId: 2 });
    expect(button("Show payment code")!.disabled).toBe(true);
    setValue(input('input[inputmode="decimal"]'), "10000");
    await start();
    expect(mocks.initiate).toHaveBeenCalledWith({ entity: "BSS", amount: 1_000_000, customer: "C-007", origin: "DESK" });
  });

  it("names a bank account for a shared family at a school with several branches", async () => {
    mocks.applies = true;
    render(ACCOUNT);
    setValue(input('input[inputmode="decimal"]'), "10000");
    expect(button("Show payment code")!.disabled).toBe(true);
    act(() => button("Pick Lekki bank")!.click());
    await start();
    expect(mocks.initiate).toHaveBeenCalledWith({ entity: "BSS", amount: 1_000_000, customer: "C-007", deposit_account: "1010", origin: "DESK" });
  });

  it("asks for no bank account at a school with one branch", () => {
    render(ACCOUNT);
    expect(button("Pick Lekki bank")).toBeUndefined();
  });
});

describe("the collection's origin follows Field Access", () => {
  it("is not submitted when the role may not write it", async () => {
    mocks.fieldAccess = { "payments.collection": { hidden: [], read_only: ["origin"], open_on_create: [] } };
    render(INVOICE);
    await start();
    expect(mocks.initiate.mock.calls[0][0]).not.toHaveProperty("origin");
  });

  it("is submitted when it is open on create, even where the role may not read it afterwards", async () => {
    mocks.fieldAccess = { "payments.collection": { hidden: ["origin"], read_only: ["origin"], open_on_create: ["origin"] } };
    render(INVOICE);
    await start();
    expect(mocks.initiate.mock.calls[0][0]).toHaveProperty("origin", "DESK");
  });
});
