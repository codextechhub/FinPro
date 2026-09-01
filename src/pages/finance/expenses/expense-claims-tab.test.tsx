import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { openAttachment } = vi.hoisted(() => ({ openAttachment: vi.fn() }));

vi.mock("@/utils/attachment-download", () => ({ openAttachment }));
vi.mock("@/redux/services/finance/ops-api", () => ({
  useUploadExpenseReceiptMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteExpenseReceiptMutation: () => [vi.fn(), { isLoading: false }],
}));

import { ReceiptCell } from "./expense-claims-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("expense claim receipt", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    openAttachment.mockReset();
    openAttachment.mockResolvedValue("receipt.pdf");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens protected receipt media through the authenticated attachment helper", async () => {
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

    expect(openAttachment).toHaveBeenCalledWith(
      "https://api.example.test/media/expense-receipts/taxi-token.pdf",
      "taxi-receipt.pdf",
    );
  });
});
