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
  // Nothing resolves until the list is in: returning a code here would send it
  // to the backend before we know the caller may read it.
  if (entities.length === 0) return null;

  const known = (code: string | null) =>
    code !== null && entities.some((entity) => entity.code === code);

  // An explicit ?entity= wins, but only if it is one of theirs. A code that is
  // not resolves to null rather than falling back, so a shared or edited URL
  // fails visibly instead of quietly showing a different school's books.
  if (requestedCode) return known(requestedCode) ? requestedCode : null;

  // The stored choice is only honoured while it is still one of theirs.
  //
  // It used to be returned unchecked, and that is what put a code belonging to
  // another tenant on every request: the backend refused each one with a 404
  // ("Resource not found"), because resolve_entity only matches within the
  // caller's own tenant. The console never showed it because its EntitySelect
  // corrects the stored code on mount; an app that does not render the switcher
  // - a school has one set of books, so there is nothing to switch - had
  // nothing to correct it.
  if (known(selectedCode)) return selectedCode;

  // Otherwise take the only sensible default. A school has exactly one set of
  // books, so this is the answer rather than a guess.
  return entities[0].code;
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
