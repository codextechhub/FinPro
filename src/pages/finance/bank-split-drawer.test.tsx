/**
 * Splitting Bright Star's shared GTBank account (ledger 1110, N5,000,000) into
 * Ikeja's and Lekki's own accounts.
 *
 *   1. It is offered only to a whole-school reader with the update key, on a
 *      live account no branch owns, at a school with several branches.
 *   2. Debt between branches is chosen until the bursar picks otherwise, and
 *      the shares, names and codes go to the split route as typed, an
 *      overdraft share as a negative figure.
 *   3. The result lists what is now owed between the branches, each linked to
 *      its transfer in the register.
 *   4. Before anything is agreed, the drawer shows each branch's own entries on
 *      the account (Ikeja N6,000,000, Lekki minus N1,000,000) and each one's
 *      difference from its share, and money in journals no branch holds keeps
 *      the split back.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ split: vi.fn(), preview: vi.fn() }));

vi.mock("@/redux/services/finance/interbranch-api", () => ({
  useSplitBankAccountByBranchMutation: () => [mocks.split, { isLoading: false }],
  useGetBankSplitPreviewQuery: (args: unknown) => mocks.preview(args),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostingDateField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Split date" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { BankAccount } from "@/redux/services/finance/ops-types";
import { BankSplitDrawer, canSplitAccount } from "./bank-split-drawer";
import type { InterBranchReader } from "./inter-branch/use-inter-branch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SHARED: BankAccount = {
  id: 7, branch_id: null, name: "GTBank", bank_name: "GTBank", gl_account: "1110", gl_account_name: "GTBank current",
  gl_account_id: 3, currency: "NGN", is_active: true, is_primary: true, is_primary_collection: false,
  book_balance: 500_000_000, book_balance_naira: "5,000,000.00", unreconciled_count: 0, last_reconciled_at: null,
};
const BRANCHES = [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }];
const READER: InterBranchReader = {
  applies: true, isLoading: false, branches: BRANCHES, mine: BRANCHES,
  reach: { wholeSchool: true, branchIds: null, covers: () => true },
  keys: { view: true, request: true, transfer: true, confirm: true, recharge: true, reverse: true },
  nameOf: (id) => BRANCHES.find((b) => b.id === id)?.name ?? `Branch ${id}`,
};

let container: HTMLDivElement;
let root: Root;

const PREVIEW = {
  bank_account_id: 7, legacy_balance: 500_000_000, unbranched_balance: 0, split_date: "2026-09-30",
  branches: [
    { branch_id: 1, branch_name: "Ikeja", book_balance: 600_000_000 },
    { branch_id: 2, branch_name: "Lekki", book_balance: -100_000_000 },
  ],
};

beforeEach(() => {
  mocks.split.mockReset();
  mocks.preview.mockReset();
  mocks.preview.mockReturnValue({ data: undefined });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Type into a React-controlled input. */
