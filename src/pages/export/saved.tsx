/**
 * Export Centre → Exports. The recipes, not the files.
 *
 * The distinction the page has to carry: editing an export changes FUTURE files
 * only. Files it already produced are never altered and never disappear, which
 * is also why "delete" archives rather than destroys - runs point at the
 * definition, and a hard delete would orphan the history that explains them.
 */

import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Copy, MoreVertical, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { CustomNativeSelect } from "@/components/custom/custom-native-select";
import PageAccessDenied from "@/components/custom/page-access-denied";
import { RunStatusPill } from "@/components/custom/run-status-pill";
import { ConfirmActionModal } from "@/components/finance-ui/confirm-action-modal";
import { DataTable, type Column } from "@/components/finance-ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDebounce } from "@/hooks/use-debounce";
import { usePermissions } from "@/hooks/use-permissions";
import { P } from "@/permissions";
import { cn } from "@/lib/utils";
import { routesPath } from "@/routes/routes-path";
import { apiErrorMessage, errorStatus } from "@/utils/api-errors";
import {
  useArchiveExportDefinitionMutation,
  useDuplicateExportDefinitionMutation,
  useGetExportCatalogueQuery,
  useGetExportDefinitionsQuery,
  useRunExportDefinitionMutation,
} from "@/redux/services/dashboard/exports-api";
import type {
  DefinitionListParams,
  ExportDefinitionListItem,
} from "@/redux/services/dashboard/exports-types";
import { formatDay } from "./format";
import { PageShell } from "@/components/layout/page-shell";

const NUM = "font-geist-mono tabular-nums";

