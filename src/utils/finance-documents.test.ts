import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Cookies from "js-cookie";
import { openInvoiceDocument, openPaymentReceipt } from "./finance-documents";

// A stand-in for the tab returned by window.open - records the load handler so a
// test can fire it, and tracks navigation / print / close.
const makeWin = () => {
  const handlers: Record<string, () => void> = {};
  return {
    location: { href: "" },
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn((ev: string, cb: () => void) => { handlers[ev] = cb; }),
    fire: (ev: string) => handlers[ev]?.(),
  };
};

const htmlResponse = () => new Response("<html>doc</html>", { status: 200, headers: { "Content-Type": "text/html" } });

beforeEach(() => {
  Cookies.set("token", "test-token");
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  Cookies.remove("token");
  vi.restoreAllMocks();
});

describe("finance-documents", () => {
  it("fetches the invoice HTML document endpoint (not the removed .pdf route)", async () => {
    const win = makeWin();
    vi.spyOn(window, "open").mockReturnValue(win as unknown as Window);
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openInvoiceDocument(13, "CODEX");

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("http://test.local/v1/finance/invoices/13/document/?entity=CODEX");
    expect(calledUrl).not.toContain(".pdf");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("fetches the payment receipt HTML endpoint (not .pdf)", async () => {
    const win = makeWin();
    vi.spyOn(window, "open").mockReturnValue(win as unknown as Window);
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openPaymentReceipt(9, "CODEX");

    expect(fetchMock.mock.calls[0][0]).toBe("http://test.local/v1/finance/payments/9/receipt/?entity=CODEX");
    expect(fetchMock.mock.calls[0][0]).not.toContain(".pdf");
  });

  it("opens the tab synchronously (before fetch) so popup blockers can't swallow it", async () => {
    const win = makeWin();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(win as unknown as Window);
    let opened = false;
    const fetchMock = vi.fn(() => { opened = openSpy.mock.calls.length > 0; return Promise.resolve(htmlResponse()); });
    vi.stubGlobal("fetch", fetchMock);

    await openInvoiceDocument(13, "CODEX");

    expect(openSpy).toHaveBeenCalledWith("", "_blank"); // synchronous empty tab, no noopener
    expect(opened).toBe(true); // tab already open by the time fetch runs
  });

  it("navigates the tab to the blob and prints on load", async () => {
    const win = makeWin();
    vi.spyOn(window, "open").mockReturnValue(win as unknown as Window);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse()));

    await openInvoiceDocument(13, "CODEX");
    expect(win.location.href).toBe("blob:mock-url");

    win.fire("load");
    expect(win.focus).toHaveBeenCalled();
    expect(win.print).toHaveBeenCalled();
  });

  it("throws the backend message and closes the tab on a non-ok response", async () => {
    const win = makeWin();
    vi.spyOn(window, "open").mockReturnValue(win as unknown as Window);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Invoice not found for this entity." }), { status: 404 }),
    ));

    await expect(openInvoiceDocument(999, "CODEX")).rejects.toThrow("Invoice not found for this entity.");
    expect(win.close).toHaveBeenCalled();
  });

  it("throws an allow-pop-ups error and never fetches when the popup is blocked", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(openPaymentReceipt(9, "CODEX")).rejects.toThrow(/pop-ups/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
