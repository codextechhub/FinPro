import { describe, expect, it } from "vitest";
import type {
  WorkflowStage,
  WorkflowTemplate,
} from "@/redux/services/dashboard/workflow-types";
import {
  isCentralTemplate,
  stageToPayload,
  templateToPublishPayload,
} from "./template-payload";

const stage = (over: Partial<WorkflowStage>): WorkflowStage => ({
  id: "s1",
  code: "stage",
  label: "Stage",
  kind: "APPROVAL",
  order: 1,
  approver_source: "ROLE",
  approver_scope: "SCHOOL",
  approver_role_key: "bursar",
  organogram_target: "",
  organogram_levels: 1,
  organogram_position_code: null,
  advance_rule: "ANY",
  quorum_count: 0,
  on_rejection: "TERMINAL",
  skip_if_no_approvers: true,
  inclusion_condition: null,
  ...over,
});

const template = (stages: WorkflowStage[]): WorkflowTemplate => ({
  id: "t1",
  tenant: "tenant-1",
  branch: null,
  document_type: "probe.request",
  code: "probe",
  name: "Probe",
  description: "desc",
  notification_events: { "workflow.rejected": true },
  is_active: true,
  is_platform: false,
  tenant_has_own: null,
  platform_updated_at: null,
  platform_changed_since: false,
  created_at: "",
  updated_at: "",
  stages,
  routes: [
    { id: "r1", from_stage_code: null, to_stage_code: "one", order: 1, condition: null },
    {
      id: "r2",
      from_stage_code: "one",
      to_stage_code: null,
      order: 2,
      condition: { op: "gte", field: "amount", value: 10 },
    },
  ],
});

describe("stageToPayload", () => {
  it("sends only the fields belonging to the stage's own source", () => {
    // The publish validator checks every key it is given against its enum, so
    // an empty organogram_target on a role stage is rejected, not ignored.
    const role = stageToPayload(stage({ approver_role_key: "bursar" }), 1);
    expect(role.approver_role_key).toBe("bursar");
    expect(role).not.toHaveProperty("organogram_target");
    expect(role).not.toHaveProperty("approver_group_code");
    expect(role).not.toHaveProperty("dynamic_role_rules");

    const group = stageToPayload(
      stage({ approver_source: "WORKFLOW_GROUP", approver_group_code: "po-approvers" }),
      1,
    );
    expect(group.approver_group_code).toBe("po-approvers");
    expect(group).not.toHaveProperty("approver_role_key");

    const org = stageToPayload(
      stage({
        approver_source: "ORGANOGRAM",
        organogram_target: "N_LEVELS_UP",
        organogram_levels: 2,
      }),
      1,
    );
    expect(org.organogram_target).toBe("N_LEVELS_UP");
    expect(org.organogram_levels).toBe(2);
    // Only SPECIFIC_POSITION carries a position code.
    expect(org).not.toHaveProperty("organogram_position_code");
  });

  it("carries no approver config at all for a routing-only stage", () => {
    const branch = stageToPayload(stage({ kind: "BRANCH" }), 1);
    expect(branch).not.toHaveProperty("approver_source");
    expect(branch).not.toHaveProperty("approver_role_key");
  });

  it("renumbers dynamic rules into evaluation order", () => {
    const payload = stageToPayload(
      stage({
        approver_source: "DYNAMIC_ROLE",
        dynamic_role_rules: [
          { id: "b", order: 5, condition: null, role_key: "head", role_name: "Head", label: "", is_fallback: true },
          {
            id: "a",
            order: 2,
            condition: { op: "lt", field: "amount", value: 100 },
            role_key: "officer",
            role_name: "Officer",
            label: "small",
            is_fallback: false,
          },
        ],
      }),
      1,
    );
    expect(payload.dynamic_role_rules).toEqual([
      { order: 0, condition: { op: "lt", field: "amount", value: 100 }, role_key: "officer", label: "small" },
      { order: 1, condition: null, role_key: "head", label: "" },
    ]);
  });
});

describe("templateToPublishPayload", () => {
  it("round-trips every stage and route untouched", () => {
    const t = template([
      stage({ id: "s1", code: "one", label: "One", order: 1, quorum_count: 3, advance_rule: "QUORUM" }),
      stage({
        id: "s2",
        code: "two",
        label: "Two",
        order: 2,
        approver_source: "WORKFLOW_GROUP",
        approver_group_code: "board",
        inclusion_condition: { op: "gte", field: "amount", value: 500 },
      }),
    ]);
    const payload = templateToPublishPayload(t);

    expect(payload.document_type).toBe("probe.request");
    expect(payload.notification_events).toEqual({ "workflow.rejected": true });
    expect(payload.stages).toHaveLength(2);
    // Quorum and inclusion conditions are exactly the sort of thing a hand-rolled
    // mapper drops; assert them explicitly.
    expect(payload.stages[0].advance_rule).toBe("QUORUM");
    expect(payload.stages[0].quorum_count).toBe(3);
    expect(payload.stages[1].inclusion_condition).toEqual({
      op: "gte",
      field: "amount",
      value: 500,
    });
    expect(payload.routes).toEqual([
      { from_stage_code: null, to_stage_code: "one", order: 1, condition: null },
      {
        from_stage_code: "one",
        to_stage_code: null,
        order: 2,
        condition: { op: "gte", field: "amount", value: 10 },
      },
    ]);
  });

  it("replaces rules on the named stage only, and leaves its siblings alone", () => {
    const t = template([
      stage({ id: "s1", code: "one", label: "One", order: 1, approver_role_key: "bursar" }),
      stage({
        id: "s2",
        code: "spend",
        label: "Spend",
        order: 2,
        approver_source: "DYNAMIC_ROLE",
        dynamic_role_rules: [
          { id: "a", order: 0, condition: null, role_key: "old", role_name: "Old", label: "", is_fallback: true },
        ],
      }),
    ]);
    const payload = templateToPublishPayload(t, {
      stageCode: "spend",
      rules: [
        { order: 9, condition: { op: "lt", field: "amount", value: 1 }, role_key: "new", label: "" },
        { order: 4, condition: null, role_key: "head", label: "" },
      ],
    });

    expect(payload.stages[0].approver_role_key).toBe("bursar");
    expect(payload.stages[0]).not.toHaveProperty("dynamic_role_rules");
    // Renumbered densely, in the order given - the array order is the contract,
    // not whatever `order` the caller happened to carry in.
    expect(payload.stages[1].dynamic_role_rules).toEqual([
      { order: 0, condition: { op: "lt", field: "amount", value: 1 }, role_key: "new", label: "" },
      { order: 1, condition: null, role_key: "head", label: "" },
    ]);
  });

  it("changes nothing when the named stage is not in the template", () => {
    const t = template([stage({ code: "one", order: 1 })]);
    expect(templateToPublishPayload(t, { stageCode: "ghost", rules: [] })).toEqual(
      templateToPublishPayload(t),
    );
  });
});

describe("isCentralTemplate", () => {
  it("is true only when the template has no tenant", () => {
    expect(isCentralTemplate({ tenant: null })).toBe(true);
    expect(isCentralTemplate({ tenant: "tenant-1" })).toBe(false);
  });
});
