import { describe, expect, it } from "vitest";

import type { FreeRequisitionLine } from "@/redux/services/procurement/procurement-types";
import {
  groupSharedLines, participatingBranches, sharedRfqLinesBody, sharedSourcingProblem, sourceLinesFrom, type SourceLine,
} from "./shared-sourcing";

const ikejaChairs: SourceLine = { requisition_line: 101, requisition_number: "PR-0001", branch_id: 1, branch_name: "Ikeja", description: "Classroom chair", quantity: 60, expense_code: "5300" };
const lekkiChairs: SourceLine = { requisition_line: 202, requisition_number: "PR-0002", branch_id: 2, branch_name: "Lekki", description: "classroom  chair ", quantity: 40, expense_code: "5300" };
const lekkiDesks: SourceLine = { requisition_line: 203, requisition_number: "PR-0002", branch_id: 2, branch_name: "Lekki", description: "Desk", quantity: 10, expense_code: "5300" };

describe("groupSharedLines", () => {
  it("puts the same item from two branches on one RFQ line with both allocations", () => {
    const groups = groupSharedLines([ikejaChairs, lekkiChairs, lekkiDesks]);
    expect(groups).toHaveLength(2);
    expect(groups[0].quantity).toBe(100);
    expect(groups[0].allocations.map((a) => a.requisition_line)).toEqual([101, 202]);
  });
});

describe("sharedRfqLinesBody", () => {
  it("allocates each whole requisition line, as the server requires", () => {
    expect(sharedRfqLinesBody(groupSharedLines([ikejaChairs, lekkiChairs]))).toEqual([{
      line_no: 1, description: "Classroom chair", quantity: 100, expense_account: "5300",
      allocations: [{ requisition_line: 101, quantity: 60 }, { requisition_line: 202, quantity: 40 }],
    }]);
  });

  it("keeps a renamed line's allocations", () => {
    const groups = groupSharedLines([ikejaChairs, lekkiChairs]);
    expect(sharedRfqLinesBody(groups, { [groups[0].key]: "Plastic chair, blue" })[0].description).toBe("Plastic chair, blue");
  });
});

describe("sharedSourcingProblem", () => {
  it("needs lines from at least two branches", () => {
    expect(sharedSourcingProblem([])).toContain("Choose");
    expect(sharedSourcingProblem([ikejaChairs])).toContain("at least two branches");
    expect(sharedSourcingProblem([ikejaChairs, lekkiDesks])).toBeNull();
  });

  it("names each branch once", () => {
    expect(participatingBranches([lekkiDesks, ikejaChairs, lekkiChairs])).toEqual([{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }]);
  });
});

describe("sourceLinesFrom", () => {
  const free = (over: Partial<FreeRequisitionLine>): FreeRequisitionLine => ({
    id: 101, line_no: 1, catalog_item_id: null, description: "Classroom chair", quantity: "60.000", unit: "each",
    estimated_unit_price: 0, expense_code: "5300", estimated_line_total: 0,
    requisition_id: 1, requisition_number: "PR-0001", request_date: "2026-10-01", branch_id: 1, branch_name: "Ikeja", ...over,
  });

  it("offers each free line with its requisition and branch", () => {
    expect(sourceLinesFrom([free({})])).toEqual([ikejaChairs]);
  });

  it("leaves out a line whose requisition has no branch yet, which the server would refuse", () => {
    expect(sourceLinesFrom([free({ branch_id: null, branch_name: null }), free({ id: 202, branch_id: 2, branch_name: "Lekki" })]).map((l) => l.requisition_line)).toEqual([202]);
  });
});
