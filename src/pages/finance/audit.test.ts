import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FinanceAuditLog } from "@/redux/services/finance/setup-types";
import { AuditDetail, auditActorLabel, auditBranchLabel, auditEntityLabel } from "./audit";

/**
 * Holy Cross's trail, read by the proprietor. A journal posted at the Annex
 * names the Annex. A fee-settings change and a vendor quotation that no
 * administrator has placed yet name no branch, and both read "No branch": the
 * quotation is not the whole school's, it simply has not been given a branch.
 */
describe("the audit trail's Branch column", () => {
  it("names the branch of the document the entry is about", () => {
    expect(auditBranchLabel({ branch_name: "Holy Cross College Annex" })).toBe("Holy Cross College Annex");
  });

  it("says an entry names no branch, never that it is the whole school's", () => {
    expect(auditBranchLabel({ branch_name: null })).toBe("No branch");
  });
});

/**
 * Mrs Bello posts a receipt while acting as Mrs Adeyemi. The trail names both,
 * in the server's words; an ordinary entry names the actor; an automatic one
 * says System.
 */
describe("the audit trail's Actor column", () => {
  const base = { actor: "bello@brightstar.example.com", real_actor_name: null, proxied_user_name: null, acted_label: "Mrs Bello" };

  it("names both people for an act done through a proxy", () => {
    expect(auditActorLabel({ ...base, real_actor_name: "Mrs Bello", proxied_user_name: "Mrs Adeyemi", acted_label: "Mrs Bello for Mrs Adeyemi" }))
      .toBe("Mrs Bello for Mrs Adeyemi");
  });

  it("names the actor for an ordinary act, and System for an automatic one", () => {
    expect(auditActorLabel(base)).toBe("bello@brightstar.example.com");
    expect(auditActorLabel({ ...base, actor: null, acted_label: null })).toBe("System");
  });
});

/** The Entity column names the kind of record in words, never the model name. */
describe("the audit trail's Entity column", () => {
  it("reads a model name as words", () => {
    expect(auditEntityLabel("JournalEntry")).toBe("Journal entry");
    expect(auditEntityLabel("DunningPolicy")).toBe("Dunning policy");
    expect(auditEntityLabel("FixedAsset")).toBe("Fixed asset");
  });

  it("shows a dash when the entry names no record", () => {
    expect(auditEntityLabel(null)).toBe("-");
  });
});

/**
 * Mrs Bello cancels Bright Star's order for diesel and says why. The entry's
 * sentence names the order and no figure; her reason sits beside it; the float
 * and the amount reach the drawer as the values her role may read. An auditor
 * who may not read amounts is sent the same entry with no amount keys, and the
 * drawer shows no row and no blank for them.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const log = (over: Partial<FinanceAuditLog> = {}): FinanceAuditLog => ({
  id: 9, action: "FLOAT_CHANGED", action_display: "Petty cash float changed", status: "SUCCESS",
  actor: "bello@brightstar.example.com", target_type: "PettyCashFund", target_id: 3, document_number: "PCF-0003",
  branch_id: 1, branch_name: "Ikeja Branch",
  message: "Petty cash float changed: PCF-0003", reason: "",
  before: { float_amount: 5_000_000 }, after: { float_amount: 7_500_000 },
  created_at: "2026-10-09T08:15:00Z",
  ...over,
});

const render = (entry: FinanceAuditLog) => act(() => root.render(createElement(AuditDetail, { log: entry, currency: "NGN" })));
const text = () => container.textContent ?? "";

describe("the audit entry drawer", () => {
  it("reads the sentence, the reason and the change list as money in words", () => {
    render(log({ reason: "The tin was topped up after the diesel delivery" }));
    expect(text()).toContain("Petty cash float changed: PCF-0003");
    expect(text()).toContain("The tin was topped up after the diesel delivery");
    expect(text()).toContain("What changed");
    expect(text()).toContain("Float amount");
    expect(text()).toContain("₦50,000.00");
    expect(text()).toContain("₦75,000.00");
    expect(text()).not.toContain("float_amount");
    expect(text()).not.toMatch(/undefined|NaN|\[object/);
  });

  it("leaves the reason out when the entry has none", () => {
    render(log({ reason: "" }));
    expect(text()).not.toContain("Reason");
    render(log({ reason: undefined }));
    expect(text()).not.toContain("Reason");
  });

  it("shows no row for a value the reader's snapshot does not carry", () => {
    render(log({ before: {}, after: {} }));
    expect(text()).toContain("No values were recorded for this action, or none are open to your role.");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(text()).not.toContain("Float amount");
  });

  it("keeps every row's cells under the three headings", () => {
    render(log({ before: { float_amount: 1_000, status: "DRAFT" }, after: { float_amount: 2_000, status: "POSTED" } }));
    const heads = container.querySelectorAll("thead th").length;
    expect(heads).toBe(3);
    expect([...container.querySelectorAll("tbody tr")].every((tr) => tr.querySelectorAll("td").length === heads)).toBe(true);
  });
});
