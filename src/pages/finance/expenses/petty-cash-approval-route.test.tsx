/**
 * The ready-made approval route for petty cash returns.
 *
 * Mrs Bello covers the whole of Bright Star and holds the publish key: she sees
 * the route, a N5,000 shortage figure she may change, and Adopt. Mrs Adeyemi is
 * Lekki's own bursar: she reads the route and is told why she cannot adopt it.
 * Once adopted the card says so with the school's own figure, never offers to
 * replace it, and reminds the reader that the approver group starts empty only
 * while nobody is in it. The group reads by name, never by its code.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adopt: vi.fn(),
  route: null as unknown,
  query: vi.fn(),
  denied: new Set<string>(),
  wholeSchool: true,
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetPettyCashReturnRouteQuery: (...args: unknown[]) => {
    mocks.query(...args);
    return { data: mocks.route ? { data: mocks.route } : undefined, isLoading: false };
  },
  useAdoptPettyCashReturnRouteMutation: () => [mocks.adopt, { isLoading: false }],
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => !mocks.denied.has(code),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
  }),
}));

vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  MoneyInput: ({ valueKobo, onChangeKobo }: { valueKobo: number; onChangeKobo: (kobo: number) => void }) => (
    <input data-money value={String(valueKobo)} onChange={(event) => onChangeKobo(Number(event.target.value))} />
  ),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import { P } from "../../../permissions";
import { PettyCashApprovalRouteCard, adoptRefusal, approverGroupName } from "./petty-cash-approval-route";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROUTE = {
  document_type: "finance.petty_cash_return", code: "default", name: "Petty cash return approval",
  threshold: 500_000, threshold_naira: "₦5,000.00", default_threshold: 500_000,
  approver_group_code: "finance-petty-cash-approver", approver_group_id: null, approver_group_member_count: 0,
  stages: [{ code: "second-approval", label: "Second approval of a short count or a closure", kind: "APPROVAL", approver_group_code: "finance-petty-cash-approver" }],
  adopted: false, route_id: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.adopt.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Petty cash return approval route adopted." }) });
  mocks.query.mockReset();
  mocks.route = ROUTE;
  mocks.denied = new Set();
  mocks.wholeSchool = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const testId = (id: string) => container.querySelector(`[data-testid=${id}]`);

function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("approval for petty cash returns", () => {
  it("lets a whole-school reader adopt the route with the N5,000 figure, or their own", async () => {
    act(() => root.render(<PettyCashApprovalRouteCard entity="BSS" />));
    expect(testId("route-none")?.textContent).toContain("A return posts as soon as it is raised.");
    expect(testId("route-stages")?.textContent).toContain("more than ₦5,000.00 short, and every closure");
    expect(testId("route-stages")?.textContent).toContain("Finance Petty Cash Approver");
    expect(container.textContent).not.toContain("finance-petty-cash-approver");
    expect(container.querySelector<HTMLInputElement>("input[data-money]")?.value).toBe("500000");

    act(() => type(container.querySelector<HTMLInputElement>("input[data-money]")!, "1000000"));
    await act(async () => button("Adopt route")!.click());
    expect(mocks.adopt).toHaveBeenCalledWith({ entity: "BSS", threshold: 1_000_000 });
    expect(mocks.toast.success).toHaveBeenCalledWith("Petty cash return approval route adopted.");
  });

  it("does not offer Adopt to a branch's own bursar, and says why", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<PettyCashApprovalRouteCard entity="BSS" />));
    expect(button("Adopt route")).toBeUndefined();
    expect(testId("adopt-refusal")?.textContent).toContain("covers the whole school");
  });

  it("does not offer Adopt without the publish key", () => {
    mocks.denied = new Set([P.PUBLISH_WORKFLOW_TEMPLATE]);
    act(() => root.render(<PettyCashApprovalRouteCard entity="BSS" />));
    expect(button("Adopt route")).toBeUndefined();
    expect(adoptRefusal({ canPublish: false, wholeSchool: true })).toContain("publish approval routes");
  });

  it("shows an adopted route as the school's own, with the empty-group reminder", () => {
    mocks.route = { ...ROUTE, adopted: true, route_id: 42, approver_group_id: 5 };
    act(() => root.render(<PettyCashApprovalRouteCard entity="BSS" />));
    expect(testId("route-adopted")?.textContent).toContain("more than ₦5,000.00 short");
    expect(testId("route-group-reminder")?.textContent).toContain("Finance Petty Cash Approver starts empty");
    expect(testId("route-group-members")).toBeNull();
    expect(button("Adopt route")).toBeUndefined();
  });

  it("shows the figure the school's route holds now, and drops the reminder once the group has people", () => {
    mocks.route = {
      ...ROUTE, adopted: true, route_id: 42, approver_group_id: 5,
      threshold: 2_000_000, threshold_naira: "₦20,000.00", approver_group_member_count: 2,
    };
    act(() => root.render(<PettyCashApprovalRouteCard entity="BSS" />));
    expect(testId("route-adopted")?.textContent).toContain("more than ₦20,000.00 short");
    expect(testId("route-group-reminder")).toBeNull();
    expect(testId("route-group-members")?.textContent).toBe("2 people in Finance Petty Cash Approver can approve these returns.");
  });

  it("names no figure for a route the school has edited the shortage test out of", () => {
    mocks.route = { ...ROUTE, adopted: true, route_id: 42, threshold: null, threshold_naira: null };
    act(() => root.render(<PettyCashApprovalRouteCard entity="BSS" />));
    expect(testId("route-adopted")?.textContent).not.toContain("₦");
  });

  it("is absent, and asks nothing, without the key that reads approval routes", () => {
    mocks.denied = new Set([P.VIEW_WORKFLOW_TEMPLATES]);
    act(() => root.render(<PettyCashApprovalRouteCard entity="BSS" />));
    expect(container.textContent).toBe("");
    expect(mocks.query).toHaveBeenCalledWith({ entity: "BSS" }, { skip: true });
  });
});

describe("approverGroupName", () => {
  it("names a group from its code as the server does", () => {
    expect(approverGroupName("finance-petty-cash-approver")).toBe("Finance Petty Cash Approver");
    expect(approverGroupName("payout_approvers")).toBe("Payout Approvers");
    expect(approverGroupName("IKEJA-bursars")).toBe("Ikeja Bursars");
  });
});
