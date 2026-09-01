import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  continueWithoutApproval: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/redux/services/dashboard/workflow-api", () => ({
  useContinueWithoutApprovalMutation: () => [
    mocks.continueWithoutApproval,
    { isLoading: false },
  ],
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: vi.fn() },
}));

import { useNoApproverPrompt } from "./no-approver-prompt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PARKED_APPROVAL = {
  parked: true,
  instance_id: "12608223",
  stage_label: "Finance approval",
  requirement: "assign an eligible finance approver",
};

function Harness() {
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({
    documentLabel: "refund",
  });

  return (
    <>
      <button type="button" onClick={() => promptIfParked(PARKED_APPROVAL)}>
        Show parked refund
      </button>
      {noApproverDialog}
    </>
  );
}

describe("useNoApproverPrompt", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.continueWithoutApproval.mockReturnValue({
      unwrap: () => Promise.resolve(),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  const button = (label: string) =>
    Array.from(document.body.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === label);

  const openDialog = () => {
    act(() => root.render(<Harness />));
    act(() => button("Show parked refund")?.click());
  };

  it("waits for the confirmation to close before announcing the approved refund", async () => {
    openDialog();

    expect(document.body.textContent).toContain("Nobody can approve this");
    await act(async () => button("Continue anyway")?.click());

    expect(mocks.continueWithoutApproval).toHaveBeenCalledWith({ id: "12608223" });
    expect(mocks.success).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(250));

    expect(document.body.textContent).not.toContain("Nobody can approve this");
    expect(mocks.success).toHaveBeenCalledWith(
      "Continued without approval. This refund has been recorded as approved.",
    );
  });
});
