import { describe, expect, it } from "vitest";
import type { CostCenter } from "@/redux/services/finance/setup-types";
import { costCenterFormValues, costCenterUpsertPayload } from "./cost-center-form";

const centre: CostCenter = {
  id: 12,
  code: "CC-LAG-FAC",
  name: "Facilities",
  parent_id: 4,
  parent_code: "CC-LAG",
  is_active: true,
};

describe("cost centre edit form", () => {
  it("prefills every field that the upsert endpoint accepts", () => {
    expect(costCenterFormValues(centre)).toEqual({
      code: "CC-LAG-FAC",
      name: "Facilities",
      parent: "CC-LAG",
      active: true,
    });
  });

  it("sends the inactive state through the existing upsert contract", () => {
    expect(costCenterUpsertPayload("school-1", {
      code: "cc-lag-fac",
      name: "Facilities",
      parent: "",
      active: false,
    })).toEqual({
      entity: "school-1",
      code: "CC-LAG-FAC",
      name: "Facilities",
      parent: undefined,
      is_active: false,
    });
  });
});
