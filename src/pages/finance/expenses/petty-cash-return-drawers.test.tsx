/**
 * The petty cash forms, told as Ikeja's front-desk float: N100,000 on the books
 * and a N100,000 float, held at Ikeja and banked into Ikeja's own account.
 *
 * - Reduce float to N60,000 with a full count banks N40,000 and asks no reason.
 * - A count of N98,500 shows N1,500 short before anything is sent, and is not
 *   sent until it says why.
 * - A return the school's route stops comes back waiting, and the approval
 *   block is handed on so the no-approver prompt can open.
 * - Close fund names the draft voucher holding it up, and is not sent.
 * - Reopen needs a reason; Edit fund refuses what only a return or a reopen may
 *   do, and points at that action.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reduce: vi.fn(),
  close: vi.fn(),
  reopen: vi.fn(),
  update: vi.fn(),
  denied: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useReducePettyCashFloatMutation: () => [mocks.reduce, { isLoading: false }],
  useClosePettyCashFundMutation: () => [mocks.close, { isLoading: false }],
  useReopenPettyCashFundMutation: () => [mocks.reopen, { isLoading: false }],
  useUpdatePettyCashFundMutation: () => [mocks.update, { isLoading: false }],
  useGetBankAccountsQuery: () => ({ data: { data: [{ id: 3, name: "Ikeja GTBank", branch_id: 1, is_active: true }] } }),
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostingRecap: () => null,
  BankAccountPicker: ({ onChange, documentBranchId }: { onChange: (id: string) => void; documentBranchId?: number | null }) => (
    <button type="button" data-branch={String(documentBranchId)} onClick={() => onChange("3")}>Pick bank</button>
  ),
  PostingDateField: ({ onChange }: { onChange: (d: string) => void }) => (
    <button type="button" onClick={() => onChange("2026-10-05")}>Pick date</button>
  ),
  MoneyInput: ({ valueKobo, onChangeKobo }: { valueKobo: number; onChangeKobo: (kobo: number) => void }) => (
    <input data-money defaultValue={String(valueKobo)} onChange={(event) => onChangeKobo(Number(event.target.value))} />
  ),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => !mocks.denied.has(code),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
  }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import type { PettyCashFund } from "@/redux/services/finance/ops-types";
import { P } from "../../../permissions";
import { CloseFundDrawer, EditFundDrawer, ReduceFloatDrawer, ReopenFundDialog } from "./petty-cash-return-drawers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NAIRA = 100;
const FUND: PettyCashFund = {
  id: 1, branch_id: 1, name: "Front desk", gl_account: "1150", gl_account_id: 9, custodian_id: null,
  custodian_name: "Mrs Eze", custodian_label: "Mrs Eze", float_amount: 100_000 * NAIRA,
  float_amount_naira: "", current_balance: 100_000 * NAIRA, current_balance_naira: "", shortfall: 0,
  currency: "NGN", last_replenished_at: null, is_active: true, state: "ACTIVE", closed_on: null, closed_by_id: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  for (const fn of [mocks.reduce, mocks.close, mocks.reopen, mocks.update]) {
    fn.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Done.", data: {} }) });
  }
  mocks.toast.success.mockReset();
  mocks.denied = new Set();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const body = () => document.body;
const button = (text: string) => [...body().querySelectorAll("button")].find((b) => b.textContent?.includes(text));
/** The control inside the form field labelled ``label``. */
const inField = <T extends Element>(label: string, selector: string) => {
  const field = [...body().querySelectorAll("label")].find((l) => l.textContent?.startsWith(label));
  return (field?.querySelector(selector) ?? null) as T | null;
};

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Reduce float", () => {
  it("banks the cash above the new float into the fund's own branch's account", async () => {
    const onRaised = vi.fn();
    act(() => root.render(<ReduceFloatDrawer fund={FUND} entity="BSS" onClose={() => undefined} onRaised={onRaised} />));
    expect(button("Pick bank")?.dataset.branch).toBe("1");

    act(() => type(inField<HTMLInputElement>("New float", "input")!, String(60_000 * NAIRA)));
    act(() => button("Pick bank")!.click());
    act(() => button("Pick date")!.click());

    expect(body().querySelector("[data-testid=return-summary]")?.textContent).toContain("₦40,000.00");
    expect(body().textContent).not.toContain("Why the count differs");
    expect(body().querySelector("[data-testid=return-difference]")).toBeNull();

    await act(async () => button("Bank ₦40,000.00")!.click());
    expect(mocks.reduce).toHaveBeenCalledWith(expect.objectContaining({
      id: 1, entity: "BSS", counted_amount: 100_000 * NAIRA, new_float_amount: 60_000 * NAIRA,
      bank_account: "3", return_date: "2026-10-05", difference_reason: undefined,
    }));
    expect(onRaised).toHaveBeenCalledWith(undefined);
  });

  it("shows a short count before sending, and needs a reason for it", async () => {
    act(() => root.render(<ReduceFloatDrawer fund={FUND} entity="BSS" onClose={() => undefined} onRaised={vi.fn()} />));
    act(() => type(inField<HTMLInputElement>("Cash counted", "input")!, String(98_500 * NAIRA)));
    act(() => type(inField<HTMLInputElement>("New float", "input")!, String(60_000 * NAIRA)));
    act(() => button("Pick bank")!.click());
    act(() => button("Pick date")!.click());

    expect(body().querySelector("[data-testid=return-difference]")?.textContent)
      .toBe("₦1,500.00 short. It goes to Cash over and short.");
    expect(body().querySelector("[role=alert]")?.textContent).toBe("The count differs from the books. Say why.");
    expect(button("Bank ₦38,500.00")!.disabled).toBe(true);

    act(() => type(body().querySelector("textarea")!, "coins missing"));
    expect(button("Bank ₦38,500.00")!.disabled).toBe(false);
    await act(async () => button("Bank ₦38,500.00")!.click());
    expect(mocks.reduce.mock.calls[0][0]).toMatchObject({ counted_amount: 98_500 * NAIRA, difference_reason: "coins missing" });
  });

  it("hands on the approval block when the school's route holds the return", async () => {
    const approval = { parked: true, instance_id: "abc" };
    mocks.reduce.mockReturnValue({ unwrap: () => Promise.resolve({ message: "PCR-0001 is waiting for approval.", data: { status: "PENDING_APPROVAL", approval } }) });
    const onRaised = vi.fn();
    act(() => root.render(<ReduceFloatDrawer fund={FUND} entity="BSS" onClose={() => undefined} onRaised={onRaised} />));
    act(() => type(inField<HTMLInputElement>("New float", "input")!, String(60_000 * NAIRA)));
    act(() => button("Pick bank")!.click());
    act(() => button("Pick date")!.click());
    await act(async () => button("Bank ₦40,000.00")!.click());
    expect(mocks.toast.success).toHaveBeenCalledWith("PCR-0001 is waiting for approval.");
    expect(onRaised).toHaveBeenCalledWith(approval);
  });

  it("refuses a float that is not lower than today's", () => {
    act(() => root.render(<ReduceFloatDrawer fund={FUND} entity="BSS" onClose={() => undefined} onRaised={vi.fn()} />));
    act(() => type(inField<HTMLInputElement>("New float", "input")!, String(120_000 * NAIRA)));
    expect(body().querySelector("[role=alert]")?.textContent).toContain("must be lower than the current float");
  });
});

