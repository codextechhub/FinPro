/**
 * The reason field is what stands between a reader and a 400 from the server:
 * a blank reason and an over-long one are both refused there, so both are
 * answered here first.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REASON_MAX_LENGTH, ReasonField, hasReason } from "./reason-field";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("hasReason", () => {
  it("refuses a blank or whitespace-only reason", () => {
    expect(hasReason("")).toBe(false);
    expect(hasReason("  \n ")).toBe(false);
  });

  it("accepts any written reason", () => {
    expect(hasReason("Wrong file attached")).toBe(true);
  });
});

describe("ReasonField", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("is a labelled, required field capped at the length the server stores", async () => {
    await act(async () => {
      root.render(<ReasonField value="" onChange={() => undefined} hint="Kept on the audit trail." />);
    });
    const field = container.querySelector("textarea")!;
    const label = container.querySelector(`label[for="${field.id}"]`);

    expect(label?.textContent).toContain("Reason");
    expect(field.required).toBe(true);
    expect(field.maxLength).toBe(REASON_MAX_LENGTH);
    expect(container.textContent).toContain("Kept on the audit trail.");
  });
});
