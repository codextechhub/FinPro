import { describe, expect, it } from "vitest";

import {
  gateExplanation,
  gateRuleFromTemplate,
  gatedBatchRows,
  isBatchGateRefusal,
  predictsApproval,
  primaryAction,
  resolveGateRule,
  NO_GATE,
} from "./adjustment-approval";
import type { WorkflowTemplate } from "@/redux/services/dashboard/workflow-types";

const THRESHOLD = 5_000_000; // ₦50,000 in kobo, the seeded default.
const money = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;

// Only the fields the helper reads; a real WorkflowStage carries 15 more that
// have no bearing on the gate.
const template = (over: Record<string, unknown>) => ({
  document_type: "finance.concession",
  is_active: true,
  is_platform: false,
  ...over,
}) as unknown as WorkflowTemplate;

describe("gateRuleFromTemplate", () => {
  it("reads the seeded concession ladder as a threshold rule", () => {
    // Both stages carry the threshold after the backend's fix; the document is
    // gated from the lowest one.
    expect(gateRuleFromTemplate({
      stages: [
        { inclusion_condition: { op: "gte", field: "amount", value: THRESHOLD } },
        { inclusion_condition: { op: "gte", field: "amount", value: THRESHOLD } },
      ],
    })).toEqual({ mode: "threshold", threshold: THRESHOLD });
  });

  it("reads the refund ladder - one unconditional stage - as always gated", () => {
    expect(gateRuleFromTemplate({ stages: [{ inclusion_condition: null }] }))
      .toEqual({ mode: "always", threshold: null });
  });

  it("takes the lowest threshold when stages differ", () => {
    expect(gateRuleFromTemplate({
      stages: [
        { inclusion_condition: { op: "gte", field: "amount", value: 50_000_000 } },
        { inclusion_condition: { op: "gte", field: "amount", value: THRESHOLD } },
      ],
    })).toEqual({ mode: "threshold", threshold: THRESHOLD });
  });

  it("treats one unconditional stage among conditional ones as always gated", () => {
    expect(gateRuleFromTemplate({
      stages: [
        { inclusion_condition: { op: "gte", field: "amount", value: THRESHOLD } },
        { inclusion_condition: null },
      ],
    })).toEqual({ mode: "always", threshold: null });
  });

  it("ignores retired stages, which are history rather than configuration", () => {
    expect(gateRuleFromTemplate({
      stages: [
        { inclusion_condition: null, retired_at: "2026-01-01T00:00:00Z" },
        { inclusion_condition: { op: "gte", field: "amount", value: THRESHOLD } },
      ],
    })).toEqual({ mode: "threshold", threshold: THRESHOLD });
  });

  it("errs towards always-gated on a condition shape it does not understand", () => {
    // Safer to over-label than to promise a direct post the server will refuse.
    expect(gateRuleFromTemplate({ stages: [{ inclusion_condition: { op: "in", value: ["A"] } }] }))
      .toEqual({ mode: "always", threshold: null });
  });

  it("has no gate when there is no template or no live stage", () => {
    expect(gateRuleFromTemplate(null)).toEqual(NO_GATE);
    expect(gateRuleFromTemplate({ stages: [] })).toEqual(NO_GATE);
  });
});

describe("resolveGateRule", () => {
  const own = template({
    document_type: "finance.concession", is_platform: false,
    stages: [{ inclusion_condition: { op: "gte", field: "amount", value: 1_000_000 } }],
  });
  const shared = template({
    document_type: "finance.concession", is_platform: true,
    stages: [{ inclusion_condition: { op: "gte", field: "amount", value: THRESHOLD } }],
  });

  it("prefers the tenant's own template over the shared one", () => {
    expect(resolveGateRule([shared, own], "finance.concession").threshold).toBe(1_000_000);
  });

  it("falls back to the shared template when the tenant has none", () => {
    expect(resolveGateRule([shared], "finance.concession").threshold).toBe(THRESHOLD);
  });

  it("ignores other document types and inactive templates", () => {
    const other = template({ document_type: "finance.refund", stages: [{ inclusion_condition: null }] });
    expect(resolveGateRule([other], "finance.concession")).toEqual(NO_GATE);
    expect(resolveGateRule([{ ...own, is_active: false } as unknown as WorkflowTemplate], "finance.concession"))
      .toEqual(NO_GATE);
  });

  it("has no gate when nothing is published", () => {
    expect(resolveGateRule([], "finance.concession")).toEqual(NO_GATE);
    expect(resolveGateRule(undefined, "finance.concession")).toEqual(NO_GATE);
  });
});

