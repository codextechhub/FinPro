/**
 * The bursar sends back Mrs Bello's October salaries batch to correct an
 * account number. Its row reads "Sent back", not "Draft"; a batch still with
 * its approver, or never sent, keeps "Draft".
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PayoutBatchSummary } from "@/redux/services/payments/payments-types";

import { BatchStatusPill } from "./batches-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const batch = (over: Partial<PayoutBatchSummary>): PayoutBatchSummary => ({
  id: 3, entity_code: "BSS", provider: "PAYSTACK", reference: "PB-0003", title: "October salaries", status: "DRAFT",
  total_amount: 0, total_amount_naira: "0.00", item_count: 0, submitted_at: null, created_at: "2026-10-01T09:00:00Z", ...over,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("BatchStatusPill", () => {
  it("reads Sent back on a batch an approver sent back", () => {
    act(() => root.render(<BatchStatusPill batch={batch({ approval_state: "PENDING", approval_returned: true })} />));
    expect(container.textContent).toBe("Sent back");
  });

  it("keeps Draft on one never sent", () => {
    act(() => root.render(<BatchStatusPill batch={batch({ approval_state: "NOT_SUBMITTED", approval_returned: false })} />));
    expect(container.textContent).toBe("Draft");
  });
});
