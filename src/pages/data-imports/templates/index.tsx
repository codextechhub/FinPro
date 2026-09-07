import { useState, useMemo } from "react";
import { useNow } from "@/hooks/use-now";
import { useNavigate } from "react-router";
import { Plus, RefreshCw, FileText } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CustomTable from "@/components/custom/custom-table";
import { CustomInput } from "@/components/custom/custom-input";
import {
  Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList, ComboboxEmpty,
} from "@/components/ui/combobox";
import PermissionGate from "@/components/custom/permission-gate";
import PageAccessDenied from "@/components/custom/page-access-denied";
import { P } from "@/permissions";
import { usePermissions } from "@/hooks/use-permissions";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatRelativeDate } from "@/utils/helpers";
import { routesPath } from "@/routes/routes-path";
import { PageShell } from "@/components/layout/page-shell";
import {
  useGetImportTemplatesQuery,
  useDownloadImportTemplateMutation,
} from "@/redux/services/dashboard/import-api";
import type {
  DatasetType,
  ImportTemplateListItem,
  TemplateStatus,
} from "@/redux/services/dashboard/import-types";

// ── Constants ────────────────────────────────────────────────────────────────

const DATASET_TYPES: DatasetType[] = ["schools", "branches"];

const STATUS_BADGE: Record<TemplateStatus, "active" | "pending" | "inactive"> = {
  active: "active",
  draft: "pending",
  retired: "inactive",
};

const TABLE_HEADERS = ["Code", "Template", "Dataset", "Format", "Status", "Columns", "Updated", "Action"];

// The mutation resolves to an object URL (not a Blob) so redux state stays
// serializable; revoke it here once the browser has taken the download.
async function triggerDownload(
  download: (args: { id: number; format: "csv" | "xlsx" }) => { unwrap: () => Promise<string> },
  id: number,
  format: "csv" | "xlsx",
  filename: string,
) {
  try {
    const blobUrl = await download({ id, format }).unwrap();
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    toast.error("Download failed. Please try again.");
  }
}

type CardFilter = "all" | TemplateStatus;

// ── Main page ────────────────────────────────────────────────────────────────

