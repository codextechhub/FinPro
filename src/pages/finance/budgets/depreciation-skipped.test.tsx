/**
 * FY2026 is closed. Running depreciation up to February 2027 posts January and
 * February and lists December 2026's charge for the bus as skipped.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { SkippedCharges, skippedSummary } from "./depreciation-skipped";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BUS = { asset_id: 4, asset: "School bus", asset_number: "FA-0004", seq: 12, date: "2026-12-31", amount: 15_000_000, fiscal_year: "FY2026", reason: "dated in a closed year" };

describe("skipped depreciation charges", () => {
  it("says nothing when none were skipped", () => {
    expect(skippedSummary([])).toBeNull();
    expect(skippedSummary(undefined)).toBeNull();
  });

  it("counts them and names the closed years", () => {
    expect(skippedSummary([BUS])).toBe("1 charge falls in a closed year (FY2026) and is skipped. Reopen the year to post it.");
    expect(skippedSummary([BUS, { ...BUS, seq: 11, date: "2026-11-30" }])).toContain("2 charges fall in a closed year (FY2026)");
  });

  it("lists each charge with its asset and year", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<SkippedCharges skipped={[BUS]} />));

    expect(container.textContent).toContain("School bus");
    expect(container.textContent).toContain("FA-0004");
    expect(container.textContent).toContain("FY2026");
    await act(async () => root.unmount());
  });
});
