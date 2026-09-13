import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import {
  markParamConsumed,
  releaseParamKey,
  withoutConsumedParams,
} from "@/hooks/consumed-params";

export const SOURCE_DOCUMENT_ID_PARAM = "document";

export function sourceDocumentIdFromParams(
  params: Pick<URLSearchParams, "get">,
): number | null {
  const value = Number(params.get(SOURCE_DOCUMENT_ID_PARAM));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Open the record a `?document=<id>` link names, then strip the param.
 *
 * This is the landing side of the approval screen's "open the source document"
 * link, and it is one-shot in the same way `useActionParam` is, through the
 * same consumed-param registry: the instruction is answered, so it leaves the
 * address rather than sitting there to be replayed on the next render.
 *
 * ── Why it cannot read the param once and stop ───────────────────────────────
 *
 * Because the two links differ only in their query string, and react-router
 * does not remount a screen for that. Each of these pages used to seed its
 * selection with `useState(() => sourceDocumentIdFromParams(params))`, which
 * runs on the first render and never again. An approver reading Bright Star's
 * stationery requisition at `?document=41`, who goes back to approvals and
 * opens the next one at `?document=77`, stayed on requisition 41: same route,
 * no remount, initialiser never rerun. The page then showed one requisition
 * with another one's approval buttons under it.
 *
 * Stripping is what makes a repeat arrival work. The param is the instruction,
 * not the address of what is open: once consumed it is gone, so the next link
 * is a fresh instruction even when it names the record already on screen.
 */
export function useSourceDocumentParam(onMatch: (id: number) => void): void {
  const [params, setParams] = useSearchParams();
  // onMatch is a new identity on every render, so the effect cannot be trusted
  // to run once on its own. Reset when the param is gone, which is what lets a
  // second link through.
  const firedRef = useRef(false);

  useEffect(() => () => releaseParamKey(SOURCE_DOCUMENT_ID_PARAM), []);

  useEffect(() => {
    const id = sourceDocumentIdFromParams(params);
    if (id === null) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    onMatch(id);
    markParamConsumed(SOURCE_DOCUMENT_ID_PARAM);
    setParams(withoutConsumedParams(params), { replace: true });
  }, [params, onMatch, setParams]);
}
