import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VendorGovernanceFields } from "./vendor-governance-fields";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mount(canManage: boolean) {
  await act(async () => {
    root.render(
      <VendorGovernanceFields
        canManage={canManage}
        kyc="VERIFIED"
        risk="LOW"
        onHold={false}
        onKycChange={vi.fn()}
        onRiskChange={vi.fn()}
        onHoldChange={vi.fn()}
      />,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("VendorGovernanceFields", () => {
  it("does not expose protected controls to an ordinary updater", async () => {
    await mount(false);

    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).toContain("require vendor governance access");
  });

  it("exposes KYC, risk and hold controls to a vendor manager", async () => {
    await mount(true);

    expect(container.querySelectorAll("select")).toHaveLength(2);
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(container.textContent).toContain("KYC status");
    expect(container.textContent).toContain("Risk");
    expect(container.textContent).toContain("On hold");
  });
});
