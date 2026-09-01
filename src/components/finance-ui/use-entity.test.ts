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
