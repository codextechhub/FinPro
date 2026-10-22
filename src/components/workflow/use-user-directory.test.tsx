/**
 * Who a trail names. Bright Star School's principal reads the staff list, so
 * the directory can name Mrs Adeyemi; Tolu, a teacher, cannot read it. Either
 * way the name the server sent beside the id is what the screen shows, and a
 * person nobody can name reads "Unknown user", never their id.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const directory = vi.hoisted(() => ({ rows: [] as Array<{ id: string; full_name: string; email: string; role: string }> }));
vi.mock("../../host", () => ({ useDirectory: () => ({ data: directory.rows, isLoading: false }) }));

import { useUserDirectory } from "./use-user-directory";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function lookup() {
  let found!: ReturnType<typeof useUserDirectory>;
  function Probe() {
    found = useUserDirectory();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  return { found, unmount: () => act(async () => root.unmount()) };
}

afterEach(() => {
  directory.rows = [];
});

describe("useUserDirectory", () => {
  it("shows the name the server sent, even to a reader whose directory is empty", async () => {
    const { found, unmount } = await lookup();
    expect(found.name("217", "Oluwaseun Bakare")).toBe("Oluwaseun Bakare");
    expect(found.initials("217", "Oluwaseun Bakare")).toBe("OB");
    await unmount();
  });

  it("prefers the sent name over the directory's", async () => {
    directory.rows = [{ id: "66", full_name: "E. Obi", email: "principal@brightstar.example", role: "School Admin" }];
    const { found, unmount } = await lookup();
    expect(found.name("66", "Emeka Obi")).toBe("Emeka Obi");
    expect(found.name("66")).toBe("E. Obi");
    await unmount();
  });

  it("never shows a person's id when nobody can name them", async () => {
    const { found, unmount } = await lookup();
    expect(found.name("217")).toBe("Unknown user");
    expect(found.name(null)).toBe("-");
    await unmount();
  });
});
