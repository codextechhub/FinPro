import { renderToStaticMarkup } from "react-dom/server";
import { Circle } from "lucide-react";
import { describe, expect, it } from "vitest";

import { StatCard } from "./stat-card";

describe("StatCard", () => {
  it("uses the shared information-card boundary", () => {
    const html = renderToStaticMarkup(
      <StatCard label="Open" value="4" sub="Ordinary posting allowed" icon={Circle} />,
    );

    expect(html).toContain("border-white-02");
    expect(html).toContain("bg-white");
  });
});
