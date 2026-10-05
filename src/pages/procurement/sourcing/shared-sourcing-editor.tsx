/**
 * Choosing the requisition lines several branches buy together on one RFQ, and
 * seeing the RFQ lines they make. See shared-sourcing.ts for the rules.
 *
 * Only approved requisitions of branches the reader works in are offered, since
 * the server refuses a shared RFQ that reaches a branch the buyer does not. A
 * requisition is picked whole by default, and single lines can be left out.
 */

import { useMemo } from "react";

import { LoadingState, toArray } from "@/components/finance-ui";
import { Input } from "@/components/ui/input";
import { formatQuantity } from "@/utils/quantity";
import { useGetRequisitionsQuery } from "@/redux/services/procurement/procurement-api";
import { groupSharedLines, participatingBranches, type SourceLine } from "./shared-sourcing";

export function useApprovedSourceLines(entity: string, branchIds: number[] | null): { lines: SourceLine[]; isLoading: boolean } {
  const { data, isLoading } = useGetRequisitionsQuery({ entity, status: "APPROVED", page_size: 100 });
  const lines = useMemo(() => toArray(data?.data).flatMap((req) => {
    if (req.branch_id == null || (branchIds && !branchIds.includes(req.branch_id))) return [];
    return req.lines.map((line) => ({
      requisition_line: line.id,
      requisition_number: req.document_number,
      branch_id: req.branch_id as number,
      branch_name: req.branch_name || "",
      description: line.description,
      quantity: Number(line.quantity),
      expense_code: line.expense_code,
    }));
  }), [data, branchIds]);
  return { lines, isLoading };
}

export function SharedSourcingEditor({ lines, isLoading, selected, onSelectedChange, descriptions, onDescriptionsChange }: {
  lines: SourceLine[];
  isLoading: boolean;
  selected: number[];
  onSelectedChange: (ids: number[]) => void;
  descriptions: Record<string, string>;
  onDescriptionsChange: (next: Record<string, string>) => void;
}) {
  const chosen = lines.filter((line) => selected.includes(line.requisition_line));
  const groups = groupSharedLines(chosen);
  const byRequisition = useMemo(() => {
    const map = new Map<string, SourceLine[]>();
    for (const line of lines) map.set(line.requisition_number, [...(map.get(line.requisition_number) ?? []), line]);
    return [...map.entries()];
  }, [lines]);
  const toggle = (ids: number[], on: boolean) => onSelectedChange(on ? [...new Set([...selected, ...ids])] : selected.filter((id) => !ids.includes(id)));
  if (isLoading) return <LoadingState rows={3} />;
  if (!lines.length) return <p className="rounded-md border border-dashed border-white-02 px-4 py-6 text-center font-mont text-xs text-gray-05">No approved requisitions to buy from yet.</p>;
  return <div className="space-y-4">
    <div className="space-y-2">
      {byRequisition.map(([number, reqLines]) => {
        const ids = reqLines.map((line) => line.requisition_line);
        const all = ids.every((id) => selected.includes(id));
        return <div key={number} className="rounded-md border border-white-02 p-3">
          <label className="flex items-center gap-2 font-mont text-xs font-semibold">
            <input type="checkbox" className="size-4 accent-primary" checked={all} onChange={(event) => toggle(ids, event.target.checked)} />
            <span>{number}</span><span className="font-normal text-gray-05">{reqLines[0].branch_name}</span>
          </label>
          <div className="mt-2 space-y-1 pl-6">{reqLines.map((line) => <label key={line.requisition_line} className="flex items-center gap-2 font-mont text-[11px] text-gray-05">
            <input type="checkbox" className="size-3.5 accent-primary" checked={selected.includes(line.requisition_line)} onChange={(event) => toggle([line.requisition_line], event.target.checked)} />
            <span className="min-w-0 truncate text-black-01">{line.description}</span><span className="tabular-nums">× {formatQuantity(String(line.quantity))}</span>
          </label>)}</div>
        </div>;
      })}
    </div>
    {groups.length > 0 && <div>
      <p className="mb-2 font-mont text-xs font-semibold text-gray-05">What vendors are asked to quote ({participatingBranches(chosen).map((b) => b.name).join(", ")})</p>
      <div className="space-y-2">{groups.map((group) => <div key={group.key} className="grid grid-cols-1 gap-2 rounded-md border border-white-02 p-3 sm:grid-cols-[minmax(0,1fr)_90px]">
        <div className="min-w-0">
          <Input value={descriptions[group.key] ?? group.description} onChange={(event) => onDescriptionsChange({ ...descriptions, [group.key]: event.target.value })} aria-label="RFQ line description" className="bg-white" />
          <p className="mt-1 font-mont text-[11px] text-gray-05">{group.allocations.map((a) => `${a.branch_name} ${formatQuantity(String(a.quantity))}`).join(" · ")}</p>
        </div>
        <p className="self-center text-right font-mont text-sm font-semibold tabular-nums">{formatQuantity(String(group.quantity))}</p>
      </div>)}</div>
    </div>}
  </div>;
}
