/**
 * Ikeja sends Lekki ₦1,000,000 nobody asked for, and the bursar sends it back
 * to Mrs Bello to add the purpose. Its stage reads "Sent back", not
 * "Requested": nobody requested it, and it waits on her. A send still with its
 * approver keeps "Waiting for approval".
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StagePill } from "./parts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("StagePill", () => {
  it("reads Sent back on an unasked send an approver sent back", () => {
    act(() => root.render(<StagePill transfer={{ kind: "CASH", stage: "REQUESTED", status: "DRAFT", approval_state: "PENDING", approval_returned: true }} />));
    expect(container.textContent).toBe("Sent back");
  });

  it("keeps its stage otherwise", () => {
    act(() => root.render(<StagePill transfer={{ kind: "CASH", stage: "PENDING_APPROVAL", status: "PENDING_APPROVAL", approval_state: "PENDING", approval_returned: false }} />));
    expect(container.textContent).toBe("Waiting for approval");
  });
});
