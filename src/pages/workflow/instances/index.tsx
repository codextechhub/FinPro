import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { RefreshCw, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickExportButton } from "@xvs/finance/host";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/utils/helpers";
import { usePermissions } from "@/hooks/use-permissions";
import { P } from "@/permissions";
import { routesPath } from "../paths";
import { useGetWorkflowInstancesQuery } from "@/redux/services/dashboard/workflow-api";
import type { ManagedWorkflowInstance } from "@/redux/services/dashboard/workflow-types";
import { useUserDirectory } from "../../../components/workflow/use-user-directory";
import { DocumentRef, InstanceStatusBadge, UserChip } from "../../../components/workflow/workflow-ui";
import { humanizeDocumentType } from "../../../components/workflow/workflow-format";
import { DataTable, type Column } from "../../../components/finance-ui/data-table";
import { useReaderBranchLens } from "../../../components/finance-ui/raising-branch";
import { noAccessMessage } from "../../../components/finance-ui/no-access";
import { isForbidden } from "../../../lib/api-errors";
import { PageShell } from "@/components/layout/page-shell";
import { InstanceFilterBar } from "./instance-filters";
import { ReplaceApproverSheet } from "./replace-approver-sheet";
import {
  EMPTY_FILTERS,
  REPLACE_LIMIT,
  filtersFromSearchParams,
  filtersToSearchParams,
  instanceQuery,
  patchFilters,
  stagePositionLabel,
  waitingOnLabel,
  type InstanceFilters,
} from "./manage-approvals";

/** The rows ticked for a bulk action, under the filters they were ticked with. */
interface Selection {
  key: string;
  ids: Set<string>;
  labels: Map<string, string>;
}

const NO_SELECTION: Selection = { key: "", ids: new Set(), labels: new Map() };

/** How a request is named outside its row. */
function rowName(r: ManagedWorkflowInstance): string {
  return r.document_title || humanizeDocumentType(r.document_type, r.document_type_label);
}

/**
 * Manage Approvals: every approval request the reader may see, for the people who
 * look after them.
 *
 * Reading the list needs the instance-view permission. Changing who approves
 * needs the permission to change approvers, and only then does the list offer row
 * selection and "Replace approver"; a reader without it sees the same list and
 * no way to act on it. Filters live in the address bar, so a filtered view can
 * be bookmarked, shared and returned to with the back button.
 *
 * The branch column and filter appear only when the reader can see more than
 * one branch. Where there is one branch, or for a reader posted to one, every
 * row would say the same thing.
 */
