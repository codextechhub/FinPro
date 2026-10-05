/**
 * "Show archived years": offered only where the school has archived a year, kept
 * in the page address, and turned into `include_archived=true` on the reads.
 * Bright Star archived FY2027 in 2030; Sunrise Academy has archived nothing and
 * is offered no switch.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ years: [] as unknown[] }));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFiscalYearsQuery: () => ({ data: { data: mocks.years }, isLoading: false }),
}));

import { ShowArchivedToggle, archivedYearsLabel, includeArchivedArg } from "./archived-years";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.years = [];
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const mount = async (search = "") => act(async () => root.render(
  <MemoryRouter initialEntries={[`/finance/ledger${search}`]}><ShowArchivedToggle entity="BRIGHTSTAR" /></MemoryRouter>,
));

describe("Show archived years", () => {
  it("adds include_archived only when the switch is on", () => {
    expect(includeArchivedArg(false)).toEqual({});
    expect(includeArchivedArg(true)).toEqual({ include_archived: "true" });
  });

  it("names the archived years as a reader would", () => {
    expect(archivedYearsLabel([{ year: 2027 }])).toBe("FY 2027");
    expect(archivedYearsLabel([{ year: 2028 }, { year: 2027 }])).toBe("FY 2028 and FY 2027");
  });

  it("is absent at a school that has archived nothing", async () => {
    mocks.years = [{ id: 1, year: 2030, start_date: "2030-01-01", end_date: "2030-12-31", status: "OPEN", is_archived: false }];
    await mount();

    expect(container.textContent).toBe("");
  });

  it("is offered where a year is archived, and reads its state from the page address", async () => {
    mocks.years = [{ id: 1, year: 2027, start_date: "2027-01-01", end_date: "2027-12-31", status: "CLOSED", is_archived: true }];
    await mount("?archived=1");

    const box = container.querySelector<HTMLInputElement>("input[type='checkbox']");
    expect(container.textContent).toContain("Show archived years");
    expect(box?.checked).toBe(true);
  });
});
