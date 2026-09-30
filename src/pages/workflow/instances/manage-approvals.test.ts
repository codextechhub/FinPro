import { describe, expect, it } from "vitest";

import type { InstanceApprovers, StageApprovers } from "@/redux/services/dashboard/workflow-types";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  addPerson,
  appliedToWaitingMessage,
  approverIdsToSave,
  editorReducer,
  editorSaveProblem,
  filtersFromSearchParams,
  filtersToSearchParams,
  initialEditorState,
  instanceQuery,
  patchFilters,
  removePerson,
  removalBlockedReason,
  replaceProblem,
  replaceSummary,
  stageIsEditable,
  stageIsResettable,
  stagePeople,
  stagePositionLabel,
  stagesInOrder,
  waitingOnLabel,
  type EditorPerson,
  type InstanceFilters,
} from "./manage-approvals";

const funke: EditorPerson = { id: "11", name: "Funke Adeyemi", onBehalfOf: null, vote: null };
const tunde: EditorPerson = { id: "12", name: "Tunde Bello", onBehalfOf: null, vote: null };
const okafor: EditorPerson = { id: "13", name: "Mr Okafor", onBehalfOf: null, vote: "APPROVED" };

function stage(patch: Partial<StageApprovers> = {}): StageApprovers {
  return {
    stage_id: "s-2",
    label: "Vice Principal approval",
    order: 2,
    state: "ACTIVE",
    advance_rule: "ANY",
    quorum_count: null,
    approvers: [],
    preview: false,
    assignment: null,
    may_change: true,
    ...patch,
  };
}

function detail(patch: Partial<InstanceApprovers> = {}): InstanceApprovers {
  return { instance_id: "wf-1", may_change: true, blocked_reason: null, stages: [], history: [], ...patch };
}

describe("list filters in the address bar", () => {
  it("round-trips every filter through the address", () => {
    const filters: InstanceFilters = {
      documentType: "leave.request",
      statuses: ["IN_PROGRESS", "RETURNED"],
      stage: "s-2",
      requestedBy: "7",
      requestFor: "8",
      waitingOn: "11",
      waitingLongerThan: "7",
      submittedFrom: "2026-09-01",
      submittedTo: "2026-09-30",
      branch: "19",
      search: "JV-0042",
      page: 3,
    };
    const params = filtersToSearchParams(filters);
    expect(params.get("status")).toBe("IN_PROGRESS,RETURNED");
    expect(filtersFromSearchParams(params)).toEqual(filters);
  });

  it("writes nothing for an unfiltered first page", () => {
    expect(filtersToSearchParams(EMPTY_FILTERS).toString()).toBe("");
    expect(filtersFromSearchParams(new URLSearchParams())).toEqual(EMPTY_FILTERS);
  });

  it("drops a stage that arrives without its document type, and a malformed day count", () => {
    const read = filtersFromSearchParams(new URLSearchParams("stage=s-2&waiting_longer_than=soon&page=0"));
    expect(read.stage).toBe("");
    expect(read.waitingLongerThan).toBe("");
    expect(read.page).toBe(1);
  });

  it("sends the reader back to page one on any change but the page", () => {
    const onPage3 = { ...EMPTY_FILTERS, page: 3 };
    expect(patchFilters(onPage3, { waitingOn: "11" }).page).toBe(1);
    expect(patchFilters(onPage3, { page: 4 }).page).toBe(4);
  });

  it("drops the stage when the document type changes", () => {
    const leave = { ...EMPTY_FILTERS, documentType: "leave.request", stage: "s-2" };
    expect(patchFilters(leave, { documentType: "finance.refund" }).stage).toBe("");
    expect(patchFilters(leave, { documentType: "leave.request" }).stage).toBe("s-2");
    expect(patchFilters(leave, { search: "x" }).stage).toBe("s-2");
  });

  it("counts the filters that narrow the list", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, statuses: ["APPROVED"], waitingOn: "11", page: 4 })).toBe(2);
  });
});

