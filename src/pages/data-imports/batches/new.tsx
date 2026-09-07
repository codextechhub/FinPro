import { useNavigate, useSearchParams } from "react-router";
import ImportWizard from "@/components/custom/import-wizard";
import PageAccessDenied from "@/components/custom/page-access-denied";
import { usePermissions } from "@/hooks/use-permissions";
import { P } from "@/permissions";
import { routesPath } from "@/routes/routes-path";
import type { DatasetType } from "@/redux/services/dashboard/import-types";

export default function NewImportBatch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission } = usePermissions();
  const canUpload = hasPermission(P.UPLOAD_IMPORT_BATCH);

  const datasetType = searchParams.get("dataset_type") as DatasetType | null;
  const lockTemplate = searchParams.get("lock_template") === "true";
  const returnTo = searchParams.get("return_to");
  const returnLabel = searchParams.get("return_label") ?? undefined;

  if (!canUpload) {
    return <PageAccessDenied />;
  }

  return (
    <>
      <section className="px-4.5 py-6 max-w-5xl" data-guide="data-import-batches.upload">
        <ImportWizard
          datasetType={datasetType ?? undefined}
          lockTemplate={lockTemplate}
          onComplete={(batchId) =>
            navigate(routesPath.PROTECTED.DATA_IMPORTS.BATCHES.VIEW(String(batchId)))
          }
          onReturn={returnTo ? () => navigate(returnTo) : undefined}
          returnLabel={returnLabel}
          onCancel={() =>
            navigate(returnTo ?? routesPath.PROTECTED.DATA_IMPORTS.BATCHES.INDEX)
          }
        />
      </section>
    </>
  );
}
