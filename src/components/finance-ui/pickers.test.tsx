/**
 * The receivable account picker reads the tagged chart, not the balances.
 *
 * Chukwuemeka, the Holy Cross bursar, may add customers but not open the chart
 * of accounts. The chart with balances refuses them, so a picker built on it was
 * empty. The tagged chart names the control accounts without any balance and
 * is readable on any finance key; the picker must use it and offer only the
 * postable asset accounts tagged CONTROL.
 *
 * The bank account picker offers a document only its own branch's accounts:
 * Mrs Okafor covers Ikeja and Lekki, and the server refuses to pay an Ikeja
 * claim from Lekki's account or from an account not yet given a branch. At a
 * school with one branch every account is that branch's, so all are offered.
 *
 * The deposit picker on a receipt does the same with ledger accounts: Ikeja's
 * receipt is offered Ikeja's collection ledger and the cash tin, never Lekki's
 * collection ledger, and a server whose rows do not name their bank narrows
 * nothing.
 *
 * The payments screens ask for the customers and vendors the reader may raise a
 * gateway record for (`?own=true`); every other screen lists them all.
 *
 * A payment against an invoice is deposited for the invoice's own branch. Ikeja
 * raises an invoice for the Adeyemis, whom every branch shares, so the customer
 * names no branch and the invoice names Ikeja: its payment is offered Ikeja's
 * collection ledger and the cash tin. From a server whose invoice rows do not
 * name their branch it falls back to the customer's, as before.
 *
 * Customers and vendors run to hundreds, so their pickers search on the
 * server. Bright Star's bursar types "Adeyemi" and the server is asked for
 * it; the Okafors, filed past the first page, are still named when a form
 * opens with them chosen, because the chosen customer is looked up by code.
 *
 * Field Access: the customer picker asks only for active customers. A role that
 * may not read the active flag would be refused that filter, so the picker lists
 * every customer for it and never names the field; a bank account without the
 * flag (hidden) is offered, only an account saying it is inactive is not.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  options: [] as { value: string; label: string }[],
  taggedCalls: 0,
  chartCalls: 0,
  branches: [] as { id: number; name: string }[] | undefined,
  ledgers: [] as Record<string, unknown>[],
  customerArgs: [] as Record<string, unknown>[],
  customerSkips: [] as boolean[],
  customers: [] as { code: string; name?: string; branch_id?: number | null }[],
  customerPage: Infinity,
  search: undefined as ((query: string) => void) | undefined,
  change: undefined as ((e: { target: { value: string } }) => void) | undefined,
  vendorArgs: [] as Record<string, unknown>[],
  vendors: [] as { id: number; code: string; name: string; is_active: boolean }[],
  banks: [] as { id: number; name: string; bank_name: string; branch_id: number | null; is_active?: boolean }[],
  fieldAccess: {} as Record<string, { hidden?: string[]; read_only?: string[] } | undefined>,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: mocks.fieldAccess,
  }),
}));

vi.mock("../../host", () => ({
  useBranches: () => ({ data: mocks.branches, isLoading: false, isError: mocks.branches === undefined }),
}));

vi.mock("@/components/custom/search-select", () => ({
  SearchSelect: ({ options, onSearchChange, onChange }: { options: { value: string; label: string }[]; onSearchChange?: (query: string) => void; onChange: (e: { target: { value: string } }) => void }) => {
    mocks.options = options;
    mocks.search = onSearchChange;
    mocks.change = onChange;
    return null;
  },
}));

const account = (code: string, name: string, account_type: string, tag: string | null, is_postable = true) =>
  ({ id: Number(code), code, name, account_type, tag, is_postable, is_active: true, balance: null });

vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetAccountsQuery: () => ({ data: { data: mocks.ledgers }, isLoading: false }),
  useGetCurrenciesQuery: () => ({ data: undefined, isLoading: false }),
  useGetTaxCodesQuery: () => ({ data: undefined, isLoading: false }),
  useGetCostCentersQuery: () => ({ data: undefined, isLoading: false }),
  useGetChartOfAccountsQuery: () => {
    mocks.chartCalls += 1;
    return { data: undefined, isLoading: false };
  },
  useGetTaggedAccountsQuery: () => {
    mocks.taggedCalls += 1;
    return {
      isLoading: false,
      data: {
        data: [
          account("1200", "Accounts Receivable", "ASSET", "CONTROL"),
          account("1100", "Bank", "ASSET", "CASH"),
          account("2100", "Accounts Payable", "LIABILITY", "CONTROL"),
          account("1000", "Assets", "ASSET", "CONTROL", false),
        ],
      },
    };
  },
}));

const bank = (id: number, name: string, branch_id: number | null) =>
  ({ id, name, bank_name: "", branch_id, is_active: true });

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetTaxObligationsQuery: () => ({ data: undefined, isLoading: false }),
  useGetPettyCashFundsQuery: () => ({ data: undefined, isLoading: false }),
  useGetBankAccountsQuery: () => ({ isLoading: false, data: { data: mocks.banks } }),
}));

vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetCustomersQuery: (args: Record<string, unknown>, opts?: { skip?: boolean }) => {
    if (!opts?.skip) mocks.customerArgs.push(args);
    mocks.customerSkips.push(!!opts?.skip);
    const term = typeof args.search === "string" ? args.search : "";
    const rows = term ? mocks.customers.filter((c) => c.code.includes(term)) : mocks.customers.slice(0, mocks.customerPage);
    return { data: opts?.skip ? undefined : { data: rows }, isLoading: false };
  },
}));
vi.mock("@/redux/services/procurement/procurement-api", () => ({
  useGetVendorsQuery: (args: Record<string, unknown>, opts?: { skip?: boolean }) => {
    if (!opts?.skip) mocks.vendorArgs.push(args);
    const term = typeof args.search === "string" ? args.search : "";
    return { data: { data: term ? mocks.vendors.filter((v) => v.code.includes(term)) : mocks.vendors }, isLoading: false };
  },
}));

import { BankAccountPicker, CustomerPicker, DepositAccountPicker, ReceivableAccountPicker, VendorPicker, useDocumentBranch } from "./pickers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.taggedCalls = 0;
  mocks.chartCalls = 0;
  mocks.fieldAccess = {};
  mocks.customerArgs = [];
  mocks.branches = [{ id: 10, name: "Ikeja Branch" }, { id: 20, name: "Lekki Branch" }];
  mocks.banks = [bank(1, "Ikeja Collections", 10), bank(2, "Lekki Collections", 20), bank(3, "GTBank Operations", null)];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ReceivableAccountPicker", () => {
  it("reads the tagged chart and never the one with balances", () => {
    act(() => root.render(<ReceivableAccountPicker entity="HOLYCROSS" value="" onChange={() => undefined} />));

    expect(mocks.taggedCalls).toBeGreaterThan(0);
    expect(mocks.chartCalls).toBe(0);
  });

  it("offers only postable asset accounts tagged CONTROL", () => {
    act(() => root.render(<ReceivableAccountPicker entity="HOLYCROSS" value="" onChange={() => undefined} />));

    expect(mocks.options).toEqual([{ value: "1200", label: "1200 · Accounts Receivable" }]);
  });
});

describe("BankAccountPicker", () => {
  const offered = () => mocks.options.map((o) => o.label);

  it("offers a branch's document only its own branch's accounts", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={10} />));

    expect(offered()).toEqual(["Ikeja Collections"]);
  });

  it("offers a document not yet given a branch only the accounts not yet given one", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={null} />));

    expect(offered()).toEqual(["GTBank Operations"]);
  });

  it("offers every account while the document's branch is not known", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} />));

    expect(offered()).toEqual(["Ikeja Collections", "Lekki Collections", "GTBank Operations"]);
  });

  it("offers every account at a school with one branch", () => {
    mocks.branches = [{ id: 10, name: "Main Branch" }];
    mocks.banks = [bank(1, "Main Collections", 10), bank(3, "GTBank Operations", null)];
    act(() => root.render(<BankAccountPicker entity="HARBOUR" value="" onChange={() => undefined} documentBranchId={10} />));

    expect(offered()).toEqual(["Main Collections", "GTBank Operations"]);
  });

  it("still narrows when the branch list cannot be read but the accounts span two branches", () => {
    mocks.branches = undefined;
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={20} />));

    expect(offered()).toEqual(["Lekki Collections"]);
  });
});

describe("BankAccountPicker for a batch", () => {
  const offered = () => mocks.options.map((o) => o.label);

  it("offers lines of one branch that branch's accounts", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchIds={[10, undefined, 10]} />));

    expect(offered()).toEqual(["Ikeja Collections"]);
  });

  it("offers lines of two branches no account at all", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchIds={[10, 20]} />));

    expect(offered()).toEqual([]);
  });
});

describe("DepositAccountPicker", () => {
  const offered = () => mocks.options.map((o) => o.value);
  const ledger = (code: string, bank_account_id: number | null | undefined, bank_branch_id: number | null | undefined) =>
    ({ id: Number(code), code, name: code, is_active: true, bank_account_id, bank_branch_id });

  beforeEach(() => {
    mocks.ledgers = [ledger("1110", 1, 10), ledger("1120", 2, 20), ledger("1100", null, null)];
  });

  it("offers an Ikeja receipt Ikeja's ledger and the cash tin, not Lekki's", () => {
    act(() => root.render(<DepositAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={10} />));
    expect(offered()).toEqual(["1110", "1100"]);
  });

  it("offers every account while the receipt's branch is not known", () => {
    act(() => root.render(<DepositAccountPicker entity="CORONA" value="" onChange={() => undefined} />));
    expect(offered()).toEqual(["1110", "1120", "1100"]);
  });

  it("still narrows by branch when the ledger account link is hidden from the role", () => {
    mocks.ledgers = [ledger("1110", undefined, 10), ledger("1120", undefined, 20), ledger("1100", undefined, null)];
    act(() => root.render(<DepositAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={10} />));
    expect(offered()).toEqual(["1110", "1100"]);
  });

  it("narrows nothing when the server's rows do not name their bank", () => {
    mocks.ledgers = [ledger("1110", undefined, undefined), ledger("1120", undefined, undefined)];
    act(() => root.render(<DepositAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={10} />));
    expect(offered()).toEqual(["1110", "1120"]);
  });
});

describe("Payments pickers", () => {
  it("ask for the reader's own customers and vendors only when told to", () => {
    mocks.customerArgs = [];
    mocks.vendorArgs = [];
    act(() => root.render(<><CustomerPicker entity="CORONA" value="" onChange={() => undefined} own /><VendorPicker entity="CORONA" value="" onChange={() => undefined} own /></>));
    expect(mocks.customerArgs.at(-1)).toMatchObject({ own: "true" });
    expect(mocks.vendorArgs.at(-1)).toMatchObject({ own: true });

    act(() => root.render(<><CustomerPicker entity="CORONA" value="" onChange={() => undefined} /><VendorPicker entity="CORONA" value="" onChange={() => undefined} /></>));
    expect(mocks.customerArgs.at(-1)).not.toHaveProperty("own");
    expect(mocks.vendorArgs.at(-1)).not.toHaveProperty("own");
  });
});

describe("Customers and vendors searched on the server", () => {
  beforeEach(() => {
    mocks.customerArgs = [];
    mocks.customers = [{ code: "CADEY", name: "Adeyemi" }, { code: "CBELL", name: "Bello" }, { code: "COKAF", name: "Okafor" }];
    mocks.customerPage = 2;
  });
  afterEach(() => { mocks.customerPage = Infinity; });

  it("asks the server for what the bursar types, after a pause", () => {
    vi.useFakeTimers();
    try {
      act(() => root.render(<CustomerPicker entity="CORONA" value="" onChange={() => undefined} />));
      expect(mocks.customerArgs.at(-1)).not.toHaveProperty("search");
      act(() => mocks.search?.("Adeyemi"));
      act(() => { vi.advanceTimersByTime(300); });
      expect(mocks.customerArgs.at(-1)).toMatchObject({ search: "Adeyemi" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("names a chosen customer the first page does not hold, by looking up the code", () => {
    act(() => root.render(<CustomerPicker entity="CORONA" value="COKAF" onChange={() => undefined} />));
    expect(mocks.customerArgs).toContainEqual({ entity: "CORONA", search: "COKAF", page_size: 100 });
    expect(mocks.options.map((o) => o.label)).toEqual(["COKAF - Okafor", "CADEY - Adeyemi", "CBELL - Bello"]);
  });

  it("does not look up a chosen customer the page already holds", () => {
    act(() => root.render(<CustomerPicker entity="CORONA" value="CBELL" onChange={() => undefined} />));
    expect(mocks.customerArgs.every((args) => args.search !== "CBELL")).toBe(true);
  });

  it("hands a payout the vendor row it picked", () => {
    mocks.vendors = [{ id: 3, code: "VPRIME", name: "Prime Uniforms", is_active: true }];
    const onChange = vi.fn();
    act(() => root.render(<VendorPicker entity="CORONA" value="" onChange={onChange} />));
    act(() => mocks.change?.({ target: { value: "VPRIME" } }));
    expect(onChange).toHaveBeenLastCalledWith("VPRIME", mocks.vendors[0]);
  });
});

describe("useDocumentBranch", () => {
  const ledger = (code: string, bank_account_id: number | null, bank_branch_id: number | null) =>
    ({ id: Number(code), code, name: code, is_active: true, bank_account_id, bank_branch_id });

  /** A payment form's deposit picker, narrowed as RecordPaymentModal narrows it. */
  function PaymentDeposit({ doc }: { doc: { branch_id?: number | null; customer_code?: string } }) {
    const branch = useDocumentBranch("CORONA", doc);
    return <DepositAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={branch} />;
  }
  const offered = () => mocks.options.map((o) => o.value);

  beforeEach(() => {
    mocks.ledgers = [ledger("1110", 1, 10), ledger("1120", 2, 20), ledger("1100", null, null)];
    mocks.customers = [{ code: "CADEY", branch_id: null }, { code: "COKAF", branch_id: 20 }];
    mocks.customerSkips = [];
  });

  it("offers Ikeja's invoice for a shared customer Ikeja's ledger and the cash tin", () => {
    act(() => root.render(<PaymentDeposit doc={{ branch_id: 10, customer_code: "CADEY" }} />));
    expect(offered()).toEqual(["1110", "1100"]);
    expect(mocks.customerSkips.every(Boolean)).toBe(true);
  });

  it("keeps an invoice raised before its customer moved to Lekki on Ikeja", () => {
    act(() => root.render(<PaymentDeposit doc={{ branch_id: 10, customer_code: "COKAF" }} />));
    expect(offered()).toEqual(["1110", "1100"]);
  });

  it("falls back to the customer's branch when the server's rows do not name one", () => {
    act(() => root.render(<PaymentDeposit doc={{ customer_code: "COKAF" }} />));
    expect(offered()).toEqual(["1120", "1100"]);
  });

  it("narrows nothing for a shared customer's invoice from such a server", () => {
    act(() => root.render(<PaymentDeposit doc={{ customer_code: "CADEY" }} />));
    expect(offered()).toEqual(["1110", "1120", "1100"]);
  });
});

