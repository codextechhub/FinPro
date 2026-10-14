/**
 * January's payroll at Bright Star, paid through Paystack. Ikeja holds enough
 * and its staff are paid; Lekki holds less than its batch needs and waits;
 * Tunde has no checked bank account; Ngozi's transfer failed. Mrs Bello retries
 * Ngozi and records Tunde as paid from Lekki's bank. Greenfield has one branch,
 * so its panel never names one.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  fieldAccess: {} as Record<string, unknown>,
  payments: undefined as unknown,
  several: true,
  retry: vi.fn(),
  record: vi.fn(),
  refetch: vi.fn(),
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
vi.mock("@/redux/services/finance/payroll-paystack-api", () => ({
  useGetPayrollRunPaymentsQuery: () => ({ data: mocks.payments ? { data: mocks.payments } : undefined, refetch: mocks.refetch, isFetching: false }),
  useRetryPayrollPaymentsMutation: () => [mocks.retry, { isLoading: false }],
  useRecordPayrollLinesPaidFromBankMutation: () => [mocks.record, { isLoading: false }],
}));
vi.mock("./payment-branches", () => ({
  usePaymentBranchColumn: () => ({ show: mocks.several, name: (id: number | null) => (id === 2 ? "Lekki" : id === 1 ? "Ikeja" : "No branch yet") }),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  BankAccountPicker: (props: { documentBranchId?: number | null; onChange: (v: string) => void }) => (
    <button type="button" data-picker={String(props.documentBranchId)} onClick={() => props.onChange("90")}>Pick bank</button>
  ),
  PostingDateField: (props: { value: string }) => <span data-testid="pay-date">{props.value}</span>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "../../permissions";
import { PayrollPaymentsPanel } from "./payroll-payments-panel";
import type { PayrollRun } from "@/redux/services/finance/ops-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RUN = { id: 9, document_number: "PR-9", pay_date: "2027-01-28", run_status: "POSTED" } as PayrollRun;
const line = (over: Record<string, unknown>) => ({
  id: 1, line_no: 1, employee_id: 5, employee_name: "Aisha Bello", net_amount: 25_000_000, branch_id: 1, branch_name: "Ikeja",
  pay_state: "PAID", pay_state_label: "Paid", paid_via: "PAYSTACK", pay_note: "", ...over,
});
const COUNTS = { not_sent: 0, needs_bank_details: 1, waiting_for_funds: 1, sent: 0, paid: 1, failed: 1 };
const payments = (over: Record<string, unknown> = {}) => ({
  run_id: 9, run_status: "POSTED", payment_route: "PAYSTACK", counts: COUNTS,
  branches: [
    { branch_id: 1, branch_name: "Ikeja", lines: 2, counts: { ...COUNTS, waiting_for_funds: 0, needs_bank_details: 0, failed: 1 }, net_total: 50_000_000, paid_total: 25_000_000, batch: { reference: "PB-1", status: "PARTIALLY_COMPLETED" } },
    { branch_id: 2, branch_name: "Lekki", lines: 2, counts: { ...COUNTS, paid: 0, failed: 0 }, net_total: 40_000_000, paid_total: 0, batch: null },
  ],
  lines: [
    line({ id: 1 }),
    line({ id: 2, line_no: 2, employee_name: "Ngozi Okafor", pay_state: "FAILED", pay_state_label: "Failed", paid_via: "", pay_note: "Insufficient balance on the merchant account." }),
    line({ id: 3, line_no: 3, employee_name: "Bola Lawal", branch_id: 2, branch_name: "Lekki", pay_state: "WAITING_FOR_FUNDS", paid_via: "", pay_note: "Lekki holds less than its batch needs." }),
    line({ id: 4, line_no: 4, employee_name: "Tunde Adeyemi", branch_id: 2, branch_name: "Lekki", pay_state: "NEEDS_BANK_DETAILS", paid_via: "", pay_note: "" }),
  ],
  ...over,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.held = new Set([P.FIN_VIEW_PAYROLL, P.FIN_PAY_PAYROLL]);
  mocks.fieldAccess = {};
  mocks.several = true;
  mocks.payments = payments();
  for (const fn of [mocks.retry, mocks.record]) {
    fn.mockReset();
    fn.mockReturnValue({ unwrap: async () => ({ message: "Done." }) });
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = (canAct = true, run = RUN) => act(() => root.render(<PayrollPaymentsPanel run={run} entity="BSS" currency="NGN" canAct={canAct} />));
const text = () => container.textContent ?? "";
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
const row = (id: number) => container.querySelector(`[data-testid=payroll-payment-line-${id}]`) as HTMLElement;
const tick = (name: string) => act(() => (container.querySelector(`input[aria-label="Choose ${name}"]`) as HTMLInputElement).click());

describe("how paying a run through Paystack is going", () => {
  it("says it in one sentence and counts each state", () => {
    render();
    expect(container.querySelector("[data-testid=payroll-payments-sentence]")?.textContent).toBe("1 of 4 paid. 1 failed, 1 waiting for funds, 1 need bank details.");
    for (const word of ["Paid", "Failed", "Waiting for funds", "Needs bank details"]) expect(text()).toContain(word);
  });

  it("names each branch's batch at a school with several branches", () => {
    render();
    const branches = container.querySelector("[data-testid=payroll-payments-branches]")!;
    expect(branches.textContent).toContain("Ikeja");
    expect(branches.textContent).toContain("Partly completed");
    expect(branches.textContent).toContain("Lekki");
    expect(branches.textContent).toContain("Not sent yet");
    expect(text()).toContain("A branch that holds less than its batch needs waits.");
  });

  it("never names a branch at a school with one", () => {
    mocks.several = false;
    mocks.payments = payments({ branches: [], lines: [line({ id: 1 }), line({ id: 2, line_no: 2, pay_state: "FAILED", pay_note: "Declined." })] });
    render();
    expect(container.querySelector("[data-testid=payroll-payments-branches]")).toBeNull();
    expect(text()).not.toContain("Ikeja");
    expect(container.querySelector("th")?.textContent).not.toBe("Branch");
  });

  it("gives each failed line its reason, and each person a status in plain words", () => {
    render();
    expect(row(2).textContent).toContain("Failed");
    expect(row(2).textContent).toContain("Insufficient balance on the merchant account.");
    expect(row(3).textContent).toContain("Waiting for funds");
    expect(row(4).textContent).toContain("Needs bank details");
    expect(text()).toContain("1 person has no checked bank account");
  });

  it("is absent for a run not paid through Paystack, and for one never sent that way", () => {
    mocks.payments = payments({ payment_route: "OWN_BANK", lines: [line({ id: 1, pay_state: "" }), line({ id: 2, pay_state: "" })] });
    render();
    expect(text()).toBe("");
  });

  it("still shows a run some of whose lines were settled through Paystack after the school changed route", () => {
    mocks.payments = payments({ payment_route: "OWN_BANK" });
    render();
    expect(text()).toContain("Paying staff through Paystack");
  });
});

describe("retrying and recording", () => {
  it("retries the failed lines and only those", async () => {
    render();
    expect(button("Retry failed (1)")).toBeDefined();
    await act(async () => { button("Retry failed")!.click(); });
    expect(mocks.retry).toHaveBeenCalledWith({ id: 9, entity: "BSS", line_ids: [2] });
  });

  it("records chosen lines of one branch as paid from that branch's bank", async () => {
    render();
    expect(button("Record as paid from the bank")!.disabled).toBe(true);
    tick("Tunde Adeyemi");
    expect(button("Record as paid from the bank")!.disabled).toBe(false);
    act(() => button("Record as paid from the bank")!.click());
    expect(document.body.querySelector("[data-picker]")!.getAttribute("data-picker")).toBe("2");
    expect(document.body.querySelector("[data-testid=pay-date]")!.textContent).toBe("2027-01-28");
    act(() => button("Pick bank")!.click());
    const confirm = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Record as paid") as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    expect(mocks.record).toHaveBeenCalledWith({ id: 9, entity: "BSS", line_ids: [4], bank_account: 90, pay_date: "2027-01-28" });
  });

  it("will not record two branches at once, and says to go one at a time", () => {
    render();
    tick("Ngozi Okafor");
    tick("Tunde Adeyemi");
    expect(button("Record as paid from the bank")!.disabled).toBe(true);
    expect(container.textContent).toContain("Record one branch's staff at a time, from that branch's bank account.");
  });

  it("offers a checkbox only on lines that can be recorded", () => {
    render();
    expect(row(1).querySelector("input")).toBeNull();
    expect(row(3).querySelector("input")).toBeNull();
    expect(row(2).querySelector("input")).not.toBeNull();
    expect(row(4).querySelector("input")).not.toBeNull();
  });

  it("offers neither without the pay key, nor to a reader who sees only part of the run", () => {
    mocks.held = new Set([P.FIN_VIEW_PAYROLL]);
    render();
    expect(button("Retry failed")).toBeUndefined();
    expect(button("Record as paid from the bank")).toBeUndefined();
    mocks.held = new Set([P.FIN_VIEW_PAYROLL, P.FIN_PAY_PAYROLL]);
    render(false);
    expect(button("Retry failed")).toBeUndefined();
    expect(container.querySelector("input[type=checkbox]")).toBeNull();
  });
});

describe("Field Access on a run's payments", () => {
  it("leaves out the names, the money and the reasons a role may not read", () => {
    const bare = payments({
      branches: [{ branch_id: 1, branch_name: "Ikeja", lines: 4, counts: COUNTS, batch: null }],
      lines: [1, 2].map((id) => ({ id, line_no: id, employee_id: id, branch_id: 1, branch_name: "Ikeja", pay_state: "PAID" })),
    });
    mocks.payments = bare;
    render();
    expect(text()).not.toContain("Aisha");
    expect(container.querySelector("[data-testid=payroll-payments-lines]")!.textContent).not.toContain("Net pay");
    expect(container.querySelector("[data-testid=payroll-payments-lines]")!.textContent).not.toContain("Why");
  });

  it("says only that the status is not shown to a role that may not read it, and offers no action", () => {
    mocks.payments = payments({
      counts: undefined,
      branches: [{ branch_id: 1, branch_name: "Ikeja", lines: 4 }],
      lines: [{ id: 1, line_no: 1, employee_id: 5, branch_id: 1, branch_name: "Ikeja" }],
    });
    render();
    expect(text()).toContain("Your role does not see how each payment is going.");
    expect(container.querySelector("[data-testid=payroll-payments-sentence]")).toBeNull();
    expect(button("Retry failed")).toBeUndefined();
    expect(button("Record as paid from the bank")).toBeUndefined();
  });
});