describe("the list request", () => {
  it("sends only the filters that are set", () => {
    expect(instanceQuery(EMPTY_FILTERS, { multiBranch: true })).toEqual({ page: 1 });
    expect(
      instanceQuery(
        { ...EMPTY_FILTERS, statuses: ["IN_PROGRESS"], waitingOn: "11", waitingLongerThan: "3", search: "leave" },
        { multiBranch: false },
      ),
    ).toEqual({ page: 1, status: "IN_PROGRESS", waiting_on: "11", waiting_longer_than: 3, search: "leave" });
  });

  it("joins several statuses with commas", () => {
    expect(instanceQuery({ ...EMPTY_FILTERS, statuses: ["IN_PROGRESS", "RETURNED"] }, { multiBranch: false }).status)
      .toBe("IN_PROGRESS,RETURNED");
  });

  it("sends a branch only where the reader can see more than one", () => {
    const ikeja = { ...EMPTY_FILTERS, branch: "19" };
    expect(instanceQuery(ikeja, { multiBranch: true }).branch).toBe("19");
    expect(instanceQuery(ikeja, { multiBranch: false })).not.toHaveProperty("branch");
  });

  it("sends a stage only beside its document type", () => {
    expect(instanceQuery({ ...EMPTY_FILTERS, stage: "s-2" }, { multiBranch: false })).not.toHaveProperty("stage");
    expect(instanceQuery({ ...EMPTY_FILTERS, documentType: "leave.request", stage: "s-2" }, { multiBranch: false }))
      .toMatchObject({ document_type: "leave.request", stage: "s-2" });
  });
});

describe("row wording", () => {
  it("says where the request stands among its stages", () => {
    expect(stagePositionLabel({ stage_position: { index: 2, total: 3 }, current_stage_label: "Vice Principal approval" }))
      .toBe("2 of 3 · Vice Principal approval");
    expect(stagePositionLabel({ stage_position: null, current_stage_label: "Bursar" })).toBe("Bursar");
    expect(stagePositionLabel({ stage_position: null, current_stage_label: null })).toBe("-");
  });

  it("names a delegate with the person they stand in for", () => {
    expect(waitingOnLabel({ id: "12", name: "Tunde Bello", on_behalf_of: { id: "11", name: "Funke Adeyemi" } }))
      .toBe("Tunde Bello for Funke Adeyemi");
    expect(waitingOnLabel({ id: "11", name: "Funke Adeyemi", on_behalf_of: null })).toBe("Funke Adeyemi");
  });
});

