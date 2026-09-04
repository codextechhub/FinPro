import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { RefreshCw } from "lucide-react";
import CustomTable from "@/components/custom/custom-table";
import { CustomInput } from "@/components/custom/custom-input";
import { SearchSelect } from "@/components/custom/search-select";
import { Button } from "@/components/ui/button";
import { QuickExportButton } from "@xvs/finance/host";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/utils/helpers";
import { useDebounce } from "@/hooks/use-debounce";
import { routesPath } from "../paths";
import { useGetWorkflowInstancesQuery } from "@/redux/services/dashboard/workflow-api";
import type { WorkflowInstance } from "@/redux/services/dashboard/workflow-types";
import { useUserDirectory } from "@/pages/protected/workflow/components/use-user-directory";
import { DocumentRef, InstanceStatusBadge, UserChip } from "@/pages/protected/workflow/components/workflow-ui";
import { PageShell } from "@/components/layout/page-shell";

const TABLE_HEADERS = ["Document", "Template", "Status", "Current Stage", "Requested By", "Updated"];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "RETURNED", label: "Returned" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function AllInstances() {
  const navigate = useNavigate();
  const { name, initials, role } = useUserDirectory();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [docType, setDocType] = useState("");
  const debouncedDocType = useDebounce(docType, 500);

  const params = useMemo(
    () => ({
      page,
      ...(status && { status }),
      ...(debouncedDocType && { document_type: debouncedDocType }),
    }),
    [page, status, debouncedDocType],
  );

  const { data, isLoading, isFetching, refetch } = useGetWorkflowInstancesQuery(params, {
    refetchOnMountOrArgChange: true,
  });

  const items = useMemo(() => data?.data ?? [], [data]);

  const tableData = useMemo(
    () =>
      items.map((r: WorkflowInstance) => ({
        document: <DocumentRef documentType={r.document_type} objectId={r.document_object_id} />,
        template: <span className="text-sm">{r.template_code}</span>,
        status: <InstanceStatusBadge status={r.status} />,
        stage: <span className="text-xs text-gray-01">{r.current_stage_label ?? "-"}</span>,
        requestedBy: (
          <UserChip
            id={r.requested_by}
            name={name(r.requested_by)}
            initials={initials(r.requested_by)}
            role={role(r.requested_by)}
            size={22}
          />
        ),
        updated: (
          <span className="text-xs text-gray-01">
            {r.updated_at ? formatRelativeDate(r.updated_at) : "-"}
          </span>
        ),
        _raw: r,
        _id: r.id,
      })),
    [items, name, initials, role],
  );

  return (
    <>
      <PageShell className="space-y-5 text-black-01">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold font-mont text-gray-01">Workflow Instances</p>
            <p className="text-xs text-gray-01 mt-0.5">
              Every approval workflow running across the platform. Open one to monitor, cancel, or
              reverse a recorded vote.
            </p>
          </div>
          <QuickExportButton
            screen="workflow.instances"
            params={{ status, document_type: debouncedDocType }}
            defaultName="Approval requests"
            className="h-11 px-6"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <CustomInput
              id="filter-doc-type"
              label="Document type"
              placeholder="e.g. leave.request"
              className="h-10"
              containerClass="w-full sm:w-[220px]"
              value={docType}
              onChange={(e) => {
                setPage(1);
                setDocType(e.target.value);
              }}
            />
            <SearchSelect
              id="filter-status"
              label="Status"
              placeholder="All statuses"
              containerClass="w-full sm:w-[200px]"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            />
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
          emptyText="No workflow instances match these filters."
          onRowClick={(row) => navigate(routesPath.PROTECTED.WORKFLOW.INSTANCE_DETAIL(row._id))}
          perPage={data?.pagination?.pageSize}
          totalPage={data?.pagination?.totalPages}
          currentPage={data?.pagination?.currentPage}
          onPageChange={(p) => setPage(p as number)}
        />
      </PageShell>
    </>
  );
}
