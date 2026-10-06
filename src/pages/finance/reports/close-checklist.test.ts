import { describe, expect, it } from "vitest";

import { checklistItemLabel, checklistLabel, checklistSeverity, closeOutcomeMessage, failedBlockers, failedWarnings, forceCanClose } from "./close-checklist";
import type { CloseChecklistItem } from "@/redux/services/finance/setup-types";

const item = (over: Partial<CloseChecklistItem>): CloseChecklistItem => ({
  name: "check", passed: true, blocking: true, detail: "", ...over,
});

describe("close checklist severity", () => {
  it("separates a failed warning from a failed blocker", () => {
    expect(checklistSeverity(item({ passed: true }))).toBe("passed");
    expect(checklistSeverity(item({ passed: false, blocking: true }))).toBe("blocker");
    expect(checklistSeverity(item({ passed: false, blocking: false }))).toBe("warning");
  });

  it("reads work the close does itself as done by the close, never as a blocker", () => {
    const due = item({
      name: "depreciation_posted", passed: true, blocking: true, done_by_close: true,
      detail: "6 depreciation charges are due; closing the period posts them.",
    });
    expect(checklistSeverity(due)).toBe("done-by-close");
    expect(failedBlockers([due])).toEqual([]);
  });

  it("offers a force close past any blocker but the order months close in", () => {
    const order = item({ name: "earlier_periods_closed", passed: false, blocking: true });
    const bank = item({ name: "trial_balance_balanced", passed: false, blocking: true });
    expect(forceCanClose([bank])).toBe(true);
    expect(forceCanClose([order, bank])).toBe(false);
    expect(forceCanClose([item({ passed: true })])).toBe(false);
  });

  it("treats a passed non-blocking row as passed, not as a warning", () => {
    // grir_explained passes when GR/IR nets to zero; it must not be drawn as a
    // warning just because it is the non-blocking one.
    expect(checklistSeverity(item({ name: "grir_explained", passed: true, blocking: false })))
      .toBe("passed");
  });

  it("partitions a real mixed checklist", () => {
    const items = [
      item({ name: "trial_balance", passed: true }),
      item({ name: "ap_reconciled", passed: false, blocking: true, detail: "Sub-ledger ₦12,345.00 against control ₦12,340.00." }),
      item({ name: "grir_explained", passed: false, blocking: false, detail: "GR/IR clearing holds ₦4,800.00 of goods received and not yet invoiced." }),
      item({ name: "no_draft_journals", passed: false, blocking: false, detail: "2 drafts" }),
    ];
    expect(failedBlockers(items).map((i) => i.name)).toEqual(["ap_reconciled"]);
    expect(failedWarnings(items).map((i) => i.name)).toEqual(["grir_explained", "no_draft_journals"]);
  });
});

describe("close outcome message", () => {
  it("says nothing extra when every warning passed", () => {
    expect(closeOutcomeMessage("Aug 2026", [item({ passed: true, blocking: false })]))
      .toBe("Closed Aug 2026.");
  });

  it("carries the one warning's own detail, since that is the number to look at", () => {
    expect(closeOutcomeMessage("Aug 2026", [
      item({ passed: true }),
      item({ name: "grir_explained", passed: false, blocking: false, detail: "GR/IR clearing holds ₦4,800.00 of goods received and not yet invoiced." }),
    ])).toBe("Closed Aug 2026. GR/IR clearing holds ₦4,800.00 of goods received and not yet invoiced.");
  });

  it("counts them once there is more than one", () => {
    expect(closeOutcomeMessage("Aug 2026", [
      item({ name: "grir_explained", passed: false, blocking: false, detail: "a" }),
      item({ name: "no_draft_journals", passed: false, blocking: false, detail: "b" }),
    ])).toBe("Closed Aug 2026 with 2 warnings worth a look.");
  });

  it("ignores blocking rows entirely - a close that failed one never returns", () => {
    expect(closeOutcomeMessage("Aug 2026", [
      item({ name: "ap_reconciled", passed: false, blocking: true, detail: "drift" }),
    ])).toBe("Closed Aug 2026.");
  });

  it("survives a missing checklist and a missing period name", () => {
    expect(closeOutcomeMessage(undefined, undefined)).toBe("Closed the period.");
  });

  it("falls back when a warning carries no detail", () => {
    expect(closeOutcomeMessage("Aug 2026", [item({ passed: false, blocking: false, detail: "" })]))
      .toBe("Closed Aug 2026. One check is worth a look.");
  });
});

describe("check labels", () => {
  it("names the inter-branch check in the reader's words", () => {
    expect(checklistLabel("inter_branch_balanced", (v) => v)).toBe("Branches agree on what they owe each other");
  });

  it("falls back to the generic label for a check it does not know", () => {
    expect(checklistLabel("new_check", (v) => v.toUpperCase())).toBe("NEW_CHECK");
  });
});

describe("the server's label and the close order under All branches", () => {
  it("reads the server's label before this screen's name for a check", () => {
    expect(checklistItemLabel({ name: "ap_reconciled", label: "Payables agree with the ledger" }, (v) => v)).toBe("Payables agree with the ledger");
    expect(checklistItemLabel({ name: "ap_reconciled" }, (v) => v)).toBe("AP reconciled");
  });

  it("keeps Force close when the close order only warns, as it does while a branch can still close", () => {
    const items = [
      { name: "earlier_periods_closed", passed: false, blocking: false, detail: "Lekki has August open; Ikeja can close now." },
      { name: "ap_reconciled", passed: false, blocking: true, detail: "" },
    ];
    expect(forceCanClose(items)).toBe(true);
    expect(forceCanClose(items.map((i) => (i.name === "earlier_periods_closed" ? { ...i, blocking: true } : i)))).toBe(false);
  });
});
