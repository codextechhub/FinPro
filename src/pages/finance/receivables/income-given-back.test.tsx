/**
 * Lekki credits N64,500 of Tunde's textbook bill, which Ikeja raised before he
 * moved. The credit note names Ikeja's give-back and links to its transfer.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { IncomeGivenBack, incomeGivenBackLine } from "./income-given-back";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW = { id: 12, document_number: "IBT-0012", to_branch_id: 1, to_branch_name: "Ikeja Branch", amount: 6_450_000, status: "POSTED" };
const naira = (kobo: number) => `N${(kobo / 100).toLocaleString("en-NG")}`;

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

describe("income given back", () => {
  it("names the branch giving it back and the amount", () => {
    expect(incomeGivenBackLine(ROW, naira)).toBe("Ikeja Branch gives back N64,500 of income it booked");
    expect(incomeGivenBackLine({ ...ROW, status: "REVERSED" }, naira)).toContain("(reversed with this document)");
  });

  it("links each give-back to its transfer in the register", () => {
    act(() => root.render(<MemoryRouter><IncomeGivenBack rows={[ROW]} currency="NGN" /></MemoryRouter>));
    const link = container.querySelector("a");
    expect(link?.textContent).toContain("IBT-0012");
    expect(link?.getAttribute("href")).toBe("/finance/inter-branch/transfers?document=12");
  });

  it("renders nothing for a document that touched no other branch", () => {
    act(() => root.render(<MemoryRouter><IncomeGivenBack rows={[]} /></MemoryRouter>));
    expect(container.textContent).toBe("");
  });
});
