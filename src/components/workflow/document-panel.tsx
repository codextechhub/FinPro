import { FileText, Info, ExternalLink } from "lucide-react";
import { formatDate, formatRelativeDate } from "@/utils/relative-date";
import type { WorkflowInstanceDetail } from "@/redux/services/dashboard/workflow-types";
import { Button } from "@/components/ui/button";
import { humanizeDocumentType } from "./workflow-format";
import { InstanceStatusBadge, UserChip } from "./workflow-ui";
import { sourceDocumentLink, sourceDocumentPrompt } from "./source-document-link";

type Resolver = (id?: string | number | null) => string;

/**
 * Document panel shared by every instance detail view (approver / requester /
 * admin). Renders the document header + a "Summary" field grid populated from
 * the handler-provided `document_summary`, falling back to a note when none.
 */
export function DocumentPanel({
  instance,
  name,
  initials,
  role,
}: {
  instance: WorkflowInstanceDetail;
  name: Resolver;
  initials: Resolver;
  role: Resolver;
}) {
  const summary = instance.document_summary;
  const documentLink = sourceDocumentLink(instance);
  const documentPrompt = sourceDocumentPrompt(instance.status);

  return (
    <>
      {/* Header */}
      <div className="rounded-lg border border-white-02 bg-white p-5">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-content-center rounded-xl bg-pry-01 text-primary">
            <FileText className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-01">
              {humanizeDocumentType(instance.document_type)}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">
                {summary?.title || `#${String(instance.document_object_id).slice(0, 8)}`}
              </h1>
              <InstanceStatusBadge status={instance.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-01">
              <span className="font-mono">#{String(instance.document_object_id).slice(0, 8)}</span>
              <span className="size-1 rounded-full bg-gray-300" />
              <span>Template {instance.template_code}</span>
              {instance.submitted_at && (
                <>
                  <span className="size-1 rounded-full bg-gray-300" />
                  <span>Submitted {formatRelativeDate(instance.submitted_at)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-white-02 bg-white">
        <div className="flex items-center gap-2 border-b border-white-02 px-5 py-3">
          <Info className="size-4 text-gray-01" />
          <span className="text-sm font-semibold">Summary</span>
          {summary?.subtitle && (
            <span className="ml-auto truncate text-xs text-gray-01">{summary.subtitle}</span>
          )}
        </div>
        <div className="p-5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-x-6 gap-y-4">
            {(summary?.fields ?? []).map((f, i) => (
              <Field key={`${f.label}-${i}`} label={f.label}>
                <span className="break-words text-black-01">{f.value || "-"}</span>
              </Field>
            ))}
            <Field label="Requested by">
              <UserChip
                id={instance.requested_by}
                name={name(instance.requested_by)}
                initials={initials(instance.requested_by)}
                role={role(instance.requested_by)}
                size={22}
              />
            </Field>
            <Field label="Submitted">
              <span className="text-black-01">
                {instance.submitted_at ? formatDate(new Date(instance.submitted_at)) : "-"}
              </span>
            </Field>
            {instance.completed_at && (
              <Field label="Completed">
                <span className="text-black-01">{formatDate(new Date(instance.completed_at))}</span>
              </Field>
            )}
          </div>

          {documentLink && (
            <div
              data-guide="approval-detail.view-document"
              className="mt-5 flex flex-col gap-3 rounded-lg border border-primary/20 bg-pry-01 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-black-01">{documentPrompt.title}</p>
                <p className="mt-0.5 text-xs text-gray-01">{documentPrompt.description}</p>
              </div>
              <Button asChild className="w-full sm:w-auto">
                <a href={documentLink}>
                  View full document <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          )}

          {!summary?.fields?.length && !summary?.title && (
            <p className="mt-4 rounded-md border border-white-02 bg-gray-50 px-3 py-2 text-[11px] text-gray-01">
              Document content lives in the originating module - this view tracks the approval workflow only.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-gray-05">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
