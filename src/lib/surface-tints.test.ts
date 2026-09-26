import { describe, expect, it } from "vitest";

import { inkOnATint } from "./surface-tints";

const sources = import.meta.glob<string>(
  ["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"],
  { query: "?raw", import: "default", eager: true },
);

describe("surface tints", () => {
  it("reads the whole package", () => {
    expect(Object.keys(sources)).toContain("../index.ts");
  });

  it("are never used as a text or icon colour", () => {
    expect(inkOnATint(sources)).toEqual([]);
  });

  it("names the line that uses one", () => {
    expect(
      inkOnATint({
        "a.tsx": 'const ok = "fill-gray-03";\n<Icon className="text-gray-04" />',
      }),
    ).toEqual(["a.tsx:2"]);
  });
});
