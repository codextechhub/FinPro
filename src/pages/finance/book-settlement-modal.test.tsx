/**
 * Ikeja's GTBank line of N985,000 from Paystack. Payments wait in clearing at
 * both Ikeja and Lekki; booking the Ikeja line offers Ikeja's payments only,
 * and says why Lekki's are not listed.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/redux/services/payments/payments-api", () => ({
  useBookSettlementMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { SettlementRow, UnmatchedBankLine } from "@/redux/services/payments/payments-types";
import { BookSettlementModal } from "./book-settlement-modal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINE: UnmatchedBankLine = {
  bank_line_id: 5, bank_account_id: 3, txn_date: "2026-10-07", description: "PAYSTACK SETTLEMENT", reference: "STL-1",
  amount: 98_500_000, amount_naira: "985,000.00", branch_id: 1, branch_name: "Ikeja Branch",
};
const pay = (id: number, reference: string, branch_id: number): SettlementRow => ({
  kind: "COLLECTION", gateway_id: id, reference, provider: "PAYSTACK", provider_reference: "", amount: 50_000_000,
  amount_naira: "", confirmed_at: "2026-10-06T10:00:00Z", settled: false, match_basis: "", matched_bank_line_id: null,
  settled_amount: null, fee_amount: 0, settlement_reference: "", settlement_date: null, settlement_description: "",
  via_clearing: true, branch_id, branch_name: branch_id === 1 ? "Ikeja Branch" : "Lekki Branch",
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("booking a bank line as a settlement", () => {
  it("offers only the payments of the line's own branch, and says so", () => {
    act(() => root.render(
      <BookSettlementModal target={{ line: LINE, picked: [] }} payments={[pay(1, "PAY-IKJ-1", 1), pay(2, "PAY-LEK-1", 2), pay(3, "PAY-IKJ-2", 1)]}
        bankName="Ikeja GTBank" entity="BSS" currency="NGN" onClose={() => undefined} />,
    ));
    const offered = Array.from(document.body.querySelectorAll('input[type="checkbox"]')).map((i) => i.getAttribute("aria-label"));
    expect(offered).toEqual(["Settles PAY-IKJ-1", "Settles PAY-IKJ-2"]);
    expect(document.body.textContent).toContain("Only Ikeja Branch's payments are listed");
  });

  it("lists every payment at a school whose lines name no branch", () => {
    act(() => root.render(
      <BookSettlementModal target={{ line: { ...LINE, branch_id: undefined, branch_name: undefined }, picked: [] }} payments={[pay(1, "PAY-IKJ-1", 1), pay(2, "PAY-LEK-1", 2)]}
        bankName="GTBank" entity="BSS" currency="NGN" onClose={() => undefined} />,
    ));
    expect(document.body.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(document.body.textContent).not.toContain("payments are listed");
  });
});
