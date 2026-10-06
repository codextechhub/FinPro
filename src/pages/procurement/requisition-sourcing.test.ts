/**
 * Lagos Prep's PR-0004 has two lines: 40 chairs and 10 desks. Whether a buyer
 * can still put it on an RFQ or an order depends on which of them another
 * live RFQ or order already holds.
 */
import { describe, expect, it } from "vitest";

import { completeFreeLineIds, requisitionSourcing, requisitionSourcingFilter, sourcingNote } from "./requisition-sourcing";

const CHAIRS = 501;
const DESKS = 502;

describe("requisitionSourcing", () => {
  it("reads a requisition whose every line is free as free", () => {
    expect(requisitionSourcing([CHAIRS, DESKS], new Set([CHAIRS, DESKS, 900]))).toBe("free");
  });

  it("reads one with only the desks free as partly held", () => {
    expect(requisitionSourcing([CHAIRS, DESKS], new Set([DESKS]))).toBe("partly-held");
  });

  it("reads one with no line free as all held", () => {
    expect(requisitionSourcing([CHAIRS, DESKS], new Set([900]))).toBe("all-held");
  });

  it("never marks a requisition with no lines", () => {
    expect(requisitionSourcing([], new Set())).toBe("free");
  });
});

describe("requisitionSourcingFilter", () => {
  it("asks for a free line for an RFQ, and every line free for an order", () => {
    expect(requisitionSourcingFilter("rfq")).toEqual({ has_free_lines: "true" });
    expect(requisitionSourcingFilter("order")).toEqual({ all_lines_free: "true" });
    expect(requisitionSourcingFilter(undefined)).toEqual({});
  });
});

describe("sourcingNote", () => {
  it("tells an RFQ to drop the held lines, and an order that a part held blocks it", () => {
    expect(sourcingNote("partly-held", "rfq", "PR-0004")).toContain("Remove them from this RFQ");
    expect(sourcingNote("partly-held", "order", "PR-0004")).toContain("an order takes the whole requisition");
    expect(sourcingNote("all-held", "rfq", "PR-0004")).toContain("Every line of PR-0004 is already on an RFQ or purchase order");
    expect(sourcingNote("free", "rfq", "PR-0004")).toBeNull();
  });
});

describe("completeFreeLineIds", () => {
  it("answers only from a page that holds every free line", () => {
    expect(completeFreeLineIds([{ id: CHAIRS }], 1)).toEqual(new Set([CHAIRS]));
    expect(completeFreeLineIds([{ id: CHAIRS }], 250)).toBeNull();
    expect(completeFreeLineIds(undefined, undefined)).toBeNull();
  });
});
