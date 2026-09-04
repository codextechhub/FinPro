import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { RefreshCw } from "lucide-react";
import CustomTable from "@/components/custom/custom-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/utils/helpers";
import { routesPath } from "../paths";
import { useGetMySubmissionsQuery } from "@/redux/services/dashboard/workflow-api";
import type { WorkflowInstance, WorkflowInstanceStatus } from "@/redux/services/dashboard/workflow-types";
import { useFilterParam } from "@/hooks/use-filter-param";
import { useUserDirectory } from "@/pages/protected/workflow/components/use-user-directory";
import { DocumentRef, InstanceStatusBadge } from "@/pages/protected/workflow/components/workflow-ui";
import { PageShell } from "@/components/layout/page-shell";

const TABLE_HEADERS = ["Document", "Template", "Status", "Current Stage", "Updated"];

const STATUS_FILTERS: { label: string; value: "all" | WorkflowInstanceStatus }[] = [
  { label: "All", value: "all" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Returned", value: "RETURNED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

export default function MySubmissions() {
  const navigate = useNavigate();
  useUserDirectory(); // warm the directory cache for detail pages
  const [status, setStatus] = useState<"all" | WorkflowInstanceStatus>("all");
  // Dashboard deep-link: "Returned submissions" lands here as ?status=RETURNED.
  useFilterParam("status", ["IN_PROGRESS", "RETURNED", "APPROVED", "REJECTED"] as const, setStatus);

  const { data, isLoading, isFetching, refetch } = useGetMySubmissionsQuery(
    status === "all" ? undefined : { status },
    { refetchOnMountOrArgChange: true },
  );

  const items = useMemo(() => data ?? [], [data]);

  const tableData = useMemo(
    () =>
      items.map((r: WorkflowInstance) => ({
        document: <DocumentRef documentType={r.document_type} objectId={r.document_object_id} />,
        template: <span className="text-sm">{r.template_code}</span>,
        status: <InstanceStatusBadge status={r.status} />,
        stage: (
          <span className="text-xs text-gray-01">{r.current_stage_label ?? "-"}</span>
        ),
        updated: (
          <span className="text-xs text-gray-01">
            {r.updated_at ? formatRelativeDate(r.updated_at) : "-"}
          </span>
        ),
        _raw: r,
        _id: r.id,
      })),
    [items],
  );

  return (
    <>
      <PageShell className="space-y-5 text-black-01">
        <div>
          <p className="font-semibold font-mont text-gray-01">My Submissions</p>
          <p className="text-xs text-gray-01 mt-0.5">
            Documents you've submitted for approval. Returned items can be amended and resubmitted.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  status === f.value
                    ? "border-primary bg-pry-01 text-primary"
                    : "border-white-02 text-gray-01 hover:bg-gray-50",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button
            variant="white"
            size="lg"
            className="[&_svg]:size-5 font-medium font-mont"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn(isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>

        <CustomTable
          tableHeaderList={TABLE_HEADERS}
          tableBodyList={tableData}
          loading={isLoading}
          hidePagination
          emptyText="You haven't submitted any documents for approval yet."
          onRowClick={(row) =>
            navigate(routesPath.PROTECTED.WORKFLOW.SUBMISSION_DETAIL(row._id))
          }
        />
      </PageShell>
    </>
  );
}
