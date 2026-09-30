import { describe, expect, it } from "vitest";

import { approvalWorkflowLink } from "./approval-workflow-link";

const everything = () => true;
const schoolRoutes = (to: string) => !to.startsWith("/workflow/instances/");

describe("approvalWorkflowLink", () => {
  it("opens the full instance for a reader who may view every request, where the app serves it", () => {
    expect(approvalWorkflowLink("wf-1", "7", "9", everything, true)).toBe("/workflow/instances/wf-1");
  });

  it("sends the requester to their own submission where instances are not served", () => {
    expect(approvalWorkflowLink("wf-1", 7, "7", schoolRoutes, true)).toBe("/workflow/my-submissions/wf-1");
  });

  it("sends a requester who may not view every request to their own submission", () => {
    expect(approvalWorkflowLink("wf-1", "7", "7", everything, false)).toBe("/workflow/my-submissions/wf-1");
  });

  it("offers no link to anyone else who cannot open the full instance", () => {
    expect(approvalWorkflowLink("wf-1", "7", "9", schoolRoutes, true)).toBeNull();
    expect(approvalWorkflowLink("wf-1", "7", "", schoolRoutes, true)).toBeNull();
    expect(approvalWorkflowLink("wf-1", "7", "9", everything, false)).toBeNull();
  });

  it("offers no link before the requisition has a workflow", () => {
    expect(approvalWorkflowLink("", "7", "7", everything, true)).toBeNull();
  });
});
