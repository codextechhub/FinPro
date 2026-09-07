import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { RefreshCw, Upload, FileText, Eye, Trash2, AlertTriangle, CheckCircle2, Activity, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CustomTable from "@/components/custom/custom-table";
import { CustomInput } from "@/components/custom/custom-input";
import {
  Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList, ComboboxEmpty,
} from "@/components/ui/combobox";
import PermissionGate from "@/components/custom/permission-gate";
import PageAccessDenied from "@/components/custom/page-access-denied";
import PromptModal from "@/components/modal/prompt-modal";
import { usePermissions } from "@/hooks/use-permissions";
import { P } from "@/permissions";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatRelativeDate } from "@/utils/helpers";
import { formatBytes } from "@/utils/format-bytes";
import { routesPath } from "@/routes/routes-path";
import { PageShell } from "@/components/layout/page-shell";
import {
  useGetImportBatchesQuery,
  useDeleteImportBatchMutation,
} from "@/redux/services/dashboard/import-api";
import type {
  BatchStatus,
  DatasetType,
  ImportBatchListItem,
} from "@/redux/services/dashboard/import-types";

// ── Status configuration ─────────────────────────────────────────────────────

const STATUS_BADGE: Record<BatchStatus, "active" | "pending" | "suspended" | "locked" | "inactive"> = {
  draft: "inactive",
  uploaded: "inactive",
  detecting: "pending",
  mapping_required: "pending",
  validating: "locked",
  validation_failed: "suspended",
  ready_to_import: "pending",
  import_queued: "pending",
  import_running: "locked",
  import_partial: "suspended",
  import_succeeded: "active",
  import_failed: "suspended",
  rolled_back: "suspended",
  cancelled: "inactive",
};

const STATUS_LABEL: Record<BatchStatus, string> = {
  draft: "Draft",
  uploaded: "Uploaded",
  detecting: "Detecting",
  mapping_required: "Mapping",
  validating: "Validating",
  validation_failed: "Failed Validation",
  ready_to_import: "Ready",
  import_queued: "Queued",
  import_running: "Importing",
  import_partial: "Partial",
  import_succeeded: "Succeeded",
  import_failed: "Failed",
  rolled_back: "Rolled Back",
  cancelled: "Cancelled",
};

const ALL_STATUSES: BatchStatus[] = Object.keys(STATUS_BADGE) as BatchStatus[];

const IN_FLIGHT: Set<BatchStatus> = new Set([
  "uploaded", "detecting", "mapping_required", "validating",
  "ready_to_import", "import_queued", "import_running",
]);

const FAILED: Set<BatchStatus> = new Set([
  "validation_failed", "import_failed", "import_partial",
]);

const SUCCEEDED: Set<BatchStatus> = new Set([
  "import_succeeded",
]);

const DATASET_TYPES: DatasetType[] = ["schools", "branches"];

type CardFilter = "all" | "inflight" | "failed" | "succeeded";

const TABLE_HEADERS = ["File", "Dataset", "Template", "Status", "Rows / Cols", "Issues", "Uploaded", "Action"];

// ── Main page ────────────────────────────────────────────────────────────────

