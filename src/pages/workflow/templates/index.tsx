import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Info, Plus, RefreshCw } from "lucide-react";
import CustomTable from "@/components/custom/custom-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PermissionGate from "@/components/custom/permission-gate";
import { P } from "@/permissions";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/utils/helpers";
import { routesPath } from "../paths";
import { useAppSelector } from "@/redux/store";
import { selectIsPlatformTenant } from "@/redux/features/auth/auth-slice";
import { useGetWorkflowTemplatesQuery } from "@/redux/services/dashboard/workflow-api";
import { humanizeDocumentType } from "@/pages/protected/workflow/components/workflow-format";
import { pairTemplateVersions, versionLabel } from "./components/template-versions";
import { PageShell } from "@/components/layout/page-shell";

const TABLE_HEADERS = ["Name", "Document Type", "Code", "Stages", "Running", "Updated"];

export default function WorkflowTemplates() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const isPlatformTenant = useAppSelector(selectIsPlatformTenant);

  const { data, isLoading, isFetching, refetch } = useGetWorkflowTemplatesQuery(
    { page },
    { refetchOnMountOrArgChange: true },
  );

  const items = useMemo(() => data?.data ?? [], [data]);

  // Codex's version and this school's are two records but one approval path, so
  // they are paired into a single row. Two rows with the same name would read as
  // "you have a copy", which is exactly the mental model this product avoids.
  const versions = useMemo(
    () => pairTemplateVersions(items, { collapse: !isPlatformTenant }),
    [items, isPlatformTenant],
  );

  const tableData = useMemo(
    () =>
      versions.map((v) => ({
        _key: v.key,
        name: <span className="text-sm font-medium text-black-01">{v.running.name}</span>,
        documentType: <span className="text-sm">{humanizeDocumentType(v.document_type)}</span>,
        code: <span className="font-mono text-xs text-gray-01">{v.code}</span>,
        stages: <Badge variant="inactive">{v.running.stages.length} stages</Badge>,
        running: (
          <span className="inline-flex items-center gap-1.5">
            <Badge variant={v.isAdjusted ? "pending" : "outline"}>
              {versionLabel(v, isPlatformTenant)}
            </Badge>
          </span>
        ),
        updated: (
          <span className="text-xs text-gray-01">{formatRelativeDate(v.running.updated_at)}</span>
        ),
        _raw: v.running,
        _id: v.running.id,
      })),
    [versions, isPlatformTenant],
  );

  return (
    <>
      <PageShell className="space-y-5 text-black-01">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold font-mont text-gray-01">Workflow Templates</p>
            <p className="text-xs text-gray-01 mt-0.5">
              {isPlatformTenant
                ? "The approval paths every school starts on. Editing one here changes it for every school still running it."
                : "Your approval paths. Each starts as the Codex version; adjust one and this school runs your version from then on."}
            </p>
          </div>
          <PermissionGate permission={P.MANAGE_WORKFLOW_TEMPLATES}>
            <Button size="lg" onClick={() => navigate(routesPath.PROTECTED.WORKFLOW.TEMPLATE_NEW)}>
              <Plus /> New Template
            </Button>
          </PermissionGate>
        </div>

        <div className="flex justify-end">
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

        {!isPlatformTenant && versions.some((v) => v.platformMovedOn) && (
          <div className="flex items-start gap-2.5 rounded-md border border-white-02 bg-pry-01/40 px-4 py-3 text-xs text-gray-01">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              Codex has updated its version of{" "}
              <span className="font-medium text-black-01">
                {versions.filter((v) => v.platformMovedOn).map((v) => v.running.name).join(", ")}
              </span>{" "}
              since you adjusted yours. Nothing changes on its own - open the template and
              use Codex's version if you want their current one.
            </p>
          </div>
        )}

        <CustomTable
          tableHeaderList={TABLE_HEADERS}
          tableBodyList={tableData}
          loading={isLoading}
          emptyText="No workflow templates published yet."
          onRowClick={(row) => navigate(routesPath.PROTECTED.WORKFLOW.TEMPLATE_DETAIL(row._id))}
          perPage={data?.pagination?.pageSize}
          totalPage={data?.pagination?.totalPages}
          currentPage={data?.pagination?.currentPage}
          onPageChange={(p) => setPage(p as number)}
        />
      </PageShell>
    </>
  );
}
