import { describe, expect, it } from "vitest";
import type { LedgerEntity } from "@/redux/services/finance/entity-types";
import { resolveActiveEntityCode } from "./use-entity";

const entities = [
  { code: "COD" },
  { code: "TES" },
] as LedgerEntity[];

describe("resolveActiveEntityCode", () => {
  it("uses the entity requested by a source-document link", () => {
    expect(resolveActiveEntityCode("COD", "TES", entities)).toBe("TES");
  });

  it("does not fall through to another entity for an unknown requested code", () => {
    expect(resolveActiveEntityCode("COD", "OTHER", entities)).toBeNull();
  });

  it("keeps the selected entity when the URL has no entity scope", () => {
    expect(resolveActiveEntityCode("COD", null, entities)).toBe("COD");
  });
});

describe("resolveActiveEntityCode, against the loaded list", () => {
  const entities = [
    { code: "HOLYCROSS" } as never,
    { code: "SECOND" } as never,
  ];

  it("refuses a stored code that is not one of the caller's", () => {
    // The bug this covers: a code left over from another tenant was returned
    // unchecked, so every entity-scoped request 404'd with "Resource not found".
    expect(resolveActiveEntityCode("CODEX", null, entities)).toBe("HOLYCROSS");
  });

  it("keeps a stored code that is still one of theirs", () => {
    expect(resolveActiveEntityCode("SECOND", null, entities)).toBe("SECOND");
  });

  it("falls back to the only set of books when nothing is stored", () => {
    expect(resolveActiveEntityCode(null, null, entities)).toBe("HOLYCROSS");
  });

  it("resolves nothing while the list is still loading", () => {
    expect(resolveActiveEntityCode("HOLYCROSS", null, [])).toBeNull();
  });

  it("refuses an explicit ?entity= that is not theirs, rather than substituting", () => {
    // A shared or edited URL must fail visibly, never quietly show other books.
    expect(resolveActiveEntityCode(null, "SOMEONE_ELSE", entities)).toBeNull();
  });
});
