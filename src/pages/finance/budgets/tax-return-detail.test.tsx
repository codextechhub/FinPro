/**
 * Bright Star's October VAT: Ikeja's share ₦80,000 and Lekki's ₦40,000, a
 * September invoice declared late, and Lekki's ₦40,000 paid in error. Mrs Bello
 * sees each share, the late item "from September", and may reverse Lekki's
 * payment with a reason; Mrs Adeyemi, Lekki's own bursar, is not offered the
 * reversal, which changes the whole return. A return with one share shows no
 * share table.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reverse: vi.fn(),
  wholeSchool: true,
  denied: new Set<string>(),
  schedule: vi.fn(),
}));

vi.mock("@/redux/services/finance/tax-api", () => ({
  useReverseTaxRemittanceMutation: () => [mocks.reverse, { isLoading: false }],
  useGetTaxFilingScheduleQuery: (...args: unknown[]) => mocks.schedule(...args),
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

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { TaxFilingDetail, TaxFilingShare } from "@/redux/services/finance/tax-types";
import { P } from "../../../permissions";
import {
  TaxRemittances, TaxReturnLines, TaxReturnPeople, TaxReturnShares, payableShares, penaltyBranches, showsShares,
} from "./tax-return-detail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const share = (over: Partial<TaxFilingShare>): TaxFilingShare => ({
  id: 1, branch_id: 1, branch_name: "Ikeja", branch_pending: false, label: "Ikeja",
  gross_liability: 8_000_000, recoverable_amount: 0, brought_forward_credit: 0, adjustment_amount: 0,
  amount_due: 8_000_000, amount_paid: 0, balance_due: 8_000_000, carried_forward_credit: 0,
  payment_status: "UNPAID", line_count: 12, filing_journal_id: null, ...over,
});
const IKEJA = share({});
const LEKKI = share({ id: 2, branch_id: 2, branch_name: "Lekki", label: "Lekki", gross_liability: 4_000_000, amount_due: 4_000_000, amount_paid: 4_000_000, balance_due: 0, payment_status: "PAID", line_count: 5 });

const OCTOBER = {
  id: 9, document_number: "TAX-0009", obligation_id: 1, obligation_code: "VAT", obligation_type: "VAT",
  authority_name: "FIRS", liability_account: "2300", liability_account_name: "VAT output payable",
  period_start: "2026-10-01", period_end: "2026-10-31", due_date: "2026-11-21", filing_status: "FILED", status: "POSTED",
  gross_liability: 12_000_000, recoverable_amount: 0, adjustment_amount: 0, amount_due: 12_000_000, amount_due_naira: "",
  amount_paid: 4_000_000, balance_due: 8_000_000, payment_status: "PARTIAL", filing_reference: "", filed_at: "2026-11-20", narration: "",
  brought_forward_credit: 0, carried_forward_credit: 0, declared_line_count: 17, late_line_count: 1, filing_journal_id: null,
  late_items: [{ month: "2026-09", label: "from September", gross: 150_000, recoverable: 0, net: 150_000, line_count: 1, branches: {} }],
  branch_breakdown: [IKEJA, LEKKI],
  remittances: [{
    id: 31, share_id: 2, branch_id: 2, branch_name: "Lekki", bank_account_id: 12, bank_account_name: "Lekki GTBank",
    pay_date: "2026-11-21", amount: 4_000_000, journal_id: 80, is_reversed: false, reversed_at: null, reversal_journal_id: null, reversal_reason: "",
  }],
} satisfies TaxFilingDetail;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.reverse.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Remittance reversed." }) });
  mocks.schedule.mockReset().mockReturnValue({ data: undefined, isLoading: false, isFetching: false, isError: false });
  mocks.wholeSchool = true;
  mocks.denied = new Set();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = async (node: React.ReactNode) => act(async () => root.render(node));
const button = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find((el) => el.textContent?.trim() === label);

describe("which shares matter", () => {
  it("shows shares only when there are several, or lines with no branch yet", () => {
    expect(showsShares([IKEJA])).toBe(false);
    expect(showsShares([IKEJA, LEKKI])).toBe(true);
    expect(showsShares([share({ branch_pending: true, branch_id: null, label: "No branch yet" })])).toBe(true);
  });

  it("pays only placed shares with something outstanding, and lets any placed branch bear a penalty", () => {
    const pending = share({ id: 3, branch_pending: true, branch_id: null, label: "No branch yet" });
    expect(payableShares([IKEJA, LEKKI, pending]).map((s) => s.label)).toEqual(["Ikeja"]);
    expect(penaltyBranches([IKEJA, LEKKI, pending])).toEqual([{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }]);
  });
});

describe("the return's detail", () => {
  it("lists each branch's share, and warns about lines with no branch yet", async () => {
    await render(<TaxReturnShares filing={{ ...OCTOBER, branch_breakdown: [IKEJA, LEKKI, share({ id: 3, branch_pending: true, branch_id: null, label: "No branch yet" })] }} />);

    expect(container.textContent).toContain("Each branch's share");
    expect(container.textContent).toContain("Ikeja");
    expect(container.textContent).toContain("Lekki");
    expect(container.textContent).toContain("No branch yet");
    expect(container.textContent).toContain("Give them a branch before filing");
  });

  it("shows no share table for a return with one share", async () => {
    await render(<TaxReturnShares filing={{ ...OCTOBER, branch_breakdown: [IKEJA] }} />);

    expect(container.textContent).toBe("");
  });

  it("names a late item under its own month", async () => {
    await render(<TaxReturnLines filing={OCTOBER} />);

    expect(container.textContent).toContain("17 transaction lines, 1 of them late.");
    expect(container.textContent).toContain("Late items from September");
  });

  it("reverses a payment with a reason", async () => {
    await render(<TaxRemittances filing={OCTOBER} entity="BRIGHTSTAR" showBranch />);
    await act(async () => button("Reverse")!.click());
    expect(button("Reverse payment")?.disabled).toBe(true);

    const field = document.body.querySelector("textarea")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(field, "Paid from the wrong bank account");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Reverse payment")!.click());

    expect(mocks.reverse).toHaveBeenCalledWith({ id: 9, remittanceId: 31, entity: "BRIGHTSTAR", reason: "Paid from the wrong bank account" });
  });

  it("offers no reversal to a branch's own bursar, nor without the pay key", async () => {
    mocks.wholeSchool = false;
    await render(<TaxRemittances filing={OCTOBER} entity="BRIGHTSTAR" showBranch />);
    expect(button("Reverse")).toBeUndefined();

    mocks.wholeSchool = true;
    mocks.denied = new Set([P.FIN_PAY_TAX]);
    await render(<TaxRemittances filing={{ ...OCTOBER }} entity="BRIGHTSTAR" showBranch />);
    expect(button("Reverse")).toBeUndefined();
  });

  it("reads the people behind a PAYE return only when asked, and not for VAT", async () => {
    await render(<TaxReturnPeople filing={OCTOBER} entity="BRIGHTSTAR" showBranch />);
    expect(container.textContent).toBe("");

    mocks.schedule.mockReturnValue({
      data: { data: { obligation: "PAYE", authority_name: "LIRS", employee_total: 9_533_000, employer_total: 0, total: 9_533_000,
        rows: [{ line_id: 1, employee_name: "Aisha Bello", tax_id: "TIN-1", pension_pin: "", pfa: "", tax_state: "Lagos", branch_id: 1, branch_name: "Ikeja", pay_date: "2026-04-30", run: "PAY-0004", employee_amount: 9_533_000, employer_amount: 0, total: 9_533_000 }] } },
      isLoading: false, isFetching: false, isError: false,
    });
    await render(<TaxReturnPeople filing={{ ...OCTOBER, obligation_type: "PAYE" }} entity="BRIGHTSTAR" showBranch />);
    expect(mocks.schedule).toHaveBeenLastCalledWith({ id: 9, entity: "BRIGHTSTAR" }, { skip: true });
    await act(async () => button("Show people")!.click());

    expect(mocks.schedule).toHaveBeenLastCalledWith({ id: 9, entity: "BRIGHTSTAR" }, { skip: false });
    expect(container.textContent).toContain("Aisha Bello");
    expect(container.textContent).toContain("TIN-1");
  });
});
