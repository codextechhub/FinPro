import { describe, expect, it } from "vitest";

import { approvalWorkflowLink } from "./approval-workflow-link";

const everything = () => true;
const schoolRoutes = (to: string) => !to.startsWith("/workflow/instances/");

describe("approvalWorkflowLink", () => {
  it("opens the full instance where the app serves it", () => {
    expect(approvalWorkflowLink("wf-1", "7", "9", everything)).toBe("/workflow/instances/wf-1");
  });

  it("sends the requester to their own submission where instances are not served", () => {
    expect(approvalWorkflowLink("wf-1", 7, "7", schoolRoutes)).toBe("/workflow/my-submissions/wf-1");
  });

  it("offers no link to anyone else where instances are not served", () => {
    expect(approvalWorkflowLink("wf-1", "7", "9", schoolRoutes)).toBeNull();
    expect(approvalWorkflowLink("wf-1", "7", "", schoolRoutes)).toBeNull();
  });

  it("offers no link before the requisition has a workflow", () => {
    expect(approvalWorkflowLink("", "7", "7", everything)).toBeNull();
  });
});
