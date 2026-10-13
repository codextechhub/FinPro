/**
 * Branch Terminals.
 *
 * Bright Star School has Ikeja and Lekki. Ikeja's terminal is open and shows
 * the payment page with a code to scan. Lekki's branch has no phone on file, so
 * its terminal waits for a number; Mrs Adeyemi, who may change terminals, adds
 * hers and the terminal opens. Greenfield has one branch: its one terminal is
 * shown without naming a branch. A terminal never loses its last number.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  fieldAccess: {} as Record<string, unknown>,
  terminals: [] as unknown[],
  destinations: {} as Record<number, unknown[]>,
  destinationsAsked: [] as number[],
  retry: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  applies: true,
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
  useGetTerminalsQuery: () => ({ data: { data: mocks.terminals }, isLoading: false, isError: false, refetch: vi.fn() }),
  useRetryTerminalMutation: () => [mocks.retry, { isLoading: false }],
  useGetTerminalDestinationsQuery: ({ id }: { id: number }) => {
    mocks.destinationsAsked.push(id);
    return { data: { data: mocks.destinations[id] ?? [] }, isLoading: false, isError: false };
  },
  useAddTerminalDestinationMutation: () => [mocks.add, { isLoading: false }],
  useRemoveTerminalDestinationMutation: () => [mocks.remove, { isLoading: false }],
}));

vi.mock("../../host", () => ({
  hostBranchLens: () => ({ applies: mocks.applies, pinnedBranch: null, branch: "all", choices: [], isLoading: false }),
  useBranches: () => ({ data: mocks.applies ? [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }] : [{ id: 1, name: "Main" }], isLoading: false, isError: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "../../permissions";
import { TerminalsTab } from "./terminals-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const terminal = (over: Record<string, unknown>) => ({
  id: 1, branch: 1, branch_name: "Ikeja", provider: "PAYSTACK", code: "VT_ikeja", name: "Ikeja desk", status: "ACTIVE", attempts: 1,
  last_error: "", payment_details: {}, routed_to_branch_bank: false, created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-01T09:00:00Z",
  ...over,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.held = new Set([P.PAY_VIEW_TERMINALS, P.PAY_UPDATE_TERMINAL]);
  mocks.fieldAccess = {};
  mocks.applies = true;
  mocks.destinationsAsked = [];
  mocks.destinations = { 1: [{ name: "Mrs Eze", number: "+2348011111111" }, { name: "Mr Bello", number: "+2348022222222" }], 2: [] };
  mocks.terminals = [
    terminal({ payment_details: { payment_url: "https://pay.example/ikeja", poster_url: "https://pay.example/poster.pdf", paymentMethods: ["Bank transfer", "Card"] } }),
    terminal({ id: 2, branch: 2, branch_name: "Lekki", code: "", name: "Lekki desk", status: "NEEDS_NUMBER", payment_details: {} }),
  ];
  for (const fn of [mocks.retry, mocks.add, mocks.remove]) {
    fn.mockReset();
    fn.mockReturnValue({ unwrap: async () => ({ message: "Done." }) });
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = () => act(() => root.render(<TerminalsTab entity="BSS" />));
const card = (id: number) => container.querySelector(`[data-testid=terminal-${id}]`) as HTMLElement;
const button = (within: ParentNode, label: string) => [...within.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
const setValue = (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
};

describe("each branch's terminal in plain words", () => {
  it("names the branch at a school with several, and reads Open or Waiting for a phone number", () => {
    render();
    expect(card(1).textContent).toContain("Ikeja");
    expect(card(1).textContent).toContain("Open");
    expect(card(2).textContent).toContain("Lekki");
    expect(card(2).textContent).toContain("Waiting for a phone number");
    expect(card(2).textContent).toContain("This branch has no phone number on file. Add one and the terminal opens.");
  });

  it("tells a viewer that someone else must add the number a waiting terminal needs", () => {
    mocks.held = new Set([P.PAY_VIEW_TERMINALS]);
    render();
    expect(card(2).textContent).toContain("Someone who can change terminals must add a WhatsApp number before it opens.");
    expect(card(2).textContent).not.toContain("Add a WhatsApp number below");
  });

  it("does not name the branch at a school with one", () => {
    mocks.applies = false;
    mocks.terminals = [terminal({ branch_name: "Main", name: "Front desk" })];
    render();
    expect(card(1).textContent).not.toContain("Main");
    expect(card(1).querySelector("h2")?.textContent).toBe("Front desk");
  });

  it("reads Failed with the reason and offers Try again to someone who may change it", async () => {
    mocks.terminals = [terminal({ status: "FAILED", last_error: "The provider refused the branch's phone number." })];
    render();
    expect(card(1).textContent).toContain("Failed");
    expect(card(1).querySelector("[data-testid=terminal-error]")?.textContent).toContain("The provider refused the branch's phone number.");
    await act(async () => { button(card(1), "Try again")!.click(); });
    expect(mocks.retry).toHaveBeenCalledWith({ id: 1, entity: "BSS" });
  });

  it("offers no retry to a viewer, and never reads the numbers for one", () => {
    mocks.held = new Set([P.PAY_VIEW_TERMINALS]);
    mocks.terminals = [terminal({ status: "FAILED", last_error: "No luck." })];
    render();
    expect(button(card(1), "Try again")).toBeUndefined();
    expect(card(1).textContent).not.toContain("WhatsApp numbers");
    expect(mocks.destinationsAsked).toEqual([]);
  });

  it("says a switched-off terminal cannot be turned back on, and offers no retry", () => {
    mocks.terminals = [terminal({ status: "DEACTIVATED" })];
    render();
    expect(card(1).textContent).toContain("Switched off");
    expect(button(card(1), "Try again")).toBeUndefined();
    expect(button(card(1), "Refresh details")).toBeUndefined();
  });

  it("refreshes an open terminal's details", async () => {
    render();
    await act(async () => { button(card(1), "Refresh details")!.click(); });
    expect(mocks.retry).toHaveBeenCalledWith({ id: 1, entity: "BSS" });
  });
});

describe("how to pay at the terminal", () => {
  it("shows the payment page with a code, the poster and the methods", () => {
    render();
    expect((card(1).querySelector('input[aria-label="Payment page"]') as HTMLInputElement).value).toBe("https://pay.example/ikeja");
    expect(card(1).querySelector("svg title")?.textContent).toBe("Payment code");
    expect(card(1).textContent).toContain("Poster");
    expect(card(1).textContent).toContain("Bank transfer");
    expect(card(1).textContent).toContain("Card");
  });

  it("says when the provider returned nothing yet", () => {
    mocks.terminals = [terminal({ payment_details: {} })];
    render();
    expect(card(1).textContent).toContain("has not returned a payment page for this terminal yet");
  });

  it("is absent where Field Access hides the details", () => {
    const { payment_details: _details, ...hidden } = terminal({});
    mocks.terminals = [hidden];
    render();
    expect(card(1).textContent).not.toContain("How to pay");
  });
});

describe("the WhatsApp numbers", () => {
  it("lists them and adds one", async () => {
    render();
    expect(card(1).textContent).toContain("+2348011111111");
    const inputs = [...card(2).querySelectorAll("input")] as HTMLInputElement[];
    setValue(inputs[0], "Mrs Adeyemi");
    setValue(inputs[1], "08012345678");
    await act(async () => { button(card(2), "Add")!.click(); });
    expect(mocks.add).toHaveBeenCalledWith({ id: 2, entity: "BSS", name: "Mrs Adeyemi", number: "08012345678" });
  });

  it("will not add a malformed number", () => {
    render();
    const inputs = [...card(2).querySelectorAll("input")] as HTMLInputElement[];
    setValue(inputs[0], "Mrs Adeyemi");
    setValue(inputs[1], "nope");
    expect(button(card(2), "Add")!.disabled).toBe(true);
  });

  it("removes one behind a confirmation", async () => {
    render();
    act(() => button(card(1), "Remove")!.click());
    const confirm = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Remove") as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    expect(mocks.remove).toHaveBeenCalledWith({ id: 1, entity: "BSS", number: "+2348011111111" });
  });

  it("keeps the last number: Remove is disabled with one left", () => {
    mocks.destinations = { 1: [{ name: "Mrs Eze", number: "+2348011111111" }], 2: [] };
    render();
    expect(button(card(1), "Remove")!.disabled).toBe(true);
  });

  it("shows the server's words when it refuses to remove the last one", async () => {
    mocks.remove.mockReturnValue({ unwrap: async () => { throw { status: 409, data: { message: "A terminal must keep at least one WhatsApp number." } }; } });
    render();
    act(() => button(card(1), "Remove")!.click());
    const confirm = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Remove") as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    expect(card(1).querySelector("[data-testid=terminal-notice]")?.textContent).toBe("A terminal must keep at least one WhatsApp number.");
  });

  it("stops offering to add at five", () => {
    mocks.destinations = { 1: [1, 2, 3, 4, 5].map((n) => ({ name: `P${n}`, number: `+23480000000${n}` })), 2: [] };
    render();
    expect(card(1).textContent).toContain("five numbers, the most it keeps");
    expect(card(1).querySelectorAll("input").length).toBe(1);
  });

  it("hides what Field Access hides, and takes away Remove when the number is hidden", () => {
    mocks.fieldAccess = { "payments.terminal_destination": { hidden: ["number"], read_only: [], open_on_create: ["number", "name"] } };
    mocks.destinations = { 1: [{ name: "Mrs Eze" }, { name: "Mr Bello" }], 2: [] };
    render();
    expect(card(1).textContent).toContain("Mrs Eze");
    expect(card(1).textContent).not.toContain("+234");
    expect(button(card(1), "Remove")).toBeUndefined();
  });
});
