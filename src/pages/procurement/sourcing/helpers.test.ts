import { describe, expect, it } from "vitest";

import { isForbidden } from "./helpers";

describe("isForbidden", () => {
  it("recognises only a 403", () => {
    expect(isForbidden({ status: 403 })).toBe(true);
    expect(isForbidden({ status: 500 })).toBe(false);
    expect(isForbidden(null)).toBe(false);
    expect(isForbidden("403")).toBe(false);
  });
});
