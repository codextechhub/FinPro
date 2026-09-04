import { useMemo, useState } from "react";
import { FlaskConical, Info, RefreshCw, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/custom/search-select";
import PermissionGate from "@/components/custom/permission-gate";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "@/permissions";
import { selectIsPlatformTenant } from "@/redux/features/auth/auth-slice";
import { usePermissions } from "@/hooks/use-permissions";
import { useAppSelector } from "@/redux/store";
import { useRoles } from "@xvs/finance/host";
import { useGetTeamMembersQuery } from "@/redux/services/workflow/team-mgt-api";
import {
  useCreateStageApproverOverrideMutation,
  useDeleteStageApproverOverrideMutation,
  useGetApproverGroupsQuery,
  useGetStageApproverOverridesQuery,
  useGetWorkflowTemplatesQuery,
  useLazyGetWorkflowTemplateQuery,
  usePreviewApproversMutation,
  usePublishWorkflowTemplateMutation,
} from "@/redux/services/dashboard/workflow-api";
import type {
  StageApproverOverride,
  WorkflowStage,
  WorkflowTemplate,
} from "@/redux/services/dashboard/workflow-types";
import { ConditionView } from "@/pages/protected/workflow/components/condition-view";
import { humanizeDocumentType } from "@/pages/protected/workflow/components/workflow-format";
import { DynamicRulesEditor } from "../templates/components/template-builder-bits";
import {
  type RuleForm,
  rulesPayload,
  rulesToForm,
  validateRules,
} from "../templates/components/stage-form";
import {
  isCentralTemplate,
  templateToPublishPayload,
} from "../templates/components/template-payload";

/** One DYNAMIC_ROLE stage, with the template it lives on. */
type RuleSet = {
  key: string;
  stage: WorkflowStage;
  template: WorkflowTemplate;
  /** The shared definition, carried by no tenant and started on by all of them. */
  isCentral: boolean;
};

export default function DynamicRoleTab() {
  const { hasPermission } = usePermissions();
  const canSeeTemplates = hasPermission(P.VIEW_WORKFLOW_TEMPLATES);
  const self = useAppSelector((s) => s.auth.user);
  const isPlatformTenant = useAppSelector(selectIsPlatformTenant);

  const [selectedKey, setSelectedKey] = useState("");
  const [sampleText, setSampleText] = useState("");
  const [requester, setRequester] = useState(self?.id != null ? String(self.id) : "");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: templates, isLoading, isFetching, refetch } = useGetWorkflowTemplatesQuery(
    { page: 1, page_size: 100 },
    { skip: !canSeeTemplates },
  );
  const { data: roles } = useRoles();
  const { data: overrides } = useGetStageApproverOverridesQuery(undefined, {
    skip: !canSeeTemplates,
  });
  const { data: members } = useGetTeamMembersQuery({ page: 1, page_size: 200 });
  const [preview, { data: previewData, isLoading: isPreviewing, error: previewError }] =
    usePreviewApproversMutation();

  // How many people each role currently reaches. A rule pointing at a role
  // nobody holds is the quiet way a ladder stops working, so it is on screen.
  const holdersByKey = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const r of roles?.data ?? [])
      map.set(r.key, { name: r.name, count: r.assigned_users_count ?? 0 });
    return map;
  }, [roles]);

  const roleOptions = useMemo(
    () =>
      (roles?.data ?? [])
        .filter((r) => r.status === "ACTIVE")
        .map((r) => ({
          value: r.key,
          label: `${r.name} · ${r.assigned_users_count ?? 0} holder(s)`,
        })),
    [roles],
  );

  const ruleSets = useMemo<RuleSet[]>(() => {
    const out: RuleSet[] = [];
    for (const t of templates?.data ?? []) {
      for (const s of t.stages ?? []) {
        if (s.approver_source !== "DYNAMIC_ROLE") continue;
        out.push({
          key: `${t.id}:${s.code}`,
          stage: s,
          template: t,
          isCentral: t.tenant == null,
        });
      }
    }
    return out;
  }, [templates]);

  // Derived, not synced: the clicked set wins while it exists, otherwise the
  // first one stands in (first load, or a republish that removed it).
  const selected = useMemo(
    () => ruleSets.find((r) => r.key === selectedKey) ?? ruleSets[0] ?? null,
    [ruleSets, selectedKey],
  );

  const rules = useMemo(
    () => [...(selected?.stage.dynamic_role_rules ?? [])].sort((a, b) => a.order - b.order),
    [selected],
  );
  const noFallback = rules.length > 0 && !rules[rules.length - 1].is_fallback;

  const override = useMemo<StageApproverOverride | null>(
    () =>
      (overrides?.data ?? []).find((o) => selected && o.stage === selected.stage.id) ?? null,
    [overrides, selected],
  );

  const memberOptions = useMemo(
    () =>
      (members?.data ?? [])
        .filter((u) => u.status === "ACTIVE")
        .map((u) => ({ value: String(u.id), label: u.full_name || u.email })),
    [members],
  );

  let sampleInvalid = false;
  let sampleDocument: Record<string, unknown> = {};
  if (sampleText.trim()) {
    try {
      sampleDocument = JSON.parse(sampleText);
    } catch {
      sampleInvalid = true;
    }
  }

  const runPreview = () => {
    if (!selected || !requester || sampleInvalid) return;
    preview({
      requester,
      approver_source: "DYNAMIC_ROLE",
      approver_scope: selected.stage.approver_scope,
      // The stored rules, exactly as published - the tester must answer for what
      // is live, not for anything re-derived on the way to the request.
      dynamic_role_rules: rules.map((r) => ({
        order: r.order,
        condition: r.condition,
        role_key: r.role_key,
        label: r.label,
      })),
      sample_document: sampleDocument,
      document_type: selected.template.document_type,
    })
      .unwrap()
      .catch(() => {});
  };

  const dyn = previewData?.dynamic_role;
  const hitOrder = dyn?.evaluations.find((e) => e.picked)?.order ?? null;

  if (!canSeeTemplates) {
    return (
      <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md py-16 text-center")}>
        <span className="mx-auto grid size-12 place-content-center rounded-full bg-pry-01 text-primary">
          <Info className="size-6" />
        </span>
        <p className="mx-auto mt-3 max-w-md text-sm text-gray-01">
          Rule ladders live on workflow templates, so seeing them needs template view
          rights. Ask an administrator for workflow template access.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-01">
          Steps whose approver is chosen by the document itself: ordered rules, first
          match wins. Check what a ladder actually does here, and adjust one without
          leaving the screen.
        </p>
        <Button variant="white" size="lg" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn(isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[280px_1fr]">
        <aside className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md p-3")}>
          <p className="px-1 pb-1 text-xs font-semibold uppercase text-gray-01">
            {ruleSets.length} {ruleSets.length === 1 ? "rule set" : "rule sets"}
          </p>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-md bg-gray-50" />
              ))}
            </div>
          ) : ruleSets.length === 0 ? (
            <p className="px-1 py-8 text-center text-xs text-gray-01">
              No step uses document-driven rules yet. Set a stage's approver source to
              "Role chosen by the document" in the template builder.
            </p>
          ) : (
            <ul className="space-y-1">
              {ruleSets.map((rs) => {
                const rr = rs.stage.dynamic_role_rules ?? [];
                const missing = rr.filter(
                  (r) => (holdersByKey.get(r.role_key)?.count ?? 0) === 0,
                ).length;
                const lacksFallback = rr.length > 0 && !rr[rr.length - 1].is_fallback;
                return (
                  <li key={rs.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(rs.key)}
                      aria-current={rs.key === selected?.key}
                      className={cn(
                        "w-full rounded-md px-3 py-2 text-left transition-colors",
                        rs.key === selected?.key ? "bg-pry-01" : "hover:bg-gray-50",
                      )}
                    >
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          rs.key === selected?.key ? "text-primary" : "text-black-01",
                        )}
                      >
                        {rs.stage.label}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 flex items-center gap-1 text-xs tabular-nums",
                          lacksFallback || missing ? "text-yellow-01-text" : "text-gray-01",
                        )}
                      >
                        {(lacksFallback || missing > 0) && (
                          <TriangleAlert className="size-3 shrink-0" />
                        )}
                        {rr.length} {rr.length === 1 ? "rule" : "rules"}
                        {lacksFallback
                          ? " · no fallback"
                          : missing
                            ? ` · ${missing} with nobody`
                            : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          {isLoading ? (
            <div className="h-64 animate-pulse rounded-md bg-gray-50" />
          ) : !selected ? (
            <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md py-16 text-center")}>
              <span className="mx-auto grid size-12 place-content-center rounded-full bg-pry-01 text-primary">
                <FlaskConical className="size-6" />
              </span>
              <p className="mx-auto mt-3 max-w-md text-sm text-gray-01">
                Nothing to show yet. A stage published with the "Role chosen by the
                document" source appears here with its rules and a tester.
              </p>
            </div>
          ) : (
            <>
              <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-4")}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-black-01">
                    {selected.stage.label}
                  </h2>
                  <span className="rounded border border-white-02 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-01">
                    {selected.stage.code}
                  </span>
                  {selected.isCentral && (
                    <Badge variant="inactive">
                      {isPlatformTenant ? "Shared with every school" : "Codex version"}
                    </Badge>
                  )}
                  <PermissionGate permission={P.MANAGE_WORKFLOW_TEMPLATES}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setEditOpen(true)}
                    >
                      <SlidersHorizontal className="size-3.5" />{" "}
                      {selected.isCentral && !isPlatformTenant ? "Adjust rules" : "Edit rules"}
                    </Button>
                  </PermissionGate>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-01">
                  <span>{humanizeDocumentType(selected.template.document_type)}</span>
                  <span aria-hidden>·</span>
                  <span>{selected.template.name}</span>
                  <span aria-hidden>·</span>
                  <span>
                    {rules.length} {rules.length === 1 ? "rule" : "rules"}
                  </span>
                  <span aria-hidden>·</span>
                  <span>first match wins</span>
                </div>
              </div>

              {selected.isCentral && (
                <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white-02 px-4 py-3">
                    <p className="text-sm font-semibold">Shared with every tenant</p>
                    <PermissionGate permission={P.MANAGE_WORKFLOW_TEMPLATES}>
                      {override ? (
                        <RemoveOverrideButton id={override.id} />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOverrideOpen(true)}
                        >
                          Use a different approver here
                        </Button>
                      )}
                    </PermissionGate>
                  </div>
                  <p className="px-4 py-3 text-xs text-gray-01">
                    {override ? (
                      <>
                        This tenant sends this step to{" "}
                        <span className="font-medium text-black-01">
                          {override.approver_source === "ROLE"
                            ? holdersByKey.get(override.approver_role_key)?.name ||
                              override.approver_role_key
                            : override.approver_group_code}
                        </span>{" "}
                        instead, so the rules below no longer apply here. How many
                        approvals are needed, what happens on rejection, and where the
                        request goes next still come from the shared template. Remove the
                        override and the rules take over again.
                      </>
                    ) : (
                      <>
                        These rules were published centrally, and they stay read-only
                        here. Saving a change would not update the shared version, it
                        would create a copy for this tenant only, and later changes to the
                        original would stop reaching you. Repointing the approver changes
                        who approves this step for this tenant, and keeps the shared rules
                        intact.
                      </>
                    )}
                  </p>
                </div>
              )}

              {noFallback && (
                <div className="flex gap-3 rounded-md border border-yellow-01/30 bg-yellow-01/10 p-4 text-yellow-01-text">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">No fallback rule</p>
                    <p className="mt-0.5 text-xs">
                      A request matching none of these rules resolves to nobody. Add a
                      final rule with "Otherwise" ticked to catch everything else.
                    </p>
                  </div>
                </div>
              )}

              {/* The tester is the reason to open this screen, so it comes first. */}
              <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
                <div className="border-b border-white-02 px-4 py-3">
                  <p className="text-sm font-semibold">Try a request</p>
                </div>
                <div className="space-y-3 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SearchSelect
                      id="dyn-requester"
                      label="Sample requester"
                      options={memberOptions}
                      value={requester}
                      onChange={(e) => setRequester(e.target.value)}
                      placeholder="Who is raising it?"
                    />
                    <div className="space-y-1.5">
                      <label htmlFor="dyn-sample" className="text-xs font-medium text-black-01">
                        Sample document{" "}
                        <span className="text-gray-01">(JSON the rules are tried against)</span>
                      </label>
                      <Textarea
                        id="dyn-sample"
                        rows={2}
                        className="font-mono text-xs"
                        placeholder={`{ "amount": 250000 }`}
                        value={sampleText}
                        onChange={(e) => setSampleText(e.target.value)}
                      />
                      {sampleInvalid && (
                        <p className="text-xs text-destructive">Not valid JSON.</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={runPreview}
                    disabled={!requester || sampleInvalid || isPreviewing}
                  >
                    <FlaskConical className="size-3.5" />
                    {isPreviewing ? "Evaluating…" : "Evaluate"}
                  </Button>

                  {previewError != null && (
                    <p className="text-xs text-destructive">
                      {(previewError as { data?: { detail?: string } })?.data?.detail ??
                        "Could not evaluate these rules."}
                    </p>
                  )}

                  {dyn &&
                    (dyn.matched_role_key ? (
                      <div className="rounded-md border border-white-02 bg-gray-06/30 px-3 py-2.5 text-xs">
                        <p className="text-black-01">
                          <strong>Rule {(hitOrder ?? 0) + 1}</strong> wins, so this goes to{" "}
                          <strong>{dyn.matched_role_name}</strong>.
                        </p>
                        {previewData && previewData.count === 0 ? (
                          <p className="mt-1 flex items-center gap-1.5 text-yellow-01-text">
                            <TriangleAlert className="size-3.5" />
                            Nobody can actually approve it - that role reaches no one here
                            (the requester never counts as their own approver).
                          </p>
                        ) : (
                          <p className="mt-1 text-gray-01">
                            {previewData?.count}{" "}
                            {previewData?.count === 1 ? "person" : "people"} would be asked:{" "}
                            <span className="text-black-01">
                              {previewData?.approvers.map((a) => a.user.full_name).join(", ")}
                            </span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-md border border-yellow-01/30 bg-yellow-01/10 px-3 py-2.5 text-xs text-yellow-01-text">
                        {dyn.note ??
                          "No rule matches, so this request would reach the step and find no approver."}
                      </div>
                    ))}
                </div>
              </div>

              {/* Rules, numbered because order is the contract. */}
              <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
                <div className="border-b border-white-02 px-4 py-3">
                  <p className="text-sm font-semibold">
                    Rules{" "}
                    <span className="font-normal text-gray-01 tabular-nums">
                      {rules.length}
                    </span>
                  </p>
                </div>
                <ul>
                  {rules.map((r, i) => {
                    const holders = holdersByKey.get(r.role_key);
                    const isHit = hitOrder != null && r.order === hitOrder;
                    const dead = hitOrder != null && r.order > hitOrder;
                    return (
                      <li
                        key={r.id}
                        className={cn(
                          "flex gap-3 border-b border-white-02 px-4 py-3 last:border-b-0",
                          isHit && "bg-pry-01/40",
                          dead && "opacity-55",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-6 shrink-0 place-content-center rounded text-xs font-semibold tabular-nums",
                            isHit ? "bg-primary text-white" : "bg-gray-50 text-gray-01",
                          )}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            {r.is_fallback ? (
                              <span className="text-gray-01 italic">
                                Otherwise (catches everything else)
                              </span>
                            ) : (
                              <ConditionView condition={r.condition} />
                            )}
                            <span aria-hidden className="text-gray-01">
                              →
                            </span>
                            <span className="font-medium text-black-01">
                              {r.role_name || holders?.name || r.role_key}
                            </span>
                            <span
                              className={cn(
                                "text-xs tabular-nums",
                                holders?.count ? "text-gray-01" : "text-yellow-01-text",
                              )}
                            >
                              {holders
                                ? holders.count
                                  ? `${holders.count} ${holders.count === 1 ? "person" : "people"}`
                                  : "nobody holds this role"
                                : "role not in this tenant"}
                            </span>
                          </div>
                          {r.label && <p className="mt-0.5 text-xs text-gray-01">{r.label}</p>}
                          {hitOrder != null && (
                            <p
                              className={cn(
                                "mt-0.5 text-xs",
                                isHit ? "font-medium text-primary" : "text-gray-01 italic",
                              )}
                            >
                              {isHit
                                ? "Matches this request."
                                : dead
                                  ? "Not reached - an earlier rule already matched."
                                  : "Does not match this request."}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <p className="text-xs text-gray-01">
                Evaluated top to bottom. The first rule that matches picks the role; its
                current holders become that step's approvers.{" "}
                {selected.isCentral && !isPlatformTenant
                  ? "These are Codex's rules. Adjusting them gives this school its own version of this path; Codex keeps theirs."
                  : "Editing them here republishes this template; the rest of it is resent exactly as it stands."}
              </p>
            </>
          )}
        </div>
      </div>

      {selected && (
        <EditRulesSheet
          open={editOpen}
          onClose={() => setEditOpen(false)}
          templateId={selected.template.id}
          templateName={selected.template.name}
          isPlatformTenant={isPlatformTenant}
          isShared={selected.isCentral}
          stage={selected.stage}
          roleOptions={roleOptions}
        />
      )}

      {selected && (
        <OverrideSheet
          open={overrideOpen}
          onClose={() => setOverrideOpen(false)}
          stageId={selected.stage.id}
          stageLabel={selected.stage.label}
        />
      )}
    </section>
  );
}

function RemoveOverrideButton({ id }: { id: string }) {
  const [remove, { isLoading }] = useDeleteStageApproverOverrideMutation();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isLoading}
      onClick={() =>
        remove(id)
          .unwrap()
          .then(() => toast.success("Override removed - the template's own approver applies again."))
          .catch(() => {})
      }
    >
      {isLoading ? "Removing…" : "Remove override"}
    </Button>
  );
}

/**
 * Repoint one central step at this tenant's own approver.
 *
 * Only ROLE and WORKFLOW_GROUP are offered because they are the only two the
 * backend accepts: the organogram climb and the rule ladder belong to whoever
 * authored the template.
 */
function OverrideSheet({
  open,
  onClose,
  stageId,
  stageLabel,
}: {
  open: boolean;
  onClose: () => void;
  stageId: string;
  stageLabel: string;
}) {
  const [source, setSource] = useState<"ROLE" | "WORKFLOW_GROUP">("ROLE");
  const [roleKey, setRoleKey] = useState("");
  const [groupId, setGroupId] = useState("");
  const [note, setNote] = useState("");
  const [create, { isLoading }] = useCreateStageApproverOverrideMutation();

  const { data: roles } = useRoles();
  const { data: groups } = useGetApproverGroupsQuery(
    { page: 1, page_size: 100 },
    { skip: !open },
  );

  const roleOptions = (roles?.data ?? [])
    .filter((r) => r.status === "ACTIVE")
    .map((r) => ({ value: r.key, label: `${r.name} · ${r.assigned_users_count ?? 0} holder(s)` }));
  const groupOptions = (groups?.data ?? [])
    .filter((g) => g.is_active)
    .map((g) => ({ value: g.id, label: `${g.name} · ${g.member_count} member(s)` }));

  const isValid = source === "ROLE" ? !!roleKey : !!groupId;

  const close = () => {
    setSource("ROLE");
    setRoleKey("");
    setGroupId("");
    setNote("");
    onClose();
  };

  const submit = () => {
    if (!isValid) return;
    create({
      stage: stageId,
      approver_source: source,
      approver_role_key: source === "ROLE" ? roleKey : "",
      approver_group: source === "WORKFLOW_GROUP" ? groupId : null,
      note: note.trim(),
    })
      .unwrap()
      .then(() => {
        toast.success("This step now uses your own approver.");
        close();
      })
      .catch(() => {});
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-white-02 px-6 pb-4 pt-6">
          <SheetTitle className="text-base font-semibold text-black-01">
            Repoint “{stageLabel}”
          </SheetTitle>
          <SheetDescription className="text-xs text-gray-01">
            This replaces the whole ladder for this step, in this tenant only: every
            request reaching it goes to whoever you pick here, whatever the amount. The
            advance rule, rejection policy and routing stay with the shared template.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <SearchSelect
            id="ovr-source"
            label="Send it to"
            clearable={false}
            options={[
              { value: "ROLE", label: "A role in this tenant" },
              { value: "WORKFLOW_GROUP", label: "One of your approver groups" },
            ]}
            value={source}
            onChange={(e) => setSource(e.target.value as "ROLE" | "WORKFLOW_GROUP")}
          />
          {source === "ROLE" ? (
            <SearchSelect
              id="ovr-role"
              label="Role"
              options={roleOptions}
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
              placeholder="Pick a role"
            />
          ) : (
            <SearchSelect
              id="ovr-group"
              label="Approver group"
              options={groupOptions}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="Pick a group"
            />
          )}
          <div className="space-y-1.5">
            <label htmlFor="ovr-note" className="text-xs font-medium text-black-01">
              Why (optional)
            </label>
            <Textarea
              id="ovr-note"
              rows={3}
              maxLength={240}
              placeholder="E.g. our bursar signs these off, not the finance lead."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <SheetFooter className="flex flex-row justify-end gap-3 border-t border-white-02 px-6 py-4">
          <Button variant="outline" size="lg" onClick={close} disabled={isLoading}>
            Cancel
          </Button>
          <Button size="lg" onClick={submit} disabled={isLoading || !isValid}>
            {isLoading ? "Saving…" : "Use this approver"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Editing a ladder in place ─────────────────────────────────────────────────

/**
 * Edit one stage's rules without going to the builder.
 *
 * There is no "patch these rules" endpoint - publishing replaces the whole
 * template - so saving re-reads the template first and resends everything else
 * exactly as it stands. Re-reading is the point: a stale copy in this tab would
 * quietly revert whatever somebody changed elsewhere in the same template.
 *
 * Offered on every ladder, including the shared one. What a save means depends
 * on who is saving: the platform edits the shared definition in place (scope
 * PLATFORM), while a school's save gives that school its own version of the
 * template, which it runs from then on. That fork is the intended flexibility,
 * so the sheet says it plainly rather than refusing.
 */
function EditRulesSheet({
  open,
  onClose,
  templateId,
  templateName,
  stage,
  roleOptions,
  isPlatformTenant,
  isShared,
}: {
  open: boolean;
  onClose: () => void;
  templateId: string;
  templateName: string;
  stage: WorkflowStage;
  roleOptions: { value: string; label: string }[];
  isPlatformTenant: boolean;
  isShared: boolean;
}) {
  // What the save will do, said before it happens. The authoritative check runs
  // again at save time against a fresh read; this is the heading, not the guard.
  const willFork = isShared && !isPlatformTenant;
  const [rules, setRules] = useState<RuleForm[]>(() => rulesToForm(stage));
  const [fetchTemplate, { isFetching }] = useLazyGetWorkflowTemplateQuery();
  const [publish, { isLoading: isPublishing }] = usePublishWorkflowTemplateMutation();
  const busy = isFetching || isPublishing;

  // Reload the rows when the *published* rules change underneath, so reopening
  // after a save never shows the pre-save draft. Adjusted during render rather
  // than in an effect: an effect would paint the stale rows first, and the
  // signature only moves when the server's copy actually differs, so an edit in
  // progress is not disturbed by an unrelated refetch.
  const published = JSON.stringify(stage.dynamic_role_rules ?? []);
  const [loadedFrom, setLoadedFrom] = useState(published);
  if (loadedFrom !== published) {
    setLoadedFrom(published);
    setRules(rulesToForm(stage));
  }

  const save = async () => {
    const problem = validateRules(rules);
    if (problem) {
      toast.error(problem.charAt(0).toUpperCase() + problem.slice(1));
      return;
    }
    const fresh = await fetchTemplate(templateId).unwrap().catch(() => null);
    if (!fresh) {
      toast.error("Could not re-read the template, so nothing was published.");
      return;
    }
    // Re-read rather than trusted: the shared template may have been adjusted by
    // this school since the list loaded, in which case the save is an ordinary
    // edit of their own version rather than a first fork.
    const shared = isCentralTemplate(fresh);
    if (!(fresh.stages ?? []).some((s) => s.code === stage.code)) {
      toast.error(`"${stage.label}" is no longer a step on this template.`);
      return;
    }
    publish({
      ...templateToPublishPayload(fresh, {
        stageCode: stage.code,
        rules: rulesPayload(rules),
      }),
      // Codex editing the shared ladder must write the shared template, not a
      // Codex-owned one that no school inherits.
      scope: shared && isPlatformTenant ? "PLATFORM" : "TENANT",
    })
      .unwrap()
      .then(() => {
        toast.success(
          shared && !isPlatformTenant
            ? "Saved. This school now runs its own version."
            : "Rules updated.",
        );
        onClose();
      })
      .catch(() => {});
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-white-02 px-6 pb-4 pt-6">
          <SheetTitle className="text-base font-semibold text-black-01">
            Edit rules - {stage.label}
          </SheetTitle>
          <SheetDescription className="text-xs text-gray-01">
            {willFork ? (
              <>
                These are Codex's rules. Saving gives this school its own version of{" "}
                <span className="font-medium">{templateName}</span>, which it runs from then
                on - Codex keeps theirs, and you can go back to it from the template page.
              </>
            ) : (
              <>
                Saving republishes <span className="font-medium">{templateName}</span>. Only
                this step's rules change; every other stage and route is resent as it stands.
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <DynamicRulesEditor
            rules={rules}
            roleOptions={roleOptions}
            stageIndex={0}
            onChange={setRules}
          />
        </div>

        <SheetFooter className="flex flex-row justify-end gap-3 border-t border-white-02 px-6 py-4">
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="lg" onClick={save} disabled={busy}>
            {busy ? "Publishing…" : willFork ? "Save for this school" : "Save rules"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
