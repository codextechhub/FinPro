/**
 * The Payments screens name the product in each application's own voice.
 *
 * Kemi Balogun, a CodeX operator, opens Payment provider activity in the
 * console and reads "Every request CodeX made"; Mrs Adeyemi, a school bursar,
 * opens the same screen and reads "Every request XVS made". The other screens
 * read the same in both.
 */
import { describe, expect, it } from "vitest";

import { paymentsHeadings } from "./payments-headings";

describe("the Payments headings", () => {
  it("name the host's product in the provider-activity subtitle", () => {
    expect(paymentsHeadings("CodeX")["provider-activity"].subtitle)
      .toBe("Every request CodeX made to the payment provider, including refused and failed ones.");
    expect(paymentsHeadings("XVS")["provider-activity"].subtitle)
      .toBe("Every request XVS made to the payment provider, including refused and failed ones.");
  });

  it("leave every other screen's words alone", () => {
    const withoutActivity = (product: string) => {
      const headings: Record<string, unknown> = { ...paymentsHeadings(product) };
      delete headings["provider-activity"];
      return headings;
    };
    expect(withoutActivity("CodeX")).toEqual(withoutActivity("XVS"));
  });
});
