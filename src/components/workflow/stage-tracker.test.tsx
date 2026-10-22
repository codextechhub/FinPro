/**
 * Approval history: Mrs Bello approved the concession while acting as Mrs
 * Adeyemi, so the vote reads "Mrs Bello for Mrs Adeyemi". Mr Okon, who has
 * since left the school, keeps his name on his vote and his avatar carries the
 * dashed outline.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { StageTracker } from "./stage-tracker";
import { AuditTimeline } from "./audit-timeline";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NAMES: Record<string, string> = { u2: "Mrs Adeyemi", u3: "Mr Okon" };
const name = (id?: string | null) => (id ? NAMES[id] ?? id : "");
const initials = (id?: string | null) => name(id).slice(0, 2).toUpperCase();

const vote = (over: Record<string, unknown>) => ({
  id: "v1", action: "APPROVED", actor: "u2", on_behalf_of: null, comment: "", attempt: 1,
  acted_at: "2026-10-01T10:00:00Z", reversed_at: null, reversed_by: null, reversal_reason: "", is_reversal_of: null, ...over,
});

const stage = (actions: unknown[]) => ({
  id: "s1", stage_code: "BURSAR", stage_label: "Bursar", stage_kind: "APPROVAL", status: "APPROVED",
  on_rejection: "TERMINATE", advance_rule: "ANY", quorum_count: 1, activated_at: null, resolved_at: null,
  skip_reason: "", attempt: 1, eligible_approvers: [], actions,
});

async function render(node: React.ReactNode) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(node));
  return { container, unmount: () => act(async () => root.unmount()) };
}

describe("approval history", () => {
  it("names both people for a vote cast through a proxy", async () => {
    const { container, unmount } = await render(
      <StageTracker
        stages={[stage([vote({ proxied_by: "u1", real_actor_name: "Mrs Bello", proxied_user_name: "Mrs Adeyemi", acted_label: "Mrs Bello for Mrs Adeyemi" })])] as never}
        name={name}
        initials={initials}
      />,
    );
    expect(container.textContent).toContain("Mrs Bello for Mrs Adeyemi");
    await unmount();
  });

  it("keeps an ordinary vote in the approver's name, and outlines somebody who has left", async () => {
    const { container, unmount } = await render(
      <StageTracker stages={[stage([vote({ actor: "u3", actor_is_exited: true, acted_label: "Mr Okon", proxied_user_name: null })])] as never} name={name} initials={initials} />,
    );
    expect(container.textContent).toContain("Mr Okon");
    expect(container.textContent).not.toContain(" for ");
    expect(container.querySelector("[title='No longer on the staff']")?.className).toContain("outline-dashed");
    await unmount();
  });

  it("names both people on an audit entry made through a proxy", async () => {
    const { container, unmount } = await render(
      <AuditTimeline
        logs={[{ id: "a1", event_type: "STAGE_APPROVED", actor: "u2", stage_instance: null, context: {}, message: "", occurred_at: "2026-10-01T10:00:00Z",
          real_actor_name: "Mrs Bello", proxied_user_name: "Mrs Adeyemi", acted_label: "Mrs Bello for Mrs Adeyemi" }] as never}
        name={name}
      />,
    );
    expect(container.textContent).toContain("Mrs Bello for Mrs Adeyemi");
    await unmount();
  });
});

/**
 * Tolu, a teacher, opens her requisition. She may not read the staff list, so
 * her directory knows nobody, and the trail still names Mr Bakare, who
 * approved it, and Mrs Adeyemi, for whom Mr Okon held the queue place, from the
 * names the server sent.
 */
describe("a trail read by someone who may not read the staff list", () => {
  const nobody = (_id?: string | null, sent?: string | null) => sent || "Unknown user";
  const nobodyInitials = (_id?: string | null, sent?: string | null) => (sent || "U").slice(0, 2).toUpperCase();

  it("names each voter from the payload", async () => {
    const { container, unmount } = await render(
      <StageTracker
        stages={[stage([vote({ actor: "217", actor_name: "Oluwaseun Bakare", acted_label: "Oluwaseun Bakare",
          on_behalf_of: "66", on_behalf_of_name: "Mrs Adeyemi", proxied_user_name: null })])] as never}
        name={nobody}
        initials={nobodyInitials}
      />,
    );
    expect(container.textContent).toContain("Oluwaseun Bakare");
    expect(container.textContent).toContain("(for Mrs Adeyemi)");
    expect(container.textContent).not.toMatch(/User \d|217|\b66\b/);
    await unmount();
  });

  it("names the actor of each audit entry from the payload", async () => {
    const { container, unmount } = await render(
      <AuditTimeline
        logs={[{ id: "a2", event_type: "STAGE_APPROVED", actor: "218", stage_instance: null, context: {}, message: "", occurred_at: "2026-10-01T10:00:00Z",
          actor_name: "Ngozi Ibekwe", acted_label: "Ngozi Ibekwe", proxied_user_name: null }] as never}
        name={nobody}
      />,
    );
    expect(container.textContent).toContain("Ngozi Ibekwe");
    expect(container.textContent).not.toContain("218");
    await unmount();
  });
});
