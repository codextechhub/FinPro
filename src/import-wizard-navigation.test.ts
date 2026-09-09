import { describe, expect, it } from "vitest";

import { hasImportWizardWork } from "./import-wizard-navigation";

const blank = {
  complete: false,
  templateId: null,
  file: null,
  notes: "",
  batchId: null,
};

describe("hasImportWizardWork", () => {
  it("does not mark a blank new import as dirty", () => {
    expect(hasImportWizardWork(blank)).toBe(false);
  });

  it("counts each form value and a created batch as work", () => {
    expect(hasImportWizardWork({ ...blank, templateId: 9 })).toBe(true);
    expect(hasImportWizardWork({ ...blank, file: new File(["row"], "users.csv") })).toBe(true);
    expect(hasImportWizardWork({ ...blank, notes: "Check duplicates" })).toBe(true);
    expect(hasImportWizardWork({ ...blank, batchId: 42 })).toBe(true);
  });

  it("ignores whitespace-only notes", () => {
    expect(hasImportWizardWork({ ...blank, notes: "   " })).toBe(false);
  });

  it("clears dirty state after completion", () => {
    expect(hasImportWizardWork({
      ...blank,
      complete: true,
      templateId: 9,
      file: new File(["row"], "users.csv"),
      notes: "Imported",
      batchId: 42,
    })).toBe(false);
  });
});
