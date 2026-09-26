import { useSearchParams } from "react-router";
import { toArray } from "@/redux/services/finance/api-types";
import { useGetEntitiesQuery } from "@/redux/services/finance/entity-api";
import { EmptyState, LoadingState } from "./states";

export type NoEntityReason = "loading" | "none" | "choose" | "not-yours";

/**
 * Why a screen has no set of books to read yet.
 *
 * "Select an entity" is only true when there is a picker to select from. A
 * school keeps one set of books and is never shown the picker, so telling its
 * bursar to choose one describes a control that does not exist; and while the
 * list is still loading, the honest state is loading.
 */
export function noEntityReason({
  loading,
  count,
  requested,
}: {
  loading: boolean;
  count: number;
  requested: string | null;
}): NoEntityReason {
  if (loading) return "loading";
  if (count === 0) return "none";
  // One set of books resolves on its own, so a miss means the address named
  // books this reader cannot open.
  if (requested) return "not-yours";
  return count > 1 ? "choose" : "loading";
}

/**
 * What a finance or procurement screen shows before it has a set of books.
 * `message` is the screen's own line for the case where a choice is needed.
 */
export function NoEntityState({ message }: { message?: string }) {
  const [searchParams] = useSearchParams();
  const { data, isLoading } = useGetEntitiesQuery({ is_active: true });
  const reason = noEntityReason({
    loading: isLoading,
    count: toArray(data?.data).length,
    requested: searchParams.get("entity")?.trim() || null,
  });

  if (reason === "loading") return <LoadingState rows={6} />;
  if (reason === "none") {
    return (
      <EmptyState
        title="No set of books yet"
        message="There is no ledger entity to show here yet."
      />
    );
  }
  if (reason === "not-yours") {
    return (
      <EmptyState
        title="These books are not available"
        message="The link names a set of books you cannot open."
      />
    );
  }
  return <EmptyState title="Select an entity" message={message} />;
}