function type(input: HTMLInputElement | null | undefined, value: string) {
  if (!input) throw new Error("no input");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const inputs = () => Array.from(document.body.querySelectorAll<HTMLInputElement>("input"));
const button = (label: string) => Array.from(document.body.querySelectorAll("button")).filter((b) => b.textContent?.trim() === label).pop();

describe("who is offered the split", () => {
  const who = { multiBranch: true, wholeSchool: true, canUpdate: true };

  it("is a whole-school reader with the key, on a live shared account, at a school with several branches", () => {
    expect(canSplitAccount(SHARED, who)).toBe(true);
    expect(canSplitAccount(SHARED, { ...who, wholeSchool: false })).toBe(false);
    expect(canSplitAccount(SHARED, { ...who, canUpdate: false })).toBe(false);
    expect(canSplitAccount(SHARED, { ...who, multiBranch: false })).toBe(false);
    expect(canSplitAccount({ ...SHARED, branch_id: 1 }, who)).toBe(false);
    expect(canSplitAccount({ ...SHARED, is_active: false }, who)).toBe(false);
  });
});

describe("splitting the account", () => {
  it("sends each share as typed, with debt between branches as the default", async () => {
    mocks.split.mockReturnValue({ unwrap: () => Promise.resolve({
      message: "Bank account 'GTBank' split into branch accounts.",
      data: {
        legacy_bank_account_id: 7, legacy_balance: 500_000_000, journal_ids: [1, 2], difference_treatment: "DEBT",
        bank_accounts: [
          { id: 21, name: "GTBank - Ikeja", branch_id: 1, gl_account_id: 31, gl_account_code: "1111", opening_balance: 600_000_000, is_primary: true, is_primary_collection: false },
          { id: 22, name: "GTBank - Lekki", branch_id: 2, gl_account_id: 32, gl_account_code: "1112", opening_balance: -100_000_000, is_primary: false, is_primary_collection: false },
        ],
        inter_branch_transfers: [{ id: 55, document_number: "IBT-0055", from_branch_id: 1, to_branch_id: 2, amount: 40_000_000 }],
      },
    }) });
    act(() => root.render(
      <MemoryRouter>
        <BankSplitDrawer account={SHARED} bookBalance={500_000_000} entity="BSS" currency="NGN" reader={READER} onClose={() => undefined} />
      </MemoryRouter>,
    ));

    const radios = inputs().filter((i) => i.name === "split-treatment");
    expect(radios.find((r) => r.checked)?.closest("label")?.textContent).toContain("Debt between branches");

    const money = inputs().filter((i) => i.inputMode === "decimal");
    type(money[0], "6000000");
    type(money[1], "1000000");
    const overdraft = inputs().find((i) => i.getAttribute("aria-label") === "Lekki's share is an overdraft");
    act(() => { overdraft?.click(); });
    const codes = inputs().filter((i) => i.inputMode === "numeric");
    type(codes[0], "1111");
    type(codes[1], "1112");
    type(inputs().find((i) => i.getAttribute("aria-label") === "Split date"), "2026-09-30");
    type(inputs().find((i) => i.placeholder.startsWith("e.g. Bursars")), "Minute 14/2026");

    expect(button("Split account")?.disabled).toBe(false);
    await act(async () => { button("Split account")?.click(); });
    await act(async () => { button("Split account")?.click(); await Promise.resolve(); });

    expect(mocks.split).toHaveBeenCalledWith({
      id: 7, entity: "BSS", split_date: "2026-09-30", agreement_reference: "Minute 14/2026", difference_treatment: "DEBT",
      allocations: [
        { branch: 1, opening_balance: 600_000_000, bank_account_name: "GTBank - Ikeja", ledger_account_code: "1111", ledger_account_name: "GTBank current - Ikeja", is_primary: true, is_primary_collection: false },
        { branch: 2, opening_balance: -100_000_000, bank_account_name: "GTBank - Lekki", ledger_account_code: "1112", ledger_account_name: "GTBank current - Lekki", is_primary: false, is_primary_collection: false },
      ],
    });
    expect(document.body.textContent).toContain("Lekki owes Ikeja");
    const link = Array.from(document.body.querySelectorAll("a")).find((a) => a.textContent?.includes("IBT-0055"));
    expect(link?.getAttribute("href")).toBe("/finance/inter-branch/transfers?document=55");
  });

  it("holds the split back until the shares add up to the book balance", () => {
    act(() => root.render(
      <MemoryRouter>
        <BankSplitDrawer account={SHARED} bookBalance={500_000_000} entity="BSS" currency="NGN" reader={READER} onClose={() => undefined} />
      </MemoryRouter>,
    ));
    expect(button("Split account")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("The shares must add up exactly to the account's book balance.");
  });

  it("shows each branch's book balance and its difference from the share as it is typed", () => {
    mocks.preview.mockReturnValue({ data: { data: PREVIEW } });
    act(() => root.render(
      <MemoryRouter>
        <BankSplitDrawer account={SHARED} bookBalance={500_000_000} entity="BSS" currency="NGN" reader={READER} onClose={() => undefined} />
      </MemoryRouter>,
    ));
    expect(mocks.preview).toHaveBeenCalledWith({ id: 7, entity: "BSS", split_date: undefined });
    const text = () => document.body.textContent ?? "";
    expect(text()).toContain("Each branch's entries on this account");
    expect(text()).toContain("₦6,000,000.00 over its share");
    expect(text()).toContain("₦1,000,000.00 under its share");

    const money = inputs().filter((i) => i.inputMode === "decimal");
    type(money[0], "5000000");
    expect(text()).toContain("₦1,000,000.00 over its share");
    expect(text()).toContain("A branch over its share owes the branches under theirs");
  });

  it("fills each share from the branch's own book balance, an overdraft as an overdraft", () => {
    mocks.preview.mockReturnValue({ data: { data: PREVIEW } });
    act(() => root.render(
      <MemoryRouter>
        <BankSplitDrawer account={SHARED} bookBalance={500_000_000} entity="BSS" currency="NGN" reader={READER} onClose={() => undefined} />
      </MemoryRouter>,
    ));
    act(() => { button("Use these as the shares")?.click(); });
    expect(document.body.textContent).toContain("Matches its share");
    expect(document.body.textContent).not.toContain("over its share");
    expect(inputs().find((i) => i.getAttribute("aria-label") === "Lekki's share is an overdraft")?.checked).toBe(true);
  });

  it("asks for the preview on the split date once one is given", () => {
    mocks.preview.mockReturnValue({ data: { data: PREVIEW } });
    act(() => root.render(
      <MemoryRouter>
        <BankSplitDrawer account={SHARED} bookBalance={500_000_000} entity="BSS" currency="NGN" reader={READER} onClose={() => undefined} />
      </MemoryRouter>,
    ));
    type(inputs().find((i) => i.getAttribute("aria-label") === "Split date"), "2026-09-30");
    expect(mocks.preview).toHaveBeenLastCalledWith({ id: 7, entity: "BSS", split_date: "2026-09-30" });
  });

  it("keeps the split back while money sits in journals no branch holds, and says why", () => {
    mocks.preview.mockReturnValue({ data: { data: { ...PREVIEW, unbranched_balance: 2_500_000 } } });
    act(() => root.render(
      <MemoryRouter>
        <BankSplitDrawer account={SHARED} bookBalance={500_000_000} entity="BSS" currency="NGN" reader={READER} onClose={() => undefined} />
      </MemoryRouter>,
    ));
    act(() => { button("Use these as the shares")?.click(); });
    expect(button("Split account")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("₦25,000.00 on this account is in journals no branch holds yet.");
  });
});
