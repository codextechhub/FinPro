/**
 * Paying and filing Bright Star's October VAT share by share.
 *
 * Pay asks which share, starts at that share's outstanding balance and sends
 * the share's branch, so Ikeja's ₦80,000 is paid from Ikeja's bank and Lekki's
 * from Lekki's. Filing with a ₦25,000 penalty asks which branch bears it, and
 * left on the default it is shared by each branch's share of the tax. A school
 * with one branch is asked neither. Mrs Adeyemi, Lekki's own bursar, is not
 * offered filing at all: the server keeps it for the whole school.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  filing: null as unknown,
  pay: vi.fn(),
  file: vi.fn(),
  bankBranch: [] as unknown[],
  wholeSchool: true,
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetTaxFilingsQuery: () => ({ data: { data: [mocks.filing], pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetTaxFilingSummaryQuery: () => ({ data: { data: { outstanding: 0, open: 0, filed: 1, paid: 0 } } }),
  useGetTaxObligationsQuery: () => ({ data: { data: [] } }),
  useCreateTaxObligationMutation: () => [vi.fn(), { isLoading: false }],
  useCreateTaxFilingMutation: () => [vi.fn(), { isLoading: false }],
  useUnfileTaxFilingMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@/redux/services/finance/tax-api", () => ({
  useGetTaxFilingQuery: () => ({ data: { data: mocks.filing } }),
  useFileTaxReturnMutation: () => [mocks.file, { isLoading: false }],
  usePayTaxShareMutation: () => [mocks.pay, { isLoading: false }],
  useReverseTaxRemittanceMutation: () => [vi.fn(), { isLoading: false }],
  useGetTaxFilingLinesQuery: () => ({ data: { data: [] }, isLoading: false, isFetching: false, isError: false }),
}));

vi.mock("./payroll-returns", () => ({
  AnnualPayeReturnDrawer: () => null,
  RemittanceSchedulePanel: () => null,
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderBranchLens: () => ({ applies: true, pinnedBranch: null, branch: "all", choices: [], isLoading: false }),
  BankAccountPicker: ({ onChange, documentBranchId }: { onChange: (v: string) => void; documentBranchId?: number }) => {
    mocks.bankBranch.push(documentBranchId);
    return <button type="button" onClick={() => onChange("12")}>Pick bank</button>;
  },
  AccountPicker: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" onClick={() => onChange("6100")}>Pick account</button>,
  PostingDateField: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" onClick={() => onChange("2026-11-21")}>Pick date</button>,
  MoneyInput: ({ valueKobo, onChangeKobo }: { valueKobo: number; onChangeKobo: (v: number) => void }) => (
    <input aria-label="Money" value={String(valueKobo)} onChange={(e) => onChangeKobo(Number(e.target.value))} />
  ),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true, hasModuleAccess: () => true }),
}));

vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TaxTab } from "./tax-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const share = (id: number, name: string, due: number, paid = 0) => ({
  id, branch_id: id, branch_name: name, branch_pending: false, label: name,
  gross_liability: due, recoverable_amount: 0, brought_forward_credit: 0, adjustment_amount: 0,
  amount_due: due, amount_paid: paid, balance_due: due - paid, carried_forward_credit: 0,
  payment_status: paid ? "PAID" : "UNPAID", line_count: 3, filing_journal_id: null,
});

const base = {
  id: 9, document_number: "TAX-0009", obligation_id: 1, obligation_code: "VAT", obligation_type: "VAT",
  authority_name: "FIRS", liability_account: "2300", liability_account_name: "VAT output payable",
  period_start: "2026-10-01", period_end: "2026-10-31", due_date: "2026-11-21", status: "POSTED",
  gross_liability: 12_000_000, recoverable_amount: 0, adjustment_amount: 0, amount_due: 12_000_000, amount_due_naira: "",
  amount_paid: 0, balance_due: 12_000_000, payment_status: "UNPAID", filing_reference: "", filed_at: "2026-11-20", narration: "",
  brought_forward_credit: 0, carried_forward_credit: 0, declared_line_count: 6, late_line_count: 0, late_items: [],
  remittances: [], filing_journal_id: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.pay.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Remitted." }) });
  mocks.file.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Filed." }) });
  mocks.bankBranch = [];
  mocks.wholeSchool = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const button = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find((el) => el.textContent?.trim() === label);
/** The last button whose label starts so: the drawer opened last sits last in the page. */
const buttonStarting = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).filter((el) => el.textContent?.trim().startsWith(label)).at(-1);
const click = async (el: Element | undefined) => { expect(el).toBeTruthy(); await act(async () => (el as HTMLElement).click()); };

