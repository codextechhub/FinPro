/**
 * The split of Mr Okafor's payment, as the preview shows it.
 *
 * He pays N500,000 into Ikeja's bank for Ada (Ikeja) and Emeka (Lekki). Ada's
 * share is a receipt at Ikeja that settles her bills; Emeka's is held for Lekki.
 * Mrs Adeyemi, who works at Ikeja alone in this example, is not shown Lekki's
 * bills, only Emeka and his amount. At a school with one branch nothing names
 * a branch at all.
 *
 * Field Access: a reader whose `finance.payer_payment` switches hide the amount
 * sees no amount, credit or bills, a reader who may not write a field sees it
 * greyed and never sends it, and a hidden filter is never sent.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PayerPayment, PayerPlanShare } from "@/redux/services/finance/fees-types";

const mocks = vi.hoisted(() => ({
  branches: [] as { id: number; name: string }[],
  fieldAccess: {} as Record<string, { hidden?: string[]; read_only?: string[] } | undefined>,
  can: true,
  preview: vi.fn(),
  record: vi.fn(),
  links: vi.fn(),
  payments: vi.fn(),
  rows: [] as unknown[],
  plan: null as unknown,
  splitDefault: "OLDEST_FIRST",
  omitDefault: false,
}));

vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("../../../host", async () => (await import("../../../host-fake")).fakeHost({
  useBranches: () => ({ data: mocks.branches, isLoading: false, isError: false }),
  hostBranchLens: undefined,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: mocks.fieldAccess,
  }),
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useVoidPayerPaymentMutation: () => [vi.fn(), { isLoading: false }],
  useGetPayerLinksQuery: (args: unknown, options?: { skip?: boolean }) => {
    mocks.links(args, options);
    return { data: undefined, isSuccess: false };
  },
  useGetPayerPaymentsQuery: (args: unknown) => {
    mocks.payments(args);
    return { data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() };
  },
  usePreviewPayerPaymentMutation: () => [(body: unknown) => { mocks.preview(body); return { unwrap: () => Promise.resolve({ data: mocks.plan ?? PLAN }) }; }, { isLoading: false }],
  useRecordPayerPaymentMutation: () => [(body: unknown) => { mocks.record(body); return { unwrap: () => Promise.resolve({ message: "ok", data: { id: 1 } }) }; }, { isLoading: false }],
  useGetPayerPaymentSplitChoicesQuery: () => ({
    data: {
      data: {
        split_options: [
          { value: "OLDEST_FIRST", label: "Oldest bill first, across every customer" },
          { value: "PROPORTIONAL", label: "In proportion to what each owes" },
          { value: "AS_ENTERED", label: "As entered" },
        ],
        ...(mocks.omitDefault ? {} : {
          split_default: mocks.splitDefault,
          split_default_label: "Oldest bill first, across every customer",
        }),
      },
    },
  }),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  BankAccountPicker: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" data-picker="bank" onClick={() => onChange("7")}>bank</button>,
  CustomerPicker: ({ onChange, placeholder }: { onChange: (v: string) => void; placeholder?: string }) => (
    <button type="button" data-picker={placeholder ? "payer-filter" : "payer"} onClick={() => onChange("PAY-OKAFOR")}>payer</button>
  ),
  PostingDateField: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" data-picker="date" onClick={() => onChange("2026-10-01")}>date</button>,
  MoneyInput: ({ onChangeKobo }: { onChangeKobo: (v: number) => void }) => <button type="button" data-picker="amount" onClick={() => onChangeKobo(500_000_00)}>amount</button>,
}));
vi.mock("@/components/finance-ui/can", () => ({ useCan: () => ({ can: () => mocks.can }) }));
vi.mock("@/components/finance-ui/list-branch", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useListBranch: () => ({ view: { applies: true, canChoose: true, selected: 2, showBranch: false, offerUnassigned: false, choices: [] }, choose: vi.fn() }),
  ListBranchSelect: () => <span data-picker="branch-filter" />,
}));
vi.mock("../../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => String(v).slice(0, 10) }) }));

import { PayerPaymentDrawer, PayerPaymentsTab, PlanTable, RecordPayerPaymentDrawer } from "./payer-payments-tab";

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

const PLAN = {
  payer: { id: 9, code: "PAY-OKAFOR", name: "Mr Okafor" }, bank_account: { id: 7, name: "GTBank" }, branch_id: 1, branch_name: "Ikeja",
  amount: 500_000_00, payment_date: "2026-10-01", split: "OLDEST_FIRST", split_label: "Oldest bill first", shares: [ADA, EMEKA],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.fieldAccess = {}; mocks.can = true; mocks.rows = []; mocks.plan = null; mocks.splitDefault = "OLDEST_FIRST"; mocks.omitDefault = false;
  mocks.preview.mockClear(); mocks.record.mockClear(); mocks.links.mockClear(); mocks.payments.mockClear();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
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

describe("the split picker when the school's split setting is hidden", () => {
  it("still offers the choices, names no default, and leaves no empty label", () => {
    mocks.omitDefault = true;
    mocks.branches = [{ id: 1, name: "Ikeja" }];
    act(() => root.render(<RecordPayerPaymentDrawer entity="HOLYCROSS" currency="NGN" onClose={() => undefined} onRecorded={() => undefined} />));
    const picker = document.body.querySelector<HTMLSelectElement>("select[aria-label='How to split it']")!;
    const options = [...picker.options].map((o) => o.textContent);
    expect(options[0]).toBe("School setting");
    expect(options).toContain("In proportion to what each owes");
    expect(options).toContain("I will enter each customer's amount");
    expect(document.body.textContent).not.toMatch(/undefined|null/);
  });
});

const access = (entry: { hidden?: string[]; read_only?: string[] }) => { mocks.fieldAccess = { "finance.payer_payment": entry }; };
const linkAccess = (entry: { hidden?: string[]; read_only?: string[] }) => { mocks.fieldAccess = { ...mocks.fieldAccess, "finance.payer_link": entry }; };

/** Every row's cell count equals the header's, in each table on screen. */
const alignedTables = () => {
  const tables = [...document.body.querySelectorAll("table")];
  expect(tables.length).toBeGreaterThan(0);
  for (const table of tables) {
    const heads = table.querySelectorAll("thead th").length;
    for (const row of table.querySelectorAll("tbody tr")) expect(row.querySelectorAll("td").length).toBe(heads);
  }
};
const headers = () => [...document.body.querySelectorAll("th")].map((th) => th.textContent);
const click = (selector: string) => act(() => { document.body.querySelector<HTMLElement>(selector)!.click(); });
const fillForm = () => { for (const picker of ["payer", "bank", "date", "amount"]) click(`[data-picker='${picker}']`); };
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

