import { useMemo } from "react";
import { useDirectory } from "../../host";
import type { HostPerson } from "../../host";
import { returnInitial } from "@/utils/helpers";

/** Backend user FKs serialize as numbers; normalize everything to a string key. */
type UserId = string | number | null | undefined;
const toKey = (id: UserId): string => (id == null ? "" : String(id));

/**
 * Names the people on an approval trail: requesters, voters, eligible approvers.
 *
 * The workflow API sends each person's name beside their id (`actor_name`,
 * `requested_by_name`, `acted_label` and so on), because the trail is read by
 * everyone who may open the document and most of them may not read the staff
 * list. Callers pass that name as `sent`, and it always wins. The host's staff
 * directory is only the fallback for a server that sends no name, and the
 * source of `role`, which the trail deliberately does not carry. A person
 * neither source can name reads "Unknown user", never their id.
 */
export function useUserDirectory() {
  const { data, isLoading } = useDirectory();

  const byId = useMemo(() => {
    const map = new Map<string, HostPerson>();
    for (const u of data ?? []) map.set(String(u.id), u);
    return map;
  }, [data]);

  const get = (id: UserId): HostPerson | undefined => {
    const key = toKey(id);
    return key ? byId.get(key) : undefined;
  };

  const name = (id: UserId, sent?: string | null): string => {
    if (sent) return sent;
    const key = toKey(id);
    if (!key) return "-";
    const u = byId.get(key);
    return u?.full_name || u?.email || "Unknown user";
  };

  const initials = (id: UserId, sent?: string | null): string => {
    if (sent) return returnInitial(sent);
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
