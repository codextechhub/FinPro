import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList, ComboboxEmpty,
} from "@/components/ui/combobox";
import { useGetImportJobQuery } from "@/redux/services/dashboard/import-api";

export function RowResultsTab({ batchId, latestJobId }: { batchId: number; latestJobId: number | null }) {
  const { data: job, isLoading, isError, refetch } = useGetImportJobQuery(
    { batchId, jobId: latestJobId as number },
    { skip: !latestJobId },
  );

  const [actionFilter, setActionFilter] = useState<"all" | "create" | "update" | "skip" | "failed">("all");

  if (!latestJobId) {
    return (
      <div className="py-12 text-center text-sm text-gray-01">
        No import jobs have been run for this batch yet.
      </div>
    );
  }

  if (isLoading) return <div className="flex h-32 items-center justify-center"><div className="loader" /></div>;
  if (isError) return (
    <div className="flex h-32 flex-col items-center justify-center gap-2">
      <p className="text-sm text-destructive">Failed to load row results.</p>
      <Button size="sm" variant="white" onClick={() => refetch()}>Retry</Button>
    </div>
  );

  const rows = job?.data?.row_results ?? [];
  const filtered = actionFilter === "all" ? rows : rows.filter((r) => r.action === actionFilter);

  const counts = {
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    skip: rows.filter((r) => r.action === "skip").length,
    failed: rows.filter((r) => r.action === "failed").length,
  };

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-01">
        No row-level results recorded for job #{latestJobId}.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-gray-01">Job #{latestJobId} · {rows.length.toLocaleString()} rows:</span>
          <Badge variant="active" className="text-[10px]">{counts.create} create</Badge>
          <Badge variant="pending" className="text-[10px]">{counts.update} update</Badge>
          <Badge variant="inactive" className="text-[10px]">{counts.skip} skip</Badge>
          <Badge variant="suspended" className="text-[10px]">{counts.failed} failed</Badge>
        </div>
        <Combobox
          value={actionFilter === "all" ? null : actionFilter}
          onValueChange={(v) => setActionFilter((v as "create" | "update" | "skip" | "failed" | null) ?? "all")}
        >
          <ComboboxInput
            placeholder="All actions"
            showTrigger
            showClear={actionFilter !== "all"}
            className="w-44 h-9"
          />
          <ComboboxContent>
            <ComboboxList>
              <ComboboxItem value="create">Created</ComboboxItem>
              <ComboboxItem value="update">Updated</ComboboxItem>
              <ComboboxItem value="skip">Skipped</ComboboxItem>
              <ComboboxItem value="failed">Failed</ComboboxItem>
              <ComboboxEmpty>No matches</ComboboxEmpty>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>

      <div className="rounded-md border border-white-02 divide-y divide-white-02 overflow-hidden max-h-[600px] overflow-y-auto">
        {filtered.map((row) => {
          const actionColor =
            row.action === "create" ? "active" :
            row.action === "update" ? "pending" :
            row.action === "failed" ? "suspended" :
            "inactive";
          return (
            <div key={row.id} className="px-4 py-2.5 hover:bg-gray-50">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono text-gray-400">Row {row.row_number}</span>
                <Badge variant={actionColor} className="text-[10px] capitalize">{row.action}</Badge>
                {row.target_model && (
                  <span className="text-[10px] font-mono text-gray-500">{row.target_model}</span>
                )}
                {row.target_object_pk && (
                  <span className="text-[10px] font-mono text-gray-400">#{row.target_object_pk}</span>
                )}
              </div>
              {row.status_message && (
                <p className="text-xs text-black-01 mt-0.5">{row.status_message}</p>
              )}
              {row.action === "failed" && row.error_details && Object.keys(row.error_details).length > 0 && (
                <pre className="mt-1 text-[10px] text-red-500 font-mono bg-red-50 px-2 py-1 rounded overflow-x-auto">
                  {JSON.stringify(row.error_details, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