describe("the preview columns follow the amount switch", () => {
  it("keeps every column and its header with full access", () => {
    mocks.branches = [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }];
    render([ADA, EMEKA], mocks.branches);
    expect(headers()).toEqual(["Customer", "Bills at", "Booked as", "Amount", "Settles"]);
    alignedTables();
  });

  it("drops the amount, credit and bills columns together with their headers when the amount is hidden", () => {
    access({ hidden: ["amount"] });
    const text = render([{ ...ADA, bills: undefined, outstanding: undefined }, EMEKA], [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }]);
    expect(headers()).toEqual(["Customer", "Bills at", "Booked as"]);
    expect(text).not.toContain("INV-0091");
    alignedTables();
  });

  it("keeps the branch column and names the branch for a held share whatever the map lists", () => {
    access({ hidden: ["branch_id", "branch_name"] });
    const text = render([ADA, EMEKA], [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }]);
    expect(headers()).toContain("Bills at");
    expect(text).toContain("Held for Lekki");
    alignedTables();
  });

  it("drops the booked-as and settles columns when what each share settled is hidden", () => {
    access({ hidden: ["kind", "credit", "outstanding", "bills", "document", "forwarded_by"] });
    render([ADA, EMEKA], [{ id: 1, name: "Ikeja" }]);
    expect(headers()).toEqual(["Customer", "Amount"]);
    alignedTables();
  });
});

