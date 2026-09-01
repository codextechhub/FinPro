// Stock locations, and the one rule that outranks every other decision about them.
//
// A stock location is a place stock physically sits. Most schools have exactly one,
// and for them the concept must not exist on screen at all: no picker, no column, no
// "All locations" chip, no empty state. An empty column is worse than no column, and
// branch-optional and multi-branch schools both have to look finished.
//
// So every location-aware surface asks this hook first and renders the control only
// when `multi` is true. Zero or one active location renders nothing.
import { useMemo } from "react";

import { toArray } from "@/components/finance-ui";
import { useGetStockLocationsQuery } from "@/redux/services/procurement/procurement-ext-api";
import type { StockLocation } from "@/redux/services/procurement/procurement-types";

export interface StockLocationsState {
  /** Active locations, default first (the server orders them that way). */
  locations: StockLocation[];
  /** True only when this entity really has more than one active location. */
  multi: boolean;
  /** The entity's default store, pre-filled into movement forms. */
  defaultLocation: StockLocation | null;
  /**
   * Whether the answer is known yet. `multi` is false while loading, which is the
   * safe default for *hiding* a control but not for *requiring* a field - a form
   * that gates a required location on `multi` alone would let an early submit
   * through and collect a 409 from the server. Gate submission on this too.
   */
  resolved: boolean;
  /** True when the caller may not read locations at all (no procurement.stock.view). */
  forbidden: boolean;
}

export function useStockLocations(entity: string | undefined): StockLocationsState {
  const { data, isLoading, isError, error } = useGetStockLocationsQuery(
    // Active only: an archived store is not somewhere stock can move to or from, so
    // it must not make a one-store school look like a two-store one.
    { entity: entity!, is_active: "true", page_size: 100 },
    { skip: !entity },
  );

  return useMemo(() => {
    const locations = toArray(data?.data);
    const status = (error as { status?: number } | undefined)?.status;
    return {
      locations,
      multi: locations.length > 1,
      defaultLocation: locations.find((row) => row.is_default) ?? locations[0] ?? null,
      resolved: !isLoading && !isError,
      forbidden: status === 403,
    };
  }, [data, isLoading, isError, error]);
}
