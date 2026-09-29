import { describe, expect, it } from "vitest";

import { nowIn } from "../../../utils/dates";
import { renderFileNamePreview } from "./helpers";

describe("renderFileNamePreview", () => {
  it("dates the file by the school's clock on both tokens, just past Lagos midnight", () => {
    // 23:30 UTC on 28 Sep is 00:30 on the 29th in Lagos. The preview read the
    // date from UTC and the hour from the browser, and showed 2026-09-28-0030.
    const now = nowIn("Africa/Lagos", new Date("2026-09-28T23:30:00Z"));
    expect(renderFileNamePreview("fees-{date}", "xlsx", now)).toBe("fees-2026-09-29.xlsx");
    expect(renderFileNamePreview("fees-{datetime}", "csv", now)).toBe("fees-2026-09-29-0030.csv");
  });

  it("stands placeholders in for the entity and the run", () => {
    const now = nowIn("Africa/Lagos", new Date("2026-09-29T07:05:00Z"));
    expect(renderFileNamePreview("{entity}-{run}-{datetime}", "csv", now)).toBe("entity-1-2026-09-29-0805.csv");
  });
});
