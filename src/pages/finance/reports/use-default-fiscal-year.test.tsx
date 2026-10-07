/**
 * The default window's year is remembered while another window is picked.
 *
 * Bright Star opens its income statement in 2026 and the first choice reads
 * "This fiscal year (FY2026)". Mrs Bello picks FY2025: the answer now names
 * 2025, but the first choice must still say 2026, the year it returns to.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useDefaultFiscalYear } from "./use-default-fiscal-year";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

function Probe(props: { onDefault: boolean; year: number | null; settled: boolean }) {
  return <span>{String(useDefaultFiscalYear(props.onDefault, props.year, props.settled))}</span>;
}
const show = (props: { onDefault: boolean; year: number | null; settled: boolean }) => {
  act(() => root.render(<Probe {...props} />));
  return container.textContent;
};

describe("the default window's fiscal year", () => {
  it("is the year the default window's answer names", () => {
    expect(show({ onDefault: true, year: 2026, settled: true })).toBe("2026");
  });

  it("stays while another year is picked, and follows a new default answer", () => {
    show({ onDefault: true, year: 2026, settled: true });
    expect(show({ onDefault: false, year: 2025, settled: true })).toBe("2026");
    expect(show({ onDefault: true, year: 2027, settled: true })).toBe("2027");
  });

  it("ignores an answer still loading, which may belong to the previous window", () => {
    show({ onDefault: true, year: 2026, settled: true });
    expect(show({ onDefault: true, year: 2025, settled: false })).toBe("2026");
  });

  it("is null for a school with no fiscal year", () => {
    expect(show({ onDefault: true, year: null, settled: true })).toBe("null");
  });
});
