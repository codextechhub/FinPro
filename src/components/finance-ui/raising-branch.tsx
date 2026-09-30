/**
 * The branch a new transaction is raised for.
 *
 * Every transaction names a real branch. At a school with several branches the
 * server refuses a whole-school reader who names none ("Name the branch this is
 * for; the school has more than one."), takes a branch-bound reader's own
 * branch when she works in one, and at a school with one branch files every
 * transaction under it without asking. So a create form asks only when there is
 * a real question: the school runs more than one branch AND the reader is not
 * pinned to one. Mr Bello, the whole-school bursar at a school with Ikeja and
 * Lekki, is asked; Mrs Adeyemi, posted to Ikeja alone, and Harbour Primary's
 * bursar at a one-branch school are not, and their forms send no branch.
 *
 * The field starts from the branch the reader is working in on the app's
 * branch switcher, so Mr Bello, working in Lekki, raises for Lekki unless he
 * changes it.
 *
 * Budgets are plans, not transactions, and keep their own owner field with a
 * School-wide choice (see the budgets tab).
 */

import { useMemo, useState } from "react";

import { NativeSelect } from "@/components/ui/native-select";
import { useAppSelector } from "@/redux/store";
import { useBranches, type HostBranch } from "../../host";
import { FormField } from "./form-modal";

/** The reader's branch lens: which branches they may work in, and which one
 *  they are working in now. The school app's own lens has this shape. */
export interface ReaderBranchLens {
  /** True when the school runs more than one branch. */
  applies: boolean;
  /** The one branch the reader may work in, when their reach is exactly one. */
  pinnedBranch: number | null;
  /** The branch the reader is working in, or "all" when the lens reads every
   *  branch in their reach. */
  branch: number | "all";
  /** The branches this reader may pick between. */
  choices: HostBranch[];
  isLoading: boolean;
}

/** The session's branch reach, as the school app stores it. */
interface SessionReach {
  whole_tenant: boolean;
  branch_ids: number[];
}

/**
 * The lens for an app that does not supply one: every branch the app lists,
 * narrowed to the session's branch reach. Until a session carries a reach, the
 * home posting stands in for it, as the server itself does for a user with no
 * role grants; a reader with neither is whole-school. There is no switcher to
 * read, so `branch` is always "all".
 */
export function fallbackBranchLens({ branches, reach, homeBranchId, isLoading }: {
  branches: HostBranch[];
  reach: SessionReach | null | undefined;
  homeBranchId: number | null | undefined;
  isLoading: boolean;
}): ReaderBranchLens {
  const reachIds = reach
    ? (reach.whole_tenant ? null : reach.branch_ids)
    : homeBranchId != null ? [homeBranchId] : null;
  const choices = reachIds === null ? branches : branches.filter((b) => reachIds.includes(Number(b.id)));
  const applies = branches.length > 1;
  return {
    applies,
    pinnedBranch: applies && reachIds?.length === 1 ? reachIds[0] : null,
    branch: "all",
    choices,
    isLoading,
  };
}

function useFallbackBranchLens(): ReaderBranchLens {
  const { data, isLoading } = useBranches();
  // Read loosely: the console's session carries no branch reach at all.
  const auth = useAppSelector((state) => state.auth as unknown as {
    branch_reach?: SessionReach | null;
    user?: { branch_id?: number | null } | null;
  });
  return useMemo(
    () => fallbackBranchLens({
      branches: data ?? [],
      reach: auth?.branch_reach,
      homeBranchId: auth?.user?.branch_id,
      isLoading,
    }),
    [data, auth?.branch_reach, auth?.user?.branch_id, isLoading],
  );
}

/** The reader's branch lens, derived from the app's branch list and the
 *  session's branch reach. */
export const useReaderBranchLens: () => ReaderBranchLens = useFallbackBranchLens;

