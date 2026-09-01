import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InfoHint } from "./info-hint";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("InfoHint", () => {
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

  async function renderHint() {
    await act(async () => {
      root.render(
        <InfoHint ariaLabel="About refundable credit">
          Total customer credit available to refund.
        </InfoHint>,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="About refundable credit"]',
    );
    expect(trigger).not.toBeNull();
    return trigger!;
  }

  it("reveals its explanation when the info button is clicked", async () => {
    const trigger = await renderHint();

    await act(async () => {
      trigger.click();
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).toContain(
      "Total customer credit available to refund.",
    );
  });

  it("stays closed on hover and focus", async () => {
    const trigger = await renderHint();

    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
      trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      trigger.focus();
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.textContent).not.toContain(
      "Total customer credit available to refund.",
    );
  });

  it("closes on a second activation and Escape", async () => {
    const trigger = await renderHint();

    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await act(async () => trigger.click());
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes when the user activates outside the disclosure", async () => {
    const trigger = await renderHint();
    const outside = document.createElement("button");
    document.body.appendChild(outside);

    await act(async () => trigger.click());
    await act(async () => {
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      outside.click();
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    outside.remove();
  });

  it("provides a named disclosure and a minimum 32px target", async () => {
    const trigger = await renderHint();

    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.type).toBe("button");
    expect(trigger.className).toContain("min-h-8");
    expect(trigger.className).toContain("min-w-8");

    await act(async () => trigger.click());
    expect(document.querySelector('[aria-label="About refundable credit details"]')).not.toBeNull();
  });
});
