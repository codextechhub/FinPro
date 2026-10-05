/**
 * Aisha's April payslip is the server's PDF. It is fetched with the reader's
 * token and the school's tenant, and shown in the app's file viewer; a refusal
 * is answered with the server's own sentence rather than a blank tab.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), error: vi.fn() }));
vi.mock("../components/finance-ui/file-preview-dialog", () => ({ showBlobPreview: mocks.preview }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/utils/tenant-context", () => ({ getTenantSlug: () => "bright-star" }));

import { clearAccessToken, setAccessToken } from "@/utils/access-token";
import { openLinePayslip, payrollPdfUrl } from "./payroll-documents";

beforeEach(() => {
  setAccessToken("test-token");
  mocks.preview.mockReset();
  mocks.error.mockReset();
});
afterEach(() => {
  clearAccessToken();
  vi.unstubAllGlobals();
});

describe("payroll PDFs", () => {
  it("fetches a line's payslip with the token and tenant, and shows it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
      status: 200, headers: { "Content-Disposition": 'inline; filename="payslip-2026-04-1.pdf"' },
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await openLinePayslip("BSS", 4, 51)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/finance/payroll-runs/4/lines/51/payslip/?entity=BSS&tenant=bright-star");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(mocks.preview.mock.calls[0][0]).toBe("payslip-2026-04-1.pdf");
  });

  it("answers a refusal with the server's sentence", async () => {
    const message = "This document shows each person's pay, and your role may not see every figure on it.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, message, error: { code: "REQUEST_ERROR", detail: { detail: message } } }), { status: 403 })));
    expect(await openLinePayslip("BSS", 4, 51)).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith(message);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("asks for the reader's own tax summary as a PDF", () => {
    expect(payrollPdfUrl("/finance/my-tax-summary/", { year: 2026, entity: "BSS", output: "pdf" })).toContain("/finance/my-tax-summary/?year=2026&entity=BSS&output=pdf&tenant=bright-star");
  });
});