/** What a create form needs to know about the branch it raises for. */
export interface RaisingBranch {
  /** Whether the form asks for a branch. */
  ask: boolean;
  /** The branches it offers when it asks. */
  choices: HostBranch[];
  /** The reader's one branch when she is pinned to it; the server files her
   *  transactions there without being told. */
  pinned: number | null;
  /** The branch the field starts on: the one the reader is working in, when it
   *  is one of the choices, else the only choice, else none. */
  initial: string;
  isLoading: boolean;
}

/** The rule above, as plain data so it can be tested apart from React. */
export function raisingBranchFor(lens: ReaderBranchLens): RaisingBranch {
  const ask = lens.applies && lens.pinnedBranch == null && lens.choices.length > 0;
  if (!ask) return { ask, choices: [], pinned: lens.pinnedBranch, initial: "", isLoading: lens.isLoading };
  const working = lens.branch !== "all" && lens.choices.some((b) => Number(b.id) === lens.branch)
    ? String(lens.branch)
    : lens.choices.length === 1 ? String(lens.choices[0].id) : "";
  return { ask, choices: lens.choices, pinned: null, initial: working, isLoading: lens.isLoading };
}

/** The raising-branch rule for the signed-in reader. */
export function useRaisingBranch(): RaisingBranch {
  const lens = useReaderBranchLens();
  return useMemo(() => raisingBranchFor(lens), [lens]);
}

/**
 * The request fields that name the branch: `{ branch }` when the form asked
 * and one is chosen, nothing otherwise, so a pinned reader or a one-branch
 * school leaves the choice to the server. `field` names the key for a route
 * that reads it under another name (a customer's `opening_branch`).
 */
export function raisedBranchBody(raising: RaisingBranch, value: string, field = "branch"): Record<string, number> {
  return raising.ask && value ? { [field]: Number(value) } : {};
}

/** Whether a form may submit as far as its branch goes. */
export function raisingBranchReady(raising: RaisingBranch, value: string): boolean {
  return !raising.ask || !!value;
}

/**
 * A create form's branch choice: the rule, the value (the reader's pick, else
 * the field's starting branch), and the request fields it adds.
 *
 * The value is derived rather than copied into state on open, so a form opened
 * before the branch list arrives still starts on the working branch. `reset`
 * forgets the pick when the form closes.
 */
export function useRaisingBranchChoice() {
  const raising = useRaisingBranch();
  const [picked, setPicked] = useState<string | null>(null);
  const value = picked ?? raising.initial;
  return {
    raising,
    value,
    setValue: (branch: string) => setPicked(branch),
    reset: () => setPicked(null),
    ready: raisingBranchReady(raising, value),
    /** The branch the new row will belong to, where the form knows it: the
     *  one chosen, or the reader's own when she is pinned. Undefined at a
     *  one-branch school or before a choice, which leaves a bank picker
     *  un-narrowed. */
    branchId: raising.ask ? (value ? Number(value) : undefined) : raising.pinned ?? undefined,
    body: (field = "branch") => raisedBranchBody(raising, value, field),
  };
}

/** What `useRaisingBranchChoice` returns. */
export type RaisingBranchChoice = ReturnType<typeof useRaisingBranchChoice>;

/**
 * The Branch field on a create form. Renders nothing when the form does not
 * ask (see the file's doc block), so a form can place it unconditionally.
 */
export function RaisingBranchField({ raising, value, onChange, label = "Branch", hint }: {
  raising: RaisingBranch;
  value: string;
  onChange: (branch: string) => void;
  label?: string;
  hint?: string;
}) {
  if (!raising.ask) return null;
  return (
    <FormField label={label} required>
      <NativeSelect value={value} disabled={raising.isLoading} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="" disabled>Select branch</option>
        {raising.choices.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
      </NativeSelect>
      {hint ? <span className="mt-1 block font-mont text-[11px] leading-5 text-gray-05">{hint}</span> : null}
    </FormField>
  );
}

/** `RaisingBranchField` bound to a form's `useRaisingBranchChoice`. */
export function RaisingBranchChoiceField({ choice, label, hint }: { choice: RaisingBranchChoice; label?: string; hint?: string }) {
  return <RaisingBranchField raising={choice.raising} value={choice.value} onChange={choice.setValue} label={label} hint={hint} />;
}
