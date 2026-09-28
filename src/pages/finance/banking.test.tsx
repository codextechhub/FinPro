/**
 * The bank account drawer.
 *
 * A bank account's number follows Field Access on `finance.bankaccount`:
 *
 *   1. hidden: the settings form has no Account number field at all;
 *   2. read-only: the field is shown greyed and a save does not send it;
 *   3. a refused save shows the backend's message under the field it names,
 *      not as a generic toast.
 *
 * A bulk-imported statement is corrected from its own row: it offers a
 * rollback while the server names the import that published it, and the
 * rollback goes to that batch and job.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  update: vi.fn(),
  rollback: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useUpdateBankAccountMutation: () => [mocks.update, { isLoading: false }],
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CurrencyPicker: () => null,
  AccountPicker: () => null,
}));

vi.mock("@/redux/services/dashboard/import-api", () => ({
  useCancelImportBatchMutation: () => [vi.fn(), { isLoading: false }],
  useRollbackImportJobMutation: () => [mocks.rollback, { isLoading: false }],
}));
vi.mock("@/redux/store", () => ({ useAppDispatch: () => mocks.dispatch }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SettingsTab, StatementsTab } from "./banking";
import type { BankAccount, BankStatement } from "@/redux/services/finance/ops-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT: BankAccount = {
  id: 7, name: "GTBank Operations", bank_name: "GTBank", account_number: "0123456789",
  gl_account: "1110", gl_account_id: 3, currency: "NGN", is_active: true, is_primary: true,
  is_primary_collection: false, book_balance: 0, book_balance_naira: "0.00",
  unreconciled_count: 0, last_reconciled_at: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.fieldAccess = {};
  mocks.update.mockReset();
  mocks.rollback.mockReset();
  mocks.dispatch.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const accountNumberField = () => container.querySelector("fieldset[data-field=account_number]");
const saveButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Save changes"))!;

describe("Bank account settings under Field Access", () => {
  it("has no account number field when the user cannot read it", () => {
    mocks.fieldAccess = { "finance.bankaccount": { hidden: ["account_number"] } };
    const { account_number: _hidden, ...withoutNumber } = ACCOUNT;
    void _hidden;
    const record = { ...withoutNumber, _read_only_fields: [] } as BankAccount;
    act(() => root.render(<SettingsTab account={record} record={record} entity="COD" canEdit />));
    expect(accountNumberField()).toBeNull();
    expect(container.textContent).not.toContain("Account number");
    expect(container.textContent).toContain("Bank name");
  });

  it("greys a read-only account number and leaves it out of the save", async () => {
    const record = { ...ACCOUNT, _read_only_fields: ["account_number"] };
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Saved." }) });
    act(() => root.render(<SettingsTab account={record} record={record} entity="COD" canEdit />));
    const field = accountNumberField() as HTMLFieldSetElement;
    expect(field.disabled).toBe(true);
    expect(field.querySelector("input")!.value).toBe("0123456789");
    await act(async () => { saveButton().click(); });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("account_number");
  });

  it("sends an account number the user may change", async () => {
    const record = { ...ACCOUNT, _read_only_fields: [] };
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Saved." }) });
    act(() => root.render(<SettingsTab account={record} record={record} entity="COD" canEdit />));
    await act(async () => { saveButton().click(); });
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ account_number: "0123456789" });
  });

  it("shows a field_write_denied refusal under the account number", async () => {
    const record = { ...ACCOUNT, _read_only_fields: [] };
    mocks.update.mockReturnValue({
      unwrap: () => Promise.reject({
        status: 403,
        data: {
          success: false,
          message: "You do not have permission to change: account_number.",
          error: { code: "field_write_denied", detail: { account_number: ["You do not have permission to change this field."] } },
        },
      }),
    });
    act(() => root.render(<SettingsTab account={record} record={record} entity="COD" canEdit />));
    await act(async () => { saveButton().click(); });
    const alert = accountNumberField()!.querySelector("[role=alert]");
    expect(alert?.textContent).toBe("You do not have permission to change this field.");
  });
});

const statement = (over: Partial<BankStatement>): BankStatement => ({
  id: 1, statement_date: "2026-03-31", period_label: "March 2026",
  opening_balance: 0, opening_balance_naira: "0.00",
  closing_balance: 0, closing_balance_naira: "0.00",
  line_count: 2, status: "UPLOADED", status_display: "Uploaded",
  can_edit: false, edit_block_reason: "Bulk-imported statements must be rolled back and re-imported.",
  import_rollback: null,
  ...over,
});

const render = (statements: BankStatement[]) =>
  act(() =>
    root.render(<StatementsTab detail={{ statements }} canEdit onEdit={() => {}} />),
  );

const rollBackButton = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="Roll back statement ${label}"]`);

describe("StatementsTab rollback", () => {
  it("offers a rollback only on a statement the server names an import for", () => {
    render([
      statement({ id: 1, period_label: "March 2026", import_rollback: { batch_id: 40, job_id: 41 } }),
      statement({ id: 2, period_label: "February 2026", can_edit: true, edit_block_reason: null }),
    ]);
    expect(rollBackButton("March 2026")).not.toBeNull();
    expect(rollBackButton("February 2026")).toBeNull();
  });

  it("rolls back the named batch and job with the reason given", async () => {
    mocks.rollback.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    render([statement({ import_rollback: { batch_id: 40, job_id: 41 } })]);

    await act(async () => rollBackButton("March 2026")!.click());
    const reason = document.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(reason, "  Imported into the wrong account ");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const confirm = [...document.querySelectorAll("button")].find((b) => b.textContent === "Roll back statement")!;
    await act(async () => confirm.click());

    expect(mocks.rollback).toHaveBeenCalledWith({
      batchId: 40, jobId: 41, reason: "Imported into the wrong account",
    });
    expect(mocks.dispatch).toHaveBeenCalled();
  });
});
