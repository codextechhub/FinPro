/**
 * The active entity's posting window - which dates a document may carry.
 *
 * Every document date in Finance and Procurement ends up at the same backend
 * guard: `ensure_period_open` rejects a date outside an OPEN fiscal period with a
 * 409. Without this, a user fills a whole drawer and only then learns the date was
 * never allowed. Read this hook, feed `ranges` to <PostingDateField>, and the
 * calendar stops offering those days at all.
 *
 * Degrades open on purpose: if the window can't be read (no entity yet, a 403, the
 * network), `constrained` is false and every date stays selectable. A permission
 * gap must never lock someone out of a form - the backend guard is still there.
 */

import { useMemo } from "react";
import { useGetPostingWindowQuery } from "@/redux/services/finance/setup-api";
import type { PeriodBrief } from "@/redux/services/finance/setup-types";
import {
  blockedReason,
  isWithinRanges,
  openWindowLabel,
  toOpenRanges,
  todayISO,
  type OpenRange,
} from "@/utils/posting-window";
import { useEntityCode } from "./use-entity";

export interface PostingWindowState {
  /** Selectable spans, oldest first. Empty means unconstrained - see `constrained`. */
  ranges: OpenRange[];
  /** The date a new document should open on. Never empty. */
  defaultDate: string;
  /** True once a real window was read; false while loading or when unavailable. */
  constrained: boolean;
  /** The entity has fiscal periods, but none of them are open. Nothing can post. */
  noOpenPeriod: boolean;
  /** e.g. "Jan 2026" or "Jan 2026 – Mar 2026"; null when unconstrained. */
  label: string | null;
  /** Periods that exist but reject postings - used to explain a blocked day. */
  blocked: PeriodBrief[];
  /** Is this date postable? Always true while unconstrained. */
  isOpen: (date: string) => boolean;
  /** Why this date is unavailable, as a sentence, or null if it's fine. */
  reasonFor: (date: string) => string | null;
  isLoading: boolean;
}

/**
 * The posting window for the globally-selected entity (or an explicit `entity`).
 *
 * Pass `entity` only when the component is scoped to a different entity than the
 * global picker - most callers should let it default.
 */
export function usePostingWindow(entity?: string | null): PostingWindowState {
  const activeCode = useEntityCode();
  const code = entity ?? activeCode;

  const { data, isLoading, isError } = useGetPostingWindowQuery(
    { entity: code! },
    { skip: !code },
  );

  return useMemo(() => {
    const window = data?.data;
    // No window to apply: still loading, no entity chosen, or the read failed.
    // Fall back to an unconstrained field defaulting to today.
    if (!window || isError) {
      return {
        ranges: [],
        defaultDate: todayISO(),
        constrained: false,
        noOpenPeriod: false,
        label: null,
        blocked: [],
        isOpen: () => true,
        reasonFor: () => null,
        isLoading,
      };
    }

    const open = window.open ?? [];
    const blocked = window.blocked ?? [];
    const ranges = toOpenRanges(open);

    return {
      ranges,
      // `default_date` is null only when nothing is open at all. Today is then as
      // good a placeholder as any - the field surfaces `noOpenPeriod` instead of
      // pretending some date would work.
      defaultDate: window.default_date ?? todayISO(),
      constrained: ranges.length > 0,
      noOpenPeriod: open.length === 0,
      label: openWindowLabel(open),
      blocked,
      isOpen: (date: string) => isWithinRanges(date, ranges),
      reasonFor: (date: string) => blockedReason(date, ranges, blocked),
      isLoading,
    };
  }, [data, isError, isLoading]);
}
