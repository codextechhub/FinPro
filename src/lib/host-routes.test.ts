import type { RouteObject } from "react-router";
import { describe, expect, it } from "vitest";

import { servesPath } from "./host-routes";

/** A route table in the shape both hosts build: a pathless shell, then a 404. */
const routes: RouteObject[] = [
  {
    children: [
      {
        children: [
          { path: "/workflow/approvals/:id" },
          { path: "/workflow/my-submissions/:id" },
          { path: "/finance/audit" },
          { path: "/procurement/requisitions" },
        ],
      },
      { path: "*" },
    ],
  },
];

describe("servesPath", () => {
  it("serves an address a route mounts", () => {
    expect(servesPath(routes, "/workflow/my-submissions/42")).toBe(true);
    expect(servesPath(routes, "/finance/audit")).toBe(true);
  });

  it("does not serve an address only the 404 route answers", () => {
    expect(servesPath(routes, "/workflow/team-load")).toBe(false);
    expect(servesPath(routes, "/audit/events")).toBe(false);
    expect(servesPath(routes, "/finance/payments/batches")).toBe(false);
  });

  it("ignores the query string and hash", () => {
    expect(servesPath(routes, "/procurement/requisitions?document=7#lines")).toBe(true);
  });

  it("does not serve an address that is not a path inside the app", () => {
    expect(servesPath(routes, "https://example.com/finance/audit")).toBe(false);
    expect(servesPath(routes, "")).toBe(false);
  });

  it("does not serve anything from a table with no match at all", () => {
    expect(servesPath([{ path: "/overview" }], "/finance/audit")).toBe(false);
  });
});
