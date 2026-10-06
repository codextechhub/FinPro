import { describe, expect, it } from "vitest";

import type { WorkflowStage } from "@/redux/services/dashboard/workflow-types";
import {
  UNNAMED_ROLE,
  approverScopeLabel,
  approverSummary,
  humanizeDocumentType,
  routeStageName,
} from "./workflow-format";

describe("humanizeDocumentType", () => {
  it("uses the server's label when the row carries one", () => {
    expect(humanizeDocumentType("rbac.role_grant", "Restricted role grant")).toBe(
      "Restricted role grant",
    );
  });

  // Without the server's label the type is never derived from its code.
  it("calls a type with no label a document, never its code in words", () => {
    expect(humanizeDocumentType("rbac.role_grant")).toBe("Document");
    expect(humanizeDocumentType("finance.write_off", "")).toBe("Document");
    expect(humanizeDocumentType("")).toBe("Document");
  });
});

describe("approverScopeLabel", () => {
  it("names the platform scope in the platform operator's words", () => {
    expect(approverScopeLabel("PLATFORM", true)).toBe("Everyone, platform-wide");
    expect(approverScopeLabel("SCHOOL", true)).toBe("Whole organisation");
  });

  it("never tells a school a step reaches the whole platform", () => {
    expect(approverScopeLabel("PLATFORM", false)).toBe("Whole school (as published)");
    expect(approverScopeLabel("SCHOOL", false)).toBe("Whole school");
    expect(approverScopeLabel("BRANCH", false)).toBe("This branch only");
  });
});

describe("approverSummary", () => {
  const stage = (over: Partial<WorkflowStage>) => ({
    approver_source: "ROLE", approver_role_key: "", ...over,
  }) as WorkflowStage;

  it("names a role by the server's name, then the host's, and never by its key", () => {
    expect(approverSummary(stage({ approver_role_key: "bursar", approver_role_name: "Bursar" }))).toBe("Bursar");
    expect(approverSummary(stage({ approver_role_key: "bursar" }), () => "School bursar")).toBe("School bursar");
    expect(approverSummary(stage({ approver_role_key: "bursar" }), () => undefined)).toBe(UNNAMED_ROLE);
  });

  it("names a group and a post by name, and neutrally without one", () => {
    expect(approverSummary(stage({ approver_source: "WORKFLOW_GROUP", approver_group_code: "fin-senior" })))
      .toBe("An approver group");
    expect(approverSummary(stage({
      approver_source: "ORGANOGRAM", organogram_target: "SPECIFIC_POSITION",
      organogram_position_code: "HOD-SCI", organogram_position_name: "Head of Science",
    }))).toBe("Organogram - Head of Science");
  });
});

describe("routeStageName", () => {
  it("reads a route's ends by stage name, never by code", () => {
    expect(routeStageName(null, null, "Start")).toBe("Start");
    expect(routeStageName("check", "Budget check", "Approved")).toBe("Budget check");
    expect(routeStageName("old-step", null, "Approved")).toBe("A retired stage");
  });
});
