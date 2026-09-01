// <TeachingNote> - a dismissible explainer callout (ported from the design's
// teaching-note pattern, in our theme). Use sparingly at the top of a screen to
// explain what it does; the dismissal persists per id.

import { useState } from "react";
import { Info, X } from "lucide-react";

export function TeachingNote({ id, children }: { id: string; children: React.ReactNode }) {
  const key = `tn-dismissed-${id}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(key) === "true"; } catch { return false; }
  });
  if (dismissed) return null;
  return (
    <div className="flex items-start gap-3 rounded-md border border-pry-01 bg-pry-01/40 px-4 py-3">
      <span className="mt-0.5 grid size-5 shrink-0 place-content-center rounded-full bg-primary text-white">
        <Info className="size-3.5" />
      </span>
      <div className="flex-1 font-mont text-xs leading-relaxed text-gray-01">{children}</div>
      <button
        onClick={() => { setDismissed(true); try { localStorage.setItem(key, "true"); } catch { /* ignore */ } }}
        className="text-gray-05 hover:text-black-01"
        title="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
