import { useNavigate, useParams } from "react-router";
import { Download, RefreshCw, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageAccessDenied from "@/components/custom/page-access-denied";
import PermissionGate from "@/components/custom/permission-gate";
import { P } from "@/permissions";
import { usePermissions } from "@/hooks/use-permissions";
import { routesPath } from "@/routes/routes-path";
import { PageShell } from "@/components/layout/page-shell";
import {
  useGetImportTemplateQuery,
  useDownloadImportTemplateMutation,
} from "@/redux/services/dashboard/import-api";
import type {
  ImportTemplate,
  TemplateStatus,
} from "@/redux/services/dashboard/import-types";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";

const STATUS_BADGE: Record<TemplateStatus, "active" | "pending" | "inactive"> = {
  active: "active",
  draft: "pending",
  retired: "inactive",
};

const unwrap = <T,>(res: { data: T } | T | undefined): T | undefined => {
  if (!res) return undefined;
  return (res as { data: T }).data ?? (res as T);
};

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

export default function ViewTemplate() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { id } = useParams<{ id: string }>();
  const templateId = Number(id);
  const canView = hasPermission(P.VIEW_IMPORT_TEMPLATES);
  // Was `user.user_type === "CX_STAFF"`, a field the API never returns, so it
  // was always false and these affordances never appeared. RBAC owns this.
  const canManageTemplates = hasPermission(P.MANAGE_IMPORT_TEMPLATES);
  const [downloadTemplate, downloadState] = useDownloadImportTemplateMutation();

  const { data, isLoading, isError, refetch } = useGetImportTemplateQuery(templateId, {
    skip: !templateId || isNaN(templateId) || !canView,
  });
  const template = unwrap<ImportTemplate>(data);

  const back = () => navigate(routesPath.PROTECTED.DATA_IMPORTS.TEMPLATES.INDEX);

  if (!canView) {
    return <PageAccessDenied onBack={back} />;
  }

  if (!templateId || isNaN(templateId)) {
    return (
      <>
        <div className="flex h-96 items-center justify-center">
          <p className="text-sm text-destructive">Invalid template id.</p>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <div className="flex h-96 items-center justify-center"><div className="loader" /></div>
      </>
    );
  }

  if (isError || !template) {
    return (
      <>
        <div className="flex h-96 flex-col items-center justify-center gap-3">
          <p className="text-sm text-destructive">Template not found or you don't have access.</p>
          <Button variant="white" size="sm" onClick={() => refetch()}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </div>
      </>
    );
  }

  const cols = (template.columns ?? []).slice().sort((a, b) => a.column_order - b.column_order);

  return (
    <>
      <PageShell className="text-black-01 space-y-5 max-w-5xl">
        {/* Header card */}
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-4")}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs text-gray-01 font-mono mb-1">#{template.id}</p>
              <h1 className="text-lg font-semibold font-mont text-black-01 truncate">{template.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-01">
                <span className="font-mono">{template.code}</span>
                <span>·</span>
                <span className="capitalize">{template.dataset_type}</span>
                <span>·</span>
                <span className="font-mono uppercase">{template.default_file_format}</span>
              </div>
            </div>
            <Badge variant={STATUS_BADGE[template.status] ?? "inactive"} className="capitalize shrink-0">
              {template.status}
            </Badge>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap border-t border-white-02 pt-4">
            <Button variant="white" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
            {canManageTemplates && (
              <PermissionGate permission={P.MANAGE_IMPORT_TEMPLATES}>
                <Button
                  size="sm"
                  onClick={() => navigate(routesPath.PROTECTED.DATA_IMPORTS.TEMPLATES.EDIT(templateId))}
                >
                  <Pencil className="size-3.5" /> Edit Template
                </Button>
              </PermissionGate>
            )}
            {template.is_download_enabled && (
              <>
                <Button
                  variant="white"
                  size="sm"
                  disabled={downloadState.isLoading}
                  onClick={() => triggerDownload(downloadTemplate, template.id, "csv", `${template.code}_template.csv`)}
                >
                  <Download className="size-3.5" /> Download CSV
                </Button>
                <Button
                  variant="white"
                  size="sm"
                  disabled={downloadState.isLoading}
                  onClick={() => triggerDownload(downloadTemplate, template.id, "xlsx", `${template.code}_template.xlsx`)}
                >
                  <Download className="size-3.5" /> Download XLSX
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Two columns: meta + description */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
          <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-5")}>
            {template.description && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-01 font-mont mb-1.5">Description</p>
                <p className="text-sm text-black-01 leading-relaxed">{template.description}</p>
              </div>
            )}

            {template.instructions && (
              <div className={template.description ? "border-t border-white-02 pt-5" : ""}>
                <p className="text-[10px] uppercase tracking-wide text-gray-01 font-mont mb-1.5">Instructions</p>
                <p className="text-sm text-black-01 leading-relaxed whitespace-pre-wrap">{template.instructions}</p>
              </div>
            )}

            {!template.description && !template.instructions && (
              <p className="text-xs text-gray-01 italic">No description or instructions provided.</p>
            )}
          </div>

          <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-3.5")}>
            <p className="text-sm font-semibold font-mont border-b border-white-02 pb-3">Metadata</p>
            <MetaRow label="Dataset"><span className="text-sm capitalize">{template.dataset_type}</span></MetaRow>
            <MetaRow label="Format"><span className="text-sm font-mono uppercase">{template.default_file_format}</span></MetaRow>
            <MetaRow label="Columns"><span className="text-sm">{template.columns?.length ?? template.total_columns ?? 0}</span></MetaRow>
            <MetaRow label="Sample row"><span className="text-sm">{template.allow_sample_row ? "Enabled" : "Disabled"}</span></MetaRow>
            <MetaRow label="Download"><span className="text-sm">{template.is_download_enabled ? "Enabled" : "Disabled"}</span></MetaRow>
            <MetaRow label="Published">
              <span className="text-sm">{template.published_at ? new Date(template.published_at).toLocaleDateString() : "-"}</span>
            </MetaRow>
            {template.retired_at && (
              <MetaRow label="Retired">
                <span className="text-sm">{new Date(template.retired_at).toLocaleDateString()}</span>
              </MetaRow>
            )}
          </div>
        </div>

        {/* Columns section */}
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5")}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold font-mont">
              Columns <span className="text-gray-01 font-normal">({cols.length})</span>
            </p>
          </div>

          {cols.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 px-4 py-12 text-center">
              <FileText className="size-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-01">No columns defined.</p>
            </div>
          ) : (
            <div className="rounded-md border border-white-02 divide-y divide-white-02 overflow-hidden">
              {cols.map((col) => (
                <div key={col.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                  <span className="text-xs text-gray-400 font-mono mt-0.5 w-6 shrink-0 text-right">
                    {col.column_order}
                  </span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-black-01">{col.column_name}</span>
                      <span className="text-xs text-gray-400">→</span>
                      <span className="font-mono text-xs text-gray-500">{col.target_field}</span>
                      <Badge variant="inactive" className="text-[10px] font-mono uppercase">{col.data_type}</Badge>
                      {col.is_required && <Badge variant="pending" className="text-[10px]">Required</Badge>}
                      {col.is_unique && <Badge variant="pending" className="text-[10px]">Unique</Badge>}
                      {col.reference_model && (
                        <Badge variant="inactive" className="text-[10px]">
                          FK: {col.reference_model}
                          {col.reference_lookup_field ? `.${col.reference_lookup_field}` : ""}
                        </Badge>
                      )}
                    </div>
                    {col.display_name && col.display_name !== col.column_name && (
                      <p className="text-xs text-gray-500">{col.display_name}</p>
                    )}
                    {col.help_text && <p className="text-xs text-gray-400 italic">{col.help_text}</p>}
                    {col.data_type === "choice" && col.allowed_values?.length > 0 && (
                      <p className="text-xs text-gray-400 font-mono">[{col.allowed_values.join(", ")}]</p>
                    )}
                    {col.sample_value && (
                      <p className="text-[10px] text-gray-400 font-mono">sample: {col.sample_value}</p>
                    )}
                    {col.default_value && (
                      <p className="text-[10px] text-gray-400 font-mono">default: {col.default_value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageShell>
    </>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-01 font-mont mb-0.5">{label}</p>
      {children}
    </div>
  );
}