describe("the approver editor", () => {
  it("will not remove somebody who has voted, and says why", () => {
    expect(removalBlockedReason(okafor)).toBe(
      "Mr Okafor has already approved this stage. Reverse the vote to remove them.",
    );
    expect(removePerson([funke, okafor], okafor.id)).toEqual([funke, okafor]);
  });

  it("removes somebody who has not voted", () => {
    expect(removalBlockedReason(funke)).toBeNull();
    expect(removePerson([funke, tunde], funke.id)).toEqual([tunde]);
  });

  it("adds a person once", () => {
    const once = addPerson([funke], { id: "12", name: "Tunde Bello" });
    expect(once).toEqual([funke, tunde]);
    expect(addPerson(once, { id: "12", name: "Tunde Bello" })).toBe(once);
  });

  it("saves the complete list, each person once", () => {
    const delegate: EditorPerson = { ...tunde, onBehalfOf: { id: "11", name: "Funke Adeyemi" } };
    expect(approverIdsToSave([funke, tunde, delegate])).toEqual(["11", "12"]);
  });

  it("asks for a change, somebody on the stage, and a reason", () => {
    expect(editorSaveProblem([funke], [funke], "Funke is on leave")).toBe("Add or remove somebody to save a change.");
    expect(editorSaveProblem([funke], [], "Funke is on leave")).toBe("A stage needs at least one approver.");
    expect(editorSaveProblem([funke], [tunde], "   ")).toBe("Give a reason. It is kept with the change.");
    expect(editorSaveProblem([funke], [tunde], "x".repeat(501))).toBe("Keep the reason to 500 characters.");
    expect(editorSaveProblem([funke], [tunde], "Funke is on leave")).toBeNull();
  });

  it("shows an upcoming stage's assignment in place of its preview", () => {
    const assigned = stage({
      state: "UPCOMING",
      preview: false,
      approvers: [{ id: "11", name: "Funke Adeyemi", on_behalf_of: null, vote: null }],
      assignment: {
        approvers: [{ id: "13", name: "Mr Okafor" }],
        reason: "Mr Okafor covers this term",
        set_by: { id: "1", name: "Mrs Ade" },
        set_at: "2026-09-28T10:00:00Z",
      },
    });
    expect(stagePeople(assigned).map((p) => p.name)).toEqual(["Mr Okafor"]);
    expect(stagePeople(stage({ approvers: [{ id: "13", name: "Mr Okafor", on_behalf_of: null, vote: "APPROVED" }] })))
      .toEqual([okafor]);
  });

  it("offers changes only on an open request's unfinished stages", () => {
    expect(stageIsEditable(detail(), stage())).toBe(true);
    expect(stageIsEditable(detail(), stage({ state: "DONE", may_change: false }))).toBe(false);
    expect(stageIsEditable(detail({ may_change: false, blocked_reason: "This request is finished." }), stage()))
      .toBe(false);
    expect(stageIsEditable(detail(), stage({ may_change: false }))).toBe(false);
  });

  it("numbers stages by their place in the request, not by the template's sort key", () => {
    const senior = stage({ stage_id: "s-2", order: 20, label: "Senior approval" });
    const manager = stage({ stage_id: "s-1", order: 10, label: "Manager approval" });
    expect(stagesInOrder([senior, manager]).map(({ stage: s, position }) => `${position}. ${s.label}`))
      .toEqual(["1. Manager approval", "2. Senior approval"]);
    expect(stagesInOrder([])).toEqual([]);
  });

  it("clears a refused save once the list or the reason changes", () => {
    const refusal = "Funke Adeyemi cannot approve this request, because they raised it.";
    const refused = editorReducer(
      { ...initialEditorState([tunde, funke]), reason: "Cover" },
      { type: "refused", message: refusal },
    );
    expect(refused.failure).toBe(refusal);

    expect(editorReducer(refused, { type: "remove", id: funke.id })).toMatchObject({ list: [tunde], failure: "" });
    expect(editorReducer(refused, { type: "add", person: { id: "13", name: "Mr Okafor" } }).failure).toBe("");
    expect(editorReducer(refused, { type: "reason", reason: "Cover for October" })).toMatchObject({
      reason: "Cover for October", failure: "",
    });
    expect(editorReducer(refused, { type: "saving" }).failure).toBe("");
  });

  it("keeps a refusal when nothing it was about has changed", () => {
    const refused = editorReducer(initialEditorState([tunde, okafor]), { type: "refused", message: "No." });
    // Okafor has voted and cannot be removed, and Tunde is already on the list.
    expect(editorReducer(refused, { type: "remove", id: okafor.id })).toBe(refused);
    expect(editorReducer(refused, { type: "add", person: { id: "12", name: "Tunde Bello" } })).toBe(refused);
    expect(editorReducer(refused, { type: "reason", reason: "" })).toBe(refused);
  });

  it("offers a reset only on an upcoming stage an admin assigned", () => {
    const assignment = {
      approvers: [{ id: "13", name: "Mr Okafor" }], reason: "cover",
      set_by: { id: "1", name: "Mrs Ade" }, set_at: "2026-09-28T10:00:00Z",
    };
    expect(stageIsResettable(detail(), stage({ state: "UPCOMING", assignment }))).toBe(true);
    expect(stageIsResettable(detail(), stage({ state: "UPCOMING", preview: true }))).toBe(false);
    expect(stageIsResettable(detail(), stage({ state: "ACTIVE", assignment }))).toBe(false);
  });
});

describe("replacing one approver across many requests", () => {
  it("needs a selection within the limit, two different people and a reason", () => {
    const ok = { from: "11", to: "12", reason: "Funke is on leave", count: 12 };
    expect(replaceProblem(ok)).toBeNull();
    expect(replaceProblem({ ...ok, count: 0 })).toBe("Select at least one request.");
    expect(replaceProblem({ ...ok, count: 201 })).toBe("Select at most 200 requests at a time.");
    expect(replaceProblem({ ...ok, from: "" })).toBe("Choose who is being replaced.");
    expect(replaceProblem({ ...ok, to: "" })).toBe("Choose who takes their place.");
    expect(replaceProblem({ ...ok, to: "11" })).toBe("Choose two different people.");
    expect(replaceProblem({ ...ok, reason: "" })).toBe("Give a reason. It is kept with the change.");
  });

  it("sums up what happened", () => {
    expect(replaceSummary({ replaced: 11, skipped: 1 })).toBe("Replaced on 11 requests. 1 skipped.");
    expect(replaceSummary({ replaced: 1, skipped: 0 })).toBe("Replaced on 1 request.");
  });
});

describe("a new delegation's reach", () => {
  it("says how many waiting requests it joined", () => {
    expect(appliedToWaitingMessage(3, "Funke Adeyemi")).toBe("Also added to 3 requests already waiting on Funke Adeyemi.");
    expect(appliedToWaitingMessage(1, "Funke Adeyemi")).toBe("Also added to 1 request already waiting on Funke Adeyemi.");
    expect(appliedToWaitingMessage(0, "Funke Adeyemi")).toBeNull();
    expect(appliedToWaitingMessage(undefined, "Funke Adeyemi")).toBeNull();
  });
});
