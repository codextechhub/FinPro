import { describe, expect, it, vi } from "vitest";
import type { GoodsReceipt } from "@/redux/services/procurement/procurement-types";
import {
  canReceiveRemaining,
  completeReceiptSave,
  purchaseOrderRemainingQuantity,
} from "./goods-receipt-fulfilment";

function receipt(overrides: Partial<GoodsReceipt> = {}): GoodsReceipt {
  return {
    id: 1,
    document_number: "GRN-1",
    status: "POSTED",
    receipt_status: "PARTIAL",
    vendor_id: 1,
    vendor_code: "V-1",
    vendor_name: "Vendor",
    received_by_name: "Buyer",
    purchase_order_id: 10,
    purchase_order_number: "PO-10",
    received_date: "2026-08-08",
    reference: "",
    narration: "",
    total_value: 400,
    total_value_naira: "4.00",
    journal_id: 2,
    received_item_count: "4.0000",
    ordered_item_count: "12.0000",
    purchase_order_fulfilment_status: "PARTIAL",
    purchase_order_received_item_count: "4.0000",
    purchase_order_ordered_item_count: "12.0000",
    purchase_order_remaining_item_count: "8.0000",
    lines: [],
    ...overrides,
  };
}

describe("goods receipt fulfilment behavior", () => {
  it("gates Receive Remaining on current PO outstanding quantity, not historical GRN status", () => {
    expect(canReceiveRemaining(receipt())).toBe(true);
    expect(canReceiveRemaining(receipt({
      receipt_status: "PARTIAL",
      purchase_order_fulfilment_status: "RECEIVED",
      purchase_order_remaining_item_count: "0.0000",
    }))).toBe(false);
    expect(canReceiveRemaining(receipt({
      receipt_status: "FULL",
      purchase_order_remaining_item_count: "3.0000",
    }))).toBe(true);
  });

  it("normalizes invalid or negative remaining quantities to zero", () => {
    expect(purchaseOrderRemainingQuantity(receipt({ purchase_order_remaining_item_count: "invalid" }))).toBe(0);
    expect(purchaseOrderRemainingQuantity(receipt({ purchase_order_remaining_item_count: "-2" }))).toBe(0);
  });

  it("returns the newly created posted receipt so the drawer can select it", async () => {
    const draft = receipt({ id: 22, status: "DRAFT" });
    const posted = receipt({
      id: 22,
      receipt_status: "FULL",
      purchase_order_fulfilment_status: "RECEIVED",
      purchase_order_remaining_item_count: "0.0000",
    });
    const saveDraft = vi.fn().mockResolvedValue({ data: draft });
    const postDraft = vi.fn().mockResolvedValue({ data: posted });

    await expect(completeReceiptSave(saveDraft, postDraft)).resolves.toBe(posted);
    expect(postDraft).toHaveBeenCalledWith(22);
  });
});
