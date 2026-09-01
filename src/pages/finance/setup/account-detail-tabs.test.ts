import { describe, expect, it } from "vitest";
import { getAccountDetailTabKeys } from "./account-detail-tabs";

describe("getAccountDetailTabKeys", () => {
  it("includes posting views for postable accounts", () => {
    expect(getAccountDetailTabKeys(true)).toEqual(["activity", "taccount", "subs", "settings"]);
  });

  it("only includes structural views for non-postable accounts", () => {
    expect(getAccountDetailTabKeys(false)).toEqual(["subs", "settings"]);
  });
});
