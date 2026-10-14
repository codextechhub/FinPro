/**
 * How Bright Star pays staff. Mrs Bello, who covers the whole school, moves
 * payroll to Paystack; the save carries the route and nothing else. Greenfield's
 * online payments settle straight into each branch's bank, so Paystack is
 * closed to it, with the server's reason beside the option. Mrs Adeyemi, who
 * keeps Lekki's books only, reads the choice greyed.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/redux/services/finance/payroll-api", () => ({
  useUpdateFinancePayrollSettingsMutation: () => [mocks.update, { isLoading: false }],
}));
vi.mock("@/components/settings/settings-layout", () => ({
  SettingsPanel: ({ title, children }: { title?: string; children: ReactNode }) => <section><h3>{title}</h3>{children}</section>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PayrollPaymentRouteSection, paymentRouteChoices, routeSelectable } from "./payroll-payment-route";
import type { FinancePayrollSettingsValues } from "@/redux/services/finance/payroll-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const values = (over: Partial<FinancePayrollSettingsValues> = {}) => ({
  payment_route: "OWN_BANK", payment_route_label: "Paid from the branch's own bank", paystack_route_available: true,
  paystack_route_unavailable_reason: null, ...over,
}) as unknown as FinancePayrollSettingsValues;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.update.mockReset();
  mocks.update.mockReturnValue({ unwrap: async () => ({ message: "Saved." }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = (v = values(), canUpdate = true, readOnlyReason: string | null = null) =>
  act(() => root.render(<PayrollPaymentRouteSection entityCode="BSS" values={v} canUpdate={canUpdate} readOnlyReason={readOnlyReason} />));
const radio = (value: string) => container.querySelector(`input[value=${value}]`) as HTMLInputElement;
const save = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Save how staff are paid")) as HTMLButtonElement;

describe("how staff are paid", () => {
  it("offers the school's bank, selected, and Paystack", () => {
    render();
    expect(container.textContent).toContain("From the school's bank");
    expect(container.textContent).toContain("Through Paystack");
    expect(radio("OWN_BANK").checked).toBe(true);
    expect(radio("PAYSTACK").disabled).toBe(false);
    expect(save().disabled).toBe(true);
  });

  it("saves the route alone", async () => {
    render();
    act(() => radio("PAYSTACK").click());
    expect(save().disabled).toBe(false);
    await act(async () => { save().click(); });
    expect(mocks.update).toHaveBeenCalledWith({ entity: "BSS", payment_route: "PAYSTACK" });
  });

  it("closes Paystack with the server's reason when the school's online money is not held", () => {
    render(values({ paystack_route_available: false, paystack_route_unavailable_reason: "Your online payments settle directly to each branch's bank." }));
    expect(radio("PAYSTACK").disabled).toBe(true);
    expect(container.querySelector("[data-testid=payment-route-reason]")?.textContent).toBe("Your online payments settle directly to each branch's bank.");
  });

  it("lets a school already on Paystack step back, though Paystack is now closed", () => {
    render(values({ payment_route: "PAYSTACK", paystack_route_available: false, paystack_route_unavailable_reason: "A move to direct settlement is waiting." }));
    expect(radio("PAYSTACK").checked).toBe(true);
    expect(radio("OWN_BANK").disabled).toBe(false);
    expect(routeSelectable("PAYSTACK", "PAYSTACK", false)).toBe(true);
    expect(routeSelectable("PAYSTACK", "OWN_BANK", false)).toBe(false);
  });

  it("is read-only for someone who does not cover the whole school, and says why", () => {
    render(values(), false, "The payroll policy binds every branch, so only someone who covers the whole school may change it.");
    expect(radio("OWN_BANK").disabled).toBe(true);
    expect(radio("PAYSTACK").disabled).toBe(true);
    expect(save().disabled).toBe(true);
    expect(container.textContent).toContain("only someone who covers the whole school");
  });

  it("is absent from a server that does not send the route", () => {
    render(values({ payment_route: undefined }));
    expect(container.textContent).toBe("");
  });

  it("words the two routes in plain words", () => {
    expect(paymentRouteChoices("Paystack").map((c) => c.label)).toEqual(["From the school's bank", "Through Paystack"]);
  });
});
