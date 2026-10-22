import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ActivityFeed } from "./activity-feed";
import { mergeActivityItems } from "./activity-feed-model";

describe("mergeActivityItems", () => {
  it("names a workflow entry from the name the server sent beside its actor", () => {
    const [item] = mergeActivityItems({
      workflowLogs: [{
        id: "voted", event_type: "STAGE_APPROVED", actor: "218", stage_instance: null, context: {},
        message: "approved", occurred_at: "2026-10-21T10:00:00Z", actor_name: "Ngozi Ibekwe", acted_label: "Ngozi Ibekwe",
      } as never],
    });
    expect(item.actorName).toBe("Ngozi Ibekwe");
  });

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

describe("mergeActivityItems reasons", () => {
  it("carries a document row's reason and drops a blank one", () => {
    const items = mergeActivityItems({
      activity: [
        { id: 2, action: "CANCELLED", message: "Contract cancelled: CT-0007", reason: "  Supplier lost its licence ", actor_name: "Ada Admin", created_at: "2026-08-10T15:23:00Z" },
        { id: 1, action: "POSTED", message: "Bill posted: VB-0004", reason: "", actor_name: "Ada Admin", created_at: "2026-08-10T15:20:00Z" },
        { id: 0, action: "CREATED", message: "Quotation created: Q-0002", actor_name: "Ada Admin", created_at: "2026-08-10T15:10:00Z" },
      ],
    });
    expect(items.map((item) => item.reason)).toEqual(["Supplier lost its licence", undefined, undefined]);
  });
});

/**
 * The activity tab of a contract, an RFQ, a quotation, a stock item, a vendor
 * payment and a vendor bill all draw this feed. Mr Okoro terminates Greenfield's
 * cleaning contract and gives a reason; the feed shows the sentence, the reason
 * beneath it, and the actor. A row with no reason shows no "Reason" line.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const activity = [
  { id: 2, action: "TERMINATED", message: "Contract terminated: CT-0007", reason: "Service fell below the agreed standard", status: "SUCCESS", actor_name: "Mr Okoro", created_at: "2026-08-10T15:23:00Z" },
  { id: 1, action: "CREATED", message: "Contract created: CT-0007", reason: "", status: "SUCCESS", actor_name: "Mr Okoro", created_at: "2026-08-10T15:00:00Z" },
];

describe("ActivityFeed", () => {
  it("shows the reason beneath the sentence it explains", () => {
    act(() => root.render(createElement(ActivityFeed, { activity })));
    const text = container.textContent ?? "";
    expect(text).toContain("Contract terminated: CT-0007");
    expect(text).toContain("Reason: Service fell below the agreed standard");
    expect(text).toContain("Mr Okoro");
    expect(text.match(/Reason:/g)).toHaveLength(1);
  });
});
