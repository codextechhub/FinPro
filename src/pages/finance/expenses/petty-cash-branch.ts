/**
 * Which branch's petty cash the page shows, and which fund.
 *
 * A float is one branch's cash tin, so the branch decides which funds are on
 * offer. The rule is the server's own:
 *
 * - At a school with one branch nothing about branches is asked or shown.
 * - A reader whose reach is one branch (Mrs Adeyemi, posted to Lekki) sees
 *   Lekki's floats without being asked.
 * - Anyone else at a school with several branches (Mrs Bello, bursar for Ikeja
 *   and Lekki) picks All branches or one branch. The pick lives in the page
 *   address (`?branch=`), as does the fund (`?fund=`), so two tabs can hold two
 *   branches. Under All branches every fund and every return names its branch.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { useReaderBranchLens, type ReaderBranchLens } from "@/components/finance-ui/raising-branch";
import type { PettyCashFund } from "@/redux/services/finance/ops-types";
import { NO_BRANCH_YET } from "../../../lib/branch-labels";

/** The page-address keys the petty cash page keeps. */
export const PETTY_CASH_BRANCH_PARAM = "branch";
export const PETTY_CASH_FUND_PARAM = "fund";

export interface PettyCashBranch {
  /** The school runs more than one branch. */
  applies: boolean;
  /** The reader may switch between All branches and their branches. */
  canChoose: boolean;
  /** The branch shown, or "all" for every branch in the reader's reach. */
  selected: number | "all";
  /** Rows name their branch: several branches are on screen at once. */
  showBranch: boolean;
  choices: { id: number; name: string }[];
}

/** The rule in the file's doc block, as plain data. */
export function pettyCashBranchFor(lens: ReaderBranchLens, param: string | null): PettyCashBranch {
  const choices = lens.choices.map((b) => ({ id: Number(b.id), name: b.name }));
  if (!lens.applies) return { applies: false, canChoose: false, selected: "all", showBranch: false, choices };
  const fixed = lens.pinnedBranch ?? (choices.length === 1 ? choices[0].id : null);
  if (fixed != null) return { applies: true, canChoose: false, selected: fixed, showBranch: false, choices };
  const picked = param != null && /^\d+$/.test(param) && choices.some((b) => b.id === Number(param)) ? Number(param) : null;
  return {
    applies: true,
    canChoose: true,
    selected: picked ?? "all",
    showBranch: picked == null,
    choices,
  };
}

/** A branch's name, or what a row not yet given one is called. */
export function branchName(view: PettyCashBranch, id: number | null | undefined): string {
  if (id == null) return NO_BRANCH_YET;
  return view.choices.find((b) => b.id === id)?.name ?? `Branch ${id}`;
}

/** The rows of the branch shown; every row under All branches. */
export function inBranch<T extends { branch_id?: number | null }>(rows: T[], view: PettyCashBranch): T[] {
  if (!view.applies || view.selected === "all") return rows;
  return rows.filter((row) => (row.branch_id ?? null) === view.selected);
}

/** The fund the page opens on: the one in the address, else the first running one. */
export function pickFund(funds: PettyCashFund[], param: string | null): PettyCashFund | undefined {
  const asked = param != null && /^\d+$/.test(param) ? funds.find((f) => f.id === Number(param)) : undefined;
  return asked ?? funds.find((f) => f.is_active && f.state !== "CLOSED") ?? funds[0];
}

/** How a fund reads in the fund picker. */
export function fundOptionLabel(fund: PettyCashFund, view: PettyCashBranch): string {
  const parts = [fund.name];
  if (fund.custodian_label) parts.push(fund.custodian_label);
  if (view.showBranch) parts.push(branchName(view, fund.branch_id));
  const label = parts.join(" · ");
  return fund.state === "CLOSED" ? `${label} (closed)` : label;
}

/** The page's branch and fund for the signed-in reader, kept in the page address. */
export function usePettyCashBranch() {
  const lens = useReaderBranchLens();
  const [params, setParams] = useSearchParams();
  const branchParam = params.get(PETTY_CASH_BRANCH_PARAM);
  const fundParam = params.get(PETTY_CASH_FUND_PARAM);
  const view = useMemo(() => pettyCashBranchFor(lens, branchParam), [lens, branchParam]);
  const set = useCallback((key: string, value: string | null, clear?: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value == null) next.delete(key);
      else next.set(key, value);
      if (clear) next.delete(clear);
      return next;
    }, { replace: true });
  }, [setParams]);
  const chooseBranch = useCallback(
    (next: number | "all") => set(PETTY_CASH_BRANCH_PARAM, next === "all" ? null : String(next), PETTY_CASH_FUND_PARAM),
    [set],
  );
  const chooseFund = useCallback((id: number) => set(PETTY_CASH_FUND_PARAM, String(id)), [set]);
  return { view, fundParam, chooseBranch, chooseFund };
}
