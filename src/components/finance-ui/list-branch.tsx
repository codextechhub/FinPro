/**
 * Which branch a list shows, in Finance (deferred income, provisions, deposits,
 * credit transfers, payer payments, terminal payments) and in Procurement
 * (requisitions, sourcing, orders, receipts, supplier bills, payments, credit
 * notes and the analytics reports).
 *
 * The server narrows each list with `?branch=` (one branch the reader works in,
 * or the rows not yet given one) and refuses a branch outside the reader's
 * reach. The two engines spell "not yet given one" differently, so each has its
 * own argument builder: `listBranchArg` for Finance, `procurementBranchArg` for
 * Procurement. The rule for the screen:
 *
 * - At a school with one branch nothing about branches is asked or shown.
 * - A reader whose reach is one branch (Mrs Adeyemi, posted to Lekki) sees
 *   Lekki's rows without being asked; the server narrows them already.
 * - Anyone else at a school with several branches (Mrs Bello, bursar for Ikeja
 *   and Lekki) reads the branch she picks on the app's own branch switcher, the
 *   pill under the sidebar menu. That switcher is the only branch control: a
 *   list shows no picker of its own and reads no `?branch=` from its address,
 *   so switching the pill from Ikeja to Lekki always moves the list with it.
 * - An app with no switcher of its own (the console, which supplies no
 *   `useBranchLens`) gets the picker on the page instead. The pick lives in the
 *   page address (`?branch=`), so two tabs can hold two branches, and only a
 *   whole-school reader is offered "No branch yet", because only she can see
 *   such rows.
 *
 * Under All branches each row names its branch; with one branch picked the
 * column would repeat itself, so it is left out.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { useReaderBranchLens, type ReaderBranchLens } from "./raising-branch";
import { NativeSelect } from "@/components/ui/native-select";
import { hostBranchLens, useReaderReach } from "../../host";
import { NO_BRANCH_YET } from "../../lib/branch-labels";

export const LIST_BRANCH_PARAM = "branch";
const UNASSIGNED = "unassigned";

export interface ListBranchView {
  /** The school runs more than one branch. */
  applies: boolean;
  /** The reader may switch between All branches and their branches. */
  canChoose: boolean;
  /** The branch shown, "all" for every branch in reach, or rows with no branch yet. */
  selected: number | "all" | "unassigned";
  /** Rows name their branch: several branches are on screen at once. */
  showBranch: boolean;
  /** Offer "No branch yet": only a whole-school reader sees such rows. */
  offerUnassigned: boolean;
  choices: { id: number; name: string }[];
  /** The page offers its own branch picker. False where the app's switcher is
   *  the branch control; absent is read as true. */
  pageControl?: boolean;
}

/** The rule in the file's doc block, as plain data. */
export function listBranchFor(lens: ReaderBranchLens, param: string | null, wholeSchool: boolean): ListBranchView {
  const choices = lens.choices.map((b) => ({ id: Number(b.id), name: b.name }));
  const none = { applies: false, canChoose: false, selected: "all" as const, showBranch: false, offerUnassigned: false, choices };
  if (!lens.applies) return none;
  const fixed = lens.pinnedBranch ?? (choices.length === 1 ? choices[0].id : null);
  if (fixed != null) return { ...none, applies: true, selected: fixed };
  const known = (id: number) => choices.some((b) => b.id === id);
  let selected: ListBranchView["selected"] = "all";
  if (param === UNASSIGNED && wholeSchool) selected = UNASSIGNED;
  else if (param != null && /^\d+$/.test(param) && known(Number(param))) selected = Number(param);
  else if (param == null && lens.branch !== "all" && known(lens.branch)) selected = lens.branch;
  return { applies: true, canChoose: true, selected, showBranch: selected === "all", offerUnassigned: wholeSchool, choices };
}

/** The `?branch=` a list asks the server for: the branch picked, or none for all of the reader's. */
export function listBranchArg(view: ListBranchView): { branch?: number | "unassigned" } {
  return view.canChoose && view.selected !== "all" ? { branch: view.selected } : {};
}

/** The same `?branch=` for a Procurement list, whose server spells "no branch yet" as `none`. */
export function procurementBranchArg(view: ListBranchView): { branch?: number | "none" } {
  if (!view.canChoose || view.selected === "all") return {};
  return { branch: view.selected === UNASSIGNED ? "none" : view.selected };
}

/** Whether a list's branch picker belongs on the page: only where the app keeps no switcher. */
export function branchPickedOnPage(view: ListBranchView): boolean {
  return view.canChoose && view.pageControl !== false;
}

/**
 * The list's branch: the app's switcher where it has one, else the page's own
 * pick, read from and written to the page address.
 */
export function useListBranch(): { view: ListBranchView; choose: (next: string) => void } {
  const lens = useReaderBranchLens();
  const { wholeSchool } = useReaderReach();
  const [params, setParams] = useSearchParams();
  const appSwitcher = hostBranchLens != null;
  const param = appSwitcher ? null : params.get(LIST_BRANCH_PARAM);
  const view = useMemo(
    () => ({ ...listBranchFor(lens, param, wholeSchool), pageControl: !appSwitcher }),
    [lens, param, wholeSchool, appSwitcher],
  );
  const choose = useCallback((next: string) => {
    const copy = new URLSearchParams(params);
    copy.set(LIST_BRANCH_PARAM, next || "all");
    setParams(copy, { replace: true });
  }, [params, setParams]);
  return { view, choose };
}

/**
 * The branch picker of a list's filter bar. Nothing where there is no choice to
 * make, and nothing where the app's own switcher is the branch control.
 */
export function ListBranchSelect({ view, onChange, className }: {
  view: ListBranchView; onChange: (next: string) => void; className?: string;
}) {
  if (!branchPickedOnPage(view)) return null;
  return (
    <div className={className ?? "w-full sm:w-60"}>
      <NativeSelect value={String(view.selected)} onChange={(e) => onChange(e.target.value)} aria-label="Branch" className="h-9">
        <option value="all">All branches</option>
        {view.choices.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        {view.offerUnassigned ? <option value={UNASSIGNED}>{NO_BRANCH_YET}</option> : null}
      </NativeSelect>
    </div>
  );
}
