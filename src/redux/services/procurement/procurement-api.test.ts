/**
 * The requests behind supplier evidence on vendor bills and payments.
 *
 * Removing a file from a document that has left draft supersedes it, and the
 * backend refuses that without a reason. The reason travels as `?reason=`
 * because some clients send no body with a DELETE; a draft's removal carries
 * none. Reading the list for such a document asks for superseded files too, so
 * a removed file stays in sight.
 *
 * The host's base api is replaced by one that only records the endpoint
 * definitions, which keeps the test independent of either application's
 * interceptor.
 */
import { describe, expect, it, vi } from "vitest";

type Definition = { query: (args: never) => { url: string; method: string; body?: unknown } };
const captured = vi.hoisted(() => ({ endpoints: {} as Record<string, Definition> }));

vi.mock("@/redux/services/base-api", () => ({
  baseApi: {
    injectEndpoints: ({ endpoints }: { endpoints: (b: unknown) => Record<string, Definition> }) => {
      const builder = { query: (d: Definition) => d, mutation: (d: Definition) => d };
      Object.assign(captured.endpoints, endpoints(builder));
      return {};
    },
  },
}));

import "./procurement-api";

function request(name: string, args: Record<string, unknown>) {
  return captured.endpoints[name].query(args as never);
}

describe.each([
  ["deleteVendorInvoiceFile", "vendor-invoices"],
  ["deleteVendorPaymentFile", "vendor-payments"],
])("%s", (endpoint, path) => {
  it("sends the reason as a query parameter for a document that has left draft", () => {
    const sent = request(endpoint, { id: 12, entity: "BRIGHTSTAR", attachmentId: 5, reason: "Supplier sent a corrected copy" });

    expect(sent.method).toBe("DELETE");
    expect(sent.url).toBe(
      `/procurement/${path}/12/attachments/5/?entity=BRIGHTSTAR&reason=Supplier%20sent%20a%20corrected%20copy`,
    );
    expect(sent.body).toBeUndefined();
  });

  it("sends no reason when removing from a draft", () => {
    const sent = request(endpoint, { id: 12, entity: "BRIGHTSTAR", attachmentId: 5 });

    expect(sent.url).toBe(`/procurement/${path}/12/attachments/5/?entity=BRIGHTSTAR`);
  });
});

describe.each([
  ["getVendorInvoiceAttachments", "vendor-invoices"],
  ["getVendorPaymentAttachments", "vendor-payments"],
])("%s", (endpoint, path) => {
  it("asks for superseded files too", () => {
    const sent = request(endpoint, { id: 12, entity: "BRIGHTSTAR", include_superseded: true });

    expect(sent.method).toBe("GET");
    expect(sent.url).toBe(`/procurement/${path}/12/attachments/?entity=BRIGHTSTAR&include_superseded=true`);
  });
});
