/**
 * This control puts a document in a paying customer's inbox and cannot be recalled.
 * These tests cover the parts that would be actively harmful if they broke, rather
 * than the parts that merely look wrong:
 *
 *   1. no permission means no button at all - a visible send somebody cannot perform
 *      is the dead-button defect, and here it invites them to email a customer
 *   2. the preview must show the real address BEFORE sending, because the whole
 *      point of the confirmation is that nobody sends blind
 *   3. a customer with no billing email must not be sendable - the server refuses
 *      it, so an enabled button would produce an error where a reason belongs
 *   4. Retry must target the failed DELIVERY, not the document; sending the
 *      document again would work but would lose the link to what failed
 *   5. the statement send must carry the period the reader is looking at, or the
 *      customer receives a statement nobody on this side has seen
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  send: vi.fn(),
  retry: vi.fn(),
  hasPermission: vi.fn(),
  hasAnyPermission: vi.fn(),
  hasAllPermissions: vi.fn(),
}));

vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetDocumentEmailQuery: (...args: unknown[]) => mocks.preview(...args),
  useSendDocumentEmailMutation: () => [mocks.send, { isLoading: false }],
  useRetryDocumentEmailMutation: () => [mocks.retry, { isLoading: false }],
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    hasAllPermissions: mocks.hasAllPermissions,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DocumentEmailAction } from "./document-email-action";
import { P } from "../../permissions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SENT_DELIVERY = {
  id: 11,
  document_type: "INVOICE" as const,
  document_type_display: "Invoice",
  document_id: "5",
  document_number: "INV-2026-00005",
  period_start: null,
  period_end: null,
  source: "AUTOMATIC" as const,
  source_display: "Automatic on posting",
  status: "SENT" as const,
  requested_by_name: "System",
  recipients: ["payer@example.com"],
  recipient_count: 1,
  bcc: ["finance-monitor@codexng.com"],
  note: "",
  queued_at: "2026-08-16T08:00:00Z",
  sent_at: "2026-08-16T08:00:05Z",
  failure_reason: "",
  can_retry: false,
  created_at: "2026-08-16T08:00:00Z",
};

const FAILED_DELIVERY = {
  ...SENT_DELIVERY,
  id: 12,
  source: "MANUAL" as const,
  source_display: "Manual send",
  status: "FAILED" as const,
  requested_by_name: "Ada Admin",
  sent_at: null,
  failure_reason: "Mailbox full.",
  can_retry: true,
};

function previewData(over: Record<string, unknown> = {}) {
  return {
    data: {
      data: {
        recipients: ["payer@example.com"],
        bcc: ["finance-monitor@codexng.com"],
        subject: "Invoice INV-2026-00005 from CodeX",
        can_send: true,
        blocked_reason: "",
        deliveries: [SENT_DELIVERY],
        ...over,
      },
    },
    isFetching: false,
    isError: false,
  };
}

describe("DocumentEmailAction", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.hasPermission.mockReturnValue(true);
    mocks.hasAnyPermission.mockReturnValue(true);
    mocks.hasAllPermissions.mockReturnValue(true);
    mocks.preview.mockReturnValue(previewData());
    mocks.send.mockReturnValue({ unwrap: () => Promise.resolve({ data: SENT_DELIVERY }) });
    mocks.retry.mockReturnValue({ unwrap: () => Promise.resolve({ data: SENT_DELIVERY }) });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const render = (props: Record<string, unknown> = {}) =>
    act(() => {
      root.render(
        <DocumentEmailAction
          kind="invoices"
          id={5}
          entity="CODEX"
          permission={P.FIN_EMAIL_INVOICE}
          label="Email invoice"
          title="Email this invoice to the customer?"
          {...props}
        />,
      );
    });

  // The modal is portalled to document.body, so read the whole document.
  const text = () => document.body.textContent ?? "";
  // Exact text, not startsWith: the trigger "Send to customer" and the
  // confirmation "Send" would otherwise be the same button to the test.
  const buttons = (label: string) =>
    Array.from(document.body.querySelectorAll("button"))
      .filter((node) => node.textContent?.trim() === label);
  const button = (label: string) => buttons(label)[0];
  // The dialog footer renders after its children, so a duplicate label (Retry
  // appears on the failed row AND on the confirm button) resolves to the last.
  const confirmButton = (label: string) => buttons(label).at(-1);

  const open = () => {
    render();
    act(() => { button("Email invoice")?.click(); });
  };

  it("renders no button at all without the send permission", () => {
    mocks.hasPermission.mockReturnValue(false);
    mocks.hasAnyPermission.mockReturnValue(false);
    mocks.hasAllPermissions.mockReturnValue(false);

    render();

    expect(button("Email invoice")).toBeUndefined();
  });

  it("does not ask the server for recipients until the panel is opened", () => {
    render();

    // The second argument is RTK Query's options object.
    expect(mocks.preview.mock.calls[0]?.[1]).toMatchObject({ skip: true });
  });

  it("shows the address, the blind copy and the subject before anything is sent", () => {
    open();

    expect(text()).toContain("payer@example.com");
    expect(text()).toContain("finance-monitor@codexng.com");
    expect(text()).toContain("Invoice INV-2026-00005 from CodeX");
    // The monitoring copy is blind, and the label must not claim otherwise.
    // Checked on the element, because "BCC:" trivially contains "CC:".
    const labels = Array.from(document.body.querySelectorAll("span"))
      .map((node) => node.textContent?.trim());
    expect(labels).toContain("BCC:");
    expect(labels).not.toContain("CC:");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("lists the automatic copy sent when the document posted", () => {
    open();

    expect(text()).toContain("Automatic on posting");
    expect(text()).toContain("Sent");
  });

  it("refuses to send, and says why, when the customer has no billing email", () => {
    mocks.preview.mockReturnValue(previewData({
      recipients: [],
      can_send: false,
      blocked_reason: "This customer has no billing email. Add one on the customer record first.",
      deliveries: [],
    }));

    open();

    expect(text()).toContain("no billing email");
    expect(confirmButton("Send")?.hasAttribute("disabled")).toBe(true);
  });

  it("sends to the document, carrying the note", async () => {
    open();
    const textarea = document.body.querySelector("textarea");
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!
        .set!.call(textarea, "Due on Friday.");
      textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { confirmButton("Send")?.click(); });

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "invoices", id: 5, entity: "CODEX", note: "Due on Friday." }),
    );
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("retries the failed delivery rather than re-sending the document", async () => {
    mocks.preview.mockReturnValue(previewData({ deliveries: [FAILED_DELIVERY] }));
    open();

    expect(text()).toContain("Mailbox full.");
    act(() => { button("Retry")?.click(); });          // the failed row
    await act(async () => { confirmButton("Retry")?.click(); });   // the confirmation

    // The retry endpoint takes the delivery id; re-sending the document would
    // succeed but would lose the link to the attempt that failed.
    expect(mocks.retry).toHaveBeenCalledWith(
      expect.objectContaining({ id: FAILED_DELIVERY.id, entity: "CODEX" }),
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends a statement for the period on screen, not a fresh one", async () => {
    render({ kind: "customers", id: "CUST-001", label: "Send to customer",
             title: "Email this statement to the customer?",
             period: { start: "2026-01-01", end: "2026-01-31" } });
    act(() => { button("Send to customer")?.click(); });
    await act(async () => { confirmButton("Send")?.click(); });

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "customers", id: "CUST-001", start: "2026-01-01", end: "2026-01-31" }),
    );
  });
});
