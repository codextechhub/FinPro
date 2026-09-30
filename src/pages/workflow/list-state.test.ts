import { describe, expect, it } from "vitest";

import { listEmptyText, listLoadedEmpty } from "./list-state";

describe("listEmptyText", () => {
  it("says the list is empty only when it loaded", () => {
    expect(listEmptyText(undefined, "No approver groups yet.", "view approver groups")).toBe("No approver groups yet.");
  });

  it("says the reader's role cannot see it when the server refused", () => {
    expect(listEmptyText({ status: 403, data: {} }, "No approver groups yet.", "view approver groups")).toBe(
      "Your role can't view approver groups. Ask your administrator.",
    );
  });

  it("asks for another try when the request failed", () => {
    expect(listEmptyText({ status: 500 }, "No approver groups yet.", "view approver groups")).toBe(
      "This list could not be loaded. Try again.",
    );
    expect(listEmptyText({ status: "FETCH_ERROR" }, "x", "y")).toBe("This list could not be loaded. Try again.");
  });

  it("offers to create a first item only when the list truly loaded empty", () => {
    expect(listLoadedEmpty(undefined)).toBe(true);
    expect(listLoadedEmpty({ status: 403 })).toBe(false);
  });
});
