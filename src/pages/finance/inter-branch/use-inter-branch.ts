/**
 * The reader of the Between Branches screens: whether the school runs more than
 * one branch, every branch it runs, the reader's own branches, how far their
 * changes reach, and which inter-branch keys they hold.
 *
 * Every branch, not only the reader's, because a branch deals with branches it
 * does not work in: Mrs Adeyemi at Lekki asks Ikeja for money and owes Ikeja
 * for a recharge, though she cannot read Ikeja's books. The host's branch list
 * names every branch of the school; the reach decides which of them are hers.
 */

import { useMemo } from "react";

import { useCan } from "@/components/finance-ui/can";
import { useReaderBranchLens } from "@/components/finance-ui";
import { P, type PermissionCode } from "../../../permissions";
import { useBranches, useReaderReach, type HostReaderReach } from "../../../host";
import type { TransferKeys } from "./transfer-actions";

export interface BranchOption {
  id: number;
  name: string;
}

export interface InterBranchReader {
  /** The school runs more than one branch. */
  applies: boolean;
  isLoading: boolean;
  /** Every branch of the school. */
  branches: BranchOption[];
  /** The branches the reader works in (all of them for a whole-school reader). */
  mine: BranchOption[];
  reach: HostReaderReach;
  keys: TransferKeys & { view: boolean; request: boolean; recharge: boolean };
  /** A branch's name, or "Branch <id>" when the list does not carry it. */
  nameOf(id: number | null | undefined): string;
}

/** The rule as plain data, so it can be tested apart from React. */
export function interBranchReader({ applies, isLoading, rows, reach, can }: {
  applies: boolean;
  isLoading: boolean;
  rows: { id: string | number; name: string }[];
  reach: HostReaderReach;
  can: (code: PermissionCode) => boolean;
}): InterBranchReader {
  const branches = rows.map((b) => ({ id: Number(b.id), name: b.name }));
  const names = new Map(branches.map((b) => [b.id, b.name]));
  const mine = reach.wholeSchool || reach.branchIds === null
    ? branches
    : branches.filter((b) => reach.branchIds!.includes(b.id));
  return {
    applies,
    isLoading,
    branches,
    mine,
    reach,
    keys: {
      view: can(P.FIN_VIEW_INTERBRANCH),
      request: can(P.FIN_REQUEST_INTERBRANCH),
      transfer: can(P.FIN_TRANSFER_INTERBRANCH),
      confirm: can(P.FIN_CONFIRM_INTERBRANCH),
      recharge: can(P.FIN_RECHARGE_INTERBRANCH),
      reverse: can(P.FIN_REVERSE_INTERBRANCH),
    },
    nameOf: (id) => (id == null ? "" : names.get(Number(id)) ?? `Branch ${id}`),
  };
}

export function useInterBranchReader(): InterBranchReader {
  const lens = useReaderBranchLens();
  const reach = useReaderReach();
  const { data, isLoading } = useBranches();
  const { can } = useCan();
  return useMemo(
    () => interBranchReader({
      applies: lens.applies,
      isLoading: lens.isLoading || isLoading,
      rows: data ?? [],
      reach,
      can,
    }),
    [lens.applies, lens.isLoading, isLoading, data, reach, can],
  );
}
