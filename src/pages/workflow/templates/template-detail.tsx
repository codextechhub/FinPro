import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowRight, GitBranch, Loader2, Pencil, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PermissionGate from "@/components/custom/permission-gate";
import { P } from "@/permissions";
import { routesPath } from "../paths";
import { formatRelativeDate } from "@/utils/helpers";
import { useAppSelector } from "@/redux/store";
import { selectIsPlatformTenant } from "@/redux/features/auth/auth-slice";
import {
  useGetWorkflowTemplateQuery,
  useGetWorkflowTemplatesQuery,
  useUsePlatformTemplateVersionMutation,
} from "@/redux/services/dashboard/workflow-api";
import { pairTemplateVersions } from "./components/template-versions";
import { AdoptionPanel } from "./components/adoption-panel";
import { FieldHint } from "./components/template-builder-bits";
import {
  advanceRuleLabel,
  approverScopeLabel,
  approverSummary,
  humanizeDocumentType,
} from "@/pages/protected/workflow/components/workflow-format";
import { ConditionView } from "@/pages/protected/workflow/components/condition-view";
import { PageShell } from "@/components/layout/page-shell";

export default function TemplateDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const isPlatformTenant = useAppSelector(selectIsPlatformTenant);
  const [resetOpen, setResetOpen] = useState(false);

  const { data: template, isLoading, isError, refetch } = useGetWorkflowTemplateQuery(id, {
    refetchOnMountOrArgChange: true,
  });
  // The detail endpoint answers for one row; which version this school runs is a
  // fact about the pair, so it comes from the list the templates page already
  // holds - a cache hit in the normal case rather than a second round trip.
  const { data: all } = useGetWorkflowTemplatesQuery({ page: 1, page_size: 100 });
  const [switchToPlatformVersion, { isLoading: isResetting }] =
    useUsePlatformTemplateVersionMutation();

  const versions = useMemo(
    () =>
      template
        ? pairTemplateVersions(all?.data ?? [], { collapse: !isPlatformTenant }).find(
            (v) => v.document_type === template.document_type && v.code === template.code,
          ) ?? null
        : null,
    [all, template, isPlatformTenant],
  );

  const doReset = () => {
    if (!template) return;
    switchToPlatformVersion(template.id)
      .unwrap()
      .then((platform) => {
        toast.success("Back on the Codex version.");
        setResetOpen(false);
        navigate(routesPath.PROTECTED.WORKFLOW.TEMPLATE_DETAIL(platform.id));
      })
      .catch((err) => {
        const message =
          (err as { data?: { message?: string } })?.data?.message ??
          "Could not switch back to the Codex version.";
        toast.error(message);
      });
  };

  return (
    <>
      <PageShell className="text-black-01">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : isError || !template ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <p className="text-sm text-destructive">Failed to load this template.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white-02 bg-white p-5">
              <div>
                <h1 className="text-lg font-semibold">{template.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-01">
                  <span>{humanizeDocumentType(template.document_type)}</span>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{template.code}</span>
                  <span aria-hidden>·</span>
                  <Badge variant={template.is_platform ? "outline" : "pending"}>
                    {template.is_platform
                      ? isPlatformTenant
                        ? "Shared with every school"
                        : "Codex version"
                      : isPlatformTenant
                        ? "Codex-only"
                        : "This school's version"}
                  </Badge>
                </p>
                {isPlatformTenant && !template.is_platform && (
                  <div className="mt-2 max-w-2xl">
                    <FieldHint title="Why doesn't any school get this one?">
                      This one belongs to Codex alone - no school inherits it. To give every
                      school this path, publish it with the same document type and code from a
                      new template, which writes the shared version.
                    </FieldHint>
                  </div>
                )}
                {template.description && (
                  <p className="mt-2 max-w-2xl text-sm text-gray-01">{template.description}</p>
                )}
              </div>
              <PermissionGate permission={P.MANAGE_WORKFLOW_TEMPLATES}>
                <div className="flex flex-wrap items-center gap-2">
                  {!template.is_platform && !isPlatformTenant && (
                    <Button variant="outline" onClick={() => setResetOpen(true)}>
                      <Undo2 className="size-4" /> Use Codex's version
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => navigate(routesPath.PROTECTED.WORKFLOW.TEMPLATE_EDIT(template.id))}
                  >
                    <Pencil className="size-4" /> {template.is_platform && !isPlatformTenant ? "Adjust" : "Edit"}
                  </Button>
                </div>
              </PermissionGate>
            </div>

            {!isPlatformTenant && template.is_platform && (
              <p className="rounded-md border border-white-02 bg-pry-01/40 px-4 py-3 text-xs text-gray-01">
                This is the Codex version, and this school runs it as published. Adjust it and
                this school runs your version from then on, while Codex keeps theirs.
              </p>
            )}
            {!isPlatformTenant && !template.is_platform && (
              <p className="rounded-md border border-white-02 bg-pry-01/40 px-4 py-3 text-xs text-gray-01">
                This school runs its own version of this approval path.{" "}
                {versions?.platformMovedOn ? (
                  <>
                    Codex changed theirs{" "}
                    {template.platform_updated_at
                      ? formatRelativeDate(template.platform_updated_at)
                      : "recently"}
                    . Nothing changed here on its own - "Use Codex's version" switches to their
                    current one.
                  </>
                ) : (
                  <>"Use Codex's version" puts this school back on whatever Codex has at that
                    moment.</>
                )}
              </p>
            )}
            {isPlatformTenant && template.is_platform && (
              <>
                <p className="rounded-md border border-white-02 bg-pry-01/40 px-4 py-3 text-xs text-gray-01">
                  Every school starts on this. Editing it reaches all of them except the ones
                  running their own version of this path.
                </p>
                {/* Who that actually is, rather than leaving it to be assumed. */}
                <AdoptionPanel templateId={template.id} />
              </>
            )}

            {/* Stages */}
            <div className="rounded-lg border border-white-02 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold">Stages</h3>
              <div className="space-y-3">
                {[...template.stages]
                  .sort((a, b) => a.order - b.order)
                  .map((s, i) => (
                    <div key={s.id} className="rounded-md border border-white-02 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="grid size-6 place-content-center rounded-full bg-pry-01 text-xs font-semibold text-primary">
                          {i + 1}
                        </span>
                        <span className="text-sm font-semibold">{s.label}</span>
                        <span className="font-mono text-xs text-gray-01">{s.code}</span>
                        <Badge variant={s.kind === "BRANCH" ? "outline" : "inactive"}>
                          {s.kind === "BRANCH" ? (
                            <>
                              <GitBranch className="size-3" /> Branch
                            </>
                          ) : (
                            "Approval"
                          )}
                        </Badge>
                      </div>
                      {s.kind === "APPROVAL" && (
                        <>
                          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-01 sm:grid-cols-3">
                            <Detail label="Approved by" value={approverSummary(s)} />
                            <Detail
                            label="Approvers looked for in"
                            value={approverScopeLabel(s.approver_scope, isPlatformTenant)}
                          />
                            <Detail label="Advance rule" value={advanceRuleLabel(s.advance_rule, s.quorum_count)} />
                            <Detail label="On rejection" value={s.on_rejection === "TERMINAL" ? "Ends workflow" : "Returns to requester"} />
                            <Detail label="Skip if no approvers" value={s.skip_if_no_approvers ? "Yes" : "No"} />
                          </div>
                          {/* A dynamic stage's answer IS its rule order, so the
                              ladder is spelled out rather than summarised. */}
                          {s.approver_source === "DYNAMIC_ROLE" && (
                            <ol className="mt-2 space-y-1 border-l-2 border-white-02 pl-3">
                              {[...(s.dynamic_role_rules ?? [])]
                                .sort((a, b) => a.order - b.order)
                                .map((r, ri) => (
                                  <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="text-gray-01 tabular-nums">{ri + 1}.</span>
                                    {r.is_fallback ? (
                                      <span className="text-gray-01 italic">Otherwise</span>
                                    ) : (
                                      <ConditionView condition={r.condition} />
                                    )}
                                    <span aria-hidden className="text-gray-01">→</span>
                                    <span className="font-medium text-black-01">
                                      {r.role_name || r.role_key}
                                    </span>
                                    {r.label && <span className="text-gray-01">{r.label}</span>}
                                  </li>
                                ))}
                            </ol>
                          )}
                        </>
                      )}
                      {s.inclusion_condition != null && (
                        <p className="mt-2 text-xs text-gray-01">
                          Included only when <ConditionView condition={s.inclusion_condition} />
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Routes */}
            <div className="rounded-lg border border-white-02 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold">Routing</h3>
              {template.routes.length === 0 ? (
                <p className="text-sm text-gray-01">
                  No explicit routes - stages run linearly in order.
                </p>
              ) : (
                <div className="space-y-2">
                  {[...template.routes]
                    .sort((a, b) => a.order - b.order)
                    .map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="outline">{r.from_stage_code ?? "ENTRY"}</Badge>
                        <ArrowRight className="size-3.5 text-gray-01" />
                        <Badge variant="outline">{r.to_stage_code ?? "EXIT (approved)"}</Badge>
                        <span className="text-xs text-gray-01">
                          when <ConditionView condition={r.condition} />
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Notification events */}
            {Object.keys(template.notification_events).length > 0 && (
              <div className="rounded-lg border border-white-02 bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold">Notification events</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(template.notification_events).map(([k, v]) => (
                    <Badge key={k} variant={v ? "active" : "inactive"}>
                      {k}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </PageShell>

      <Dialog open={resetOpen} onOpenChange={(v) => !v && setResetOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Use Codex's version?</DialogTitle>
            <DialogDescription>
              This school goes back to the Codex version as it stands today, and your
              adjustments stop being used. Approvals already running keep the path they
              started on. You can adjust it again at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={isResetting}>
              Keep ours
            </Button>
            <Button onClick={doReset} disabled={isResetting}>
              {isResetting ? "Switching…" : "Use Codex's version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-05">{label}</p>
      <p className={mono ? "font-mono text-black-01" : "text-black-01"}>{value}</p>
    </div>
  );
}
