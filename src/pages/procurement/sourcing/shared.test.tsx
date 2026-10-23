/**
 * Compare quotations lists the RFQs a vendor has replied to.
 *
 * The modal asks the server for RFQs with a reply (`has_responses`), so its
 * chips are the newest comparable RFQs rather than whichever of the newest
 * page happened to have bids. Bright Star's buyer, with forty answered RFQs
 * since September, can still reach March's laboratory-stool RFQ: when the
 * server counts more comparable RFQs than the page holds, a search beside the
 * chips finds the older ones.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { rfqArgs: [] as unknown[], rfqs: undefined as unknown, picker: vi.fn() };
  const query = () => ({ data: undefined, currentData: undefined, isLoading: false, isFetching: false, isError: false, refetch: () => undefined });
  /** Every hook an RTK Query module exports, answering empty unless named in `own`. */
  const api = (own: Record<string, unknown>) => new Proxy(own, {
    has: () => true,
    get: (target, key) => {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      if (key.endsWith("Mutation")) return () => [() => ({ unwrap: async () => ({}) }), { isLoading: false }];
      if (key.startsWith("use")) return query;
      return undefined;
    },
  });
  return { state, query, api };
});

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true, hasModuleAccess: () => true, fieldAccess: {} }),
}));
vi.mock("../../../lib/display-prefs", () => ({
  useDates: () => ({ day: (value: string) => String(value).slice(0, 10), dateTime: String, time: String, today: () => "2026-10-06" }),
}));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("../pickers", () => ({ RfqPicker: (props: unknown) => { mocks.state.picker(props); return null; } }));
vi.mock("@/redux/services/procurement/procurement-ext-api", () => mocks.api({
  useGetRfqsQuery: (args: unknown) => { mocks.state.rfqArgs.push(args); return { ...mocks.query(), data: mocks.state.rfqs }; },
}));

import { CompareModal } from "./shared";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rfq = (id: number, number: string, bids: number) => ({ id, document_number: number, title: "Stools", response_count: bids });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.state.rfqArgs = [];
  mocks.state.picker.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = () => act(() => root.render(<CompareModal entity="BSS" currency="NGN" open onClose={() => undefined} />));

describe("the RFQs compare quotations offers", () => {
  it("asks the server for RFQs a vendor has replied to", () => {
    mocks.state.rfqs = { data: [rfq(40, "RQ-0040", 3)], pagination: { totalItems: 1 } };
    render();
    expect(mocks.state.rfqArgs.at(-1)).toEqual({ entity: "BSS", has_responses: "true" });
    expect(document.body.textContent).toContain("RQ-0040");
    expect(mocks.state.picker).not.toHaveBeenCalled();
  });

  it("offers a search for older answered RFQs when the page does not hold them all", () => {
    mocks.state.rfqs = { data: [rfq(40, "RQ-0040", 3), rfq(39, "RQ-0039", 1)], pagination: { totalItems: 41 } };
    render();
    expect(mocks.state.picker).toHaveBeenLastCalledWith(expect.objectContaining({ entity: "BSS", withBids: true, value: "" }));
  });

  it("says no RFQ has a reply when the server finds none", () => {
    mocks.state.rfqs = { data: [], pagination: { totalItems: 0 } };
    render();
    expect(document.body.textContent).toContain("No RFQ has received a quotation yet.");
  });
});
