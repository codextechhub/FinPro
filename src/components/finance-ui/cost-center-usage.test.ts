import { describe, expect, it } from "vitest";
import type { CostCenter } from "@/redux/services/finance/setup-types";
import { selectableCostCenters } from "./cost-center-usage";

const centre = (code: string, is_active: boolean): CostCenter => ({
  id: code === "ACTIVE" ? 1 : 2,
  code,
  name: code,
  parent_id: null,
  parent_code: null,
  is_active,
});

describe("cost centre selection", () => {
  it("keeps inactive centres out of new allocations", () => {
    expect(selectableCostCenters([
      centre("ACTIVE", true),
      centre("ARCHIVED", false),
    ], "").map((item) => item.code)).toEqual(["ACTIVE"]);
  });

  it("keeps an existing inactive value visible while editing", () => {
    expect(selectableCostCenters([
      centre("ACTIVE", true),
      centre("ARCHIVED", false),
    ], "ARCHIVED").map((item) => item.code)).toEqual(["ACTIVE", "ARCHIVED"]);
  });
});
