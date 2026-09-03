import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { markParamConsumed, releaseParamKey, withoutConsumedParams } from "@/hooks/consumed-params";

const ACTION_KEY = "action";

/**
 * Open a flow in response to an `?action=<value>` query param, then strip the
 * param so a refresh or back-navigation doesn't reopen it. This is the landing
 * side of the action palette: a `do` action navigates to a list screen with
 * `?action=new`, and the screen calls
 * `useActionParam("new", canCreate, openDrawer)` to pop its create drawer on
 * arrival.
 *
 * A screen with more than one create flow calls the hook once per value
 * (e.g. `useActionParam("new", …)` and `useActionParam("new-writeoff", …)`);
 * only the matching one fires and clears the param.
 *
 * Strips through the shared consumed-param registry, so a screen that also reads
 * a deep-link filter (Tasks lands with `?tab=team&action=new`) doesn't have the
 * two hooks put each other's key back. See ./consumed-params.ts.
 *
 * ── Why `allowed` is a required argument ─────────────────────────────────────
 *
 * Because a query param is typed as easily as it is clicked, and for a while
 * this hook let anyone who could READ a screen open its create drawer by
 * address. The buttons were gated correctly - `<Can permission={P.PROC_CREATE_
 * VENDOR}>` - but the drawer rendered off local state and this hook set that
 * state on sight of the param. A bursar at Holy Cross who holds no
 * `procurement.vendor.create` saw no Add Vendor button and got the Add Vendor
 * form anyway from /procurement/vendors/vendors?action=new. The save was still
 * refused by the server, so nothing was written - but a form the product had
 * decided that person may not open, opened.
 *
 * It is a required positional argument rather than an option with a default,
 * and rather than a check left to each callback, because there were thirty-five
 * call sites and exactly one of them remembered. Anything a caller can leave
 * out is something thirty-four callers will. Pass the same expression that
 * gates the screen's own create button: `can(P.X)`, `canAll([...])`, or
 * whatever compound the button uses.
 *
 * A refused instruction is still CONSUMED - the param is stripped either way.
 * It was answered; the answer was no. Leaving it on the URL would re-fire it on
 * the next render and keep an address that promises something it will not do.
 */
export function useActionParam(
  value: string,
  allowed: boolean,
  onMatch: () => void,
): void {
  const [params, setParams] = useSearchParams();
  // Guard against re-firing (onMatch identity changes each render) until the
  // param is actually cleared; it resets once the param no longer matches.
  const firedRef = useRef(false);

  useEffect(() => () => releaseParamKey(ACTION_KEY), []);

  useEffect(() => {
    if (params.get(ACTION_KEY) !== value) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    if (allowed) onMatch();
    markParamConsumed(ACTION_KEY);
    setParams(withoutConsumedParams(params), { replace: true });
  }, [params, value, allowed, onMatch, setParams]);
}