describe("predictsApproval and primaryAction", () => {
  const rule = { mode: "threshold" as const, threshold: THRESHOLD };

  it("gates at the threshold itself, not above it", () => {
    expect(predictsApproval(rule, THRESHOLD - 1)).toBe(false);
    expect(predictsApproval(rule, THRESHOLD)).toBe(true);
  });

  it("is the brief's example: ₦2,000 posts and ₦400,000 submits", () => {
    expect(primaryAction(undefined, rule, 200_000)).toBe("post");
    expect(primaryAction(undefined, rule, 40_000_000)).toBe("submit");
  });

  it("always prefers the server's answer over the prediction", () => {
    // The server is the same computation the post endpoint runs, so when the two
    // disagree the screen must follow the server or it offers a button that 400s.
    expect(primaryAction(true, rule, 200_000)).toBe("submit");
    expect(primaryAction(false, rule, 40_000_000)).toBe("post");
  });

  it("never gates when no ladder is published", () => {
    expect(primaryAction(undefined, NO_GATE, 999_999_999)).toBe("post");
  });
});

describe("gateExplanation", () => {
  const rule = { mode: "threshold" as const, threshold: THRESHOLD };

  it("says nothing for a document type with no ladder", () => {
    expect(gateExplanation(NO_GATE, 40_000_000, money)).toBeNull();
  });

  it("states the flat rule for an always-gated document", () => {
    expect(gateExplanation({ mode: "always", threshold: null }, 1, money))
      .toMatch(/always needs a second person/i);
  });

  it("warns once the amount has crossed", () => {
    expect(gateExplanation(rule, 40_000_000, money)).toMatch(/needs approval/i);
  });

  it("reassures while the amount is still under", () => {
    expect(gateExplanation(rule, 200_000, money)).toMatch(/posts straight to the ledger/i);
  });

  it("states the rule up front on an empty form", () => {
    expect(gateExplanation(rule, 0, money)).toMatch(/or more need approval/i);
  });
});

describe("batch refusals", () => {
  it("recognises the refund and write-off batch refusals", () => {
    expect(isBatchGateRefusal({ data: { action: "One or more refunds are approval-gated; submit this batch for approval instead of posting it." } })).toBe(true);
    expect(isBatchGateRefusal({ data: { action: ["One or more write-offs are approval-gated; submit this batch instead."] } })).toBe(true);
  });

  it("does not claim unrelated failures", () => {
    expect(isBatchGateRefusal({ data: { action: "The period is closed." } })).toBe(false);
    expect(isBatchGateRefusal({ data: {} })).toBe(false);
    expect(isBatchGateRefusal(null)).toBe(false);
    expect(isBatchGateRefusal("boom")).toBe(false);
  });

  it("names the rows that caused it, 1-based as the user sees them", () => {
    const rule = { mode: "threshold" as const, threshold: THRESHOLD };
    expect(gatedBatchRows(rule, [100_000, 40_000_000, 200_000, 9_000_000]))
      .toEqual([{ index: 2, amount: 40_000_000 }, { index: 4, amount: 9_000_000 }]);
  });

  it("names every row when the document type is always gated", () => {
    expect(gatedBatchRows({ mode: "always", threshold: null }, [1, 2])).toHaveLength(2);
  });
});
