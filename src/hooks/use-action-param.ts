import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { markParamConsumed, releaseParamKey, withoutConsumedParams } from "@/hooks/consumed-params";

const ACTION_KEY = "action";

/**
 * Open a flow in response to an `?action=<value>` query param, then strip the
 * param so a refresh or back-navigation doesn't reopen it. This is the landing
 * side of the action palette: a `do` action navigates to a list screen with
 * `?action=new`, and the screen calls `useActionParam("new", openDrawer)` to
 * pop its create drawer on arrival.
 *
 * A screen with more than one create flow calls the hook once per value
 * (e.g. `useActionParam("new", …)` and `useActionParam("new-writeoff", …)`);
 * only the matching one fires and clears the param.
 *
 * Strips through the shared consumed-param registry, so a screen that also reads
 * a deep-link filter (Tasks lands with `?tab=team&action=new`) doesn't have the
 * two hooks put each other's key back. See ./consumed-params.ts.
 */
export function useActionParam(value: string, onMatch: () => void): void {
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
    onMatch();
    markParamConsumed(ACTION_KEY);
    setParams(withoutConsumedParams(params), { replace: true });
  }, [params, value, onMatch, setParams]);
}
