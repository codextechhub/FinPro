import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveFieldAccess, type FieldAccessMap } from "../../../components/finance-ui/field-access";
import { VendorGovernanceFields } from "./vendor-governance-fields";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const VENDOR = "procurement.vendor";

async function mount(canManage: boolean, map: FieldAccessMap = {}) {
  await act(async () => {
    root.render(
      <VendorGovernanceFields
        canManage={canManage}
        access={resolveFieldAccess(map, VENDOR)}
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

  it("leaves out a value the role may not read, and its label", async () => {
    await mount(true, { [VENDOR]: { hidden: ["risk", "on_hold"] } });

    expect(container.querySelectorAll("select")).toHaveLength(1);
    expect(container.textContent).toContain("KYC status");
    expect(container.textContent).not.toContain("Risk");
    expect(container.textContent).not.toContain("On hold");
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("greys a value the role may read but not change", async () => {
    await mount(true, { [VENDOR]: { read_only: ["kyc_status", "on_hold"] } });

    const fieldset = (name: string) => container.querySelector<HTMLFieldSetElement>(`fieldset[data-field=${name}]`)!;
    expect(fieldset("kyc_status").disabled).toBe(true);
    expect(fieldset("on_hold").disabled).toBe(true);
    expect(fieldset("risk").disabled).toBe(false);
  });

  it("shows nothing at all when every compliance value is hidden", async () => {
    await mount(true, { [VENDOR]: { hidden: ["kyc_status", "risk", "on_hold"] } });
    expect(container.textContent).toBe("");

    await mount(false, { [VENDOR]: { hidden: ["kyc_status", "risk", "on_hold"] } });
    expect(container.textContent).toBe("");
  });

  it("shows a refusal under the value it names", async () => {
    await act(async () => {
      root.render(
        <VendorGovernanceFields
          canManage access={resolveFieldAccess({}, VENDOR)} errors={{ risk: "You do not have permission to change this field." }}
          kyc="VERIFIED" risk="LOW" onHold={false} onKycChange={vi.fn()} onRiskChange={vi.fn()} onHoldChange={vi.fn()}
        />,
      );
    });
    expect(container.querySelector("fieldset[data-field=risk] [role=alert]")?.textContent).toBe("You do not have permission to change this field.");
    expect(container.querySelector("fieldset[data-field=kyc_status] [role=alert]")).toBeNull();
  });
});
