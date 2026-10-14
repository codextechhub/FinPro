/**
 * Refunds returned through Paystack, on the refund screens.
 *
 * Bright Star School holds its online money. Mrs Bello raises a N100,000 refund
 * for Mrs Adeyemi, who paid N180,000 online, and picks that payment. When
 * Paystack fails it, the refund is a draft again: she can try again, or pay it
 * from Lekki's bank. Greenfield's payments settle straight into each branch's
 * bank, so its bursar is never offered the online refund.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  fieldAccess: {} as Record<string, unknown>,
  custody: "HELD" as "HELD" | "DIRECT" | "UNKNOWN",
  links: [] as unknown[],
  method: "ONLINE" as string,
  collections: [] as unknown[],
  link: vi.fn(),
  verify: vi.fn(),
  payFromBank: vi.fn(),
  linksAsked: [] as unknown[],
  collectionsAsked: [] as unknown[],
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

vi.mock("@/components/finance-ui/held-custody", () => ({ useCustodyReading: () => mocks.custody }));

vi.mock("@/redux/services/payments/payments-api", () => ({
  useGetProviderRefundsQuery: (args: unknown, options?: { skip?: boolean }) => {
    mocks.linksAsked.push({ args, skip: options?.skip === true });
    return { data: options?.skip ? undefined : { data: mocks.links }, isLoading: false };
  },
  useGetCollectionsQuery: (args: unknown, options?: { skip?: boolean }) => {
    mocks.collectionsAsked.push({ args, skip: options?.skip === true });
    return { data: options?.skip ? undefined : { data: mocks.collections }, isFetching: false };
  },
  useLinkProviderRefundMutation: () => [mocks.link, { isLoading: false }],
  useVerifyProviderRefundMutation: () => [mocks.verify, { isLoading: false }],
  usePayProviderRefundFromBankMutation: () => [mocks.payFromBank, { isLoading: false }],
}));

vi.mock("../../../lib/display-prefs", () => ({
  useDates: () => ({ day: (v: string) => String(v).slice(0, 10), dateTime: (v: string) => String(v).slice(0, 16).replace("T", " "), today: () => "2026-10-13" }),
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  BankAccountPicker: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" onClick={() => onChange("9")}>Pick Lekki bank</button>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { P } from "../../../permissions";
import { NO_ONLINE_REFUND } from "./provider-refund-model";
import { OnlineRefundFields, ProviderRefundChip, ProviderRefundPanel } from "./provider-refund-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINK = {
  id: 7, refund_id: 12, refund_number: "RF-0012", refund_status: "DRAFT", branch: 2, provider: "PAYSTACK",
  status: "FAILED", provider_status: "failed", amount: 10_000_000, amount_naira: "100,000.00",
  collection_id: 5, collection_reference: "COL-5", provider_reference: "ref_77",
  failure_reason: "Insufficient balance on the merchant account.", sent_at: "2026-10-12T09:00:00Z", processed_at: null, created_at: "2026-10-12T08:00:00Z",
};
const PAYMENT = (over: Record<string, unknown> = {}) => ({
  id: 5, reference: "COL-5", status: "SUCCEEDED", customer_code: "C-001", branch: 2, amount: 18_000_000,
  confirmed_at: "2026-10-01T10:00:00Z", created_at: "2026-10-01T09:00:00Z", ...over,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.held = new Set([P.PAY_VIEW_REFUNDS, P.PAY_CREATE_REFUND, P.PAY_VIEW_COLLECTIONS]);
  mocks.fieldAccess = {};
  mocks.custody = "HELD";
  mocks.links = [LINK];
  mocks.method = "ONLINE";
  mocks.collections = [PAYMENT(), PAYMENT({ id: 6, reference: "COL-6", customer_code: "C-009" })];
  mocks.linksAsked = [];
  mocks.collectionsAsked = [];
  for (const fn of [mocks.link, mocks.verify, mocks.payFromBank]) {
    fn.mockReset();
    fn.mockReturnValue({ unwrap: async () => ({ message: "Done.", data: LINK }) });
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
const panel = (onSend = vi.fn().mockResolvedValue(undefined)) => {
  act(() => root.render(
    <ProviderRefundPanel refundId={12} refundStatus="DRAFT" method={mocks.method} customerCode="C-001" entity="BSS" currency="NGN" amount={10_000_000} onSend={onSend} />,
  ));
  return onSend;
};

describe("a refund Paystack failed", () => {
  it("reads Failed with Paystack's reason", () => {
    panel();
    const text = container.textContent ?? "";
    expect(text).toContain("Returned through Paystack");
    expect(text).toContain("Failed");
    expect(container.querySelector("[data-testid=provider-refund-reason]")?.textContent).toContain("Insufficient balance on the merchant account.");
    expect(text).toContain("COL-5");
  });

  it("ties the same payment again, then sends the draft through the normal route", async () => {
    const send = panel();
    await act(async () => { button("Try again")!.click(); });
    expect(mocks.link).toHaveBeenCalledWith({ entity: "BSS", refund: 12, collection: 5 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not send when the tie is refused", async () => {
    mocks.link.mockReturnValue({ unwrap: async () => { throw { status: 409 }; } });
    const send = panel();
    await act(async () => { button("Try again")!.click(); });
    expect(send).not.toHaveBeenCalled();
  });

  it("pays from the bank instead, with the account chosen", async () => {
    panel();
    act(() => button("Pay from bank instead")!.click());
    const confirm = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Pay from bank") as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    act(() => button("Pick Lekki bank")!.click());
    await act(async () => { confirm().click(); });
    expect(mocks.payFromBank).toHaveBeenCalledWith({ id: 7, entity: "BSS", bank_account: 9 });
  });

  it("offers neither action to someone who may only read refunds", () => {
    mocks.held = new Set([P.PAY_VIEW_REFUNDS]);
    panel();
    expect(button("Try again")).toBeUndefined();
    expect(button("Pay from bank instead")).toBeUndefined();
    expect(container.textContent).toContain("Failed");
  });

  it("is absent for someone who may not read refunds", () => {
    mocks.held = new Set();
    panel();
    expect(container.textContent).toBe("");
    expect(mocks.linksAsked.every((q) => (q as { skip: boolean }).skip)).toBe(true);
  });

  it("shows no reason, status or reference where Field Access hides them", () => {
    const { failure_reason: _reason, provider_reference: _ref, status: _status, provider_status: _ps, ...bare } = LINK;
    mocks.links = [bare];
    panel();
    const text = container.textContent ?? "";
    expect(text).not.toContain("Why it failed");
    expect(text).not.toContain("ref_77");
    expect(container.querySelector(".bg-destructive\\/10")).toBeNull();
    expect(button("Try again")).toBeUndefined();
  });
});

describe("a refund Paystack is handling", () => {
  it("reads Processing, offers to check with Paystack and nothing else", async () => {
    mocks.links = [{ ...LINK, status: "PROCESSING", refund_status: "APPROVED", failure_reason: "" }];
    panel();
    expect(container.textContent).toContain("Processing");
    expect(button("Try again")).toBeUndefined();
    expect(button("Pay from bank instead")).toBeUndefined();
    await act(async () => { button("Check with Paystack")!.click(); });
    expect(mocks.verify).toHaveBeenCalledWith({ id: 7, entity: "BSS" });
  });

  it("reads Returned once it has gone back", () => {
    mocks.links = [{ ...LINK, status: "PROCESSED", refund_status: "POSTED", processed_at: "2026-10-13T10:30:00Z" }];
    panel();
    expect(container.textContent).toContain("Returned");
    expect(container.textContent).toContain("2026-10-13 10:30");
  });
});

describe("a draft online refund with no payment yet", () => {
  it("lets the payment be chosen and tied", async () => {
    mocks.links = [];
    panel();
    expect(container.textContent).toContain("Original payment");
    const reference = container.querySelector('input[placeholder^="For example"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setter.call(reference, "COL-5"); reference.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { button("Tie to this payment")!.click(); });
    expect(mocks.link).toHaveBeenCalledWith({ entity: "BSS", refund: 12, collection: "COL-5" });
  });

  it("is not offered to a role that may not write the payment", () => {
    mocks.links = [];
    mocks.fieldAccess = { "payments.refund": { hidden: [], read_only: ["collection"], open_on_create: [] } };
    panel();
    expect(button("Tie to this payment")).toBeUndefined();
  });

  it("is absent from a bank refund altogether", () => {
    mocks.links = [];
    mocks.method = "BANK_TRANSFER";
    panel();
    expect(container.textContent).toBe("");
  });
});

describe("the online choice on a new refund", () => {
  const fields = (value = NO_ONLINE_REFUND, onChange = vi.fn()) => {
    act(() => root.render(<OnlineRefundFields entity="BSS" currency="NGN" customerCode="C-001" branch={2} amount={10_000_000} value={value} onChange={onChange} />));
    return onChange;
  };

  it("is offered at a school that holds its online money", () => {
    fields();
    expect(container.textContent).toContain("Back through Paystack");
  });

  it("is never offered at a school whose payments settle straight to its banks", () => {
    mocks.custody = "DIRECT";
    fields();
    expect(container.textContent).toBe("");
  });

  it("is not offered when the custody cannot be read, or to someone who may not tie a payment", () => {
    mocks.custody = "UNKNOWN";
    fields();
    expect(container.textContent).toBe("");
    mocks.custody = "HELD";
    mocks.held = new Set([P.PAY_VIEW_REFUNDS]);
    fields();
    expect(container.textContent).toBe("");
  });

  it("lists only the customer's confirmed payments at the refund's branch, and refuses an amount above the payment", () => {
    mocks.collections = [PAYMENT(), PAYMENT({ id: 8, reference: "COL-8", branch: 1 }), PAYMENT({ id: 6, reference: "COL-6", customer_code: "C-009" })];
    const picked = PAYMENT();
    fields({ online: true, collection: "5", payment: picked as never });
    expect(container.textContent).toContain("Original payment");
    act(() => root.render(<OnlineRefundFields entity="BSS" currency="NGN" customerCode="C-001" branch={2} amount={18_000_001} value={{ online: true, collection: "5", payment: picked as never }} onChange={vi.fn()} />));
    expect(container.textContent).toContain("The refund is more than the payment it returns.");
  });

  it("asks the server for this customer's paid payments only", () => {
    fields();
    act(() => button("Back through Paystack")!.click());
    fields({ online: true, collection: "", payment: null });
    expect(mocks.collectionsAsked).toContainEqual({
      args: { entity: "BSS", group: "PAID", customer: "C-001", page_size: 100 }, skip: false,
    });
  });

  it("switches between the bank and the provider", () => {
    const onChange = fields();
    act(() => button("Back through Paystack")!.click());
    expect(onChange).toHaveBeenCalledWith({ online: true, collection: "", payment: null });
  });
});

describe("the one-line state on the refunds list", () => {
  it("names the provider and the state", () => {
    act(() => root.render(<ProviderRefundChip link={{ ...LINK, status: "PROCESSING" } as never} />));
    expect(container.textContent).toBe("Paystack: Processing");
  });

  it("shows nothing for a refund with no online side, or where the status is hidden", () => {
    act(() => root.render(<ProviderRefundChip link={undefined} />));
    expect(container.textContent).toBe("");
    mocks.fieldAccess = { "payments.refund": { hidden: ["status"], read_only: [], open_on_create: [] } };
    act(() => root.render(<ProviderRefundChip link={{ ...LINK, status: undefined } as never} />));
    expect(container.textContent).toBe("");
  });
});
