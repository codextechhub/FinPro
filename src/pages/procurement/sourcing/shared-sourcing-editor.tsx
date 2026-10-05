/**
 * Choosing the requisition lines several branches buy together on one RFQ, and
 * seeing the RFQ lines they make. See shared-sourcing.ts for the rules.
 *
 * The lines offered are the server's free lines: approved requisitions of the
 * branches the reader works in, on no live RFQ, order or shared RFQ. A
 * requisition is picked whole by default, and single lines can be left out. A
 * search narrows the list without dropping what is already picked, so a buyer
 * can pick Ikeja's chairs, search for Lekki's and keep both.
 */

import { useMemo, useRef } from "react";

import { LoadingState, toArray } from "@/components/finance-ui";
import { Input } from "@/components/ui/input";
import { formatQuantity } from "@/utils/quantity";
import { useGetFreeRequisitionLinesQuery } from "@/redux/services/procurement/procurement-ext-api";
import { groupSharedLines, participatingBranches, sourceLinesFrom, type SourceLine } from "./shared-sourcing";

/** The page size the picker asks for: the server's ceiling. */
const FREE_LINES_PAGE = 100;

/**
 * The free lines matching `q`, and every line seen so far by id, so a pick
 * survives a search that no longer lists it.
 */
export function useFreeSourceLines(entity: string, q: string, { skip = false }: { skip?: boolean } = {}) {
  const { data, isLoading, isFetching } = useGetFreeRequisitionLinesQuery(
    { entity, page_size: FREE_LINES_PAGE, ...(q ? { q } : {}) }, { skip },
  );
  const seen = useRef(new Map<number, SourceLine>());
  const lines = useMemo(() => {
    const next = sourceLinesFrom(toArray(data?.data));
    for (const line of next) seen.current.set(line.requisition_line, line);
    return next;
  }, [data]);
  const total = data?.pagination?.totalItems ?? lines.length;
  const pick = (ids: number[]) => ids.flatMap((id) => seen.current.get(id) ?? []);
  return { lines, total, isLoading, isFetching, pick };
}

export function SharedSourcingEditor({ lines, total, chosen, isLoading, search, onSearchChange, selected, onSelectedChange, descriptions, onDescriptionsChange }: {
  lines: SourceLine[];
  total: number;
  chosen: SourceLine[];
  isLoading: boolean;
  search: string;
  onSearchChange: (next: string) => void;
  selected: number[];
  onSelectedChange: (ids: number[]) => void;
  descriptions: Record<string, string>;
  onDescriptionsChange: (next: Record<string, string>) => void;
}) {
  const groups = groupSharedLines(chosen);
  const byRequisition = useMemo(() => {
    const map = new Map<string, SourceLine[]>();
    for (const line of lines) map.set(line.requisition_number, [...(map.get(line.requisition_number) ?? []), line]);
    return [...map.entries()];
  }, [lines]);
  const toggle = (ids: number[], on: boolean) => onSelectedChange(on ? [...new Set([...selected, ...ids])] : selected.filter((id) => !ids.includes(id)));
  if (isLoading) return <LoadingState rows={3} />;
  const searchBox = <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by item or requisition number" aria-label="Search requisition lines" className="h-9 bg-white" />;
  if (!lines.length && !search.trim() && !chosen.length) return <p className="rounded-md border border-dashed border-white-02 px-4 py-6 text-center font-mont text-xs text-gray-05">No approved requisition lines are free to buy from. A line already on an RFQ or a purchase order is not offered.</p>;
  return <div className="space-y-4">
    {searchBox}
    {total > lines.length && <p className="font-mont text-[11px] text-gray-05">Showing the first {lines.length} of {total} lines. Search to find the rest.</p>}
    {!lines.length && <p className="rounded-md border border-dashed border-white-02 px-4 py-4 text-center font-mont text-xs text-gray-05">No free requisition lines match.</p>}
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