describe("a payment as the reader may see it", () => {
  const SHARES: PayerPayment["shares"] = [
    {
      id: 1, customer: { id: 11, code: "CUS-ADA", name: "Ada Okafor" }, branch_id: 1, branch_name: "Ikeja", kind: "RECEIPT",
      amount: 400_000_00, credit: 50_000_00, document: { id: 3, document_number: "RC-0003", status: "POSTED" },
      bills: [{ invoice_id: 91, document_number: "INV-0091", applied: 350_000_00 }],
    },
    {
      id: 2, customer: { id: 12, code: "CUS-EMEKA", name: "Emeka Okafor" }, branch_id: 2, branch_name: "Lekki", kind: "HELD",
      amount: 100_000_00, credit: 0, document: { id: 4, document_number: "HR-0004", status: "POSTED" }, forwarded_by: null,
    },
  ];
  const PAYMENT: PayerPayment = {
    id: 5, document_number: "PYP-0005", status: "POSTED", payer: { id: 9, code: "CUS-OKAFOR", name: "Mr Okafor" },
    branch_id: 1, branch_name: "Ikeja", bank_account: { id: 3, name: "GTBank collections" }, amount: 500_000_00,
    payment_date: "2026-09-26", method: "BANK_TRANSFER", split: "OLDEST_FIRST", split_label: "Oldest bill first",
    reference: "REF-77", narration: "", shares: SHARES,
  };
  const open = (payment: Partial<PayerPayment> | Record<string, unknown>) => {
    mocks.branches = [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }];
    act(() => root.render(<PayerPaymentDrawer payment={payment as PayerPayment} entity="HOLYCROSS" currency="NGN" onClose={() => undefined} />));
    return document.body.textContent ?? "";
  };

  it("shows every field and column with full access", () => {
    const text = open(PAYMENT);
    expect(text).toContain("Received into");
    expect(text).toContain("REF-77");
    expect(text).toContain("RC-0003");
    expect(text).toContain("Held for Lekki, not yet forwarded");
    expect(text).toContain("INV-0091");
    expect(headers()).toEqual(["Customer", "Bills at", "Document", "Amount", "Settled"]);
    alignedTables();
  });

  it("removes the amount, the credit and the bills when the amount is hidden", () => {
    access({ hidden: ["amount"] });
    const bare = { ...PAYMENT, shares: SHARES.map(({ amount, credit, bills, ...rest }) => rest) } as Record<string, unknown>;
    delete bare.amount;
    const text = open(bare);
    expect(text).not.toContain("Amount");
    expect(text).not.toContain("as credit");
    expect(text).not.toContain("INV-0091");
    expect(headers()).toEqual(["Customer", "Bills at", "Document"]);
    alignedTables();
  });

  it("drops the payer and date from the description and the number from the title when they are hidden", () => {
    access({ hidden: ["payer", "payment_date", "document_number"] });
    const bare = { ...PAYMENT } as Record<string, unknown>;
    delete bare.payer; delete bare.payment_date; delete bare.document_number;
    const text = open(bare);
    expect(text).toContain("Payer payment");
    expect(text).not.toContain("Mr Okafor");
    expect(text).not.toContain("PYP-0005");
  });

  it("removes the shares table when the shares are hidden", () => {
    access({ hidden: ["shares"] });
    const bare = { ...PAYMENT } as Record<string, unknown>;
    delete bare.shares;
    open(bare);
    expect(document.body.querySelectorAll("table")).toHaveLength(0);
  });

  it("states a held share without claiming it is not yet forwarded when the forward is hidden", () => {
    access({ hidden: ["forwarded_by"] });
    const text = open({ ...PAYMENT, shares: SHARES.map(({ forwarded_by, ...rest }) => rest) });
    expect(text).toContain("Held for Lekki");
    expect(text).not.toContain("not yet forwarded");
  });

  it("drops the method, split and bank rows when their fields are hidden, keeping the branch rows", () => {
    access({ hidden: ["branch_id", "branch_name", "method", "split", "split_label", "bank_account"] });
    const bare = { ...PAYMENT } as Record<string, unknown>;
    for (const name of ["method", "split", "split_label", "bank_account"]) delete bare[name];
    const text = open(bare);
    for (const label of ["Method", "Split", "Received into"]) expect(text).not.toContain(label);
    expect(text).toContain("Received at");
    expect(headers()).toContain("Bills at");
    alignedTables();
  });
});

