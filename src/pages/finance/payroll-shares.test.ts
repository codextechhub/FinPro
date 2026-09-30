/**
 * The rules a payroll run's branch shares decide.
 *
 * Corona's September run pays Ikeja and Lekki staff and posts one journal per
 * branch. Mr Eze pays Ikeja's share from Ikeja's account first: the run is then
 * partly paid, not paid, and can no longer be voided. It reads Paid once Lekki's
 * share is paid too. A run from a server without shares keeps the old rules, and
 * a post refused because Okon Udo has no branch names them.
 */

import { describe, expect, it } from "vitest";
import type { PayrollRun, PayrollRunBranchShare } from "@/redux/services/finance/ops-types";
import {
  isBranchPartOfWholeSchoolRun, isPartlyPaid, mayCancelRun, singleJournalBranch, unassignedStaffRefusal, unpaidShares,
} from "./payroll-shares";

const share = (id: number, branch: string, status: PayrollRunBranchShare["status"]): PayrollRunBranchShare => ({
  id, branch_id: id, branch_name: branch, status, gross_total: 100, paye_total: 10, pension_total: 5,
  net_total: 85, journal_id: id, disbursement_journal_id: null, bank_account_id: null,
});
const run = (run_status: string, branch_shares?: PayrollRunBranchShare[]) => ({ run_status, branch_shares });

describe("a run posted per branch", () => {
  it("is partly paid, and cannot be voided, once one branch's share is paid", () => {
    const r = run("POSTED", [share(10, "Ikeja Branch", "PAID"), share(20, "Lekki Branch", "POSTED")]);
    expect(isPartlyPaid(r)).toBe(true);
    expect(mayCancelRun(r)).toBe(false);
    expect(unpaidShares(r).map((s) => s.branch_name)).toEqual(["Lekki Branch"]);
  });

  it("may be voided while no share is paid", () => {
    expect(mayCancelRun(run("POSTED", [share(10, "Ikeja Branch", "POSTED"), share(20, "Lekki Branch", "POSTED")]))).toBe(true);
  });

  it("is not partly paid once the server marks the run paid", () => {
    const r = run("PAID", [share(10, "Ikeja Branch", "PAID"), share(20, "Lekki Branch", "PAID")]);
    expect(isPartlyPaid(r)).toBe(false);
    expect(mayCancelRun(r)).toBe(false);
  });
});

describe("a run from a server without shares", () => {
  it("keeps the rules of a run with one journal", () => {
    expect(isPartlyPaid(run("POSTED"))).toBe(false);
    expect(mayCancelRun(run("POSTED"))).toBe(true);
    expect(mayCancelRun(run("DRAFT"))).toBe(true);
    expect(mayCancelRun(run("PAID"))).toBe(false);
    expect(unpaidShares(run("POSTED"))).toEqual([]);
  });
});

describe("singleJournalBranch", () => {
  const lines = (...ids: (number | null | undefined)[]) => ids.map((branch_id, i) => ({ id: i, line_no: i, employee_id: null, cost_center: null, branch_id }));
  const r = (branch_id: number | null, l: ReturnType<typeof lines>) => ({ branch_id, lines: l }) as Pick<PayrollRun, "branch_id" | "lines">;

  it("is the run's branch, else the one branch all its lines are booked to", () => {
    expect(singleJournalBranch(r(10, lines(20)))).toBe(10);
    expect(singleJournalBranch(r(null, lines(20, 20)))).toBe(20);
  });

  it("is unknown for lines of several branches or lines that name none", () => {
    expect(singleJournalBranch(r(null, lines(10, 20)))).toBeUndefined();
    expect(singleJournalBranch(r(null, lines(undefined, undefined)))).toBeUndefined();
  });
});

describe("unassignedStaffRefusal", () => {
  it("names the staff with no branch", () => {
    const error = { status: 400, data: {
      message: "Payroll run PR-7 pays staff with no branch: Okon Udo.",
      error: { code: "PAYROLL_BRANCH_UNASSIGNED", detail: { employees: ["Okon Udo"] } },
    } };
    expect(unassignedStaffRefusal(error)).toEqual({ message: "Payroll run PR-7 pays staff with no branch: Okon Udo.", employees: ["Okon Udo"] });
  });

  it("is null for any other refusal", () => {
    expect(unassignedStaffRefusal({ status: 400, data: { error: { code: "VALIDATION_ERROR" } } })).toBeNull();
    expect(unassignedStaffRefusal(undefined)).toBeNull();
  });
});

describe("a branch's part of a run for the whole school", () => {
  it("is what a branch-bound reader holds of a central run", () => {
    expect(isBranchPartOfWholeSchoolRun({ branch_id: null }, false)).toBe(true);
    expect(isBranchPartOfWholeSchoolRun({ branch_id: null, partial_view: true }, true)).toBe(true);
  });

  it("is not a branch's own run, nor the run a whole-school reader holds", () => {
    expect(isBranchPartOfWholeSchoolRun({ branch_id: 20 }, false)).toBe(false);
    expect(isBranchPartOfWholeSchoolRun({ branch_id: null, partial_view: false }, true)).toBe(false);
    expect(isBranchPartOfWholeSchoolRun({ branch_id: null }, true)).toBe(false);
  });
});