describe("Close fund", () => {
  it("names what holds it up and sends nothing", () => {
    act(() => root.render(
      <CloseFundDrawer fund={FUND} entity="BSS" blockers={["Vouchers not yet posted: PCV-7. Post or cancel them first."]}
        onClose={() => undefined} onRaised={vi.fn()} />,
    ));
    expect(body().querySelector("[data-testid=close-blockers]")?.textContent).toContain("PCV-7");
    act(() => button("Pick bank")!.click());
    act(() => button("Pick date")!.click());
    const closeButtons = [...body().querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Close fund");
    expect(closeButtons.at(-1)!.disabled).toBe(true);
  });

  it("banks everything counted and says the day it closes", async () => {
    act(() => root.render(<CloseFundDrawer fund={{ ...FUND, current_balance: 20_000 * NAIRA }} entity="BSS" blockers={[]} onClose={() => undefined} onRaised={vi.fn()} />));
    act(() => button("Pick bank")!.click());
    act(() => button("Pick date")!.click());
    expect(body().textContent).toContain("The fund closes on 5 Oct 2026.");
    const send = [...body().querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Close fund").at(-1)!;
    await act(async () => send.click());
    expect(mocks.close.mock.calls[0][0]).toMatchObject({ counted_amount: 20_000 * NAIRA, bank_account: "3", return_date: "2026-10-05" });
    expect(mocks.close.mock.calls[0][0]).not.toHaveProperty("new_float_amount");
  });

  it("asks for no bank account when the tin is empty", () => {
    act(() => root.render(<CloseFundDrawer fund={{ ...FUND, current_balance: 0 }} entity="BSS" blockers={[]} onClose={() => undefined} onRaised={vi.fn()} />));
    expect(button("Pick bank")).toBeUndefined();
  });
});

describe("Reopen and Edit fund", () => {
  const CLOSED: PettyCashFund = { ...FUND, state: "CLOSED", is_active: false, float_amount: 0, current_balance: 0, closed_on: "2026-10-01", closed_by_id: 7 };

  it("reopens only with a reason, on the float chosen", async () => {
    act(() => root.render(<ReopenFundDialog fund={CLOSED} entity="BSS" initialFloat={80_000 * NAIRA} onClose={() => undefined} />));
    expect(button("Reopen fund")!.disabled).toBe(true);
    act(() => type(body().querySelector("textarea")!, "new term"));
    await act(async () => button("Reopen fund")!.click());
    expect(mocks.reopen).toHaveBeenCalledWith({ id: 1, entity: "BSS", reason: "new term", float_amount: 80_000 * NAIRA });
  });

  it("refuses to lower the float below the cash held, pointing at Reduce float", () => {
    const onSwitch = vi.fn();
    act(() => root.render(<EditFundDrawer fund={FUND} entity="BSS" onClose={() => undefined} onSwitch={onSwitch} />));
    act(() => type(inField<HTMLInputElement>("Float", "input")!, String(60_000 * NAIRA)));
    const refusal = body().querySelector("[data-testid=edit-refusal]");
    expect(refusal?.textContent).toContain("Reduce the float instead");
    expect(button("Save changes")!.disabled).toBe(true);
    act(() => [...refusal!.querySelectorAll("button")].find((b) => b.textContent?.includes("Reduce float"))!.click());
    expect(onSwitch).toHaveBeenCalledWith("reduce");
  });

  it("states the refusal without offering an action the reader may not take", () => {
    mocks.denied = new Set([P.FIN_RETURN_PETTY_CASH]);
    act(() => root.render(<EditFundDrawer fund={FUND} entity="BSS" onClose={() => undefined} onSwitch={vi.fn()} />));
    act(() => type(inField<HTMLInputElement>("Float", "input")!, String(60_000 * NAIRA)));
    const refusal = body().querySelector("[data-testid=edit-refusal]");
    expect(refusal?.textContent).toContain("Reduce the float instead");
    expect(refusal?.querySelector("button")).toBeNull();
  });

  it("refuses a closed fund's float change, pointing at Reopen", () => {
    act(() => root.render(<EditFundDrawer fund={CLOSED} entity="BSS" onClose={() => undefined} onSwitch={vi.fn()} />));
    act(() => type(inField<HTMLInputElement>("Float", "input")!, String(50_000 * NAIRA)));
    expect(body().querySelector("[data-testid=edit-refusal]")?.textContent).toContain("change only by reopening it");
  });

  it("sends only what changed", async () => {
    act(() => root.render(<EditFundDrawer fund={FUND} entity="BSS" onClose={() => undefined} onSwitch={vi.fn()} />));
    act(() => type(inField<HTMLInputElement>("Fund name", "input")!, "Front office"));
    await act(async () => button("Save changes")!.click());
    expect(mocks.update).toHaveBeenCalledWith({ id: 1, entity: "BSS", name: "Front office" });
  });
});
