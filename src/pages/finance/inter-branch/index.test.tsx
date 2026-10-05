/**
 * Holy Cross runs Main and Annex. Mr Okoro, a bursar whose role holds no
 * inter-branch key, types the Transfers address: he is told his role cannot
 * view it, and no list is asked for. Mrs Bello, who holds the key, gets the
 * register. Held Receipts follows the payments view key, as its menu entry does.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ keys: { view: true }, payments: true }));

vi.mock("../finance-shell", () => ({ FinanceShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/layout/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveEntity: () => ({ code: "HOLYCROSS", currency: "NGN" }),
  InfoHint: () => null,
}));
vi.mock("@/components/finance-ui/can", () => ({
  useCan: () => ({ can: () => mocks.payments }),
}));
vi.mock("./use-inter-branch", () => ({
  useInterBranchReader: () => ({ applies: true, isLoading: false, keys: mocks.keys }),
}));
vi.mock("./transfers-tab", () => ({ TransfersTab: () => <p>transfer register</p> }));
vi.mock("./held-receipts-tab", () => ({ HeldReceiptsTab: () => <p>held receipts list</p> }));
vi.mock("./balances-tab", () => ({ BalancesTab: () => null }));
vi.mock("./recharges-tab", () => ({ RechargesTab: () => null }));
vi.mock("./cost-rules-tab", () => ({ CostRulesTab: () => null }));

import InterBranchPage from "./index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.keys = { view: true };
  mocks.payments = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("inter-branch page access", () => {
  it("tells a reader without the view key that their role cannot view it", () => {
    mocks.keys = { view: false };
    act(() => root.render(<InterBranchPage section="transfers" />));
    expect(container.textContent).toContain("Your role can't view inter-branch transfers.");
    expect(container.textContent).not.toContain("transfer register");
  });

  it("shows the register to a holder of the key", () => {
    act(() => root.render(<InterBranchPage section="transfers" />));
    expect(container.textContent).toContain("transfer register");
  });

  it("gates Held Receipts on the payments view key", () => {
    mocks.keys = { view: false };
    act(() => root.render(<InterBranchPage section="held-receipts" />));
    expect(container.textContent).toContain("held receipts list");
    mocks.payments = false;
    act(() => root.render(<InterBranchPage section="held-receipts" />));
    expect(container.textContent).toContain("Your role can't view held receipts.");
  });
});
