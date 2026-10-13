/**
 * Mr Okafor's payer account pays for Ada and Emeka.
 *
 * The Payers tab of a customer's record lists who a customer pays for and who
 * pays for them, by filtering on the payer or on the linked customer. A reader
 * whose `finance.payer_link` switches hide either side cannot be shown a row, so
 * the panel and its tab are left out and no filter is sent. A reader who may not
 * write the payer or the customer is not offered the link form, and one who may
 * not write the active switch cannot end a link.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer } from "@/redux/services/finance/ar-types";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, { hidden?: string[]; read_only?: string[] } | undefined>,
  queries: vi.fn(),
  create: vi.fn(),
  end: vi.fn(),
  rows: [] as unknown[],
  createFails: null as unknown,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: mocks.fieldAccess,
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useGetPayerLinksQuery: (args: unknown, options?: { skip?: boolean }) => {
    mocks.queries(args, options);
    return { data: options?.skip ? undefined : { data: mocks.rows }, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useCreatePayerLinkMutation: () => [(body: unknown) => {
    mocks.create(body);
    return { unwrap: () => (mocks.createFails ? Promise.reject(mocks.createFails) : Promise.resolve({ message: "Linked." })) };
  }, { isLoading: false }],
  useEndPayerLinkMutation: () => [(body: unknown) => { mocks.end(body); return { unwrap: () => Promise.resolve({ message: "Ended." }) }; }, { isLoading: false }],
}));
vi.mock("@/components/finance-ui/can", () => ({ useCan: () => ({ can: () => true }) }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CustomerPicker: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" data-picker="customer" onClick={() => onChange("CUS-ADA")}>pick</button>,
}));

import { PayerLinksPanel, payerLinksReadable } from "./payer-links-panel";
import { resolveFieldAccess } from "@/components/finance-ui";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OKAFOR = { id: 9, code: "PAY-OKAFOR", name: "Mr Okafor" } as Customer;
const LINK = {
  id: 1, payer: { id: 9, code: "PAY-OKAFOR", name: "Mr Okafor" }, customer: { id: 11, code: "CUS-ADA", name: "Ada Okafor" },
  is_active: true, source_type: "", source_id: "",
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.fieldAccess = {}; mocks.rows = [LINK]; mocks.createFails = null;
  mocks.queries.mockClear(); mocks.create.mockClear(); mocks.end.mockClear();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const access = (entry: { hidden?: string[]; read_only?: string[] }) => { mocks.fieldAccess = { "finance.payer_link": entry }; };
const mount = () => act(() => root.render(<PayerLinksPanel entity="HOLYCROSS" customer={OKAFOR} />));
const text = () => container.textContent ?? "";
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label));

describe("who may see the payer links", () => {
  it("needs both the payer and the linked customer to be readable", () => {
    expect(payerLinksReadable(resolveFieldAccess({}, "finance.payer_link"))).toBe(true);
    expect(payerLinksReadable(resolveFieldAccess({ "finance.payer_link": { hidden: ["payer"] } }, "finance.payer_link"))).toBe(false);
    expect(payerLinksReadable(resolveFieldAccess({ "finance.payer_link": { hidden: ["customer"] } }, "finance.payer_link"))).toBe(false);
    expect(payerLinksReadable(resolveFieldAccess({ "finance.payer_link": { hidden: ["is_active"] } }, "finance.payer_link"))).toBe(true);
  });

  it("lists both sides with a status and an End action with full access", () => {
    mount();
    expect(text()).toContain("Ada Okafor");
    expect(text()).toContain("Active");
    expect(button("End")).toBeDefined();
    expect(mocks.queries).toHaveBeenCalledWith({ entity: "HOLYCROSS", payer: "PAY-OKAFOR" }, { skip: false });
    expect(mocks.queries).toHaveBeenCalledWith({ entity: "HOLYCROSS", customer: "PAY-OKAFOR" }, { skip: false });
  });

  it("renders nothing, and sends neither filter, when the payer is hidden", () => {
    access({ hidden: ["payer"] });
    mount();
    expect(text()).toBe("");
    expect(mocks.queries.mock.calls.every(([, options]) => (options as { skip: boolean }).skip)).toBe(true);
  });

  it("renders nothing when the linked customer is hidden", () => {
    access({ hidden: ["customer"] });
    mount();
    expect(text()).toBe("");
  });
});

describe("the active switch", () => {
  it("leaves out the status and the End action when the active field is hidden", () => {
    access({ hidden: ["is_active"] });
    const { is_active, ...bare } = LINK;
    mocks.rows = [bare];
    mount();
    expect(text()).toContain("Ada Okafor");
    expect(text()).not.toContain("Active");
    expect(button("End")).toBeUndefined();
  });

  it("keeps the status but offers no End action when the active field is read-only", () => {
    access({ read_only: ["is_active"] });
    mount();
    expect(text()).toContain("Active");
    expect(button("End")).toBeUndefined();
  });
});

describe("linking a customer", () => {
  it("sends the payer and the customer", async () => {
    mount();
    act(() => document.body.querySelector<HTMLElement>("[data-picker='customer']")!.click());
    await act(async () => { button("Link")!.click(); });
    expect(mocks.create).toHaveBeenCalledWith({ entity: "HOLYCROSS", payer: "PAY-OKAFOR", customer: "CUS-ADA" });
  });

  it("is not offered when the payer or the customer is read-only", () => {
    for (const entry of [{ read_only: ["payer"] }, { read_only: ["customer"] }]) {
      access(entry);
      mount();
      expect(document.body.querySelector("[data-picker='customer']")).toBeNull();
      expect(button("Link")).toBeUndefined();
    }
  });

  it("shows a refusal about reactivating an ended link", async () => {
    mocks.createFails = { status: 403, data: { error: { code: "field_write_denied", detail: { is_active: ["You may not change link active."] } } } };
    mount();
    act(() => document.body.querySelector<HTMLElement>("[data-picker='customer']")!.click());
    await act(async () => { button("Link")!.click(); });
    expect(text()).toContain("You may not change link active.");
  });
});
