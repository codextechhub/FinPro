import { describe, expect, it } from "vitest";

import { humanizeDocumentType } from "./workflow-format";

describe("humanizeDocumentType", () => {
  it("uses the server's label when the row carries one", () => {
    expect(humanizeDocumentType("rbac.role_grant", "Restricted role grant")).toBe(
      "Restricted role grant",
    );
  });

  // The fallback reads the code's last segment, as the server's own does, so a
  // module prefix never reaches the reader as "Rbac Role Grant".
  it("puts the last segment of the code into words without a label", () => {
    expect(humanizeDocumentType("rbac.role_grant")).toBe("Role grant");
    expect(humanizeDocumentType("finance.write_off", "")).toBe("Write off");
    expect(humanizeDocumentType("PLATFORM_USER_CREATION")).toBe("Platform user creation");
  });

  it("calls a missing type a document", () => {
    expect(humanizeDocumentType("")).toBe("Document");
  });
});
