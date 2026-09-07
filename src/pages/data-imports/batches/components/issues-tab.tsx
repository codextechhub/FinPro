import { useState, useMemo } from "react";
import { Check, AlertTriangle, Info, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList, ComboboxEmpty,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import {
  useGetValidationIssuesQuery,
  importDownloadUrls,
} from "@/redux/services/dashboard/import-api";
import type { ValidationIssueListItem, ValidationSeverity } from "@/redux/services/dashboard/import-types";
import { SEVERITY_BADGE } from "./batch-status";
import { triggerDownload } from "./batch-utils";

export function IssuesTab({ batchId }: { batchId: number }) {
  const [sev, setSev] = useState<"all" | ValidationSeverity>("all");
  const [resolved, setResolved] = useState<"all" | "open" | "resolved">("open");
  const [page, setPage] = useState(1);

  const params = useMemo<Record<string, string | number>>(() => {
    const p: Record<string, string | number> = { page, page_size: 50 };
    if (sev !== "all") p.severity = sev;
    if (resolved !== "all") p.is_resolved = resolved === "resolved" ? "true" : "false";
    return p;
  }, [sev, resolved, page]);

  const { data, isLoading, isError, refetch, isFetching } = useGetValidationIssuesQuery(
    { batchId, params },
    { refetchOnMountOrArgChange: true },
  );
  const issues = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="loader" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2">
        <p className="text-sm text-destructive">Failed to load issues.</p>
        <Button size="sm" variant="white" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Combobox
            value={sev === "all" ? null : sev}
            onValueChange={(v) => { setSev((v as ValidationSeverity | null) ?? "all"); setPage(1); }}
          >
            <ComboboxInput
              placeholder="All severities"
              showTrigger
              showClear={sev !== "all"}
              className="w-44 h-9"
            />
            <ComboboxContent>
              <ComboboxList>
                <ComboboxItem value="error">Errors only</ComboboxItem>
                <ComboboxItem value="warning">Warnings only</ComboboxItem>
                <ComboboxItem value="info">Info only</ComboboxItem>
                <ComboboxEmpty>No matches</ComboboxEmpty>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <Combobox
            value={resolved}
            onValueChange={(v) => { setResolved((v as "all" | "open" | "resolved" | null) ?? "open"); setPage(1); }}
          >
            <ComboboxInput
              placeholder="Status"
              showTrigger
              className="w-36 h-9"
            />
            <ComboboxContent>
              <ComboboxList>
                <ComboboxItem value="open">Open</ComboboxItem>
                <ComboboxItem value="resolved">Resolved</ComboboxItem>
                <ComboboxItem value="all">All</ComboboxItem>
                <ComboboxEmpty>No matches</ComboboxEmpty>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
        <Button
          variant="white" size="sm"
          onClick={() => triggerDownload(importDownloadUrls.validationIssuesExport(batchId), `batch_${batchId}_issues.csv`)}
        >
          <Download className="size-3.5" /> Export CSV
        </Button>
      </div>

      {issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Check className="size-7 text-green-500 mb-2" />
          <p className="text-sm font-medium">No {resolved !== "all" ? resolved : ""} issues</p>
          <p className="text-xs text-gray-01 mt-1">
            {resolved === "open" ? "Nothing left to triage." : "Try changing the filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-white-02 divide-y divide-white-02 overflow-hidden">
          {issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </div>
      )}

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button variant="white" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-gray-01">Page {data.pagination.currentPage} of {data.pagination.totalPages}</span>
          <Button variant="white" size="sm" disabled={page >= data.pagination.totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: ValidationIssueListItem }) {
  return (
    <div className={cn("flex items-start gap-3 px-4 py-3", issue.is_resolved && "opacity-60")}>
      <div className="shrink-0 mt-0.5">
        {issue.severity === "error" && <AlertTriangle className="size-4 text-red-500" />}
        {issue.severity === "warning" && <AlertTriangle className="size-4 text-amber-500" />}
        {issue.severity === "info" && <Info className="size-4 text-blue-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={SEVERITY_BADGE[issue.severity] ?? "inactive"} className="text-[10px] capitalize">
            {issue.severity}
          </Badge>
          <span className="font-mono text-[10px] text-gray-500">{issue.code}</span>
          {issue.row_number !== null && issue.row_number > 0 && (
            <span className="text-[10px] text-gray-400">Row {issue.row_number}</span>
          )}
          {issue.column_name && (
            <span className="font-mono text-[10px] text-gray-400">{issue.column_name}</span>
          )}
          {issue.is_resolved && (
            <Badge variant="active" className="text-[10px]">
              <Check className="size-2.5 mr-0.5" /> Resolved
            </Badge>
          )}
        </div>
        <p className="text-sm text-black-01 mt-1">{issue.message}</p>
      </div>
    </div>
  );
}