describe("the payments list", () => {
  const ROW = {
    id: 5, document_number: "PYP-0005", status: "POSTED", payer: { id: 9, code: "CUS-OKAFOR", name: "Mr Okafor" },
    branch_id: 1, branch_name: "Ikeja", bank_account: { id: 3, name: "GTBank" }, amount: 500_000_00,
    payment_date: "2026-09-26", method: "BANK_TRANSFER", split: "OLDEST_FIRST", split_label: "Oldest bill first",
    reference: "", narration: "", shares: [{ id: 1, customer: { id: 11, code: "CUS-ADA", name: "Ada Okafor" } }],
  };
  const mount = () => {
    mocks.branches = [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }];
    act(() => root.render(<PayerPaymentsTab entity="HOLYCROSS" currency="NGN" />));
  };
  const tableHeaders = () => [...container.querySelectorAll("table thead th")].map((th) => th.textContent);

  it("sends the payer and branch filters and shows every column with full access", () => {
    mocks.rows = [ROW];
    mount();
    expect(tableHeaders()).toEqual(["Ref", "Payer", "Pays for", "Received at", "Date", "Amount", "Status"]);
    expect(container.querySelector("[data-picker='payer-filter']")).not.toBeNull();
    expect(container.querySelector("[data-picker='branch-filter']")).not.toBeNull();
    expect(mocks.payments).toHaveBeenLastCalledWith(expect.objectContaining({ branch: 2 }));
  });

  it("removes the hidden columns with their headers and keeps header and cell counts equal", () => {
    access({ hidden: ["amount", "status", "payer", "shares", "document_number", "branch_id", "branch_name"] });
    const bare: Record<string, unknown> = { ...ROW };
    for (const name of ["amount", "status", "payer", "shares"]) delete bare[name];
    mocks.rows = [bare];
    mount();
    expect(tableHeaders()).toEqual(["Ref", "Received at", "Date"]);
    const row = container.querySelector("table tbody tr")!;
    expect(row.querySelectorAll("td")).toHaveLength(3);
  });

  it("neither shows nor sends the payer filter when it is hidden, and keeps the branch filter whatever the map lists", () => {
    access({ hidden: ["payer", "branch_id", "branch_name"] });
    mount();
    expect(container.querySelector("[data-picker='payer-filter']")).toBeNull();
    expect(container.querySelector("[data-picker='branch-filter']")).not.toBeNull();
    const last = mocks.payments.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(last).not.toHaveProperty("payer");
    expect(last).toHaveProperty("branch", 2);
  });

  it("offers Record only when the payer, bank account, amount and date may be written", () => {
    mount();
    expect(button("Record payer payment")).toBeDefined();
    for (const entry of [{ read_only: ["amount"] }, { hidden: ["payment_date"] }, { read_only: ["bank_account"] }, { read_only: ["payer"] }]) {
      access(entry);
      mount();
      expect(button("Record payer payment")).toBeUndefined();
    }
    access({ read_only: ["reference", "narration", "method", "split", "split_label", "shares"] });
    mount();
    expect(button("Record payer payment")).toBeDefined();
  });
});