export default function ImportTemplatesList() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const [downloadTemplate] = useDownloadImportTemplateMutation();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [datasetFilter, setDatasetFilter] = useState<"" | DatasetType>("");
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");
  const [page, setPage] = useState(1);

  const canView = hasPermission(P.VIEW_IMPORT_TEMPLATES);
  // Was `user.user_type === "CX_STAFF"`, a field the API never returns, so it
  // was always false and these affordances never appeared. RBAC owns this.
  const canManageTemplates = hasPermission(P.MANAGE_IMPORT_TEMPLATES);

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, page_size: 100 };
    if (datasetFilter) p.dataset_type = datasetFilter;
    return p;
  }, [page, datasetFilter]);

  const { data, isLoading, isError, refetch, isFetching } = useGetImportTemplatesQuery(params, {
    refetchOnMountOrArgChange: true,
    skip: !canView,
  });

  const allTemplates = useMemo<ImportTemplateListItem[]>(() => data?.data ?? [], [data]);
  const now = useNow();

  // Client-side status + search filter (backend doesn't support these).
  const filtered = useMemo(() => {
    let list = allTemplates;
    if (cardFilter !== "all") list = list.filter((t) => t.status === cardFilter);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.code.toLowerCase().includes(q) ||
          t.dataset_type.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allTemplates, cardFilter, debouncedSearch]);

  const stats = useMemo(() => ({
    total: allTemplates.length,
    active: allTemplates.filter((t) => t.status === "active").length,
    draft: allTemplates.filter((t) => t.status === "draft").length,
    retired: allTemplates.filter((t) => t.status === "retired").length,
  }), [allTemplates]);

  const cards: { title: string; value: number; key: CardFilter; hint?: string }[] = canManageTemplates
    ? [
        { title: "Total Templates", value: stats.total, key: "all", hint: "All lifecycles" },
        { title: "Active", value: stats.active, key: "active", hint: "Available for use" },
        { title: "Drafts", value: stats.draft, key: "draft", hint: "Not yet published" },
        { title: "Retired", value: stats.retired, key: "retired", hint: "Replaced or paused" },
      ]
    : [
        { title: "Available Templates", value: stats.active, key: "all", hint: "Ready for download" },
        { title: "Schools", value: allTemplates.filter((t) => t.dataset_type === "schools").length, key: "all", hint: "Templates for schools" },
        { title: "Branches", value: allTemplates.filter((t) => t.dataset_type === "branches").length, key: "all", hint: "Templates for branches" },
        { title: "Updated Recently", value: allTemplates.filter((t) => now - new Date(t.updated_at).getTime() < 30 * 86_400_000).length, key: "all", hint: "Within 30 days" },
      ];

  const tableData = filtered.map((tpl) => ({
    code: <span className="font-mono text-xs font-semibold text-black-01">{tpl.code}</span>,
    name: (
      <div className="max-w-xs">
        <p className="text-sm font-medium text-black-01 truncate">{tpl.name}</p>
        {tpl.description && (
          <p className="text-xs text-gray-01 truncate mt-0.5">{tpl.description}</p>
        )}
      </div>
    ),
    dataset: (
      <Badge variant="inactive" className="text-[10px] capitalize">{tpl.dataset_type}</Badge>
    ),
    format: <span className="text-xs font-mono uppercase">{tpl.default_file_format}</span>,
    status: (
      <Badge variant={STATUS_BADGE[tpl.status] ?? "inactive"} className="text-[10px] capitalize">
        {tpl.status}
      </Badge>
    ),
    columns: (
      <span className="text-xs">
        <span className="font-medium">{tpl.total_columns}</span>
        <span className="text-gray-01"> cols</span>
      </span>
    ),
    updated: <span className="text-xs text-gray-01">{formatRelativeDate(tpl.updated_at)}</span>,
    _id: tpl.id,
    _tpl: tpl,
  }));

  if (!canView) {
    return <PageAccessDenied />;
  }

  return (
    <>
      <PageShell className="space-y-5 text-black-01" data-guide="data-import-templates.workspace">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3" data-guide="data-import-templates.heading">
          <div className="w-full sm:w-auto">
            <p className="font-semibold font-mont text-gray-01">Import Templates</p>
            <p className="text-xs text-gray-01 mt-0.5">
              {canManageTemplates
                ? "System-level templates defining column structure and validation for each dataset."
                : "Available templates you can download and use for data uploads."}
            </p>
          </div>
          <div className="inline-flex items-center gap-3">
            <Button variant="white" size="lg" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} /> Refresh
            </Button>
            <PermissionGate permission={P.CREATE_IMPORT_TEMPLATE}>
              <Button size="lg" onClick={() => navigate(routesPath.PROTECTED.DATA_IMPORTS.TEMPLATES.NEW)}>
                <Plus className="size-4" /> New Template
              </Button>
            </PermissionGate>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4" data-guide="data-import-templates.summary">
          {cards.map((card, i) => {
            const isClickable = canManageTemplates && card.key !== "all";
            const isActive = canManageTemplates && cardFilter === card.key && card.key !== "all";
            return (
              <button
                type="button"
                key={`${card.title}_${i}`}
                onClick={() => canManageTemplates && setCardFilter(cardFilter === card.key ? "all" : card.key)}
                disabled={!isClickable && card.key === "all" && !canManageTemplates}
                className={cn(
                  INFORMATION_CARD_SURFACE,
                  "rounded-md text-left p-4 transition-colors",
                  isClickable && "cursor-pointer hover:border-primary/30",
                  !isClickable && "cursor-default",
                  isActive && "border-primary bg-primary/5",
                )}
              >
                <p className="text-xs font-mont text-gray-01 font-medium">{card.title}</p>
                <p className="text-2xl font-semibold mt-1.5">{card.value}</p>
                {card.hint && <p className="text-[10px] text-gray-400 mt-1">{card.hint}</p>}
              </button>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <CustomInput
              id="search-templates"
              canSearch
              placeholder="Search by code, name or dataset…"
              className="h-10"
              containerClass="w-full sm:w-[280px]"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <Combobox
              value={datasetFilter || null}
              onValueChange={(v) => { setDatasetFilter((v as DatasetType | null) ?? ""); setPage(1); }}
              items={DATASET_TYPES}
              filter={(item: string, q: string) => !q || item.toLowerCase().includes(q.toLowerCase())}
              itemToStringLabel={(item: string) => item}
            >
              <ComboboxInput
                placeholder="All datasets"
                showTrigger
                showClear={!!datasetFilter}
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
          </div>
          <p className="text-xs text-gray-01">
            {filtered.length} of {allTemplates.length} {allTemplates.length === 1 ? "template" : "templates"}
          </p>
        </div>

        {/* Table */}
        {isError ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 bg-white rounded-md border">
            <p className="text-sm font-medium text-destructive">Failed to load templates.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        ) : !isLoading && filtered.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 bg-white rounded-md border border-dashed">
            <FileText className="size-7 text-gray-300" />
            <p className="text-sm font-medium text-black-01">No templates found</p>
            <p className="text-xs text-gray-01">
              {debouncedSearch || cardFilter !== "all" || datasetFilter
                ? "Try adjusting your filters."
                : canManageTemplates
                  ? "Create the first system import template."
                  : "No templates are available for download yet."}
            </p>
          </div>
        ) : (
          <CustomTable
            tableHeaderList={TABLE_HEADERS}
            tableBodyList={tableData}
            loading={isLoading}
            onRowClick={(row: { _id: number }) =>
              navigate(routesPath.PROTECTED.DATA_IMPORTS.TEMPLATES.VIEW(row._id))
            }
            dropDown
            dropDownList={(row: { _id: number; _tpl: ImportTemplateListItem }) => {
              const tpl = row._tpl;
              const items: Array<{ label: string; className: string; onActionClick: () => void }> = [
                {
                  label: "View Details",
                  className: "",
                  onActionClick: () =>
                    navigate(routesPath.PROTECTED.DATA_IMPORTS.TEMPLATES.VIEW(tpl.id)),
                },
              ];
              if (canManageTemplates && hasPermission(P.MANAGE_IMPORT_TEMPLATES)) {
                items.push({
                  label: "Edit Template",
                  className: "",
                  onActionClick: () =>
                    navigate(routesPath.PROTECTED.DATA_IMPORTS.TEMPLATES.EDIT(tpl.id)),
                });
              }
              if (tpl.is_download_enabled) {
                items.push({
                  label: "Download CSV",
                  className: "",
                  onActionClick: () =>
                    triggerDownload(downloadTemplate, tpl.id, "csv", `${tpl.code}_template.csv`),
                });
                items.push({
                  label: "Download XLSX",
                  className: "",
                  onActionClick: () =>
                    triggerDownload(downloadTemplate, tpl.id, "xlsx", `${tpl.code}_template.xlsx`),
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
            <span className="text-gray-01">Page {data.pagination.currentPage} of {data.pagination.totalPages}</span>
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
    </>
  );
}