describe("Field Access on the pickers", () => {
  it("asks for active customers only while the active flag is readable", () => {
    act(() => root.render(<CustomerPicker entity="CORONA" value="" onChange={() => undefined} />));
    expect(mocks.customerArgs.at(-1)).toMatchObject({ is_active: "true" });
  });

  it("never names the active flag when its role may not read it", () => {
    mocks.fieldAccess = { "finance.customer": { hidden: ["is_active"] } };
    act(() => root.render(<CustomerPicker entity="CORONA" value="" onChange={() => undefined} />));
    expect(mocks.customerArgs.length).toBeGreaterThan(0);
    expect(mocks.customerArgs.every((args) => !("is_active" in args))).toBe(true);
  });

  it("reads the branch of a chosen customer from the same unfiltered list", () => {
    mocks.fieldAccess = { "finance.customer": { hidden: ["is_active"] } };
    mocks.customers = [{ code: "COKAF", branch_id: 20 }];
    function Branch() {
      const branch = useDocumentBranch("CORONA", { customer_code: "COKAF" });
      return <span data-branch={String(branch)} />;
    }
    act(() => root.render(<Branch />));
    expect(container.querySelector("[data-branch]")?.getAttribute("data-branch")).toBe("20");
    expect(mocks.customerArgs.every((args) => !("is_active" in args))).toBe(true);
  });

  it("offers a bank account whose active flag is hidden and drops one that is inactive", () => {
    mocks.banks = [
      { id: 1, name: "Ikeja Collections", bank_name: "", branch_id: null },
      { id: 2, name: "Old account", bank_name: "", branch_id: null, is_active: false },
    ];
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} />));
    expect(mocks.options.map((o) => o.label)).toEqual(["Ikeja Collections"]);
  });
});
