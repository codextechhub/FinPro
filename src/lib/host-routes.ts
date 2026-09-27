import { useCallback, useContext } from "react";
import { matchRoutes, UNSAFE_DataRouterContext, type RouteObject } from "react-router";

/**
 * Whether the application this package runs inside serves an address.
 *
 * The screens here link to one another and to screens the host owns, and the
 * two hosts do not mount the same set. The console serves workflow instances,
 * the platform audit log and the Payments area; the school app serves none of
 * them. A link that leads a school reader to a 404 is a broken screen, however
 * correct it is in the console.
 *
 * The host's router is the only thing that knows what it mounts, so the
 * question goes to it rather than to a list kept here. Finance Settings and
 * Setup sections are answered by the host contract's own section lists, which
 * both routers are built from; every other cross-screen link asks this.
 *
 * A path that only the catch-all route answers is not served: that route is
 * the 404 page. A query string or hash narrows what a screen does rather than
 * which screen it is, so it is ignored.
 */
export function servesPath(
  routes: RouteObject[],
  to: string,
  basename?: string,
): boolean {
  if (!to.startsWith("/")) return false;
  const path = to.split(/[?#]/)[0];
  const matches = matchRoutes(routes, path, basename);
  if (!matches?.length) return false;
  return matches[matches.length - 1].route.path !== "*";
}

/**
 * The host's answer to "does this app serve that address?", as a function.
 *
 * Outside a data router, as in a component test under `MemoryRouter`, there is
 * no route table to read, and every path counts as served: nothing can say
 * otherwise, and a link that renders is the behaviour the screen had before
 * it asked.
 */
export function useServesPath(): (to: string) => boolean {
  const context = useContext(UNSAFE_DataRouterContext);
  const routes = context?.router.routes as RouteObject[] | undefined;
  const basename = context?.basename;
  return useCallback(
    (to: string) => (routes ? servesPath(routes, to, basename) : true),
    [routes, basename],
  );
}
