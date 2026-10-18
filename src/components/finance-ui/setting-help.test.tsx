/**
 * The settings pieces keep one promise: a setting shows its name, its control
 * and the service that reads it, and every explanation waits behind its ⓘ.
 *
 * Mrs Bello, the bursar at Bright Star School, opens Fiscal calendar. She sees
 * "Days ahead", a number box and "Used by Fiscal calendar rollover". The range
 * and the server's sentence about what the number changes appear only when she
 * opens the ⓘ, and once each, never twice. A colleague who may only read the
 * setting can still open the ⓘ on the greyed field; a colleague who may not
 * see it at all gets no field and no ⓘ.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccessField } from "./access-field";
import { resolveFieldAccess } from "./field-access";
import { HintedPanel, HintedRow, SettingField, SettingHint, SettingToggle, UsedBy } from "./setting-help";

vi.mock("@/components/settings/settings-layout", () => ({
  SettingsPanel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RESOURCE = "finance.settings";
const LEAD = {
  service: "Fiscal calendar rollover",
  impact: "Sets how many days before the calendar ends the next year is opened or the warning starts.",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (node: React.ReactNode) => act(() => root.render(node));
const hint = (label: string) => container.querySelector<HTMLElement>(`[aria-label="About ${label}"]`);
const open = (label: string) => act(() => { hint(label)!.click(); });
const page = () => document.body.textContent ?? "";
const count = (text: string, needle: string) => text.split(needle).length - 1;

const daysAhead = () => (
  <SettingField label="Days ahead" hint="A whole number from 7 to 180." consumer={LEAD}>
    {(id) => <input id={id} type="number" defaultValue={30} />}
  </SettingField>
);

describe("SettingField", () => {
  it("shows the name, the control and the chip, and keeps the explanation behind the ⓘ", () => {
    render(daysAhead());
    expect(container.textContent).toContain("Days ahead");
    expect(container.textContent).toContain("Used by Fiscal calendar rollover");
    expect(page()).not.toContain("A whole number from 7 to 180.");
    expect(page()).not.toContain(LEAD.impact);
  });

  it("opens to the field's own words, then what a change does, each once", () => {
    render(daysAhead());
    open("Days ahead");
    const text = page();
    expect(text).toContain("A whole number from 7 to 180.");
    expect(text).toContain(`What it changes: ${LEAD.impact}`);
    expect(count(text, LEAD.impact)).toBe(1);
  });

  it("names the control by its label without the label wrapping the ⓘ", () => {
    render(daysAhead());
    const label = container.querySelector("label")!;
    const input = container.querySelector("input")!;
    expect(label.htmlFor).toBe(input.id);
    expect(input.labels?.[0]).toBe(label);
    expect(label.contains(hint("Days ahead"))).toBe(false);
  });

  it("keeps the ⓘ openable on a read-only field, with the control disabled", () => {
    const access = resolveFieldAccess({ [RESOURCE]: { read_only: ["next_year_lead_days"] } }, RESOURCE, { next_year_lead_days: 30 });
    render(<AccessField access={access} name="next_year_lead_days">{daysAhead()}</AccessField>);
    const fieldset = container.querySelector("fieldset")!;
    expect(fieldset.disabled).toBe(true);
    expect(fieldset.contains(container.querySelector("input"))).toBe(true);
    expect(hint("Days ahead")!.tagName).toBe("SPAN");
    open("Days ahead");
    expect(page()).toContain("A whole number from 7 to 180.");
  });

  it("takes its ⓘ and its chip with it when the field is hidden", () => {
    const access = resolveFieldAccess({ [RESOURCE]: { hidden: ["next_year_lead_days"] } }, RESOURCE);
    render(<AccessField access={access} name="next_year_lead_days">{daysAhead()}</AccessField>);
    expect(container.innerHTML).toBe("");
    expect(hint("Days ahead")).toBeNull();
  });
});

describe("SettingHint", () => {
  it("renders nothing with neither an explanation nor a consumer sentence", () => {
    render(<SettingHint label="Days ahead" consumer={{ service: "Fiscal calendar rollover", impact: " " }} />);
    expect(container.innerHTML).toBe("");
  });

  it("opens to the consumer sentence alone when the field has no words of its own", () => {
    render(<SettingHint label="Default receipt allocation" consumer={{ service: "Receipt allocation", impact: "Orders invoices when a receipt is allocated without an explicit user choice." }} />);
    open("Default receipt allocation");
    expect(page()).toContain("What it changes: Orders invoices when a receipt is allocated");
  });
});

describe("UsedBy", () => {
  it("names the service and never repeats its sentence", () => {
    render(<UsedBy consumer={LEAD} />);
    expect(container.textContent).toBe("Used by Fiscal calendar rollover");
  });

  it("renders nothing without a consumer", () => {
    render(<UsedBy consumer={undefined} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("SettingToggle", () => {
  it("names the switch, shows its default and chip, and keeps its explanation behind the ⓘ", () => {
    const change = vi.fn();
    render(
      <SettingToggle
        label="Close months in order"
        suffix="(default)"
        hint="January cannot close while December of the year before is still open."
        consumer={{ service: "Period close and reopen", impact: "When on, a month closes only once every earlier month is closed." }}
        checked
        onCheckedChange={change}
        disabled={false}
      />,
    );
    expect(container.textContent).toContain("Close months in order(default)");
    expect(container.textContent).toContain("Used by Period close and reopen");
    expect(page()).not.toContain("January cannot close");
    expect(container.querySelector('[aria-label="Close months in order"]')!.getAttribute("aria-checked")).toBe("true");
    open("Close months in order");
    expect(page()).toContain("January cannot close");
    expect(page()).toContain("What it changes: When on, a month closes");
  });
});

describe("HintedPanel and HintedRow", () => {
  it("shows the panel title and the row's name and value, each explanation behind its ⓘ", () => {
    render(
      <HintedPanel title="Record keeping" hint="A kept record cannot be deleted.">
        <HintedRow label="Statutory floor" hint="Set by CodeX for every school." value="7 years" />
      </HintedPanel>,
    );
    expect(container.querySelector("h3")!.textContent).toBe("Record keeping");
    expect(container.textContent).toContain("Statutory floor");
    expect(container.textContent).toContain("7 years");
    expect(page()).not.toContain("A kept record cannot be deleted.");
    expect(page()).not.toContain("Set by CodeX for every school.");
    open("Record keeping");
    expect(page()).toContain("A kept record cannot be deleted.");
    open("Statutory floor");
    expect(page()).toContain("Set by CodeX for every school.");
  });

  it("joins a single setting's consumer sentence to the panel's ⓘ", () => {
    render(
      <HintedPanel title="Doubtful debts" hint="Each band applies to older balances." consumer={{ service: "Doubtful-debt provision", impact: "Sets the share of each overdue balance the allowance must cover, by age." }}>
        <p>bands</p>
      </HintedPanel>,
    );
    open("Doubtful debts");
    expect(page()).toContain("Each band applies to older balances.");
    expect(page()).toContain("What it changes: Sets the share of each overdue balance");
  });
});
