import { useMemo } from "react";
import { useBranches, useDirectory, useRoles } from "@xvs/finance/host";
import type { NameLookups } from "./dynamic-role-format";

/**
 * Names for the branches, people and roles a Dynamic Role rule may hold.
 *
 * Read from the host's own lists rather than asked of the server, because
 * each app already loads them and scopes them to the caller: a school sees its
 * own branches and staff, and the console sees CodeX's.
 */
export function useRuleNames(): NameLookups {
  const { data: branches } = useBranches();
  const { data: people } = useDirectory();
  const { data: roles } = useRoles();
  return useMemo(() => {
    const branchNames = new Map((branches ?? []).map((b) => [String(b.id), b.name]));
    const personNames = new Map((people ?? []).map((p) => [String(p.id), p.full_name || p.email]));
    const roleNames = new Map((roles ?? []).map((r) => [r.key, r.name]));
    return {
      branch: (id: string) => branchNames.get(id),
      person: (id: string) => personNames.get(id),
      role: (key: string) => roleNames.get(key),
    };
  }, [branches, people, roles]);
}
