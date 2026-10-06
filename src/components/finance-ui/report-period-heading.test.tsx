/**
 * Which stretch of time a report covers, as its heading reads.
 *
 * Mrs Bello opens the trial balance for September: the server names the period
 * "September 2026" and that is the heading, never the stored name "2026-09".
 * With no period the report covers everything and the heading says so in the
 * picker's own words.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReportPeriodHeading } from "./report-period-heading";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const heading = () => container.querySelector("h3")?.textContent;

describe("the report period heading", () => {
  it("shows the server's words for the period", () => {
    act(() => root.render(<ReportPeriodHeading label="September 2026" fallback="All periods" />));
    expect(heading()).toBe("September 2026");
  });

  it("shows the fallback when the report covers every period", () => {
    act(() => root.render(<ReportPeriodHeading label={null} fallback="Year to date" />));
    expect(heading()).toBe("Year to date");
  });
});
