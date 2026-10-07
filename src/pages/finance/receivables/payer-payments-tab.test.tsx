/**
 * The split of Mr Okafor's payment, as the preview shows it.
 *
 * He pays N500,000 into Ikeja's bank for Ada (Ikeja) and Emeka (Lekki). Ada's
 * share is a receipt at Ikeja that settles her bills; Emeka's is held for Lekki.
 * Mrs Adeyemi, who works at Ikeja alone in this example, is not shown Lekki's
 * bills, only Emeka and his amount. At a school with one branch nothing names
 * a branch at all.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PayerPayment, PayerPlanShare } from "@/redux/services/finance/fees-types";

const mocks = vi.hoisted(() => ({ branches: [] as { id: number; name: string }[] }));

vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBranches: () => ({ data: mocks.branches, isLoading: false, isError: false }),
  hostBranchLens: undefined,
}));

vi.mock("@/redux/services/finance/fees-api", () => ({
  useVoidPayerPaymentMutation: () => [vi.fn(), { isLoading: false }],
  useGetPayerLinksQuery: () => ({ data: undefined, isSuccess: false }),
  usePreviewPayerPaymentMutation: () => [vi.fn(), { isLoading: false }],
  useRecordPayerPaymentMutation: () => [vi.fn(), { isLoading: false }],
  useGetPayerPaymentSplitChoicesQuery: () => ({
    data: {
      data: {
        split_options: [
          { value: "OLDEST_FIRST", label: "Oldest bill first, across every customer" },
          { value: "PROPORTIONAL", label: "In proportion to what each owes" },
          { value: "AS_ENTERED", label: "As entered" },
        ],
        split_default: "OLDEST_FIRST",
        split_default_label: "Oldest bill first, across every customer",
      },
    },
  }),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  BankAccountPicker: () => null,
  CustomerPicker: () => null,
  PostingDateField: () => null,
}));
vi.mock("@/components/finance-ui/can", () => ({ useCan: () => ({ can: () => false }) }));
vi.mock("../../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => String(v).slice(0, 10) }) }));

import { PayerPaymentDrawer, PlanTable, RecordPayerPaymentDrawer } from "./payer-payments-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADA: PayerPlanShare = {
  customer: { id: 11, code: "CUS-ADA", name: "Ada Okafor" }, branch_id: 1, branch_name: "Ikeja",
  kind: "RECEIPT", amount: 400_000_00, credit: 0, outstanding: 400_000_00,
  bills: [{ id: 91, document_number: "INV-0091", kind: "INVOICE", balance: 400_000_00, applied: 400_000_00 }],
};
const EMEKA: PayerPlanShare = {
  customer: { id: 12, code: "CUS-EMEKA", name: "Emeka Okafor" }, branch_id: 2, branch_name: "Lekki",
  kind: "HELD", amount: 100_000_00, credit: 0,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = (shares: PayerPlanShare[], branches: { id: number; name: string }[]) => {
  mocks.branches = branches;
  act(() => root.render(<PlanTable shares={shares} currency="NGN" receivedAt="Ikeja" />));
  return container.textContent ?? "";
};

describe("payer payment preview", () => {
  it("books the Ikeja share as a receipt and holds the Lekki share for Lekki", () => {
    const text = render([ADA, EMEKA], [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }]);
    expect(text).toContain("Bills at");
    expect(text).toContain("INV-0091");
    expect(text).toContain("Held for Lekki, from Ikeja");
    expect(text).toContain("Bills at a branch you do not work in");
  });

  it("names no branch at a school with one", () => {
    const text = render([ADA], [{ id: 1, name: "Ikeja" }]);
    expect(text).not.toContain("Bills at");
    expect(text).toContain("Ada Okafor");
  });

  it("says what is left as credit", () => {
    const text = render([{ ...ADA, amount: 450_000_00, credit: 50_000_00 }], [{ id: 1, name: "Ikeja" }]);
    expect(text).toContain("left as credit");
  });
});

describe("how a split reads", () => {
  const PAYMENT: PayerPayment = {
    id: 5, document_number: "PYP-0005", status: "POSTED", payer: { id: 9, code: "CUS-OKAFOR", name: "Mr Okafor" },
    branch_id: 1, branch_name: "Ikeja", bank_account: { id: 3, name: "GTBank collections" }, amount: 500_000_00,
    payment_date: "2026-09-26", method: "BANK_TRANSFER", split: "EXPLICIT", split_label: "Entered per customer",
    reference: "", narration: "", shares: [],
  };

  it("shows the payment's own split label, for a split no setting offers as well as for one it does", () => {
    mocks.branches = [{ id: 1, name: "Ikeja" }];
    act(() => root.render(<PayerPaymentDrawer payment={PAYMENT} entity="HOLYCROSS" currency="NGN" onClose={() => undefined} />));
    expect(document.body.textContent).toContain("Entered per customer");
    expect(document.body.textContent).not.toContain("EXPLICIT");

    act(() => root.render(<PayerPaymentDrawer
      payment={{ ...PAYMENT, split: "OLDEST_FIRST", split_label: "Oldest bill first, across every customer" }}
      entity="HOLYCROSS" currency="NGN" onClose={() => undefined} />));
    expect(document.body.textContent).toContain("Oldest bill first, across every customer");
  });
});

describe("the split picker of the record form", () => {
  it("offers both choices to a recorder who cannot read the receivables settings", () => {
    mocks.branches = [{ id: 1, name: "Ikeja" }];
    act(() => root.render(<RecordPayerPaymentDrawer entity="HOLYCROSS" currency="NGN" onClose={() => undefined} onRecorded={() => undefined} />));
    const picker = document.body.querySelector<HTMLSelectElement>("select[aria-label='How to split it']");
    expect(picker).not.toBeNull();
    const options = [...picker!.options].map((o) => o.textContent);
    expect(options).toContain("School setting: Oldest bill first, across every customer");
    expect(options).toContain("Oldest bill first, across every customer");
    expect(options).toContain("In proportion to what each owes");
    expect(options).toContain("I will enter each customer's amount");
  });
});
