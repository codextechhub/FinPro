/**
 * The fiscal calendar's Field Access: a read filters on a year's status only
 * when the user may read that status, because the server refuses the filter
 * otherwise. Mrs Okafor, whose role reads a year's dates but not whether it is
 * open, asks for every year and is not told which ones are open.
 */
import { describe, expect, it } from "vitest";
import { yearStatusArg } from "./calendar-access";

describe("yearStatusArg", () => {
  it("filters by status for a user who may read it", () => {
    expect(yearStatusArg(true, "OPEN")).toEqual({ status: "OPEN" });
  });

  it("sends no status filter for a user whose Field Access closes it", () => {
    expect(yearStatusArg(false, "OPEN")).toEqual({});
  });
});
