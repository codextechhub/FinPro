import { describe, expect, it } from "vitest";
import { auditChanges, auditFieldLabel, auditValue, isMoneyKey, type AuditValueContext } from "./audit-changes";

/**
 * Bright Star School's bursar opens the trail. A petty cash float moves from
 * N50,000 to N75,000, a fiscal year is closed, and a staff pay record changes
 * for a reader who may not see pay: each entry's sentence names no figure, so
 * the change list is where the values are read, in plain words.
 */
const context: AuditValueContext = {
  currency: "NGN",
  dates: {
    dateTime: (value) => (value ? `dt(${String(value)})` : "-"),
    day: (value) => (value ? `day(${String(value)})` : "-"),
  },
};

describe("audit field labels", () => {
  it("uses a registered plain-words label where there is one", () => {
    expect(auditFieldLabel("gross_amount")).toBe("Gross pay");
    expect(auditFieldLabel("is_primary")).toBe("Main operating account");
  });

  it("reads an unlisted key as words, never as the raw key", () => {
    expect(auditFieldLabel("default_invoice_due_days")).toBe("Default invoice due days");
    expect(auditFieldLabel("customer_id")).toBe("Customer");
  });
});

describe("audit values", () => {
  it("writes an amount of kobo as money in the books' currency", () => {
    expect(auditValue("float_amount", 5_000_000, context)).toBe("₦50,000.00");
    expect(auditValue("amount", "250000", context)).toBe("₦2,500.00");
    expect(auditValue("net_income", -1_000, context)).toBe("-₦10.00");
  });

  it("leaves a count, a share and a number-like reference as they are", () => {
    expect(auditValue("default_invoice_due_days", 30, context)).toBe("30");
    expect(auditValue("term_collection_target_pct", 80, context)).toBe("80");
    expect(auditValue("amount_naira", "2,500.00", context)).toBe("2,500.00");
    expect(auditValue("account_number", "0123456789", context)).toBe("0123456789");
  });

  it("writes dates in the school's format, states as words and flags as Yes or No", () => {
    expect(auditValue("posted_at", "2026-10-09T08:15:00+00:00", context)).toBe("dt(2026-10-09T08:15:00+00:00)");
    expect(auditValue("repay_by", "2026-11-01", context)).toBe("day(2026-11-01)");
    expect(auditValue("status", "PENDING_APPROVAL", context)).toBe("Pending approval");
    expect(auditValue("status", "POSTED", context)).toBe("Posted");
    expect(auditValue("is_active", false, context)).toBe("No");
  });

  it("does not turn a currency code or a document number into a state word", () => {
    expect(auditValue("currency", "NGN", context)).toBe("NGN");
    expect(auditValue("reference", "INV-0042", context)).toBe("INV-0042");
  });

  it("shows a dash for nothing, a count for rows and pairs for a flat object", () => {
    expect(auditValue("narration", null, context)).toBe("-");
    expect(auditValue("narration", "", context)).toBe("-");
    expect(auditValue("provision_bands", [{ a: 1 }, { a: 2 }], context)).toBe("2 items");
    expect(auditValue("components", { basic_salary: 5_000_000 }, context)).toBe("Basic salary: 5000000");
  });
});

describe("isMoneyKey", () => {
  it("knows amounts by their ending and by name, and refuses derived text", () => {
    expect(["amount", "net_amount", "closing_balance", "required_total", "brought_forward_nhf_amount", "paye_override", "taxable_pay"].every(isMoneyKey)).toBe(true);
    expect(["amount_naira", "balance_label", "term_collection_target_pct", "customer_name"].some(isMoneyKey)).toBe(false);
  });
});

describe("audit changes", () => {
  it("lists each changed value with a label and both sides written out", () => {
    const rows = auditChanges(
      { float_amount: 5_000_000, status: "DRAFT", narration: "Float" },
      { float_amount: 7_500_000, status: "POSTED", narration: "Float" },
      context,
    );
    expect(rows).toEqual([
      { key: "float_amount", label: "Float amount", before: "₦50,000.00", after: "₦75,000.00" },
      { key: "status", label: "Status", before: "Draft", after: "Posted" },
    ]);
  });

  it("shows a value present on one side only against a dash, and no row for a key neither side carries", () => {
    const rows = auditChanges({}, { amount: 150_000, decline_reason: "Diesel is already paid for" }, context);
    expect(rows.map((r) => [r.label, r.before, r.after])).toEqual([
      ["Amount", "-", "₦1,500.00"],
      ["Decline reason", "-", "Diesel is already paid for"],
    ]);
  });

  it("gives no row for a hidden value: it is absent from both snapshots", () => {
    expect(auditChanges({ is_active: true }, { is_active: false }, context).map((r) => r.label)).toEqual(["Active"]);
    expect(auditChanges({}, {}, context)).toEqual([]);
    expect(auditChanges(null, undefined, context)).toEqual([]);
  });

  it("drops a row whose two sides read the same", () => {
    expect(auditChanges({ lines: undefined }, { lines: [] }, context)).toEqual([]);
  });
});
