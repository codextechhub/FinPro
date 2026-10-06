/**
 * The inter-branch register at Bright Star (Ikeja 1, Lekki 2).
 *
 *   1. Mrs Adeyemi, who works only at Lekki, opens Ikeja's N1,000,000 sent to
 *      Lekki: she is offered Confirm it arrived, and told a void needs somebody
 *      in both branches. Confirming sends the transfer to the confirm route.
 *   2. Mrs Bello, who covers the whole school, opens a shared bank split's
 *      difference: no Void, and the reason it is never voided.
 *   3. Choosing a branch pair in the filters asks the list for that pair, and
 *      the filters live in the page address.
 *   4. A branch-bound reader is not offered Move a customer's balance.
 *   5. Tunde's move, opened a day later, lists the term bill and the credit it
 *      carried and says Lekki owes Ikeja N10,000.
 *   6. An income given back opens the register narrowed to its document, and
 *      the register asks the list for that document's journal.
 *   7. Mrs Adeyemi opens Ikeja's transfer to Lekki: Lekki's journal opens in
 *      the General Ledger, Ikeja's is named without a link because she cannot
 *      read Ikeja's books. Mrs Bello, who covers both, can open both.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  confirm: vi.fn(),
  transfer: null as unknown,
}));

vi.mock("@/redux/services/finance/interbranch-api", () => ({
  useGetInterBranchTransfersQuery: (args: unknown) => {
    mocks.list(args);
    return { data: { data: [], pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() };
  },
  useGetInterBranchTransferQuery: (args: unknown) => (args && typeof args === "object"
    ? { data: { data: mocks.transfer }, isLoading: false, isError: false, refetch: vi.fn() }
    : { data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useConfirmInterBranchArrivalMutation: () => [mocks.confirm, { isLoading: false }],
  useDeclineInterBranchRequestMutation: () => [vi.fn(), { isLoading: false }],
  useVoidInterBranchTransferMutation: () => [vi.fn(), { isLoading: false }],
  useSendRequestedTransferMutation: () => [vi.fn(), { isLoading: false }],
  useSendInterBranchMoneyMutation: () => [vi.fn(), { isLoading: false }],
  useRequestInterBranchMoneyMutation: () => [vi.fn(), { isLoading: false }],
  useMoveReceivablesMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({
  useNoApproverPrompt: () => ({ promptIfParked: vi.fn(), noApproverDialog: null }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { InterBranchTransfer } from "@/redux/services/finance/interbranch-types";
import { TransfersTab } from "./transfers-tab";
import type { InterBranchReader } from "./use-inter-branch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SENT: InterBranchTransfer = {
  id: 9, document_number: "IBT-0009", kind: "CASH", kind_label: "Cash", status: "POSTED", stage: "SENT",
  branch_id: 1, branch_name: "Ikeja", to_branch_id: 2, to_branch_name: "Lekki",
  amount: 100_000_000, transfer_date: "2026-01-10", purpose: "Salaries", reference: "", repay_by: null,
  from_bank_account_id: 3, from_bank_account_name: "Ikeja GTBank", to_bank_account_id: 4,
  to_bank_account_name: "Lekki Access", customer_id: null, customer_name: null, held_receipt_id: null,
  receipt_id: null, recharge_id: null, requested_at: null, sent_at: "2026-01-10T09:00:00Z", received_at: null,
  arrival_date: null, declined_at: null, decline_reason: "",
  journals: [{ role: "SENDING", branch_id: 1, journal_id: 501 }, { role: "RECEIVING", branch_id: 2, journal_id: 502 }],
};

const BRANCHES = [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }];

function reader(wholeSchool: boolean): InterBranchReader {
  return {
    applies: true, isLoading: false, branches: BRANCHES, mine: wholeSchool ? BRANCHES : [BRANCHES[1]],
    reach: {
      wholeSchool, branchIds: wholeSchool ? null : [2],
      covers: (ids) => wholeSchool || (ids.length > 0 && ids.every((id) => id === 2)),
    },
    keys: { view: true, request: true, transfer: true, confirm: true, recharge: true, reverse: true },
    nameOf: (id) => BRANCHES.find((b) => b.id === id)?.name ?? `Branch ${id}`,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.list.mockReset();
  mocks.confirm.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(path: string, wholeSchool: boolean) {
  act(() => root.render(
    <MemoryRouter initialEntries={[path]}>
      <TransfersTab entity="BSS" currency="NGN" reader={reader(wholeSchool)} />
    </MemoryRouter>,
  ));
}

const buttons = () => Array.from(document.body.querySelectorAll("button")).map((b) => b.textContent?.trim() ?? "");
const text = () => document.body.textContent ?? "";

describe("the inter-branch register", () => {
  it("offers Lekki's bursar the arrival to confirm, and sends it to the confirm route", async () => {
    mocks.transfer = SENT;
    mocks.confirm.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Transfer IBT-0009 confirmed as arrived." }) });
    render("/finance/inter-branch/transfers?document=9", false);

    expect(buttons()).toContain("Confirm it arrived");
    expect(buttons()).not.toContain("Void");
    expect(text()).toContain("Voiding changes both Ikeja's and Lekki's books, so it needs somebody who works in both.");
    expect(text()).toContain("Ikeja sends");

    const open = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Confirm it arrived");
    await act(async () => { open?.click(); });
    const confirm = Array.from(document.body.querySelectorAll("button")).filter((b) => b.textContent?.trim() === "Confirm it arrived").pop();
    await act(async () => { confirm?.click(); await Promise.resolve(); });
    expect(mocks.confirm).toHaveBeenCalledWith({ id: 9, entity: "BSS", arrival_date: undefined });
  });

  it("explains a shared bank split's difference instead of offering a void", () => {
    mocks.transfer = { ...SENT, kind: "BANK_SPLIT", kind_label: "Shared bank split", from_bank_account_name: null, to_bank_account_name: null };
    render("/finance/inter-branch/transfers?document=9", true);

    expect(buttons()).not.toContain("Void");
    expect(text()).toContain("It is never voided: settle it with a cash transfer the other way.");
  });

  it("asks the list for one pair of branches when both are chosen", () => {
    mocks.transfer = null;
    render("/finance/inter-branch/transfers?branch=2&counterparty=1&kind=CASH", true);
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ entity: "BSS", branch: 2, counterparty: 1, kind: "CASH" }));
  });

  it("offers moving a customer's balance only to a whole-school reader", () => {
    mocks.transfer = null;
    render("/finance/inter-branch/transfers", false);
    expect(buttons()).not.toContain("Move a customer's balance");
    expect(buttons()).toContain("Send money");
    act(() => root.unmount());
    root = createRoot(container);
    render("/finance/inter-branch/transfers", true);
    expect(buttons()).toContain("Move a customer's balance");
  });

  it("says what a past customer balance move carried and who owes whom", () => {
    mocks.transfer = {
      ...SENT, kind: "RECEIVABLE", kind_label: "Customer balance moved", stage: "DONE", amount: 39_000_000,
      from_bank_account_name: null, to_bank_account_name: null, customer_id: 5, customer_name: "Tunde Bakare",
      moved_items: [
        { kind: "INVOICE", document_number: "INV-0041", invoice_id: 41, note_id: null, payment_id: null, amount: 40_000_000, deferred_amount: 38_000_000 },
        { kind: "RECEIPT_CREDIT", document_number: "RCT-0012", invoice_id: null, note_id: null, payment_id: 12, amount: 1_000_000, deferred_amount: 0 },
      ],
      net_owed: { amount: 1_000_000, owed_by: { id: 2, name: "Lekki" }, owed_to: { id: 1, name: "Ikeja" } },
    };
    render("/finance/inter-branch/transfers?document=9", true);

    expect(text()).toContain("What it carried");
    expect(text()).toContain("Invoice INV-0041");
    expect(text()).toContain("₦400,000.00 owed, ₦380,000.00 of it not yet earned");
    expect(text()).toContain("Credit from a receipt RCT-0012");
    expect(text()).toContain("Lekki owes Ikeja ₦10,000.00");
  });

  it("links an income given back to everything its document gave back", () => {
    mocks.transfer = {
      ...SENT, kind: "INCOME_GIVEN_BACK", kind_label: "Income given back", from_bank_account_name: null,
      to_bank_account_name: null, adjustment_entry_id: 77, moved_items: [], net_owed: null,
    };
    render("/finance/inter-branch/transfers?document=9", true);
    const link = Array.from(document.body.querySelectorAll("a")).find((a) => a.textContent?.includes("Everything the same document gave back"));
    expect(link?.getAttribute("href")).toBe("/finance/inter-branch/transfers?adjustment=77");
    expect(text()).not.toContain("What it carried");
  });

  it("links only the journals of the branches the reader works in", () => {
    mocks.transfer = SENT;
    const journalLinks = () => Array.from(document.body.querySelectorAll("a"))
      .filter((a) => a.textContent?.includes("Open its journal"))
      .map((a) => a.getAttribute("href"));

    render("/finance/inter-branch/transfers?document=9", false);
    expect(journalLinks()).toEqual(["/finance/ledger?document=502"]);
    expect(text()).toContain("Ikeja:posted in Ikeja's books");

    act(() => root.unmount());
    root = createRoot(container);
    render("/finance/inter-branch/transfers?document=9", true);
    expect(journalLinks()).toEqual(["/finance/ledger?document=501", "/finance/ledger?document=502"]);
    expect(text()).not.toContain("posted in Ikeja's books");
  });

  it("narrows the register to one document's income given back", () => {
    mocks.transfer = null;
    render("/finance/inter-branch/transfers?adjustment=77", true);
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ adjustment: 77 }));
    expect(text()).toContain("Income given back by one document");
  });
});
