/**
 * Supplier evidence on a vendor bill or payment.
 *
 * Removing a file from a draft deletes it after a plain confirm. Once the
 * document has left draft the backend keeps the file, marks it superseded and
 * refuses the removal without a reason, so the confirm says the file is kept
 * and asks for one. A superseded file stays in the list, greyed, with who
 * removed it, when and why. A document that has left draft reads its list
 * with superseded files included, so that line has something to show.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoiceList: vi.fn(),
  paymentList: vi.fn(),
}));

vi.mock("@/redux/services/procurement/procurement-api", () => ({
  useGetVendorInvoiceAttachmentsQuery: (...args: unknown[]) => mocks.invoiceList(...args),
  useGetVendorPaymentAttachmentsQuery: (...args: unknown[]) => mocks.paymentList(...args),
}));

vi.mock("@/utils/attachment-download", () => ({ fetchAttachmentBlob: vi.fn() }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DocumentAttachments, useDocumentAttachmentRows, type AttachmentOwner } from "./document-attachments";
import type { DocumentAttachment } from "@/redux/services/procurement/procurement-types";
import { P } from "../../permissions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CURRENT: DocumentAttachment = {
  id: 5,
  name: "lagoon-supplies-inv-2231.pdf",
  content_type: "application/pdf",
  size: 48_000,
  caption: "Supplier invoice, March",
  url: "/media/5",
  uploaded_by_name: "Ngozi Okafor",
  uploaded_at: "2026-03-04T09:00:00Z",
  superseded: false,
  superseded_at: null,
  superseded_by_name: null,
  superseded_reason: null,
};

const SUPERSEDED: DocumentAttachment = {
  ...CURRENT,
  id: 4,
  name: "lagoon-supplies-draft.pdf",
  superseded: true,
  superseded_at: "2026-03-05T10:30:00Z",
  superseded_by_name: "Tunde Bakare",
  superseded_reason: "Supplier sent a corrected invoice",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.invoiceList.mockReset().mockReturnValue({ data: undefined });
  mocks.paymentList.mockReset().mockReturnValue({ data: undefined });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function mount(documentIsDraft: boolean, attachments: DocumentAttachment[] = [CURRENT]) {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  await act(async () => {
    root.render(
      <DocumentAttachments
        attachments={attachments}
        documentIsDraft={documentIsDraft}
        attachPermission={P.PROC_ATTACH_VENDOR_INVOICE_FILE}
        uploading={false}
        deleting={false}
        onUpload={async () => undefined}
        onDelete={onDelete}
        emptyMessage="Nothing filed yet."
      />,
    );
  });
  return onDelete;
}

const button = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find((el) => el.textContent?.trim() === label);

async function typeReason(text: string) {
  const field = document.body.querySelector("textarea");
  expect(field).not.toBeNull();
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(field, text);
    field!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("removing a file from a draft", () => {
  it("asks a plain confirm and sends no reason", async () => {
    const onDelete = await mount(true);
    await act(async () => button("Remove")!.click());

    expect(document.body.textContent).toContain("The file is deleted from this draft.");
    expect(document.body.querySelector("textarea")).toBeNull();

    await act(async () => button("Remove file")!.click());
    expect(onDelete).toHaveBeenCalledWith(5, undefined);
  });
});

describe("removing a file from a document that has left draft", () => {
  it("says the file is kept and disables the confirm until a reason is typed", async () => {
    const onDelete = await mount(false);
    await act(async () => button("Remove")!.click());

    expect(document.body.textContent).toContain("the file is kept and marked superseded, not deleted");
    expect(button("Mark superseded")?.disabled).toBe(true);

    await typeReason("  Supplier sent a corrected invoice ");
    expect(button("Mark superseded")?.disabled).toBe(false);

    await act(async () => button("Mark superseded")!.click());
    expect(onDelete).toHaveBeenCalledWith(5, "Supplier sent a corrected invoice");
  });
});

describe("a superseded file", () => {
  it("is greyed with who removed it, when and why, and offers no Remove", async () => {
    await mount(false, [SUPERSEDED, CURRENT]);
    const rows = Array.from(container.querySelectorAll("li"));

    expect(rows.map((row) => row.dataset.superseded ?? "current")).toEqual(["current", "true"]);
    const superseded = rows[1];
    expect(superseded.className).toContain("opacity-70");
    expect(superseded.textContent).toContain("Superseded: Supplier sent a corrected invoice, by Tunde Bakare, 5 Mar 2026");
    expect(Array.from(superseded.querySelectorAll("button")).map((el) => el.textContent?.trim())).not.toContain("Remove");
  });
});

describe("useDocumentAttachmentRows", () => {
  let rows: DocumentAttachment[] = [];
  function Probe({ owner, status }: { owner: AttachmentOwner; status: string }) {
    rows = useDocumentAttachmentRows(owner, { id: 12, status, attachments: [CURRENT] }, "BRIGHTSTAR", true);
    return null;
  }

  it("reads a posted bill's list with superseded files included", async () => {
    mocks.invoiceList.mockReturnValue({ data: { data: { attachments: [CURRENT, SUPERSEDED] } } });
    await act(async () => root.render(<Probe owner="vendor-invoice" status="POSTED" />));

    expect(mocks.invoiceList).toHaveBeenCalledWith(
      { id: 12, entity: "BRIGHTSTAR", include_superseded: true },
      { skip: false },
    );
    expect(rows).toEqual([CURRENT, SUPERSEDED]);
  });

  it("reads a posted payment's list through the payment endpoint", async () => {
    await act(async () => root.render(<Probe owner="vendor-payment" status="POSTED" />));

    expect(mocks.paymentList).toHaveBeenCalledWith(expect.objectContaining({ include_superseded: true }), { skip: false });
    expect(mocks.invoiceList).toHaveBeenCalledWith(expect.anything(), { skip: true });
  });

  it("uses a draft's own files without a second read", async () => {
    await act(async () => root.render(<Probe owner="vendor-invoice" status="DRAFT" />));

    expect(mocks.invoiceList).toHaveBeenCalledWith(expect.anything(), { skip: true });
    expect(rows).toEqual([CURRENT]);
  });
});
