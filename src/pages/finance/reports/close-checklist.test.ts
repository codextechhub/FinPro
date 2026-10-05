import { describe, expect, it } from "vitest";

import {
  checklistDetail, checklistLabel, checklistSeverity, closeOutcomeMessage, failedBlockers, failedWarnings,
} from "./close-checklist";
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

  it("treats a passed non-blocking row as passed, not as a warning", () => {
    // grir_explained passes when GR/IR nets to zero; it must not be drawn as a
    // warning just because it is the non-blocking one.
    expect(checklistSeverity(item({ name: "grir_explained", passed: true, blocking: false })))
      .toBe("passed");
  });

  it("partitions a real mixed checklist", () => {
    const items = [
      item({ name: "trial_balance", passed: true }),
      item({ name: "ap_reconciled", passed: false, blocking: true, detail: "sub-ledger 1234500 vs control 1234000 kobo" }),
      item({ name: "grir_explained", passed: false, blocking: false, detail: "GR/IR clearing balance 480000 kobo" }),
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
      item({ name: "grir_explained", passed: false, blocking: false, detail: "GR/IR clearing balance 480000 kobo" }),
    ])).toBe("Closed Aug 2026. GR/IR clearing balance 480000 kobo");
  });

  it("words that detail as the checklist does when given the same wording", () => {
    const warning = item({ name: "grir_explained", passed: false, blocking: false, detail: "GR/IR clearing balance 480000 kobo" });
    const words = { branchName: () => undefined, money: (kobo: number) => `N${(kobo / 100).toFixed(2)}` };
    expect(closeOutcomeMessage("Aug 2026", [warning], (row) => checklistDetail(row, words)))
      .toBe("Closed Aug 2026. GR/IR clearing balance N4800.00");
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

/**
 * Bright Star closes September with Ikeja (branch 3) and Lekki (branch 5) still
 * disagreeing about a transfer Lekki never confirmed. The check names them by id
 * and counts in kobo; the reader sees the branches and naira.
 */
describe("the inter-branch close check", () => {
  const names: Record<number, string> = { 3: "Ikeja", 5: "Lekki" };
  const words = {
    branchName: (id: number) => names[id],
    money: (kobo: number) => `N${(kobo / 100).toFixed(2)}`,
  };

  it("has a label of its own", () => {
    expect(checklistLabel("inter_branch_balanced", (v) => v)).toBe("Branches agree on what they owe each other");
  });

  it("names the branches and the amounts in naira", () => {
    const row = item({
      name: "inter_branch_balanced", passed: false, blocking: true,
      detail: "branches 3 and 5 disagree: 100000000 kobo on one side and 95000000 kobo on the other; the inter-branch account nets to 5000000 kobo, not zero",
    });
    expect(checklistDetail(row, words)).toBe(
      "Ikeja and Lekki disagree: N1000000.00 on one side and N950000.00 on the other; the inter-branch account nets to N50000.00, not zero",
    );
  });

  it("keeps the ids when a branch is not in the list", () => {
    const row = item({ name: "inter_branch_balanced", passed: false, detail: "branches 3 and 9 disagree: 100 kobo on one side and 0 kobo on the other" });
    expect(checklistDetail(row, words)).toBe("branches 3 and 9 disagree: N1.00 on one side and N0.00 on the other");
  });

  it("words both figures of a sub-ledger check in naira", () => {
    const row = item({ name: "ap_reconciled", passed: false, detail: "sub-ledger 1234500 vs control 1234000 kobo" });
    expect(checklistDetail(row, words)).toBe("sub-ledger N12345.00 vs control N12340.00");
  });

  it("words every other row's kobo in naira and keeps the rest as sent", () => {
    expect(checklistDetail(item({ name: "trial_balance_balanced", detail: "difference 0 kobo" }), words)).toBe("difference N0.00");
    expect(checklistDetail(item({ name: "grir_explained", detail: "GR/IR clearing balance 492900000 kobo (received not invoiced)" }), words))
      .toBe("GR/IR clearing balance N4929000.00 (received not invoiced)");
    expect(checklistDetail(item({ name: "no_draft_journals", detail: "0 draft journal(s) dated in period" }), words))
      .toBe("0 draft journal(s) dated in period");
  });
});
