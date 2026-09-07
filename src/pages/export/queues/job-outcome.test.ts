// The queue row must not call a partly-complete export a clean success. The dev
// database has no export jobs in it, so this is where that behaviour is proven.

import { describe, expect, it } from "vitest";
import type { JobStatus } from "@/redux/services/dashboard/queue-types";
import { displayStatus, exportOutcome } from "./job-outcome";

const job = (kind: string, status: JobStatus, result: unknown) => ({ kind, status, result });

describe("exportOutcome", () => {
  it("reads the run behind an export job", () => {
    expect(
      exportOutcome(job("export", "SUCCEEDED", { run: "RUN-7F31C2", status: "COMPLETED", rows: 2410, omissions: 0 })),
    ).toEqual({ reference: "RUN-7F31C2", status: "COMPLETED", rows: 2410, omissions: 0 });
  });

  it("ignores jobs that are not exports", () => {
    expect(exportOutcome(job("email", "SUCCEEDED", { status: "COMPLETED" }))).toBeNull();
    expect(exportOutcome(job("import", "SUCCEEDED", { status: "COMPLETED" }))).toBeNull();
  });

  it("matches the kind case-insensitively", () => {
    expect(exportOutcome(job("EXPORT", "SUCCEEDED", { status: "COMPLETED" }))?.status).toBe("COMPLETED");
  });

  it("returns null rather than throwing on a payload it does not recognise", () => {
    // Every task puts something different in `result`; none of these may crash a row.
    expect(exportOutcome(job("export", "SUCCEEDED", null))).toBeNull();
    expect(exportOutcome(job("export", "SUCCEEDED", "done"))).toBeNull();
    expect(exportOutcome(job("export", "SUCCEEDED", [1, 2, 3]))).toBeNull();
    expect(exportOutcome(job("export", "SUCCEEDED", {}))).toBeNull();
    expect(exportOutcome(job("export", "SUCCEEDED", { status: 7 }))).toBeNull();
  });

  it("defers to the job when the run row was missing", () => {
    expect(exportOutcome(job("export", "SUCCEEDED", { run: 42, status: "MISSING" }))).toBeNull();
  });

  it("coerces a numeric run id to a string reference", () => {
    expect(exportOutcome(job("export", "SUCCEEDED", { run: 42, status: "COMPLETED" }))?.reference).toBe("42");
  });

  it("defaults rows to null and omissions to zero when absent", () => {
    const outcome = exportOutcome(job("export", "SUCCEEDED", { status: "COMPLETED" }));
    expect(outcome).toMatchObject({ rows: null, omissions: 0 });
  });
});

describe("displayStatus", () => {
  it("shows the run's status, not the job's, for an export", () => {
    // The whole point: the worker succeeded, the export did not fully.
    expect(
      displayStatus(
        job("export", "SUCCEEDED", { run: "RUN-1", status: "COMPLETED_WITH_OMISSIONS", omissions: 2 }),
      ),
    ).toBe("COMPLETED_WITH_OMISSIONS");
  });

  it("falls back to the job's status for everything else", () => {
    expect(displayStatus(job("email", "SUCCEEDED", null))).toBe("SUCCEEDED");
    expect(displayStatus(job("export", "FAILED", null))).toBe("FAILED");
    expect(displayStatus(job("export", "RUNNING", null))).toBe("RUNNING");
  });
});