async function openReturn() {
  await act(async () => root.render(<TaxTab entity="BRIGHTSTAR" />));
  const row = Array.from(document.body.querySelectorAll("tr, [role='row'], li")).find((el) => el.textContent?.includes("FIRS"));
  await click(row ?? undefined);
}

async function choose(select: HTMLSelectElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("paying a return share by share", () => {
  it("asks which share, starts at its balance, and sends its branch", async () => {
    mocks.filing = { ...base, filing_status: "FILED", branch_breakdown: [share(1, "Ikeja", 8_000_000), share(2, "Lekki", 4_000_000)] };
    await openReturn();
    await click(buttonStarting("Pay "));

    const shareSelect = Array.from(document.body.querySelectorAll("select")).find((s) => s.textContent?.includes("Select a branch's share"))!;
    expect(shareSelect).toBeTruthy();
    await choose(shareSelect, "2");
    expect(mocks.bankBranch.at(-1)).toBe(2);
    await click(button("Pick bank"));
    await click(button("Pick date"));
    await click(buttonStarting("Pay "));

    expect(mocks.pay).toHaveBeenCalledWith({ id: 9, entity: "BRIGHTSTAR", bank_account: "12", pay_date: "2026-11-21", amount: undefined, branch: 2 });
  });

  it("asks nothing for a return with one share", async () => {
    mocks.filing = { ...base, filing_status: "FILED", branch_breakdown: [share(1, "Main", 12_000_000)] };
    await openReturn();
    await click(buttonStarting("Pay "));

    expect(Array.from(document.body.querySelectorAll("select")).some((s) => s.textContent?.includes("Select a branch's share"))).toBe(false);
    await click(button("Pick bank"));
    await click(button("Pick date"));
    await click(buttonStarting("Pay "));
    expect(mocks.pay).toHaveBeenCalledWith({ id: 9, entity: "BRIGHTSTAR", bank_account: "12", pay_date: "2026-11-21", amount: undefined });
  });
});

describe("filing with a penalty", () => {
  it("names the branch that bears it", async () => {
    mocks.filing = { ...base, filing_status: "DRAFT", filed_at: null, branch_breakdown: [share(1, "Ikeja", 8_000_000), share(2, "Lekki", 4_000_000)] };
    await openReturn();
    await click(button("Mark as filed"));
    await click(button("Pick date"));
    const money = document.body.querySelector<HTMLInputElement>("input[aria-label='Money']")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(money, "2500000");
      money.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("Pick account"));
    const bearer = Array.from(document.body.querySelectorAll("select")).find((s) => s.textContent?.includes("Shared by each branch's share"))!;
    expect(bearer).toBeTruthy();
    await choose(bearer, "1");
    const submit = Array.from(document.body.querySelectorAll("button")).filter((b) => b.textContent?.trim() === "Mark as filed").at(-1);
    await click(submit);

    expect(mocks.file).toHaveBeenCalledWith(expect.objectContaining({ adjustment_amount: 2500000, adjustment_account: "6100", adjustment_branch: 1 }));
  });
});

describe("a branch's own bursar", () => {
  it("is not offered filing, which changes every branch's return", async () => {
    mocks.wholeSchool = false;
    mocks.filing = { ...base, filing_status: "DRAFT", filed_at: null, branch_breakdown: [share(2, "Lekki", 4_000_000)] };
    await openReturn();
    expect(button("Mark as filed")).toBeUndefined();
    expect(button("New filing")).toBeUndefined();
  });
});