export default function ManageApprovals() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(P.CHANGE_APPROVERS);
  const { name, initials, role } = useUserDirectory();
  const lens = useReaderBranchLens();
  const multiBranch = lens.applies && lens.choices.length > 1;

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);
  const setFilters = (next: InstanceFilters) => setSearchParams(filtersToSearchParams(next), { replace: true });
  const onChange = (patch: Partial<InstanceFilters>) => setFilters(patchFilters(filters, patch));

  const params = useMemo(() => instanceQuery(filters, { multiBranch }), [filters, multiBranch]);
  const { data, error, isLoading, isFetching, refetch } = useGetWorkflowInstancesQuery(params, {
    refetchOnMountOrArgChange: true,
  });
  const rows = useMemo(() => data?.data ?? [], [data]);

  // The selection belongs to one set of filters: narrowing the list another way
  // starts it again, so nothing hidden by the new filters stays selected.
  const { page: _page, ...filterOnly } = params;
  void _page;
  const selectionKey = JSON.stringify(filterOnly);
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const selected = selection.key === selectionKey ? selection.ids : NO_SELECTION.ids;
  const select = (ids: Set<string>) =>
    setSelection((prev) => {
      // Each selected request's name is kept, so a skipped one can still be
      // named once the list has moved to another page.
      const labels = new Map(prev.key === selectionKey ? prev.labels : undefined);
      for (const r of rows) if (ids.has(r.id)) labels.set(r.id, rowName(r));
      return { key: selectionKey, ids, labels };
    });
  const clearSelection = () => setSelection({ ...NO_SELECTION, key: selectionKey });

  const [replaceOpen, setReplaceOpen] = useState(0);
  const [replaceIds, setReplaceIds] = useState<string[]>([]);
  const [replaceLabels, setReplaceLabels] = useState<Map<string, string>>(new Map());

  const columns: Column<ManagedWorkflowInstance>[] = [
    {
      header: "Document",
      cell: (r) => (
        <DocumentRef
          documentType={r.document_type}
          objectId={r.document_object_id}
          label={r.document_type_label}
          title={r.document_title}
        />
      ),
    },
    {
      header: "Request for",
      cell: (r) => <span className="text-sm">{r.request_for?.name ?? "-"}</span>,
    },
    {
      header: "Raised by",
      cell: (r) => (
        <UserChip
          id={r.requested_by}
          name={name(r.requested_by)}
          initials={initials(r.requested_by)}
          role={role(r.requested_by)}
          size={22}
          exited={(r as { requested_by_is_exited?: boolean | null }).requested_by_is_exited}
        />
      ),
    },
    {
      header: "Stage",
      cell: (r) => <span className="text-xs text-gray-01">{stagePositionLabel(r)}</span>,
    },
    {
      header: "Waiting on",
      cell: (r) =>
        r.waiting_on?.length ? (
          <span className="block max-w-[240px] text-sm">
            {r.waiting_on.map((w) => waitingOnLabel(w)).join(", ")}
          </span>
        ) : (
          <span className="text-xs text-gray-01">-</span>
        ),
    },
    {
      header: "Waiting since",
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-gray-01">
          {r.waiting_since ? formatRelativeDate(r.waiting_since) : "-"}
        </span>
      ),
    },
    { header: "Status", cell: (r) => <InstanceStatusBadge status={r.status} /> },
    ...(multiBranch
      ? [{
          header: "Branch",
          cell: (r: ManagedWorkflowInstance) => <span className="text-sm">{r.branch?.name ?? "-"}</span>,
        }]
      : []),
  ];

  const forbidden = isForbidden(error);
  const overLimit = selected.size > REPLACE_LIMIT;

  return (
    <PageShell className="space-y-5 text-black-01">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold font-mont text-gray-01">Manage Approvals</p>
          <p className="mt-0.5 text-xs text-gray-01">
            Every approval request. Open one to see who approves each stage
            {canManage ? " and change it" : ""}, cancel it, or reverse a recorded vote.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="white"
            size="lg"
            className="font-medium font-mont [&_svg]:size-5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn(isFetching && "animate-spin")} /> Refresh
          </Button>
          <QuickExportButton
            screen="workflow.instances"
            params={filterOnly}
            defaultName="Approval requests"
            className="h-11 px-6"
          />
        </div>
      </div>

      <InstanceFilterBar
        filters={filters}
        onChange={onChange}
        onClear={() => setFilters(EMPTY_FILTERS)}
        branches={multiBranch ? lens.choices : null}
      />

      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/20 bg-pry-01/40 px-4 py-2.5">
          <p className="text-sm font-medium text-black-01">
            {selected.size} {selected.size === 1 ? "request" : "requests"} selected
          </p>
          {overLimit && (
            <p className="text-xs text-destructive">Select at most {REPLACE_LIMIT} at a time.</p>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear selection
            </Button>
            <Button
              size="sm"
              disabled={overLimit}
              onClick={() => {
                setReplaceIds([...selected]);
                setReplaceLabels(new Map(selection.labels));
                setReplaceOpen((n) => n + 1);
              }}
            >
              <UserRoundCog className="size-4" /> Replace approver
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={!!error && !forbidden}
        forbidden={forbidden}
        forbiddenMessage={noAccessMessage("view running approvals")}
        onRetry={refetch}
        onRowClick={(r) => navigate(routesPath.PROTECTED.WORKFLOW.INSTANCE_DETAIL(r.id))}
        emptyTitle="No approval requests match these filters."
        page={data?.pagination?.currentPage}
        totalPages={data?.pagination?.totalPages}
        onPageChange={(page) => onChange({ page })}
        selection={
          canManage
            ? {
                selected,
                onChange: select,
                rowLabel: (r) => `Select ${rowName(r)}`,
              }
            : undefined
        }
      />

      {replaceOpen > 0 && (
        <ReplaceApproverSheet
          key={replaceOpen}
          open
          onClose={() => setReplaceOpen(0)}
          instanceIds={replaceIds}
          initialFrom={filters.waitingOn}
          describe={(id) => replaceLabels.get(id) ?? `Request ${id.slice(0, 8)}`}
          onDone={clearSelection}
        />
      )}
    </PageShell>
  );
}
