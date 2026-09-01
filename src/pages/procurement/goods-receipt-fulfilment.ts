import type { GoodsReceipt } from "@/redux/services/procurement/procurement-types";

type ReceiptEnvelope = { data: GoodsReceipt };

export function purchaseOrderRemainingQuantity(receipt: GoodsReceipt): number {
  const quantity = Number(receipt.purchase_order_remaining_item_count ?? 0);
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
}

export function canReceiveRemaining(receipt: GoodsReceipt): boolean {
  return receipt.status === "POSTED"
    && receipt.purchase_order_id != null
    && purchaseOrderRemainingQuantity(receipt) > 0;
}

/** Save a draft, optionally post it, and return the authoritative final receipt. */
export async function completeReceiptSave(
  saveDraft: () => Promise<ReceiptEnvelope>,
  postDraft?: (id: number) => Promise<ReceiptEnvelope>,
): Promise<GoodsReceipt> {
  const saved = (await saveDraft()).data;
  if (!postDraft) return saved;
  return (await postDraft(saved.id)).data;
}
