import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  sourceDocumentIdFromParams,
  useSourceDocumentParam,
} from "./source-document-route";

describe("sourceDocumentIdFromParams", () => {
  it("reads a positive source document id", () => {
    expect(sourceDocumentIdFromParams(new URLSearchParams("document=42"))).toBe(42);
  });

  it.each(["", "0", "-2", "1.5", "missing"])(
    "rejects an invalid source document id of %s",
    (value) => {
      expect(sourceDocumentIdFromParams(new URLSearchParams(`document=${value}`))).toBeNull();
    },
  );
});

let container: HTMLDivElement;
let root: Root;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** A list screen with a drawer, in the shape the four procurement pages use. */
function Probe({ onOpen }: { onOpen: (id: number) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useSourceDocumentParam((id) => {
    setSelectedId(id);
    onOpen(id);
  });
  return (
    <div>
      <output data-search={location.search} data-open={selectedId ?? "closed"} />
      <button type="button" onClick={() => setSelectedId(null)}>close</button>
      <button
        type="button"
        data-testid="second-link"
        onClick={() => navigate("/procurement/requisitions?document=77")}
      >
        open 77
      </button>
    </div>
  );
}

const openRecord = () => container.querySelector("output")?.getAttribute("data-open");
const search = () => container.querySelector("output")?.getAttribute("data-search");

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("useSourceDocumentParam", () => {
  it("opens the record the link names and takes the instruction off the address", async () => {
    const onOpen = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={["/procurement/requisitions?document=41&entity=MAIN"]}
        >
          <Probe onOpen={onOpen} />
        </MemoryRouter>,
      );
    });

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(41);
    expect(openRecord()).toBe("41");
    expect(search()).toBe("?entity=MAIN");
  });

  it("opens the second link while the first record is still on screen", async () => {
    // The defect this hook exists for. Both links are the same route with a
    // different query, so the screen is never remounted: an approver who read
    // requisition 41, went back to approvals and opened 77 stayed on 41, with
    // 77's approval buttons under it.
    const onOpen = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/procurement/requisitions?document=41"]}>
          <Probe onOpen={onOpen} />
        </MemoryRouter>,
      );
    });
    expect(openRecord()).toBe("41");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid=second-link]")?.click();
    });

    expect(openRecord()).toBe("77");
    expect(onOpen).toHaveBeenLastCalledWith(77);
  });

  it("leaves a closed drawer closed, because the instruction is spent", async () => {
    const onOpen = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/procurement/requisitions?document=41"]}>
          <Probe onOpen={onOpen} />
        </MemoryRouter>,
      );
    });

    await act(async () => {
      container.querySelectorAll("button")[0]?.click();
    });

    expect(openRecord()).toBe("closed");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens nothing when the link names no record", async () => {
    const onOpen = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/procurement/requisitions?entity=MAIN"]}>
          <Probe onOpen={onOpen} />
        </MemoryRouter>,
      );
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(openRecord()).toBe("closed");
    expect(search()).toBe("?entity=MAIN");
  });
});
