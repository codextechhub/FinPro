import { describe, expect, it } from "vitest";
import { errorCode, isForbidden, refusalMessage } from "./api-errors";

/**
 * A refusal is the one failure a screen answers differently: it names what the
 * reader's role cannot do instead of offering a retry that would be refused
 * again.
 */
describe("isForbidden", () => {
  it("recognises a refusal", () => {
    expect(isForbidden({ status: 403, data: {} })).toBe(true);
  });

  it("does not mistake another failure for a refusal", () => {
    expect(isForbidden({ status: 404 })).toBe(false);
    expect(isForbidden({ status: "FETCH_ERROR" })).toBe(false);
  });

  it("does not read a missing error as a refusal", () => {
    expect(isForbidden(undefined)).toBe(false);
    expect(isForbidden(null)).toBe(false);
  });
});

/**
 * A delete of a record the law requires the business to keep is refused with
 * RECORD_RETAINED and the day the hold ends, and the reader is told that day
 * in the school's own date format.
 */
describe("refusalMessage", () => {
  const retained = {
    status: 409,
    data: {
      success: false,
      message: "Supplier bill VI-0042 is a record the law requires to be kept until 2032-12-31, so it cannot be deleted.",
      error: { code: "RECORD_RETAINED", detail: { retained_until: "2032-12-31" } },
    },
  };

  it("names the day the hold ends", () => {
    expect(refusalMessage(retained)).toBe("This record is kept until 31 Dec 2032 and can't be deleted.");
  });

  it("writes the day in the school's date format", () => {
    expect(refusalMessage(retained, { date_format: "DD_MM_YYYY" })).toBe(
      "This record is kept until 31/12/2032 and can't be deleted.",
    );
  });

  it("reads the raw response body as well as an RTK Query error", () => {
    expect(refusalMessage(retained.data)).toBe("This record is kept until 31 Dec 2032 and can't be deleted.");
    expect(errorCode(retained)).toBe("RECORD_RETAINED");
  });

  it("leaves the server's message to stand when the date is missing", () => {
    expect(refusalMessage({ status: 409, data: { error: { code: "RECORD_RETAINED", detail: {} } } })).toBeNull();
  });

  it("leaves every other refusal to the host", () => {
    expect(refusalMessage({ status: 409, data: { error: { code: "PERIOD_CLOSE_ERROR" } } })).toBeNull();
    expect(refusalMessage({ status: "FETCH_ERROR" })).toBeNull();
    expect(refusalMessage(undefined)).toBeNull();
  });
});
