/**
 * Mrs Bello approves while acting as Mrs Adeyemi; the history says both. An
 * ordinary vote reads as the approver's own name, and only the server's flag
 * says somebody has left.
 */
import { describe, expect, it } from "vitest";

import { actorExited, proxyLabel } from "./person-flags";

describe("who did it", () => {
  it("names both people when the act was done through a proxy", () => {
    expect(proxyLabel({ proxied_user_name: "Mrs Adeyemi", real_actor_name: "Mrs Bello", acted_label: "Mrs Bello for Mrs Adeyemi" }))
      .toBe("Mrs Bello for Mrs Adeyemi");
    expect(proxyLabel({ proxied_user_name: "Mrs Adeyemi", real_actor_name: "Mrs Bello" })).toBe("Mrs Bello for Mrs Adeyemi");
  });

  it("says nothing extra for an ordinary act, or an older server", () => {
    expect(proxyLabel({ acted_label: "Mrs Bello", proxied_user_name: null })).toBeNull();
    expect(proxyLabel({})).toBeNull();
    expect(proxyLabel(undefined)).toBeNull();
  });

  it("marks a person as gone only on the server's flag", () => {
    expect(actorExited({ actor_is_exited: true })).toBe(true);
    expect(actorExited({ actor_is_exited: false })).toBe(false);
    expect(actorExited({})).toBe(false);
  });
});
