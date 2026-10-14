/**
 * Paystack top-ups, as CodeX platform staff use them.
 *
 * Ngozi Eze records N2,000,000 that CodeX paid from its Zenith account into
 * Paystack on 12 October. Recording books nothing: she opens the draft and puts
 * it forward, and two other people approve it. She sees New top-up only with the
 * create key and Submit only with the submit key; a top-up already with its
 * approvers offers neither, and one an approver sent back is corrected and
 * resumed, never submitted a second time. The approval card's link opens the
 * top-up by `?document=<id>`. Fields her roles may not read have no column and
 * no line, and fields she may not write are greyed and never sent.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  fieldAccess: {} as Record<string, { hidden?: string[]; read_only?: string[]; open_on_create?: string[] }>,
  rows: [] as unknown[],
  detail: null as unknown,
  listArgs: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  submit: vi.fn(),
  resume: vi.fn(),
  uid: 4,
  request: undefined as unknown,
  toastWarning: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: (...codes: string[]) => codes.some((c) => mocks.held.has(c)),
    hasAllPermissions: (...codes: string[]) => codes.every((c) => mocks.held.has(c)),
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));

vi.mock("@/redux/services/payments/payments-api", () => ({
  useGetPlatformProviderTopupsQuery: (args: unknown) => (mocks.listArgs(args), {
    data: { data: mocks.rows }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useGetPlatformProviderTopupQuery: () => ({ data: mocks.detail ? { data: mocks.detail } : undefined, isError: false }),
  useCreatePlatformProviderTopupMutation: () => [mocks.create, { isLoading: false }],
  useUpdatePlatformProviderTopupMutation: () => [mocks.update, { isLoading: false }],
  useSubmitPlatformProviderTopupMutation: () => [mocks.submit, { isLoading: false }],
}));

vi.mock("@/redux/services/finance/approval-request-api", () => ({
  useGetDocumentApprovalRequestQuery: () => ({ data: undefined }),
  approvalRequestApi: { util: { invalidateTags: () => ({ type: "test/invalidate" }) } },
}));
vi.mock("@/redux/services/dashboard/workflow-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useGetWorkflowInstanceQuery: () => ({ data: mocks.request }),
  useResubmitWorkflowInstanceMutation: () => [(id: string) => { mocks.resume(id); return { unwrap: async () => ({}) }; }, { isLoading: false }],
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {}, user: { id: mocks.uid } } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));

vi.mock("../../host", () => ({
  platformName: "CodeX",
  useBranches: () => ({ data: [{ id: 1, name: "Head office" }], isLoading: false, isError: false }),
  hostBranchLens: () => ({ applies: false, pinnedBranch: null, branch: "all", choices: [{ id: 1, name: "Head office" }], isLoading: false }),
}));
vi.mock("../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => v, dateTime: (v: string) => v, today: () => "2026-10-14" }) }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DetailDrawer: ({ open, title, children, footer }: { open: boolean; title: string; children?: React.ReactNode; footer?: React.ReactNode }) =>
    open ? <section aria-label={title}><h2>{title}</h2>{children}<footer>{footer}</footer></section> : null,
  BankAccountPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input aria-label="bank account" value={value} onChange={(e) => onChange(e.target.value)} />,
  MoneyInput: ({ valueKobo, onChangeKobo }: { valueKobo: number; onChangeKobo: (v: number) => void }) => <input aria-label="amount" value={valueKobo} onChange={(e) => onChangeKobo(Number(e.target.value))} />,
  PostingDateField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input aria-label="date" value={value} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: mocks.toastWarning } }));

import { P } from "../../permissions";
import { ProviderTopUpsTab } from "./provider-topups-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const topup = (over: Record<string, unknown> = {}) => ({
  id: 5, provider: "PAYSTACK", currency: "NGN", amount: 200_000_000, amount_naira: "N2,000,000.00", topped_up_on: "2026-10-12",
  bank_account: 7, bank_account_name: "Zenith main", reference: "TRF-1", note: "Float for payouts",
  status: "DRAFT", approval_state: "NOT_SUBMITTED", approval_returned: false,
  journal_id: null, journal_number: null, posted_at: null, created_by: 4, created_by_name: "Ngozi Eze",
  branch: 1, branch_name: "Head office", created_at: "2026-10-12T08:00:00Z", ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.fieldAccess = {};
  mocks.rows = [topup()];
  mocks.detail = { ...topup(), workflow_instance_id: null, _read_only_fields: [] };
  mocks.request = undefined;
  mocks.uid = 4;
  for (const fn of [mocks.listArgs, mocks.create, mocks.update, mocks.submit, mocks.resume, mocks.toastWarning]) fn.mockReset();
  mocks.create.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Provider balance top-up recorded.", data: { id: 9 } }) });
  mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Updated." }) });
  mocks.submit.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Top-up submitted for approval.", data: { approval: { parked: false } } }) });
  mocks.held = new Set([P.PAY_VIEW_PLATFORM_TOPUPS, P.PAY_CREATE_PLATFORM_TOPUP, P.PAY_SUBMIT_PLATFORM_TOPUP]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const show = (entity: string | null = "CX", at = "/") =>
  act(() => root.render(<MemoryRouter initialEntries={[at]}><ProviderTopUpsTab entity={entity} /></MemoryRouter>));
const headers = () => [...container.querySelectorAll("thead th")].map((th) => th.textContent);
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
const drawer = (title: string) => document.body.querySelector(`section[aria-label="${title}"]`);
const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const field = (name: string) => document.body.querySelector<HTMLFieldSetElement>(`fieldset[data-field=${name}]`);

describe("the list", () => {
  it("says in one line what the screen is for, and shows each top-up in plain words", () => {
    show();
    expect(container.textContent).toContain("Record money CodeX adds to its Paystack balance from its own bank, so the daily balance check agrees.");
    expect(headers()).toEqual(["Date", "Amount", "Paid from", "Provider", "Reference", "Status"]);
    const text = container.querySelector("tbody tr")!.textContent!;
    expect(text).toContain("2026-10-12");
    expect(text).toContain("2,000,000.00");
    expect(text).toContain("Zenith main");
    expect(text).toContain("Draft");
  });

  it("asks the server for one status when a filter is chosen", () => {
    show();
    const select = container.querySelector("select[aria-label=Status]") as HTMLSelectElement;
    act(() => { select.value = "PENDING_APPROVAL"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(mocks.listArgs).toHaveBeenLastCalledWith({ limit: 200, status: "PENDING_APPROVAL" });
    expect([...select.options].map((o) => o.text)).toEqual(["All top-ups", "Draft", "Waiting for approval", "Booked", "Rejected"]);
  });

  it("reads a draft an approver returned as Sent back", () => {
    mocks.rows = [topup({ approval_state: "PENDING", approval_returned: true })];
    show();
    expect(container.querySelector("tbody tr")!.textContent).toContain("Sent back");
  });

  it("leaves out the column of every field her roles may not read", () => {
    mocks.fieldAccess = { "payments.platform_topup": { hidden: ["status", "approval_state", "approval_returned", "bank_account", "bank_account_name", "reference"] } };
    mocks.rows = [topup({ status: undefined, bank_account_name: undefined, reference: undefined })];
    show();
    expect(headers()).toEqual(["Date", "Amount", "Provider"]);
  });

  it("offers New top-up only with the create key and a ledger entity", () => {
    show();
    expect(button("New top-up")).toBeTruthy();
    act(() => root.unmount());
    root = createRoot(container);
    mocks.held = new Set([P.PAY_VIEW_PLATFORM_TOPUPS]);
    show();
    expect(button("New top-up")).toBeUndefined();
    act(() => root.unmount());
    root = createRoot(container);
    mocks.held = new Set([P.PAY_VIEW_PLATFORM_TOPUPS, P.PAY_CREATE_PLATFORM_TOPUP]);
    show(null);
    expect(button("New top-up")).toBeUndefined();
    expect(container.textContent).toContain("Choose CodeX");
  });
});

describe("recording a top-up", () => {
  const fill = () => {
    act(() => button("New top-up")!.click());
    act(() => type(document.body.querySelector<HTMLInputElement>("input[aria-label=amount]")!, "200000000"));
    act(() => type(document.body.querySelector<HTMLInputElement>("input[aria-label='bank account']")!, "7"));
    act(() => type(document.body.querySelector<HTMLInputElement>("input[aria-label=date]")!, "2026-10-12"));
  };

  it("cannot be saved until it has an amount, a bank account and a date", () => {
    show();
    act(() => button("New top-up")!.click());
    expect((button("Save top-up") as HTMLButtonElement).disabled).toBe(true);
    fill();
    expect((button("Save top-up") as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends the draft, leaving out an empty reference and note, then opens it", async () => {
    show();
    fill();
    await act(async () => { button("Save top-up")!.click(); });
    expect(mocks.create).toHaveBeenCalledWith({ amount: 200_000_000, bank_account: 7, topped_up_on: "2026-10-12" });
    expect(drawer("New top-up")).toBeNull();
    expect(document.body.textContent).toContain("Not put forward yet");
  });

  it("sends a reference and a note when they are typed", async () => {
    show();
    fill();
    act(() => type(document.body.querySelector<HTMLInputElement>("fieldset[data-field=reference] input")!, " TRF-9 "));
    act(() => type(document.body.querySelector<HTMLTextAreaElement>("fieldset[data-field=note] textarea")!, "Float"));
    await act(async () => { button("Save top-up")!.click(); });
    expect(mocks.create).toHaveBeenCalledWith({ amount: 200_000_000, bank_account: 7, topped_up_on: "2026-10-12", reference: "TRF-9", note: "Float" });
  });

  it("never sends a field she may not write, and has no control for one she may not read", async () => {
    mocks.fieldAccess = { "payments.platform_topup": { hidden: ["note"], read_only: ["reference"] } };
    show();
    act(() => button("New top-up")!.click());
    expect(field("note")).toBeNull();
    expect(field("reference")!.disabled).toBe(true);
    act(() => type(document.body.querySelector<HTMLInputElement>("input[aria-label=amount]")!, "200000000"));
    act(() => type(document.body.querySelector<HTMLInputElement>("input[aria-label='bank account']")!, "7"));
    act(() => type(document.body.querySelector<HTMLInputElement>("input[aria-label=date]")!, "2026-10-12"));
    await act(async () => { button("Save top-up")!.click(); });
    const body = mocks.create.mock.calls[0][0];
    expect(body).not.toHaveProperty("note");
    expect(body).not.toHaveProperty("reference");
  });

  it("opens from the palette's ?action=new link for a holder of the create key and not for anyone else", () => {
    show("CX", "/?action=new");
    expect(drawer("New top-up")).not.toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    mocks.held = new Set([P.PAY_VIEW_PLATFORM_TOPUPS]);
    show("CX", "/?action=new");
    expect(drawer("New top-up")).toBeNull();
  });
});

describe("opening a top-up", () => {
  it("opens the one the approval card names by ?document=<id>", () => {
    mocks.rows = [];
    show("CX", "/?document=5");
    expect(document.body.textContent).toContain("Zenith main");
    expect(document.body.textContent).toContain("Float for payouts");
    expect(document.body.textContent).toContain("Not put forward yet");
  });

  it("puts a draft forward after asking, and warns when nobody can approve it yet", async () => {
    mocks.submit.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Top-up submitted for approval.", data: { approval: { parked: true, requirement: "Give two people the settlement approver role." } } }) });
    show("CX", "/?document=5");
    act(() => button("Submit for approval")!.click());
    expect(document.body.textContent).toContain("Two other CodeX people must approve it before it is booked");
    expect(mocks.submit).not.toHaveBeenCalled();
    await act(async () => { button("Submit")!.click(); });
    expect(mocks.submit).toHaveBeenCalledWith({ id: 5 });
    expect(mocks.toastWarning).toHaveBeenCalledWith("Nobody can approve it yet. Give two people the settlement approver role.");
  });

  it("offers Submit only to a holder of the submit key, and Edit only to a holder of the create key", () => {
    mocks.held = new Set([P.PAY_VIEW_PLATFORM_TOPUPS]);
    show("CX", "/?document=5");
    expect(button("Submit for approval")).toBeUndefined();
    expect(button("Edit")).toBeUndefined();
  });

  it("offers neither once it is with the approvers, and says so", () => {
    mocks.detail = { ...topup({ status: "PENDING_APPROVAL", approval_state: "PENDING" }), workflow_instance_id: 31, _read_only_fields: [] };
    show("CX", "/?document=5");
    expect(button("Submit for approval")).toBeUndefined();
    expect(button("Edit")).toBeUndefined();
    expect(document.body.textContent).toContain("Waiting for two approvers");
  });

  it("links a booked top-up to its journal", () => {
    mocks.detail = {
      ...topup({ status: "POSTED", approval_state: "APPROVED", journal_id: 88, journal_number: "JV-0088", posted_at: "2026-10-13T10:00:00Z" }),
      workflow_instance_id: 31, _read_only_fields: [],
    };
    show("CX", "/?document=5");
    const link = [...document.body.querySelectorAll("a")].find((a) => a.textContent === "JV-0088") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("document=88");
    expect(button("Edit")).toBeUndefined();
  });

  it("lets the person it was sent back to correct and resume it, and not submit it again", () => {
    mocks.detail = {
      ...topup({ approval_state: "PENDING", approval_returned: true }), workflow_instance_id: 31, _read_only_fields: [],
    };
    mocks.request = { status: "RETURNED", requested_by: 4, stage_instances: [] };
    show("CX", "/?document=5");
    expect(button("Resume")).toBeTruthy();
    expect(button("Edit")).toBeTruthy();
    expect(button("Submit for approval")).toBeUndefined();
    act(() => button("Resume")!.click());
    expect(mocks.resume).toHaveBeenCalledWith("31");
  });

  it("corrects a draft by sending only what changed", async () => {
    show("CX", "/?document=5");
    act(() => button("Edit")!.click());
    act(() => type(document.body.querySelector<HTMLInputElement>("input[aria-label=amount]")!, "250000000"));
    await act(async () => { button("Save changes")!.click(); });
    expect(mocks.update).toHaveBeenCalledWith({ id: 5, amount: 250_000_000 });
  });

  it("leaves out every line of a field her roles may not read", () => {
    mocks.fieldAccess = { "payments.platform_topup": { hidden: ["journal_id", "journal_number", "posted_at", "created_by", "created_by_name"] } };
    mocks.detail = { id: 5, currency: "NGN", provider: "PAYSTACK", amount: 200_000_000, topped_up_on: "2026-10-12", status: "POSTED", approval_state: "APPROVED", approval_returned: false, workflow_instance_id: 31, _read_only_fields: [] };
    show("CX", "/?document=5");
    expect(document.body.textContent).not.toContain("Journal");
    expect(document.body.textContent).not.toContain("Recorded by");
    expect(document.body.textContent).not.toContain("Booking");
  });
});