export default function SavedExportsPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.VIEW_SAVED_EXPORTS);
  const canCreate = hasPermission(P.CREATE_EXPORT);
  const canUpdate = hasPermission(P.UPDATE_EXPORT);
  const canDelete = hasPermission(P.DELETE_EXPORT);
  const canRun = hasPermission(P.RUN_EXPORT);

  const [searchParams, setSearchParams] = useSearchParams();
  const module = searchParams.get("module") ?? "";
  const owner = searchParams.get("owner") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  // Local input so typing stays responsive; the URL and the request follow on a
  // debounce. No request-per-keystroke.
  const [searchInput, setSearchInput] = useState(q);
  const debouncedSearch = useDebounce(searchInput, 350);

  const patchParams = (patch: Record<string, string>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!("page" in patch)) next.delete("page");
        return next;
      },
      { replace: true },
    );

  const params = useMemo(() => {
    const p: DefinitionListParams = { page };
    if (module) p.module = module;
    if (owner === "me") p.owner = "me";
    if (debouncedSearch.trim()) p.q = debouncedSearch.trim();
    return p;
  }, [module, owner, debouncedSearch, page]);

  const { data, isLoading, isError, error, refetch } = useGetExportDefinitionsQuery(params, {
    skip: !canView,
  });
  const { data: catalogueRes } = useGetExportCatalogueQuery(undefined, { skip: !canView });

  const [runDefinition] = useRunExportDefinitionMutation();
  const [duplicate] = useDuplicateExportDefinitionMutation();
  const [archive, { isLoading: archiving }] = useArchiveExportDefinitionMutation();
  const [pendingArchive, setPendingArchive] = useState<ExportDefinitionListItem | null>(null);

  const rows = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.pagination;
  const modules = catalogueRes?.data.modules.filter((m) => m.available) ?? [];
  const hasFilters = !!(module || owner || debouncedSearch.trim());

  const forbidden = errorStatus(error) === 403;
  if (!canView) return <PageAccessDenied />;

  const onRun = async (row: ExportDefinitionListItem) => {
    try {
      const res = await runDefinition({ id: row.id, client_key: `${row.id}-${Date.now()}` }).unwrap();
      // 200 rather than 201 means an identical run is already going; the API
      // hands back that run and says so. Not an error.
      toast.success(res.message || "Export queued.");
      navigate(routesPath.PROTECTED.EXPORT.RUN(res.data.id));
    } catch (e) {
      toast.error(apiErrorMessage(e, "That export could not be run."));
    }
  };

  const onDuplicate = async (row: ExportDefinitionListItem) => {
    try {
      const res = await duplicate(row.id).unwrap();
      toast.success(`Copied as “${res.data.name}”.`);
      // A duplicate is a one-step task, not a five-step one: open it at review
      // with everything already carried over.
      navigate(`${routesPath.PROTECTED.EXPORT.EDIT(res.data.id)}?step=4`);
    } catch (e) {
      toast.error(apiErrorMessage(e, "That export could not be duplicated."));
    }
  };

  const onArchive = async () => {
    if (!pendingArchive) return;
    try {
      await archive(pendingArchive.id).unwrap();
      toast.success("Export archived. Files it already produced stay available until they expire.");
      setPendingArchive(null);
    } catch (e) {
      toast.error(apiErrorMessage(e, "That export could not be archived."));
    }
  };

  const columns: Column<ExportDefinitionListItem>[] = [
    {
      header: "Export",
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-black-01">{row.name}</span>
            {row.is_draft && (
              <Badge variant="pending" className="font-mont">
                Draft
              </Badge>
            )}
            {!row.dataset.available && (
              <Badge variant="rejected" className="font-mont">
                Dataset withdrawn
              </Badge>
            )}
          </div>
          {row.description && (
            <p className="mt-0.5 truncate text-xs font-normal text-gray-06-text">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      header: "Scope · format",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.scope.label}</p>
          <p className={cn(NUM, "mt-0.5 text-xs font-normal text-gray-06-text")}>
            {row.format.toUpperCase()} · {row.column_count} columns
          </p>
        </div>
      ),
    },
    { header: "Owner", cell: (row) => (row.is_owner ? "You" : row.owner_name || "-") },
    {
      header: "Last run",
      cell: (row) =>
        row.last_run ? (
          <div className="flex flex-wrap items-center gap-2">
            <RunStatusPill status={row.last_run.status} />
            <span className={cn(NUM, "text-xs text-gray-06-text")}>{formatDay(row.last_run.at)}</span>
          </div>
        ) : (
          <span className="text-gray-05">Never run</span>
        ),
    },
    {
      header: "",
      align: "right",
      cell: (row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Actions for ${row.name}`}
                className="grid size-7 place-content-center rounded text-gray-05 hover:bg-gray-03 hover:text-black-01"
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-mont">
              {/* Disabled with a reason, never hidden. */}
              <DropdownMenuItem
                disabled={!canRun || row.is_draft || !row.dataset.available}
                onClick={() => onRun(row)}
              >
                <Play className="size-4" /> Run now
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canUpdate || !row.is_owner}
                onClick={() => navigate(routesPath.PROTECTED.EXPORT.EDIT(row.id))}
              >
                <Pencil className="size-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canCreate} onClick={() => onDuplicate(row)}>
                <Copy className="size-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canDelete || !row.is_owner}
                onClick={() => setPendingArchive(row)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <PageShell className="space-y-5 text-black-01">
      <div className="flex flex-wrap items-center justify-between gap-3" data-guide="data-exports.heading">
        <div>
          <p className="font-semibold font-mont text-gray-01">Exports</p>
          <p className="mt-0.5 text-xs text-gray-01">
            Reusable recipes. Editing one changes future files only - files already produced are never
            altered.
          </p>
        </div>
        {canCreate && (
          <Button size="lg" onClick={() => navigate(routesPath.PROTECTED.EXPORT.NEW)} className="gap-1.5">
            <Plus className="size-4" /> New export
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            patchParams({ q: e.target.value });
          }}
          placeholder="Search name or description…"
          aria-label="Search Exports"
          className="h-10 w-full bg-white sm:w-72"
        />
        <CustomNativeSelect
          id="saved-module"
          aria-label="Filter by module"
          placeholder="All modules"
          containerClass="w-full sm:w-44"
          options={modules.map((m) => ({ value: m.name, label: m.name }))}
          value={module}
          onChange={(e) => patchParams({ module: e.target.value })}
        />
        <CustomNativeSelect
          id="saved-owner"
          aria-label="Filter by owner"
          placeholder="Anyone"
          containerClass="w-full sm:w-40"
          options={[{ value: "me", label: "Owned by me" }]}
          value={owner}
          onChange={(e) => patchParams({ owner: e.target.value })}
        />
        {hasFilters && (
          <button
            onClick={() => {
              setSearchInput("");
              patchParams({ module: "", owner: "", q: "" });
            }}
            className="h-10 font-mont text-xs font-semibold text-gray-05 hover:text-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={isLoading}
        error={isError && !forbidden}
        forbidden={forbidden}
        forbiddenMessage="You do not have access to Exports."
        onRetry={refetch}
        onRowClick={(row) => navigate(routesPath.PROTECTED.EXPORT.EDIT(row.id))}
        emptyTitle={hasFilters ? "No exports match these filters" : "No Exports yet"}
        emptyMessage={
          hasFilters
            ? "Clear the filters to see everything."
            : "Build one once, then reuse it whenever you need the same file."
        }
        page={pagination?.currentPage}
        totalPages={pagination?.totalPages}
        onPageChange={(p) => patchParams({ page: String(p) })}
      />

      <ConfirmActionModal
        open={!!pendingArchive}
        onOpenChange={(open) => !open && setPendingArchive(null)}
        title={`Delete “${pendingArchive?.name ?? ""}”?`}
        description="The export is removed from this list and can no longer be run. Files it already produced stay available until they expire, and its run history is kept."
        confirmText="Delete export"
        cancelText="Keep it"
        destructive
        loading={archiving}
        onConfirm={onArchive}
      />
    </PageShell>
  );
}
