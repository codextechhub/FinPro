import { describe, expect, it } from "vitest";
import { sourceDocumentIdFromParams } from "./source-document-route";

describe("sourceDocumentIdFromParams", () => {
  it("reads a positive source document id", () => {
    expect(sourceDocumentIdFromParams(new URLSearchParams("document=42"))).toBe(42);
  });

  it.each(["", "0", "-2", "1.5", "missing"])(
    "rejects an invalid source document id of %s",
    (value) => {
      expect(sourceDocumentIdFromParams(new URLSearchParams(`document=${value}`))).toBeNull();
    },
  );
});
