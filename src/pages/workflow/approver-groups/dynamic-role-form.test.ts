import { describe, expect, it } from "vitest";
import type {
  ConditionFieldSpec,
  DynamicRole,
} from "@/redux/services/dashboard/workflow-types";
import {
  type DynamicRoleDraft,
  draftFromDynamicRole,
  draftPayload,
  draftProblem,
  emptyDraft,
  emptyRule,
  rulesPayload,
  slugify,
  valueForOp,
} from "./dynamic-role-form";

const AMOUNT: ConditionFieldSpec = {
  key: "amount", label: "Amount", area: "document", subject: "document", type: "MONEY",
  operators: ["gt", "gte", "lt", "lte", "eq", "ne"], choices: [], document_types: [],
};
const BRANCH: ConditionFieldSpec = {
  key: "requester.branch", label: "Their branch", area: "requester", subject: "requester",
  type: "BRANCH", operators: ["eq", "ne", "in", "not_in"], choices: [], document_types: [],
};
const FIELDS = new Map([AMOUNT, BRANCH].map((field) => [field.key, field]));

/** Bright Star's spend approver: big purchases to the Proprietor, Ikeja's to Mrs Adebayo. */
function spendApprover(): DynamicRoleDraft {
  const draft = emptyDraft();
  draft.name = "Spend approver";
  draft.rules = [
    { ...emptyRule(), conditions: [
      { key: "c1", area: "document", field: "amount", op: "gt", value: 200_000_000 },
    ], target: { kind: "ROLE", roleKey: "proprietor", userId: "", groupCode: "" } },
    { ...emptyRule(), conditions: [
      { key: "c2", area: "requester", field: "requester.branch", op: "eq", value: "7" },
      { key: "c3", area: "document", field: "amount", op: "gt", value: 100_000_000 },
    ], target: { kind: "USER", roleKey: "", userId: "41", groupCode: "" }, label: "Ikeja desk" },
  ];
  draft.otherwise = { kind: "GROUP", roleKey: "", userId: "", groupCode: "bursary" };
  return draft;
}

describe("rulesPayload", () => {
  it("puts the Otherwise row last, with no condition", () => {
    const rules = rulesPayload(spendApprover());
    expect(rules).toHaveLength(3);
    expect(rules[2]).toEqual({ condition: null, target_kind: "GROUP", group_code: "bursary" });
  });

  it("sends one comparison on its own, and several joined by all", () => {
    const [first, second] = rulesPayload(spendApprover());
    expect(first.condition).toEqual({ op: "gt", field: "amount", value: 200_000_000 });
    expect(second.condition).toEqual({ all: [
      { op: "eq", field: "requester.branch", value: "7" },
      { op: "gt", field: "amount", value: 100_000_000 },
    ] });
  });

  it("sends only the target that matches its kind", () => {
    const [first, second] = rulesPayload(spendApprover());
    expect(first).toMatchObject({ target_kind: "ROLE", role_key: "proprietor" });
    expect(first).not.toHaveProperty("user");
    expect(second).toMatchObject({ target_kind: "USER", user: "41", label: "Ikeja desk" });
    expect(second).not.toHaveProperty("role_key");
  });
});

describe("draftPayload", () => {
  it("names no document type - the stage that picks it decides", () => {
    expect(draftPayload(spendApprover(), { creating: true })).not.toHaveProperty(
      "document_types",
    );
  });

  it("slugs a code from the name when creating", () => {
    expect(draftPayload(spendApprover(), { creating: true }).code).toBe("spend-approver");
  });

  it("never sends the code on an edit, since it cannot change", () => {
    expect(draftPayload(spendApprover(), { creating: false })).not.toHaveProperty("code");
  });
});

describe("draftFromDynamicRole", () => {
  const stored: DynamicRole = {
    id: "dr1", code: "spend", name: "Spend approver", description: "", is_active: true,
    document_types: ["procurement.purchase_requisition"], used_by: [],
    created_at: "", updated_at: "",
    rules: [
      { id: "r2", order: 1, condition: null, target_kind: "ROLE", role_key: "bursar",
        role_name: "Bursar", user: null, user_name: null, group: null, group_code: null,
        group_name: null, label: "", is_fallback: true },
      { id: "r1", order: 0, condition: { all: [
        { op: "in", field: "requester.branch", value: ["7", "9"] },
        { op: "gte", field: "amount", value: 50_000_000 },
      ] }, target_kind: "USER", role_key: "", role_name: null, user: 41,
        user_name: "Mrs Adebayo", group: null, group_code: null, group_name: null,
        label: "", is_fallback: false },
    ],
  };

  it("keeps the Otherwise row apart from the ordered rules", () => {
    const draft = draftFromDynamicRole(stored);
    expect(draft.rules).toHaveLength(1);
    expect(draft.otherwise).toMatchObject({ kind: "ROLE", roleKey: "bursar" });
  });

  it("reads each condition's area from the catalogue, and from the key without it", () => {
    const fields = new Map([[BRANCH.key, BRANCH]]);
    const [known] = draftFromDynamicRole(stored, fields).rules;
    expect(known.conditions.map((c) => c.area)).toEqual(["requester", "document"]);
    const [guessed] = draftFromDynamicRole(stored).rules;
    expect(guessed.conditions.map((c) => c.area)).toEqual(["requester", "document"]);
  });

  it("reads ids as strings and lists as lists", () => {
    const [rule] = draftFromDynamicRole(stored).rules;
    expect(rule.target.userId).toBe("41");
    expect(rule.conditions.map((c) => c.value)).toEqual([["7", "9"], 50_000_000]);
  });

  it("round-trips to the rules the server stored", () => {
    expect(rulesPayload(draftFromDynamicRole(stored))).toEqual([
      { condition: { all: [
        { op: "in", field: "requester.branch", value: ["7", "9"] },
        { op: "gte", field: "amount", value: 50_000_000 },
      ] }, target_kind: "USER", user: "41", label: "" },
      { condition: null, target_kind: "ROLE", role_key: "bursar" },
    ]);
  });
});

describe("draftProblem", () => {
  it("is null for a complete draft", () => {
    expect(draftProblem(spendApprover(), FIELDS)).toBeNull();
  });

  it("asks for a name first", () => {
    const draft = spendApprover();
    draft.name = "  ";
    expect(draftProblem(draft, FIELDS)).toBe("Give the Dynamic Role a name.");
  });

  it("names the rule and the value that is missing", () => {
    const draft = spendApprover();
    draft.rules[1].conditions[1].value = null;
    expect(draftProblem(draft, FIELDS)).toBe("Rule 2: give a value for Amount.");
  });

  it("flags a condition on a field the chosen document types no longer offer", () => {
    const draft = spendApprover();
    draft.rules[0].conditions[0].field = "document.method";
    expect(draftProblem(draft, FIELDS)).toBe("Rule 1: choose what the condition tests.");
  });

  it("asks for the Otherwise target", () => {
    const draft = spendApprover();
    draft.otherwise = { kind: "GROUP", roleKey: "", userId: "", groupCode: "" };
    expect(draftProblem(draft, FIELDS)).toBe("Otherwise: choose the approver group.");
  });
});

describe("helpers", () => {
  it("slugs a name into a code", () => {
    expect(slugify("  Spend approver (Ikeja)  ")).toBe("spend-approver-ikeja");
  });

  it("reshapes a value for a list operator and back", () => {
    expect(valueForOp("in", "7")).toEqual(["7"]);
    expect(valueForOp("eq", ["7", "9"])).toBe("7");
    expect(valueForOp("in", null)).toEqual([]);
  });
});
