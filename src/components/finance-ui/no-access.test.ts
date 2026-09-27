import { describe, expect, it } from "vitest";

import { noAccessMessage } from "./no-access";

describe("noAccessMessage", () => {
  it("says what the role cannot do and who can change it, never a permission key", () => {
    const message = noAccessMessage("submit concessions");
    expect(message).toBe("Your role can't submit concessions. Ask your administrator.");
    expect(message).not.toMatch(/\w+\.\w+\.\w+/);
  });
});
