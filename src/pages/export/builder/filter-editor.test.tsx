/**
 * Money filters take naira.
 *
 * A bursar at Bright Star looking for invoices over ₦50,000 types 50000 into
 * "Total: At least". The catalogue marks that filter `money`, so the builder
 * labels it in naira, sends exactly what was typed, as a string, and the
 * server converts it to kobo. An amount with three decimal places is called
 * out while typing. A number filter that is not money is unchanged: it still
 * sends a number.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatasetFilter, FilterSpec } from "@/redux/services/dashboard/exports-types";
import { FilterEditor } from "./filter-editor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TOTAL: DatasetFilter = {
  id: "total",
  label: "Total",
  type: "number_range",
  required: false,
  choices: [],
  description: "Enter amounts in naira, e.g. 50000 for ₦50,000.00.",
  is_primary_date: false,
  money: true,
};

const QUANTITY: DatasetFilter = { ...TOTAL, id: "quantity", label: "Quantity", description: "", money: false };

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

async function mount(filters: DatasetFilter[], value: FilterSpec[], onChange = vi.fn()) {
  await act(async () => {
    root.render(<FilterEditor filters={filters} value={value} onChange={onChange} />);
  });
  return onChange;
}

async function typeInto(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const field = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

describe("a money filter", () => {
  it("is labelled in naira and shows the naira hint", async () => {
    await mount([TOTAL], [{ id: "total" }]);
    expect(container.textContent).toContain("At least (₦)");
    expect(container.textContent).toContain("Enter amounts in naira, e.g. 50000 for ₦50,000.00.");
    expect(container.textContent).not.toMatch(/kobo|hundredths/i);
  });

  it("sends the naira typed, as a string, never through Number()", async () => {
    const onChange = await mount([TOTAL], [{ id: "total" }]);
    await typeInto(field("Total at least, in naira"), "50000.10");
    expect(onChange).toHaveBeenLastCalledWith([{ id: "total", min: "50000.10" }]);
  });

  it("clears a bound when the box is emptied", async () => {
    const onChange = await mount([TOTAL], [{ id: "total", min: "50000", max: "90000" }]);
    await typeInto(field("Total at most, in naira"), "");
    expect(onChange).toHaveBeenLastCalledWith([{ id: "total", min: "50000", max: undefined }]);
  });

  it("shows a saved bound, whether it came back as a number or a string", async () => {
    await mount([TOTAL], [{ id: "total", min: 50000, max: "75000.50" }]);
    expect(field("Total at least, in naira").value).toBe("50000");
    expect(field("Total at most, in naira").value).toBe("75000.50");
  });

  it("calls out more than two decimal places while typing", async () => {
    await mount([TOTAL], [{ id: "total", min: "50000.505" }]);
    expect(container.textContent).toContain("Use at most two digits after the decimal point.");
    expect(field("Total at least, in naira").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("a number filter that is not money", () => {
  it("still sends a number", async () => {
    const onChange = await mount([QUANTITY], [{ id: "quantity" }]);
    const input = container.querySelector<HTMLInputElement>('input[type="number"]')!;
    await typeInto(input, "12");
    expect(onChange).toHaveBeenLastCalledWith([{ id: "quantity", min: 12 }]);
    expect(container.textContent).not.toContain("(₦)");
  });
});
