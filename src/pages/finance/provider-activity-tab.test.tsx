/**
 * Payment provider activity at Bright Star.
 *
 * Mrs Okafor's checkout for Tunde's fees was refused by Paystack, and the
 * bursar, Mr Eze, opens the screen to see why. The refused row says so in
 * full, in the failure colour, with its reference ready to copy. A payout
 * that went through reads Succeeded. Filtering by result asks the server for
 * succeeded=false, and nothing from the stored metadata is shown.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ args: [] as unknown[], rows: [] as unknown[] }));

vi.mock("@/redux/services/payments/payments-api", () => ({
  useGetTransactionsLogQuery: (args: unknown) => {
    mocks.args.push(args);
    return { data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, error: undefined, refetch: vi.fn() };
  },
}));
vi.mock("../../lib/display-prefs", () => ({ useDates: () => ({ dateTime: (v: string) => v.slice(0, 16).replace("T", " "), day: String }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PROVIDER_ACTIONS, ProviderActivityTab, providerActivityArgs, providerActor } from "./provider-activity-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REFUSED = {
  id: 7, entity_code: "BSS", provider: "PAYSTACK", action: "COLLECTION_INITIATED", action_display: "Collection initiated",
  reference: "COL-20261006-0007", succeeded: false,
  message: "Paystack refused the checkout: the payer email is not valid. Correct the email and start again.",
  metadata: { channel: "CHECKOUT", secret_note: "do-not-show" },
  actor_email: "okafor@brightstar.test", created_at: "2026-10-06T09:15:00Z",
  acted_label: "Mrs Okafor", real_actor_name: null, proxied_user_name: null, actor_user_is_exited: false, proxied_by_is_exited: false,
};
const PAID = {
  ...REFUSED, id: 8, action: "PAYOUT_CONFIRMED", action_display: "Payout confirmed", reference: "PO-0008",
  succeeded: true, message: "Paid ₦45,000.00 to Ade Stationers.", acted_label: "Mr Eze", actor_user_is_exited: true,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.args = [];
  mocks.rows = [REFUSED, PAID];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = () => act(() => root.render(<ProviderActivityTab entity="BSS" />));
const row = (ref: string) => [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(ref)) as HTMLElement;

describe("the provider activity list", () => {
  it("shows when, what, the reference, the result, the message and who", () => {
    render();
    const paid = row("PO-0008").textContent ?? "";
    expect(paid).toContain("Payout confirmed");
    expect(paid).toContain("Succeeded");
    expect(paid).toContain("Paid ₦45,000.00 to Ade Stationers.");
    expect(paid).toContain("Mr Eze");
    expect(paid).toContain("2026-10-06 09:15");
  });

  it("gives a refused row's reason in full, in the failure colour, with a copyable reference", () => {
    render();
    const refused = row("COL-20261006-0007");
    expect(refused.textContent).toContain("Failed");
    const message = [...refused.querySelectorAll("span")].find((s) => s.textContent === REFUSED.message);
    expect(message?.className).toContain("text-destructive");
    expect(refused.querySelector('button[aria-label="Copy reference COL-20261006-0007"]')).not.toBeNull();
  });

  it("never shows the stored metadata", () => {
    render();
    expect(container.textContent).not.toContain("do-not-show");
    expect(container.textContent).not.toContain("CHECKOUT");
  });

  it("marks somebody who has left", () => {
    render();
    const who = [...row("PO-0008").querySelectorAll("span")].find((s) => s.textContent === "Mr Eze");
    expect(who?.getAttribute("title")).toBe("No longer on the staff");
  });

  it("asks the server for failed or refused requests when that result is picked", () => {
    render();
    const result = container.querySelector('select[aria-label="Result"]') as HTMLSelectElement;
    act(() => {
      result.value = "false";
      result.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.args.at(-1)).toMatchObject({ entity: "BSS", page: 1, succeeded: "false" });
  });
});

describe("the filters and who acted", () => {
  it("send only what is chosen", () => {
    expect(providerActivityArgs({ action: "", result: "", provider: "" })).toEqual({});
    expect(providerActivityArgs({ action: "PAYOUT_FAILED", result: "false", provider: "PAYSTACK" }))
      .toEqual({ action: "PAYOUT_FAILED", succeeded: "false", provider: "PAYSTACK" });
  });

  it("names the platform itself System", () => {
    expect(providerActor({ acted_label: "", actor_email: null })).toBe("System");
    expect(providerActor({ acted_label: "Ada Obi for Chioma Okafor", actor_email: "chioma@x.test" })).toBe("Ada Obi for Chioma Okafor");
  });
});

/**
 * `PaymentAuditAction` in the backend's `apps/vs_payments/constants.py`, as the
 * filter must offer it. The first test pins the list so a change to the filter
 * is deliberate; the second reads the backend source itself, when its checkout
 * is named in XVS_BACKEND_DIR, so a new server action cannot go unfiltered.
 */
