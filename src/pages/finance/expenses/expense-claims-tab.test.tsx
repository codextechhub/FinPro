import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAttachmentBlob } = vi.hoisted(() => ({ fetchAttachmentBlob: vi.fn() }));

/** The approval request a returned document names, and who is signed in. */
const returned = vi.hoisted(() => ({ uid: 4, request: undefined as unknown, resume: vi.fn() }));
vi.mock("@/redux/services/finance/approval-request-api", () => ({
  useGetDocumentApprovalRequestQuery: () => ({ data: undefined }),
  approvalRequestApi: { util: { invalidateTags: () => ({ type: "test/invalidate" }) } },
}));
vi.mock("@/redux/services/dashboard/workflow-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useGetWorkflowInstanceQuery: () => ({ data: returned.request }),
  useResubmitWorkflowInstanceMutation: () => [(id: string) => { returned.resume(id); return { unwrap: async () => ({}) }; }, { isLoading: false }],
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {}, user: { id: returned.uid } } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/utils/attachment-download", () => ({ fetchAttachmentBlob }));
vi.mock("../../../components/finance-ui/file-preview-dialog", () => ({
  FilePreviewDialog: ({ files, index }: { files: Array<{ name: string; loadPreview: (signal: AbortSignal) => Promise<Blob> }>; index: number | null }) =>
    index == null ? null : <div role="dialog">{files[index].name}</div>,
}));
vi.mock("@/redux/services/finance/ops-api", () => ({
  useUploadExpenseReceiptMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteExpenseReceiptMutation: () => [vi.fn(), { isLoading: false }],
}));

import type { ExpenseClaim } from "@/redux/services/finance/ops-types";
import { CLAIM_STATUS_OPTIONS, ReceiptCell, claimDisplay, claimListArgs } from "./expense-claims-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("expense claim receipt", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fetchAttachmentBlob.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens a protected receipt in the file viewer", async () => {
    await act(async () => {
      root.render(
        <ReceiptCell
          claimId={42}
          entity="LAG"
          attachable={false}
          line={{
            id: 7,
            line_no: 1,
            description: "Taxi",
            expense_account: "5300",
            quantity: "1",
            unit_price: 12_000,
            tax_code: null,
            net_amount: 12_000,
            tax_amount: 0,
            line_total: 12_000,
            cost_center: null,
            receipt_name: "taxi-receipt.pdf",
            receipt_url: "https://api.example.test/media/expense-receipts/taxi-token.pdf",
          }}
        />,
      );
    });

    expect(container.querySelector("a")).toBeNull();
    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toContain("taxi-receipt.pdf");
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')?.textContent).toBe("taxi-receipt.pdf");
  });
});

/**
 * Mrs Okafor's taxi claim at Bright Star is posted and half reimbursed. Its
 * pill reads Part-paid, and the filter offers Part-paid, which lists it and
 * exports it; Approved lists only the claims posted with nothing reimbursed.
 */
describe("the claims filter", () => {
  const claim = (over: Partial<ExpenseClaim>) => ({ status: "POSTED", payment_status: "UNPAID", approval_state: "APPROVED", ...over }) as ExpenseClaim;
  const worn: Record<string, ExpenseClaim> = {
    DRAFT: claim({ status: "DRAFT", approval_state: "NOT_SUBMITTED" }),
    PENDING: claim({ status: "PENDING_APPROVAL", approval_state: "PENDING" }),
    APPROVED: claim({}),
    PART_PAID: claim({ payment_status: "PARTIAL" }),
    PAID: claim({ payment_status: "PAID" }),
    REJECTED: claim({ status: "CANCELLED" }),
  };

  it("offers each word a claim's pill wears, Part-paid included, and Sent back", () => {
    const words = CLAIM_STATUS_OPTIONS.filter((o) => o.value !== "SENT_BACK");
    expect(words.map((o) => o.value)).toEqual(Object.keys(worn));
    for (const option of words) {
      expect(claimDisplay(worn[option.value])).toMatchObject({ key: option.value, label: option.label });
    }
    expect(CLAIM_STATUS_OPTIONS.find((o) => o.value === "PART_PAID")?.label).toBe("Part-paid");
    expect(CLAIM_STATUS_OPTIONS.at(-1)).toEqual({ value: "SENT_BACK", label: "Sent back" });
  });

  it("asks the list, and its export, for the word as display_status and for Sent back as approval=returned", () => {
    expect(claimListArgs("PART_PAID", "")).toEqual({ display_status: "PART_PAID" });
    expect(claimListArgs("SENT_BACK", "taxi")).toEqual({ q: "taxi", approval: "returned" });
    expect(claimListArgs("", "")).toEqual({});
  });
});
