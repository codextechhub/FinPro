import { describe, expect, it } from "vitest";

import { mergeActivityItems } from "./activity-feed-model";

describe("mergeActivityItems", () => {
  it("arranges workflow, document, and creation activity newest first", () => {
    const items = mergeActivityItems({
      workflowLogs: [
        {
          id: "approved",
          event_type: "INSTANCE_APPROVED",
          actor: null,
          stage_instance: null,
          context: {},
          message: "instance approved",
          occurred_at: "2026-08-10T15:21:00Z",
        },
        {
          id: "submitted",
          event_type: "INSTANCE_SUBMITTED",
          actor: "user-1",
          stage_instance: null,
          context: {},
          message: "instance submitted",
          occurred_at: "2026-08-10T15:19:00Z",
        },
      ],
      activity: [
        {
          id: 12,
          action: "POSTED",
          message: "Posted bill.",
          actor_name: "Ada Admin",
          created_at: "2026-08-10T15:23:00Z",
        },
      ],
      created: {
        key: "created",
        message: "Invoice draft created",
        actorName: "Ada Admin",
        occurredAt: "2026-08-10T15:18:00Z",
      },
    });

    expect(items.map((item) => item.message)).toEqual([
      "Posted bill.",
      "instance approved",
      "instance submitted",
      "Invoice draft created",
    ]);
  });

  it("keeps the source order when events have the same timestamp", () => {
    const occurredAt = "2026-08-10T15:23:00Z";
    const items = mergeActivityItems({
      workflowLogs: [
        {
          id: "first",
          event_type: "STAGE_ACTIVATED",
          actor: null,
          stage_instance: null,
          context: {},
          message: "first",
          occurred_at: occurredAt,
        },
        {
          id: "second",
          event_type: "STAGE_SKIPPED_NO_APPROVER",
          actor: null,
          stage_instance: null,
          context: {},
          message: "second",
          occurred_at: occurredAt,
        },
      ],
    });

    expect(items.map((item) => item.message)).toEqual(["first", "second"]);
  });
});
