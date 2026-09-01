import { useMemo } from "react";
import { useGetTeamMembersQuery } from "@/redux/services/dashboard/team-mgt-api";
import type { TeamMember } from "@/redux/services/dashboard/dashboard-types";
import { returnInitial } from "@/utils/helpers";

/** Backend user FKs serialize as numbers; normalize everything to a string key. */
type UserId = string | number | null | undefined;
const toKey = (id: UserId): string => (id == null ? "" : String(id));

/**
 * Resolves workflow user IDs (requesters, actors, eligible approvers) to
 * display names + initials by reusing the existing /user/users/ directory.
 *
 * The workflow API only returns bare user IDs; this hook fetches the staff
 * directory once (RTK-cached + deduped across every consumer) and exposes
 * cheap lookups. For an internal console with a bounded staff set this is the
 * pragmatic resolver - see project_workflow_module memory.
 */
export function useUserDirectory() {
  const { data, isLoading } = useGetTeamMembersQuery({ page: 1, page_size: 500 });

  const byId = useMemo(() => {
    const map = new Map<string, TeamMember>();
    for (const u of data?.data ?? []) map.set(String(u.id), u);
    return map;
  }, [data]);

  const get = (id: UserId): TeamMember | undefined => {
    const key = toKey(id);
    return key ? byId.get(key) : undefined;
  };

  /** Display name, falling back to a shortened ID when the user isn't found. */
  const name = (id: UserId): string => {
    const key = toKey(id);
    if (!key) return "-";
    const u = byId.get(key);
    return u?.full_name || u?.email || `User ${key.slice(0, 8)}`;
  };

  const initials = (id: UserId): string => {
    const key = toKey(id);
    if (!key) return "-";
    const u = byId.get(key);
    return returnInitial(u?.full_name || u?.email || "U");
  };

  const role = (id: UserId): string => {
    const u = get(id);
    return u?.role || "";
  };

  return { get, name, initials, role, byId, isLoading };
}
