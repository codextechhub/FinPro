import { describe, expect, it } from "vitest";
import { navLeaves } from "@/components/finance-ui/console-nav";
import { procurementNav } from "./procurement-nav";
import { PROCUREMENT_HELP, PROCUREMENT_HELP_BY_NAV_TITLE } from "./screen-help";

describe("Procurement screen help", () => {
  it("covers every menu destination", () => {
    const titles = procurementNav.flatMap((group) => group.items.flatMap(navLeaves).map((item) => item.title));
    expect(Object.keys(PROCUREMENT_HELP_BY_NAV_TITLE).sort()).toEqual([...titles].sort());
  });

  it("keeps every explanation to one short sentence", () => {
    for (const help of Object.values(PROCUREMENT_HELP)) {
      expect(help.length).toBeLessThanOrEqual(150);
      expect(help.match(/[.!?]/g)).toHaveLength(1);
    }
  });
});
