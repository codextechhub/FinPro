import { describe, expect, it } from "vitest";

import { NO_DEADLINE, deadlineInstant } from "./deadline";

describe("deadlineInstant", () => {
  it("reads the day and time in the branch's zone, not the device's", () => {
    expect(deadlineInstant({ date: "2026-09-30", time: "17:00" }, "Africa/Lagos")).toBe("2026-09-30T16:00:00.000Z");
    expect(deadlineInstant({ date: "2026-09-30", time: "17:00" }, "Africa/Nairobi")).toBe("2026-09-30T14:00:00.000Z");
  });

  it("names no moment until both parts are given", () => {
    expect(deadlineInstant(NO_DEADLINE, "Africa/Lagos")).toBeNull();
    expect(deadlineInstant({ date: "2026-09-30", time: "" }, "Africa/Lagos")).toBeNull();
    expect(deadlineInstant({ date: "", time: "17:00" }, "Africa/Lagos")).toBeNull();
  });
});
