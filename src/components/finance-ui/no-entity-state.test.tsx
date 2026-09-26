import { describe, expect, it } from "vitest";
import { noEntityReason } from "./no-entity-state";

/**
 * Holy Cross keeps one set of books and never sees the entity picker, so its
 * bursar must never be told to "select an entity". The console, with several
 * sets of books and a picker in its header, is.
 */
describe("what a screen says before it has a set of books", () => {
  it("shows loading while the list is on its way, not an instruction", () => {
    expect(noEntityReason({ loading: true, count: 0, requested: null })).toBe("loading");
  });

  it("never asks a one-ledger school to select an entity", () => {
    expect(noEntityReason({ loading: false, count: 1, requested: null })).toBe("loading");
  });

  it("asks for a choice only where the picker exists", () => {
    expect(noEntityReason({ loading: false, count: 3, requested: null })).toBe("choose");
  });

  it("says so when there are no books at all", () => {
    expect(noEntityReason({ loading: false, count: 0, requested: null })).toBe("none");
  });

  it("says so when the link names books the reader cannot open", () => {
    expect(noEntityReason({ loading: false, count: 1, requested: "GREENFIELD" })).toBe("not-yours");
  });
});
