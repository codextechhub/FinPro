// GR/IR's control figures come from the general ledger, which has no branch, so the
// backend sends null for them to a branch-bound reader rather than compare an
// entity-wide balance against a branch-only receipt walk.
//
// The screen used to read both through `kobo()`, which turns null into 0 - and 0 in the
// Difference card renders a green "Reconciled". A branch reader was shown a clean bill
// of health on a number nobody computed, which is exactly the failure the backend
// withheld them to avoid. These tests hold that shut, and cover the excluded-documents
// count that says the figures beside it are a subset.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ aging: vi.fn(), lines: vi.fn(), detail: vi.fn() }));

vi.mock("@/redux/services/procurement/procurement-ext-api", () => ({
  useGetGrirAgingQuery: (...args: unknown[]) => mocks.aging(...args),
  useGetGrirPoLinesQuery: (...args: unknown[]) => mocks.lines(...args),
  useGetGrirPoLineDetailQuery: (...args: unknown[]) => mocks.detail(...args),
}));

import GrirScreen from "./grir";
import type { GrirAging } from "@/redux/services/procurement/procurement-ext-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: (kobo / 100).toFixed(2) });

function aging(over: Partial<GrirAging> = {}): GrirAging {
  return {
    entity: "CODEX",
    as_of: "2026-08-16",
    buckets: ["current", "1-30"],
    rows: [
      {
        grn_id: 1, reference: "GRN-001", vendor_code: "V1", vendor_name: "Acme",
        received_date: "2026-08-01", days: 15, bucket: "1-30",
        received_value: money(500000), invoiced_value: money(0), open_value: money(500000),
      },
    ],
    bucket_totals: { current: money(0), "1-30": money(500000) },
    total_open: money(500000),
    control_balance: money(500000),
    difference: money(0),
    ...over,
  };
}

const query = (data: GrirAging) => ({
  data: { data }, isLoading: false, isError: false, error: undefined, refetch: vi.fn(),
});

describe("GR/IR control figures a branch reader is not shown", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.lines.mockReturnValue({
      data: { data: { rows: [] } }, isLoading: false, isError: false, error: undefined, refetch: vi.fn(),
    });
    mocks.detail.mockReturnValue({
      data: undefined, isLoading: false, isError: false, error: undefined, refetch: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const render = (report: GrirAging) => {
    mocks.aging.mockReturnValue(query(report));
    act(() => {
      root.render(<GrirScreen entity="CODEX" currency="NGN" />);
    });
    return container.textContent ?? "";
  };

  it("never badges a withheld difference as reconciled", () => {
    const text = render(aging({ control_balance: null, difference: null }));
    expect(text).not.toContain("Reconciled");
    expect(text).not.toContain("Variance to investigate");
  });

  it("shows the withheld figures as not shown, not as zero", () => {
    const text = render(aging({ control_balance: null, difference: null }));
    // Two cards, both saying the figure is absent rather than printing a made-up total.
    expect(text.match(/Not shown/g)).toHaveLength(2);
  });

  it("says why the figures are missing, in the reader's terms", () => {
    const text = render(aging({ control_balance: null, difference: null }));
    expect(text).toContain("not kept per branch");
    expect(text).toContain("You are viewing one branch");
  });

  it("still reconciles for an unbound reader whose difference really is zero", () => {
    const text = render(aging());
    expect(text).toContain("Reconciled");
    expect(text).not.toContain("Not shown");
  });

  it("still flags a real variance for an unbound reader", () => {
    const text = render(aging({ difference: money(-25000) }));
    expect(text).toContain("Variance to investigate");
  });

  it("names the entity-level receipts a branch reader's figures leave out", () => {
    const text = render(aging({ unassigned_excluded_count: 2 }));
    expect(text).toContain("2 goods receipts");
    expect(text).toContain("not included in these figures");
  });

  it("carries no scope caveat for an unbound reader", () => {
    const text = render(aging());
    expect(text).not.toContain("goods receipts sit at entity level");
    expect(text).not.toContain("You are viewing one branch");
  });
});
