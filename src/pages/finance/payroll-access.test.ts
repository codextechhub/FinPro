/**
 * Mrs Okafor may change pension but not PAYE or the pay breakdown. Aisha's
 * state of residence is greyed and left out of a save, her pension
 * administrator is not, and neither is ever hidden: reading where tax goes is
 * not reading a figure.
 */

import { describe, expect, it } from "vitest";
import { resolveFieldAccess } from "@/components/finance-ui";
import { withPayAliases } from "./payroll-access";

const OKAFOR = { "finance.salary": { hidden: [], read_only: ["components", "paye_amount"], open_on_create: [] } };

describe("the keys that change a pay figure", () => {
  const access = withPayAliases(resolveFieldAccess(OKAFOR, "finance.salary"));

  it("follow their figure's write switch", () => {
    expect(access.isReadOnly("residence_state")).toBe(true);
    expect(access.isReadOnly("structure")).toBe(true);
    expect(access.isReadOnly("pfa")).toBe(false);
    expect(access.isHidden("residence_state")).toBe(false);
  });

  it("are left out of a body the role may not send", () => {
    expect(access.writableOnly({ name: "Aisha", residence_state: "OG", pfa: 9, structure: 3 })).toEqual({ name: "Aisha", pfa: 9 });
  });
});
