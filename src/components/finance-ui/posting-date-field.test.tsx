/**
 * The posting date field names the earliest allowed day in the school's date style.
 *
 * Bright Star writes dates day first. Tunde's invoice is dated 5 Sep 2026, so a
 * credit note for it cannot be dated earlier, and the field says "05/09/2026",
 * never the "2026-09-05" the picker holds underneath. The same goes for the two
 * errors that name that day.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  window: undefined as unknown,
}));

vi.mock("./use-posting-window", () => ({ usePostingWindow: () => mocks.window }));
vi.mock("@/components/ui/date-picker-input", () => ({
  DatePickerInput: ({ value }: { value: string }) => <input aria-label="picker" value={value} readOnly />,
}));

import { PostingDateField } from "./posting-date-field";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A store whose state is one fixed object, as useSyncExternalStore requires. */
const store = (dateFormat: string) => {
  const state = { auth: { tenant: { display: { date_format: dateFormat } } } };
  return { getState: () => state, subscribe: () => () => {}, dispatch: () => undefined } as never;
};

const open = (over: Record<string, unknown> = {}) => ({
  ranges: [{ from: "2026-09-01", to: "2026-12-31" }], defaultDate: "2026-09-10", constrained: true, noOpenPeriod: false,
  label: "Sep 2026 – Dec 2026", reasonFor: () => null, isLoading: false, ...over,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.window = open();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

function render(props: Record<string, unknown>, dateFormat = "DD_MM_YYYY") {
  act(() => root.render(
    <Provider store={store(dateFormat)}>
      <PostingDateField label="Credit note date" entity="BSS" onChange={vi.fn()} {...({ value: "2026-09-10", ...props } as { value: string })} />
    </Provider>,
  ));
}

describe("the earliest day the field names", () => {
  it("is the floor in the school's date style when nothing is wrong", () => {
    render({ notBefore: "2026-09-05", notBeforeLabel: "invoice INV-104" });
    expect(container.textContent).toContain("On or after 05/09/2026 - invoice INV-104");
    expect(container.textContent).not.toContain("2026-09-05");
  });

  it("is the floor in the school's date style when the chosen date is too early", () => {
    render({ value: "2026-09-01", notBefore: "2026-09-05", notBeforeLabel: "invoice INV-104" });
    expect(container.textContent).toContain("invoice INV-104 only exists from 05/09/2026. Pick 05/09/2026 or later.");
    expect(container.textContent).not.toContain("2026-09-05");
  });

  it("is the floor in the school's date style when no open period reaches it", () => {
    mocks.window = open({ ranges: [] });
    render({ notBefore: "2027-02-05" });
    expect(container.textContent).toContain("No open period falls on or after 05/02/2027");
    expect(container.textContent).not.toContain("2027-02-05");
  });

  it("follows the school's other styles too", () => {
    render({ notBefore: "2026-09-05" }, "D_MMM_YYYY");
    expect(container.textContent).toContain("On or after 5 Sep 2026");
  });

  it("leaves the picker's own value in ISO, which is what the form sends", () => {
    render({ notBefore: "2026-09-05" });
    expect((container.querySelector('input[aria-label="picker"]') as HTMLInputElement).value).toBe("2026-09-10");
  });
});
