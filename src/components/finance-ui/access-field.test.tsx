/**
 * The form-field wrapper is how every screen obeys Field Access, so its three
 * behaviours are the contract:
 *
 *   1. a hidden field renders nothing at all: no label, no lock, no placeholder;
 *   2. a read-only field is shown, greyed and disabled, and a form building its
 *      body through `writableOnly` never sends it;
 *   3. a refused save shows its message under the field it names;
 *   4. on an Add form a field open on create is offered for editing even where
 *      the user may not read it on an existing record.
 */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AccessField } from "./access-field";
import { resolveFieldAccess, type FieldAccess } from "./field-access";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RESOURCE = "finance.bankaccount";

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

function render(node: React.ReactNode) {
  act(() => root.render(node));
}

describe("AccessField", () => {
  it("renders nothing for a hidden field", () => {
    const access = resolveFieldAccess({ [RESOURCE]: { hidden: ["account_number"] } }, RESOURCE);
    render(<AccessField access={access} name="account_number" label="Account number"><input /></AccessField>);
    expect(container.innerHTML).toBe("");
    expect(container.textContent).not.toContain("Account number");
  });

  it("shows a read-only field greyed with its control disabled", () => {
    const access = resolveFieldAccess({ [RESOURCE]: { read_only: ["account_number"] } }, RESOURCE, { account_number: "0123" });
    render(<AccessField access={access} name="account_number" label="Account number"><input defaultValue="0123" /></AccessField>);
    const fieldset = container.querySelector("fieldset")!;
    expect(container.textContent).toContain("Account number");
    expect(fieldset.disabled).toBe(true);
    expect(fieldset.getAttribute("data-read-only")).toBe("true");
    expect(fieldset.className).toContain("opacity-60");
    // A disabled fieldset disables every control inside it, native pickers included.
    expect(fieldset.contains(container.querySelector("input"))).toBe(true);
  });

  it("tells a render-prop child the field is read-only", () => {
    const access = resolveFieldAccess({ [RESOURCE]: { read_only: ["account_number"] } }, RESOURCE, { account_number: "0123" });
    render(<AccessField access={access} name="account_number">{({ readOnly }) => <input disabled={readOnly} />}</AccessField>);
    expect(container.querySelector("input")!.disabled).toBe(true);
  });

  it("leaves an open field enabled", () => {
    const access = resolveFieldAccess({}, RESOURCE);
    render(<AccessField access={access} name="account_number" label="Account number"><input /></AccessField>);
    expect(container.querySelector("fieldset")!.disabled).toBe(false);
    expect(container.querySelector("fieldset")!.hasAttribute("data-read-only")).toBe(false);
  });

  it("renders an editable input for a hidden, open-on-create field when creating", () => {
    const map = { [RESOURCE]: { hidden: ["account_number"], open_on_create: ["account_number"] } };
    render(<AccessField access={resolveFieldAccess(map, RESOURCE)} name="account_number" label="Account number" creating><input /></AccessField>);
    const fieldset = container.querySelector("fieldset")!;
    expect(container.textContent).toContain("Account number");
    expect(fieldset.disabled).toBe(false);
    expect(fieldset.hasAttribute("data-read-only")).toBe(false);
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("renders nothing for the same field on an existing record", () => {
    const map = { [RESOURCE]: { hidden: ["account_number"], open_on_create: ["account_number"] } };
    render(<AccessField access={resolveFieldAccess(map, RESOURCE, { name: "Ops" })} name="account_number" label="Account number"><input /></AccessField>);
    expect(container.innerHTML).toBe("");
  });

  it("shows the refusal message under the field it names, and only there", () => {
    const access = resolveFieldAccess({}, RESOURCE);
    render(<>
      <AccessField access={access} name="account_number" label="Account number" errors={{ account_number: "You do not have permission to change this field." }}><input /></AccessField>
      <AccessField access={access} name="bank_name" label="Bank" errors={{ account_number: "You do not have permission to change this field." }}><input /></AccessField>
    </>);
    const alerts = container.querySelectorAll("[role=alert]");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].closest("fieldset")!.getAttribute("data-field")).toBe("account_number");
  });

  it("never lets a form send a read-only field", () => {
    const access = resolveFieldAccess({ [RESOURCE]: { read_only: ["account_number"] } }, RESOURCE, { account_number: "0123", name: "Ops" });
    const sent: object[] = [];
    function Form({ fields }: { fields: FieldAccess }) {
      const [name, setName] = useState("Ops");
      const [number] = useState("0123");
      return (
        <form onSubmit={(event) => { event.preventDefault(); sent.push(fields.writableOnly({ name, account_number: number })); }}>
          <input aria-label="name" value={name} onChange={(event) => setName(event.target.value)} />
          <AccessField access={fields} name="account_number" label="Account number"><input value={number} readOnly /></AccessField>
          <button type="submit">Save</button>
        </form>
      );
    }
    render(<Form fields={access} />);
    act(() => container.querySelector<HTMLButtonElement>("button[type=submit]")!.click());
    expect(sent).toEqual([{ name: "Ops" }]);
  });
});
