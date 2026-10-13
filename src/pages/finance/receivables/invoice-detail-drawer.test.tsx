/**
 * The deferred income note on an invoice.
 *
 * Tunde's N400,000 first-term bill was raised in August: N300,000 of it still
 * waits to be released and N100,000 has been released to revenue. Each figure
 * is a `finance.deferredincome` field, so a role that may not read one is sent
 * the block without it and the note carries the other alone; with neither
 * there is no note at all.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: {} as Record<string, unknown> }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: mocks.access,
  }),
}));

import { DeferredIncomeNote } from "./invoice-detail-drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: String(kobo / 100) });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.access = {};
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const show = (block: Parameters<typeof DeferredIncomeNote>[0]["block"]) => {
  act(() => root.render(<DeferredIncomeNote block={block} currency="NGN" />));
  return container.textContent ?? "";
};

describe("the deferred income note on an invoice", () => {
  it("states both figures when both may be read", () => {
    const text = show({ pending: money(300_000_00), released: money(100_000_00) });
    expect(text).toContain("Deferred income:");
    expect(text).toContain("still to be released,");
    expect(text).toContain("released to revenue.");
    expect(text).toContain("300,000.00");
    expect(text).toContain("100,000.00");
  });

  it("carries the waiting figure alone when the released figure is hidden", () => {
    mocks.access = { "finance.deferredincome": { hidden: ["released"] } };
    const text = show({ pending: money(300_000_00) });
    expect(text).toContain("300,000.00");
    expect(text).toContain("still to be released.");
    expect(text).not.toContain("released to revenue");
  });

  it("carries the released figure alone when the waiting figure is hidden", () => {
    mocks.access = { "finance.deferredincome": { hidden: ["pending"] } };
    const text = show({ released: money(100_000_00) });
    expect(text).toContain("100,000.00 released to revenue.");
    expect(text).not.toContain("still to be released");
  });

  it("shows no note when neither figure may be read, or nothing is deferred", () => {
    mocks.access = { "finance.deferredincome": { hidden: ["pending", "released"] } };
    expect(show({})).toBe("");
    mocks.access = {};
    expect(show({ pending: money(0), released: money(0) })).toBe("");
    expect(show(undefined)).toBe("");
  });
});
