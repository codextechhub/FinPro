// Hooks for the globally-selected ledger entity. Almost every finance/
// procurement query is entity-scoped, so pages read the active entity's CODE
// from here and thread it into requests; <Money> reads its base currency.

import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { selectEntityCode, setSelectedEntity } from "@/redux/features/finance/entity-slice";
import { useGetEntitiesQuery } from "@/redux/services/finance/entity-api";
import type { LedgerEntity } from "@/redux/services/finance/entity-types";

interface ActiveEntity {
  /** The selected entity code, or null until one is chosen. */
  code: string | null;
  /** The resolved entity record (once the list has loaded). */
  entity: LedgerEntity | null;
  /** base_currency of the active entity (for <Money currency=…/>). */
  currency: string | null;
  isLoading: boolean;
}

export function resolveActiveEntityCode(
  selectedCode: string | null,
  requestedCode: string | null,
  entities: LedgerEntity[],
): string | null {
  if (!requestedCode) return selectedCode;
  return entities.some((entity) => entity.code === requestedCode) ? requestedCode : null;
}

/**
 * The active entity, resolved against the loaded entity list. Use `code` to
 * scope queries (skip them while it's null) and `currency` for money display.
 */
export function useActiveEntity(): ActiveEntity {
  const dispatch = useAppDispatch();
  const selectedCode = useAppSelector(selectEntityCode);
  const [searchParams] = useSearchParams();
  const requestedCode = searchParams.get("entity")?.trim() || null;
  const { data, isLoading } = useGetEntitiesQuery({ is_active: true });
  const entities = useMemo(
    () => Array.isArray(data?.data) ? data.data : [],
    [data],
  );
  const code = resolveActiveEntityCode(selectedCode, requestedCode, entities);

  const entity = useMemo(
    () => entities.find((item) => item.code === code) ?? null,
    [entities, code],
  );

  useEffect(() => {
    if (requestedCode && entity && selectedCode !== requestedCode) {
      dispatch(setSelectedEntity(requestedCode));
    }
  }, [dispatch, entity, requestedCode, selectedCode]);

  return {
    code,
    entity,
    currency: entity?.base_currency ?? null,
    isLoading,
  };
}

/** Bare selected code - for components that only need to scope a request. */
export function useEntityCode(): string | null {
  return useAppSelector(selectEntityCode);
}