const SERVER_ACTIONS: readonly (readonly [string, string])[] = [
  ["COLLECTION_INITIATED", "Collection initiated"],
  ["COLLECTION_CONFIRMED", "Collection confirmed"],
  ["COLLECTION_FAILED", "Collection failed"],
  ["VIRTUAL_ACCOUNT_CREATED", "Virtual account created"],
  ["VIRTUAL_ACCOUNT_STATUS_CHANGED", "Virtual account status changed"],
  ["PAYOUT_INITIATED", "Payout initiated"],
  ["PAYOUT_CONFIRMED", "Payout confirmed"],
  ["PAYOUT_FAILED", "Payout failed"],
  ["PAYOUT_BATCH_CREATED", "Payout batch created"],
  ["PAYOUT_BATCH_SUBMITTED", "Payout batch submitted"],
  ["WEBHOOK_RECEIVED", "Webhook received"],
  ["WEBHOOK_REJECTED", "Webhook rejected"],
  ["COLLECTIONS_SETTLED", "Collections settled to a bank"],
  ["SUBACCOUNT_SAVED", "Collection subaccount saved"],
  ["CUSTODY_SETTINGS_UPDATED", "Custody settings updated"],
  ["CUSTODY_SWITCHED", "Custody mode switched"],
  ["CUSTODY_SWITCH_WAITING", "Custody switch waiting"],
  ["HELD_SETTLEMENT_BUILT", "Held settlement built"],
  ["HELD_SETTLEMENT_PAID", "Held settlement paid"],
  ["HELD_SETTLEMENT_FAILED", "Held settlement failed"],
  ["HELD_FUNDS_REFUSED", "Payout refused: held funds"],
  ["HELD_OPENING_BALANCE", "Held opening balance"],
  ["VIRTUAL_ACCOUNT_REISSUED", "Virtual account reissued"],
  ["PROVIDER_DISPUTE_RECEIVED", "Chargeback or refund received"],
  ["PROVIDER_DISPUTE_RESOLVED", "Chargeback resolved"],
];

/** The backend checkout named for the source check; absent in a host app's run. */
const BACKEND_DIR = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.XVS_BACKEND_DIR;

describe("the What filter", () => {
  it("offers every action the log can hold, with the server's display names", () => {
    expect(PROVIDER_ACTIONS).toEqual(SERVER_ACTIONS);
  });

  it("offers the four custody and held-balance actions that used to show only under Everything", () => {
    render();
    const what = container.querySelector('select[aria-label="What"]') as HTMLSelectElement;
    const labels = [...what.options].map((o) => o.textContent);
    for (const label of ["Custody settings updated", "Custody mode switched", "Custody switch waiting", "Held opening balance"]) {
      expect(labels).toContain(label);
    }
    expect(what.options.length).toBe(SERVER_ACTIONS.length + 1);
  });

  it.skipIf(!BACKEND_DIR)("matches PaymentAuditAction in the backend source", async () => {
    // The module name is built at run time so the host's typecheck needs no Node types.
    const { readFileSync } = await import(/* @vite-ignore */ ["node", "fs"].join(":"));
    const source: string = readFileSync(`${BACKEND_DIR}/apps/vs_payments/constants.py`, "utf8");
    const block = source.slice(source.indexOf("class PaymentAuditAction"));
    const body = block.slice(0, block.indexOf("\nclass ", 1));
    const fromServer = [...body.matchAll(/^\s+[A-Z_]+ = "([A-Z_]+)", "([^"]+)"/gm)].map((m) => [m[1], m[2]]);
    expect(fromServer.length).toBeGreaterThan(0);
    expect(PROVIDER_ACTIONS.map((a) => [...a])).toEqual(fromServer);
  });
});
