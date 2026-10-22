/**
 * Who an expense claim reimburses, at Corona Group.
 *
 * Ngozi records Tolu Fashola's claim for lab chemicals by picking Tolu from the
 * staff list, so the claim sends Tolu's account and no typed name. Mrs Okafor
 * from the PTA is on no staff list: Ngozi chooses "Not on the staff list" and
 * types her name, and only the name is sent. A role that may not read the
 * claimant sees no Claimant field and no claimant anywhere; one that may read
 * it and not change it sees the field greyed and is not offered a new claim.
 */
import { act, type ChangeEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const directory = vi.hoisted(() => ({
  rows: [
    { id: "42", full_name: "Tolu Fashola", email: "tolu@corona.example", role: "Teacher", status: "ACTIVE" },
    { id: "7", full_name: "Ngozi Ibekwe", email: "ngozi@corona.example", role: "Finance Admin", status: "ACTIVE" },
  ],
}));
vi.mock("../../../host", async () =>
  (await import("../../../host-fake")).fakeHost({
    useDirectory: () => ({ data: directory.rows, isLoading: false, isError: false }),
  }));
vi.mock("@/components/custom/search-select", () => ({
  SearchSelect: ({ id, options, value, disabled, onChange }: {
    id: string; options: { value: string; label: string }[]; value: string; disabled?: boolean;
    onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  }) => (
    <select id={id} value={value} disabled={disabled} onChange={onChange}>
      <option value="" />
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

import { resolveFieldAccess } from "../../../components/finance-ui/field-access";
import type { ExpenseClaim } from "@/redux/services/finance/ops-types";
import { DEFAULT_DISPLAY_PREFS } from "../../../utils/dates";
import { buildExpenseClaimPrintDocument } from "../../../utils/finance-print";
import {
  EXPENSE_CLAIM, NO_CLAIMANT, TYPED_CLAIMANT, canNameClaimant, claimantBody, claimantReady, claimantShown,
  type ClaimantChoice,
} from "./claimant";
import { ClaimantField, ClaimantName } from "./claimant-field";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPEN = resolveFieldAccess({}, EXPENSE_CLAIM);
const HIDDEN = resolveFieldAccess(
  { [EXPENSE_CLAIM]: { hidden: ["claimant_id", "claimant_name"], read_only: ["claimant"] } }, EXPENSE_CLAIM,
);
const READ_ONLY = resolveFieldAccess(
  { [EXPENSE_CLAIM]: { read_only: ["claimant", "claimant_id", "claimant_name"] } }, EXPENSE_CLAIM,
);

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
function choose(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
const button = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

describe("the claimant a new claim sends", () => {
  it("sends the person picked from the staff list, and no typed name", () => {
    expect(claimantBody({ kind: "staff", id: "42" }, OPEN)).toEqual({ claimant: 42 });
  });

  it("sends only the typed name for somebody not on the staff list", () => {
    expect(claimantBody({ kind: "typed", name: "  Mrs Okafor " }, OPEN)).toEqual({ claimant_name: "Mrs Okafor" });
  });

  it("is ready only once somebody is named", () => {
    expect(claimantReady(NO_CLAIMANT)).toBe(false);
    expect(claimantReady({ kind: "typed", name: "  " })).toBe(false);
    expect(claimantReady({ kind: "staff", id: "42" })).toBe(true);
    expect(claimantReady({ kind: "typed", name: "Mrs Okafor" })).toBe(true);
  });

  it("sends nothing the reader may not write, and offers no new claim to them", () => {
    expect(claimantBody({ kind: "staff", id: "42" }, READ_ONLY)).toEqual({});
    expect(claimantBody({ kind: "typed", name: "Mrs Okafor" }, HIDDEN)).toEqual({});
    expect(canNameClaimant(OPEN)).toBe(true);
    expect(canNameClaimant(READ_ONLY)).toBe(false);
    expect(canNameClaimant(HIDDEN)).toBe(false);
  });
});

describe("the Claimant field", () => {
  let container: HTMLDivElement;
  let root: Root;
  let value: ClaimantChoice;
  const changes: ClaimantChoice[] = [];

  async function render(access = OPEN) {
    await act(async () => {
      root.render(<ClaimantField access={access} value={value} onChange={(next) => { changes.push(next); value = next; }} />);
    });
  }

  beforeEach(() => {
    value = NO_CLAIMANT;
    changes.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("lists the staff by name and role, and picking Tolu chooses her account", async () => {
    await render();

    const picker = container.querySelector<HTMLSelectElement>("#expense-claimant")!;
    expect([...picker.options].map((o) => o.textContent)).toEqual(["", "Ngozi Ibekwe (Finance Admin)", "Tolu Fashola (Teacher)"]);
    await act(async () => choose(picker, "42"));

    expect(changes.at(-1)).toEqual({ kind: "staff", id: "42" });
  });

  it("swaps the picker for a name box when Not on the staff list is chosen", async () => {
    await render();
    await act(async () => button(container, "Not on the staff list")!.click());
    expect(changes.at(-1)).toEqual({ kind: "typed", name: "" });

    await render();
    expect(container.querySelector("#expense-claimant")).toBeNull();
    const box = container.querySelector<HTMLInputElement>('input[aria-label="Claimant\'s name"]')!;
    await act(async () => type(box, "Mrs Okafor"));

    expect(changes.at(-1)).toEqual({ kind: "typed", name: "Mrs Okafor" });
    expect(claimantBody(value, OPEN)).toEqual({ claimant_name: "Mrs Okafor" });
  });

  it("is not there at all for a reader who may not read the claimant", async () => {
    await render(HIDDEN);

    expect(container.innerHTML).toBe("");
  });

  it("is greyed for a reader who may read the claimant and not change it", async () => {
    await render(READ_ONLY);

    const fieldset = container.querySelector("fieldset")!;
    expect(fieldset.disabled).toBe(true);
    expect(fieldset.getAttribute("data-read-only")).toBe("true");
    expect(container.querySelector<HTMLSelectElement>("#expense-claimant")!.disabled).toBe(true);
  });
});

describe("a claim's claimant where it is shown", () => {
  const claim = (over: Partial<ExpenseClaim>) => ({
    id: 1, document_number: "EXP-0001", claim_date: "2026-01-10", title: "Lab chemicals", narration: "",
    status: "DRAFT", payment_status: "UNPAID", subtotal: 0, tax_total: 0, total: 0, total_naira: "0.00",
    amount_paid: 0, balance_due: 0, journal_id: null, approval_required: false, lines: [], ...over,
  }) as ExpenseClaim;
  const tolu = claim({ claimant_id: 42, claimant_name: "Tolu Fashola" });
  const okafor = claim({ claimant_id: null, claimant_name: "Mrs Okafor" });
  const withheld = claim({});

  it("marks a typed name and names nobody when the claimant is withheld", () => {
    expect(claimantShown(tolu)).toEqual({ name: "Tolu Fashola", typed: false });
    expect(claimantShown(okafor)).toEqual({ name: "Mrs Okafor", typed: true });
    expect(claimantShown(withheld)).toBeNull();
  });

  it("tags a typed claimant in the list, and only a typed one", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<><ClaimantName claim={tolu} /><ClaimantName claim={okafor} /><ClaimantName claim={withheld} /></>));

    expect(container.textContent).toBe(`Tolu FasholaMrs Okafor${TYPED_CLAIMANT}`);
    await act(async () => root.unmount());
  });

  it("prints the claimant, marks a typed one, and leaves a withheld one out", () => {
    const sub = (c: ExpenseClaim) => {
      const block = buildExpenseClaimPrintDocument(c, "Draft", "NGN", DEFAULT_DISPLAY_PREFS).blocks[1];
      return (block as { text: string }).text;
    };

    expect(sub(tolu)).toMatch(/^Tolu Fashola · .+ · Lab chemicals · Draft$/);
    expect(sub(okafor)).toMatch(/^Mrs Okafor \(typed name\) · /);
    expect(sub(withheld)).not.toMatch(/Tolu|Okafor|^-/);
  });
});