describe("the record form", () => {
  const mountForm = () => {
    mocks.branches = [{ id: 1, name: "Ikeja" }];
    act(() => root.render(<RecordPayerPaymentDrawer entity="HOLYCROSS" currency="NGN" onClose={() => undefined} onRecorded={() => undefined} />));
  };
  const field = (name: string) => document.body.querySelector<HTMLFieldSetElement>(`fieldset[data-field='${name}']`);

  it("sends the whole body with full access, for the preview and for the record", async () => {
    mountForm();
    fillForm();
    await act(async () => { button("Preview split")!.click(); });
    expect(mocks.preview).toHaveBeenCalledWith({
      entity: "HOLYCROSS", payer: "PAY-OKAFOR", bank_account: 7, amount: 500_000_00, payment_date: "2026-10-01", method: "BANK_TRANSFER",
    });
    await act(async () => { button("Record payment")!.click(); });
    expect(mocks.record).toHaveBeenCalledWith(mocks.preview.mock.calls[0][0]);
  });

  it("greys a read-only field and leaves it out of both bodies", async () => {
    access({ read_only: ["method", "reference"] });
    mountForm();
    expect(field("method")!.disabled).toBe(true);
    expect(field("reference")!.disabled).toBe(true);
    expect(field("amount")!.disabled).toBe(false);
    fillForm();
    await act(async () => { button("Preview split")!.click(); });
    const body = mocks.preview.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("method");
    expect(body).not.toHaveProperty("reference");
    expect(body).toHaveProperty("amount", 500_000_00);
  });

  it("removes a hidden field entirely", () => {
    access({ hidden: ["method", "split", "split_label", "reference"] });
    mountForm();
    for (const name of ["method", "split", "reference"]) expect(field(name)).toBeNull();
    expect(document.body.textContent).not.toContain("How to split it");
    expect(document.body.textContent).not.toContain("Method");
  });

  it("does not offer typing an amount per customer when the shares are read-only", () => {
    access({ read_only: ["shares"] });
    mountForm();
    const picker = document.body.querySelector<HTMLSelectElement>("select[aria-label='How to split it']")!;
    expect([...picker.options].map((o) => o.textContent)).not.toContain("I will enter each customer's amount");
  });

  it("explains, and offers no preview, when the school's split needs amounts the reader may not enter", () => {
    access({ read_only: ["shares"] });
    mocks.splitDefault = "AS_ENTERED";
    mountForm();
    fillForm();
    expect(document.body.textContent).toContain("which you are not allowed to enter");
    expect(button("Preview split")!.disabled).toBe(true);
  });

  it("shows a refusal beside the field it names", async () => {
    mountForm();
    fillForm();
    mocks.preview.mockImplementationOnce(() => { throw { status: 403, data: { error: { code: "field_write_denied", detail: { amount: ["You may not change amount."] } } } }; });
    await act(async () => { button("Preview split")!.click(); });
    expect(field("amount")!.textContent).toContain("You may not change amount.");
  });

  it("never asks for a payer's links when the link fields are hidden", () => {
    linkAccess({ hidden: ["is_active"] });
    mountForm();
    click("[data-picker='payer']");
    expect(mocks.links.mock.calls.every(([, options]) => (options as { skip?: boolean }).skip === true)).toBe(true);
  });

  it("asks for a payer's active links when the link fields are readable", () => {
    mountForm();
    click("[data-picker='payer']");
    const [args, options] = mocks.links.mock.calls.at(-1)!;
    expect(args).toEqual({ entity: "HOLYCROSS", payer: "PAY-OKAFOR", is_active: "true" });
    expect((options as { skip?: boolean }).skip).toBe(false);
  });

  it("shows no split sentence for a hidden split, and still names the branch, in the preview heading", async () => {
    access({ hidden: ["split", "split_label", "shares"] });
    const { split, split_label, shares, ...served } = PLAN;
    mocks.plan = served;
    mountForm();
    fillForm();
    await act(async () => { button("Preview split")!.click(); });
    const text = document.body.textContent ?? "";
    expect(text).toContain("How it will be split");
    expect(text).not.toContain("Oldest bill first");
    expect(text).toContain("received at");
    expect(text).toContain("not shown to you");
    expect(document.body.querySelectorAll("table")).toHaveLength(0);
  });
});
