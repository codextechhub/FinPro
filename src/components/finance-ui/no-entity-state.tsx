import { useSearchParams } from "react-router";
import { toArray } from "@/redux/services/finance/api-types";
import { useGetEntitiesQuery } from "@/redux/services/finance/entity-api";
import { isForbidden } from "../../lib/api-errors";
import { noAccessMessage } from "./no-access";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "./states";

export type NoEntityReason = "loading" | "refused" | "failed" | "none" | "choose" | "not-yours";

/**
 * Why a screen has no set of books to read yet.
 *
 * "Select an entity" is only true when there is a picker to select from. A
 * school keeps one set of books and is never shown the picker, so telling its
 * bursar to choose one describes a control that does not exist; and while the
 * list is still loading, the honest state is loading.
 *
 * "No set of books yet" is only true when the list loaded and came back empty.
 * A reader whose role cannot view the books gets the same empty count from a
 * refused request, and reading that as "no books" sends a school looking for
 * books it already keeps: Lagoon View's admin, whose role holds no finance
 * keys, opened Budgets and was told the school had no set of books. A refusal
 * says the role cannot view them; a failed request says so and offers a retry.
 */
export function noEntityReason({
  loading,
  error,
  count,
  requested,
}: {
  loading: boolean;
  error?: unknown;
  count: number;
  requested: string | null;
}): NoEntityReason {
  if (loading) return "loading";
  if (isForbidden(error)) return "refused";
  if (error) return "failed";
  if (count === 0) return "none";
  // One set of books resolves on its own, so a miss names books this reader cannot open.
  if (requested) return "not-yours";
  return count > 1 ? "choose" : "loading";
}

/**
 * What a finance or procurement screen shows before it has a set of books.
 * `message` is the screen's own line for the case where a choice is needed.
 */
export function NoEntityState({ message }: { message?: string }) {
  const [searchParams] = useSearchParams();
  const { data, isLoading, error, refetch } = useGetEntitiesQuery({ is_active: true });
  const reason = noEntityReason({
    loading: isLoading,
    error,
    count: toArray(data?.data).length,
    requested: searchParams.get("entity")?.trim() || null,
  });

  if (reason === "loading") return <LoadingState rows={6} />;
  if (reason === "refused") return <ForbiddenState message={noAccessMessage("view the books")} />;
  if (reason === "failed") return <ErrorState message="The books could not be loaded." onRetry={refetch} />;
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
