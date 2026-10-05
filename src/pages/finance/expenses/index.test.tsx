/**
 * A bursar at Holy Cross whose role holds no petty cash key types the Petty
 * Cash address. She is told her role cannot view petty cash, not shown "No
 * petty-cash floats" with an invitation to establish the first one. Expense
 * Claims follows its own key the same way.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ held: new Set<string>() }));

vi.mock("../finance-shell", () => ({ FinanceShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/layout/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveEntity: () => ({ code: "HOLYCROSS", currency: "NGN" }),
  InfoHint: () => null,
}));
vi.mock("@/components/finance-ui/can", () => ({
  useCan: () => ({ can: (code: string) => mocks.held.has(code) }),
}));
vi.mock("./petty-cash-tab", () => ({ PettyCashTab: () => <p>petty cash workbench</p> }));
vi.mock("./expense-claims-tab", () => ({ ExpenseClaimsTab: () => <p>claims list</p> }));

import { P } from "../../../permissions";
import ExpensesPage from "./index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.held = new Set();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("expenses page access", () => {
  it("tells a reader without the petty cash key that their role cannot view it", () => {
    act(() => root.render(<ExpensesPage section="petty-cash" />));
    expect(container.textContent).toContain("Your role can't view petty cash.");
    expect(container.textContent).not.toContain("petty cash workbench");
  });

  it("opens each section for a holder of its key", () => {
    mocks.held = new Set([P.FIN_VIEW_PETTY_CASH]);
    act(() => root.render(<ExpensesPage section="petty-cash" />));
    expect(container.textContent).toContain("petty cash workbench");
    act(() => root.render(<ExpensesPage section="claims" />));
    expect(container.textContent).toContain("Your role can't view expense claims.");
    mocks.held = new Set([P.FIN_VIEW_EXPENSE_CLAIMS]);
    act(() => root.render(<ExpensesPage section="claims" />));
    expect(container.textContent).toContain("claims list");
  });
});