export default function ImportBatchesList() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");
  const [datasetFilter, setDatasetFilter] = useState<"all" | DatasetType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | BatchStatus>("all");
  const [deleteTarget, setDeleteTarget] = useState<ImportBatchListItem | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, page_size: 25 };
    if (statusFilter !== "all") p.status = statusFilter;
    return p;
  }, [page, statusFilter]);

  const canView = hasPermission(P.VIEW_IMPORT_BATCHES);

  const { data, isLoading, isError, refetch, isFetching } = useGetImportBatchesQuery(params, {
    refetchOnMountOrArgChange: true,
    pollingInterval: 0,
    skip: !canView,
  });

  const [deleteBatch, { isLoading: deleting }] = useDeleteImportBatchMutation();

  const allBatches = useMemo<ImportBatchListItem[]>(() => data?.data ?? [], [data]);

  // Polling derived from current page contents (avoids needless requests).
  const hasInFlight = allBatches.some((b) => IN_FLIGHT.has(b.status));

  // Apply client-side dataset + search + card filter (backend supports only `status`).
  const filtered = useMemo(() => {
    let list = allBatches;
    if (cardFilter === "inflight") list = list.filter((b) => IN_FLIGHT.has(b.status));
    else if (cardFilter === "failed") list = list.filter((b) => FAILED.has(b.status));
    else if (cardFilter === "succeeded") list = list.filter((b) => SUCCEEDED.has(b.status));
    if (datasetFilter !== "all") {
      list = list.filter((b) => {
        // dataset_type isn't in list serializer; fall back via template_code prefix or skip.
        // Backend list serializer doesn't include dataset_type - so this client filter is a no-op
        // unless template_code carries the dataset hint. Keep filter for future-proofing.
        return b.template_code?.toLowerCase().includes(datasetFilter) ?? true;
      });
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (b) =>
          b.original_filename.toLowerCase().includes(q) ||
          (b.template_name ?? "").toLowerCase().includes(q) ||
          (b.template_code ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [allBatches, cardFilter, datasetFilter, debouncedSearch]);

  const stats = useMemo(() => ({
    total: data?.pagination?.totalItems ?? allBatches.length,
    inflight: allBatches.filter((b) => IN_FLIGHT.has(b.status)).length,
    failed: allBatches.filter((b) => FAILED.has(b.status)).length,
    succeeded: allBatches.filter((b) => SUCCEEDED.has(b.status)).length,
  }), [data, allBatches]);

  const cards = [
    { title: "Total Batches", value: stats.total, hint: "All time", key: "all" as CardFilter, icon: Hash },
    { title: "In Flight", value: stats.inflight, hint: "Processing now", key: "inflight" as CardFilter, icon: Activity },
    { title: "Needs Attention", value: stats.failed, hint: "Validation or import failures", key: "failed" as CardFilter, icon: AlertTriangle },
    { title: "Succeeded", value: stats.succeeded, hint: "On the page", key: "succeeded" as CardFilter, icon: CheckCircle2 },
  ];

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBatch(deleteTarget.id).unwrap();
      toast.success("Batch deleted.");
      setDeleteTarget(null);
    } catch { /* interceptor shows the toast */ }
  };

  if (!canView) {
    return <PageAccessDenied />;
  }

  const tableData = filtered.map((batch) => ({
    file: (
      <div className="min-w-0">
        <p className="font-medium text-sm text-black-01 truncate max-w-56" title={batch.original_filename}>
          {batch.original_filename || "-"}
        </p>
        <p className="text-[10px] text-gray-01 mt-0.5 font-mono uppercase">
          {batch.file_format} · {formatBytes(batch.file_size_bytes)}
        </p>
      </div>
    ),
    dataset: (
      <Badge variant="inactive" className="text-[10px] capitalize">
        {batch.template_code ?? "-"}
      </Badge>
    ),
    template: (
      <div className="min-w-0 max-w-44">
        <p className="text-xs text-black-01 truncate" title={batch.template_name ?? ""}>
          {batch.template_name ?? "-"}
        </p>
      </div>
    ),
    status: (
      <div className="flex items-center gap-1.5">
        {IN_FLIGHT.has(batch.status) && (
          <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
        )}
        <Badge variant={STATUS_BADGE[batch.status] ?? "inactive"} className="text-[10px] capitalize">
          {STATUS_LABEL[batch.status] ?? batch.status}
        </Badge>
      </div>
    ),
    rows: (
      <span className="text-xs">
        <span className="font-medium">{batch.total_rows.toLocaleString()}</span>
        <span className="text-gray-01"> / {batch.total_columns} cols</span>
      </span>
    ),
    issues: (
      <div className="flex gap-1 items-center">
        {batch.error_count > 0 && (
          <Badge variant="suspended" className="text-[10px]">{batch.error_count} err</Badge>
        )}
        {batch.warning_count > 0 && (
          <Badge variant="locked" className="text-[10px]">{batch.warning_count} warn</Badge>
        )}
        {batch.has_critical_errors && batch.error_count === 0 && (
          <Badge variant="suspended" className="text-[10px]">Critical</Badge>
        )}
        {batch.error_count === 0 && batch.warning_count === 0 && !batch.has_critical_errors && (
          <span className="text-xs text-gray-400">-</span>
        )}
      </div>
    ),
    uploaded: (
      <span className="text-xs text-gray-01">
        {formatRelativeDate(batch.created_at)}
      </span>
    ),
    _id: batch.id,
    _batch: batch,
  }));

  return (
    <>
      <PageShell className="space-y-5 text-black-01" data-guide="data-import-batches.workspace">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3" data-guide="data-import-batches.heading">
          <div className="w-full sm:w-auto">
            <p className="font-semibold font-mont text-gray-01">Import Batches</p>
            <p className="text-xs text-gray-01 mt-0.5">
              Monitor uploaded datasets through validation, import execution, and rollback.
            </p>
          </div>
          <div className="inline-flex items-center gap-3">
            <Button variant="white" size="lg" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} /> Refresh
            </Button>
            <PermissionGate permission={P.UPLOAD_IMPORT_BATCH}>
              <Button size="lg" onClick={() => navigate(routesPath.PROTECTED.DATA_IMPORTS.BATCHES.NEW)}>
                <Upload className="size-4" /> New Import
              </Button>
            </PermissionGate>
          </div>
        </div>

        {/* Polling indicator */}
        {hasInFlight && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2 text-xs text-amber-800">
            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
            {allBatches.filter((b) => IN_FLIGHT.has(b.status)).length} batch{allBatches.filter((b) => IN_FLIGHT.has(b.status)).length === 1 ? "" : "es"} in flight.
            <button
              type="button"
              onClick={() => refetch()}
              className="underline ml-auto hover:no-underline"
            >
              Refresh now
            </button>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4" data-guide="data-import-batches.summary">
          {cards.map((card) => {
            const isActive = cardFilter === card.key && card.key !== "all";
            const Icon = card.icon;
            return (
              <button
                type="button"
                key={card.key}
                onClick={() => setCardFilter(cardFilter === card.key ? "all" : card.key)}
                className={cn(
                  INFORMATION_CARD_SURFACE,
                  "rounded-md text-left p-4 transition-colors",
                  "cursor-pointer hover:border-primary/30",
                  isActive && "border-primary bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mont text-gray-01 font-medium">{card.title}</p>
                  <Icon className={cn(
                    "size-3.5",
                    card.key === "failed" && card.value > 0 ? "text-destructive" : "text-gray-300",
                    card.key === "inflight" && card.value > 0 ? "text-amber-500" : "",
                    card.key === "succeeded" && card.value > 0 ? "text-green-500" : "",
                  )} />
                </div>
                <p className="text-2xl font-semibold mt-1.5">{card.value.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 mt-1">{card.hint}</p>
              </button>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <CustomInput
              id="search-batches"
              canSearch
              placeholder="Search filename or template…"
              className="h-10"
              containerClass="w-full sm:w-[280px]"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <Combobox
              value={statusFilter === "all" ? null : statusFilter}
              onValueChange={(v) => { setStatusFilter((v as BatchStatus | null) ?? "all"); setPage(1); }}
            >
              <ComboboxInput
                placeholder="All statuses"
                showTrigger
                showClear={statusFilter !== "all"}
                className="w-52 h-10 shrink-0"
              />
              <ComboboxContent>
                <ComboboxList>
                  {ALL_STATUSES.map((s) => (
                    <ComboboxItem key={s} value={s}>{STATUS_LABEL[s]}</ComboboxItem>
                  ))}
                  <ComboboxEmpty>No matches</ComboboxEmpty>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <Combobox
              value={datasetFilter === "all" ? null : datasetFilter}
              onValueChange={(v) => { setDatasetFilter((v as DatasetType | null) ?? "all"); setPage(1); }}
            >
              <ComboboxInput
                placeholder="All datasets"
                showTrigger
                showClear={datasetFilter !== "all"}
                className="w-44 h-10 shrink-0"
              />
              <ComboboxContent>
                <ComboboxList>
                  {DATASET_TYPES.map((d) => (
                    <ComboboxItem key={d} value={d} className="capitalize">{d}</ComboboxItem>
                  ))}
                  <ComboboxEmpty>No matches</ComboboxEmpty>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {(statusFilter !== "all" || datasetFilter !== "all" || debouncedSearch) && (
              <Button
                variant="white" size="sm"
                onClick={() => { setStatusFilter("all"); setDatasetFilter("all"); setSearch(""); setPage(1); }}
              >
                Clear
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-01">
            Showing {filtered.length} of {allBatches.length} on this page
          </p>
        </div>

        {/* Table */}
        {isError ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 bg-white rounded-md border">
            <p className="text-sm font-medium text-destructive">Failed to load batches.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        ) : !isLoading && filtered.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 bg-white rounded-md border border-dashed">
            <FileText className="size-7 text-gray-300" />
            <p className="text-sm font-medium text-black-01">No batches found</p>
            <p className="text-xs text-gray-01">
              {debouncedSearch || cardFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters."
                : "Upload your first batch to start importing."}
            </p>
          </div>
        ) : (
          <CustomTable
            tableHeaderList={TABLE_HEADERS}
            tableBodyList={tableData}
            loading={isLoading}
            onRowClick={(row: { _id: number }) =>
              navigate(routesPath.PROTECTED.DATA_IMPORTS.BATCHES.VIEW(String(row._id)))
            }
            dropDown
            dropDownList={(row: { _id: number; _batch: ImportBatchListItem }) => {
              const items: Array<{ label: string; className: string; onActionClick: () => void; icon?: React.ReactNode }> = [
                {
                  label: "View Details",
                  className: "",
                  onActionClick: () =>
                    navigate(routesPath.PROTECTED.DATA_IMPORTS.BATCHES.VIEW(String(row._id))),
                  icon: <Eye className="size-3.5" />,
                },
              ];
              if (hasPermission(P.DELETE_IMPORT_BATCH)) {
                items.push({
                  label: "Delete",
                  className: "text-destructive",
                  onActionClick: () => setDeleteTarget(row._batch),
                  icon: <Trash2 className="size-3.5" />,
                });
              }
              return items;
            }}
            hidePagination
          />
        )}

        {/* Server pagination */}
        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 text-xs">
            <Button
              variant="white" size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span className="text-gray-01">
              Page {data.pagination.currentPage} of {data.pagination.totalPages}
              <span className="text-gray-400 ml-2">({data.pagination.totalItems.toLocaleString()} total)</span>
            </span>
            <Button
              variant="white" size="sm"
              disabled={page >= data.pagination.totalPages || isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </PageShell>

      <PromptModal
        isOpen={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        canCancel
        onCancel={() => setDeleteTarget(null)}
        title="Delete Import Batch?"
        description={
          deleteTarget
            ? `Permanently delete batch "${deleteTarget.original_filename}"? This removes the file, validation issues, and job history. This cannot be undone.`
            : ""
        }
        onConfirmText="Delete"
        onConfirmClass="bg-destructive text-white hover:bg-destructive/90"
        src="/image/caution.png"
        srcClass="size-20"
        loading={deleting}
      />
    </>
  );
}
