import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CustomInput } from "@/components/custom/custom-input";
import { SearchSelect } from "@/components/custom/search-select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/redux/store";
import { selectIsPlatformTenant } from "@/redux/features/auth/auth-slice";
import { usePermissions } from "@/hooks/use-permissions";
import { P } from "@/permissions";
import { routesPath } from "../paths";
import {
  useGetApproverGroupsQuery,
  useGetWorkflowTemplateQuery,
  usePublishWorkflowTemplateMutation,
} from "@/redux/services/dashboard/workflow-api";
import { useGetPositionsQuery } from "@/redux/services/workflow/organogram-api";
import { useGetTeamMembersQuery } from "@/redux/services/workflow/team-mgt-api";
import { useRoles } from "@xvs/finance/host";
import { approverScopeLabel } from "@/pages/protected/workflow/components/workflow-format";
import type {
  ApproverScope,
  ApproverSource,
  OrganogramTarget,
  PublishTemplatePayload,
  StageAdvanceRule,
  StageKind,
  StageOnRejection,
  WorkflowStagePayload,
} from "@/redux/services/dashboard/workflow-types";
import {
  type StageForm,
  emptyStage,
  rulesPayload,
  rulesToForm,
  validateRules,
} from "./components/stage-form";
import {
  Advanced,
  Band,
  FieldHint,
  Section,
  ApproverPreview,
  DynamicRulesEditor,
} from "./components/template-builder-bits";
import { TemplateReachChip, TemplateReachNotice } from "./components/template-reach";
import { PageShell } from "@/components/layout/page-shell";

const SOURCE_OPTIONS = [
  { value: "ROLE", label: "Role holders" },
  { value: "WORKFLOW_GROUP", label: "Approver group" },
  { value: "DYNAMIC_ROLE", label: "Role chosen by the document" },
  { value: "ORGANOGRAM", label: "Organogram (relative to requester)" },
];
// What each source resolves to, in the words an administrator uses. Shown under
// the picker because the choice decides who can approve, and the difference
// between a role and a group is not guessable from the name alone.
const SOURCE_HINT: Record<string, string> = {
  ROLE: "Whoever currently holds this role in the tenant that raised the request.",
  WORKFLOW_GROUP:
    "A named pool built on the Approver Groups screen - people, roles and org seats mixed.",
  DYNAMIC_ROLE:
    "The document picks the role: ordered rules, first match wins (e.g. amount thresholds).",
  ORGANOGRAM: "Climbs the org chart relative to whoever raised the request.",
};
const TARGET_OPTIONS = [
  { value: "DIRECT_MANAGER", label: "Direct manager" },
  { value: "N_LEVELS_UP", label: "N levels up the chain" },
  { value: "DEPARTMENT_HEAD", label: "Department head" },
  { value: "SPECIFIC_POSITION", label: "Specific position" },
];

const KIND_OPTIONS = [
  { value: "APPROVAL", label: "Waits for approval" },
  { value: "BRANCH", label: "Routing only, nobody approves" },
];
const SCOPE_OPTIONS = (isPlatformTenant: boolean) => [
  { value: "SCHOOL", label: approverScopeLabel("SCHOOL", isPlatformTenant) },
  { value: "BRANCH", label: approverScopeLabel("BRANCH", isPlatformTenant) },
  { value: "PLATFORM", label: approverScopeLabel("PLATFORM", isPlatformTenant) },
];
const RULE_OPTIONS = [
  { value: "ANY", label: "Any one of them" },
  { value: "UNANIMOUS", label: "All of them" },
  { value: "QUORUM", label: "A set number of them" },
];
const REJECT_OPTIONS = [
  { value: "TERMINAL", label: "The request ends there" },
  { value: "RETURN_TO_REQUESTER", label: "It goes back to the requester" },
];
// The lifecycle points the engine actually emits (backend NOTIF_WIRED_EVENT_KEYS).
// An untouched template notifies for all of these; toggling any switch makes
// the dict exact intent (unchecked = off).
const NOTIF_EVENTS = [
  { key: "workflow.stage_activated", label: "Stage activated - notify that stage's approvers" },
  { key: "workflow.returned", label: "Returned for revision - notify the requester" },
  { key: "workflow.rejected", label: "Rejected - notify the requester" },
  { key: "workflow.final_approved", label: "Fully approved - notify the requester" },
];

/**
 * Everything a publish would send, as one comparable string.
 *
 * Publishing an unchanged template is a write that produces a new updated_at,
 * a fresh audit entry and - on a shared template - a tenant fork for whoever
 * pressed it. So the button follows the form rather than the intent: edit
 * something and it wakes up, put it back and it goes quiet again, with no
 * separate "dirty" flag to drift out of step with what is on screen.
 *
 * Sample-document text is deliberately absent: it drives the preview and is
 * never published, so typing in it must not arm the button.
 */
function formSignature(form: {
  name: string;
  documentType: string;
  code: string;
  description: string;
  notifEvents: Record<string, boolean>;
  stages: StageForm[];
  routesText: string;
}): string {
  return JSON.stringify({
    name: form.name.trim(),
    documentType: form.documentType.trim(),
    code: form.code.trim(),
    description: form.description.trim(),
    // Key order varies with how the switches were toggled; sort so it does not
    // read as a change.
    notifEvents: Object.fromEntries(
      Object.entries(form.notifEvents).sort(([a], [b]) => a.localeCompare(b)),
    ),
    routesText: form.routesText.trim(),
    stages: form.stages.map((s) => ({
      code: s.code.trim(),
      label: s.label.trim(),
      kind: s.kind,
      approver_source: s.approver_source,
      approver_scope: s.approver_scope,
      approver_role_key: s.approver_role_key,
      approver_group_code: s.approver_group_code,
      organogram_target: s.organogram_target,
      organogram_levels: s.organogram_levels,
      organogram_position_code: s.organogram_position_code,
      advance_rule: s.advance_rule,
      quorum_count: s.quorum_count,
      on_rejection: s.on_rejection,
      skip_if_no_approvers: s.skip_if_no_approvers,
      inclusion_condition_text: s.inclusion_condition_text.trim(),
      // The rule rows without their React keys, which are not data.
      dynamic_rules: s.dynamic_rules.map((r) => ({
        field: r.field.trim(),
        op: r.op,
        value: r.value.trim(),
        role_key: r.role_key.trim(),
        label: r.label.trim(),
        is_fallback: r.is_fallback,
        raw: r.raw,
      })),
    })),
  });
}

/** What a folded stage is still carrying, so nothing hides behind the fold. */
function advancedSummary(s: StageForm, isPlatformTenant: boolean): string | null {
  const carried: string[] = [];
  if (s.kind === "APPROVAL" && s.approver_source !== "ORGANOGRAM" && s.approver_scope !== "SCHOOL") {
    carried.push(approverScopeLabel(s.approver_scope, isPlatformTenant));
  }
  if (s.kind === "APPROVAL" && !s.skip_if_no_approvers) carried.push("never skipped");
  if (s.inclusion_condition_text.trim()) carried.push("runs conditionally");
  return carried.length ? carried.join(" · ") : null;
}

export default function TemplateBuilder() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const isPlatformTenant = useAppSelector(selectIsPlatformTenant);
  const self = useAppSelector((s) => s.auth.user);
  const { hasPermission } = usePermissions();

  // Two of the builder's pickers read data this user may not be allowed to see,
  // and asking anyway produced three red permission toasts and an empty select.
  // Ask only when the answer can come back, and say what is missing otherwise.
  //
  // The staff directory carries emails, so it is not something template
  // management should drag in; the preview works against yourself without it.
  const canSeeDirectory = hasPermission(P.ACCESS_TEAM_PANEL);
  // Organogram seats are Codex's own org chart, and that endpoint is CX-staff
  // only by design - a school admin can never resolve one, so offering the
  // source at all would be offering something that cannot work for them.
  // An organogram-sourced stage resolves its approver from the reporting line, and
  // building one needs the positions list. So the gate is "can this person read the
  // organogram", which is the permission that read is enforced on.
  //
  // Was `self.user_type === "CX_STAFF"` - a field the API does not return, so it
  // was always false and ORGANOGRAM never appeared in the picker for anyone. The
  // model calls user_type an inert marker that must never drive authorization.
  const canUseOrganogram = hasPermission(P.VIEW_ORGANOGRAM);

  const {
    data: existing, isLoading: isLoadingExisting, isError: existingFailed,
  } = useGetWorkflowTemplateQuery(id ?? "", { skip: !isEdit });

  // Codex edits the shared definition; a school edits its own. Neither is a mode
  // the user picks, because the wrong pick is silent and expensive: a school
  // cannot write the shared one at all (the API refuses it), and a Codex admin
  // publishing tenant-scoped would quietly create a Codex-only template that no
  // school inherits, which is the exact bug this contract was added to fix.
  // Only when the row actually being edited is the shared one. Defaulting a
  // platform actor to PLATFORM on *every* save would have written the shared
  // template while they had a Codex-owned one open - editing one record and
  // silently updating another.
  const editingShared = isPlatformTenant && (!isEdit || existing?.is_platform === true);
  const willFork = !isPlatformTenant && isEdit && existing?.is_platform === true;
  const [publish, { isLoading: isPublishing }] = usePublishWorkflowTemplateMutation();

  // Organogram approver-source support: positions for SPECIFIC_POSITION, and a
  // sample requester so the "who would approve?" preview can resolve live.
  const { data: positionsRes } = useGetPositionsQuery(
    { page_size: 100 },
    { skip: !canUseOrganogram },
  );
  const { data: usersRes } = useGetTeamMembersQuery(
    { page_size: 100, scope: "platform" },
    { skip: !canSeeDirectory },
  );
  // Roles and approver groups are what stages now name; both are picked from a
  // list rather than typed, so a stage cannot reference something that is not
  // there (the publish endpoint refuses that anyway - this just gets there first).
  const { data: rolesRes } = useRoles();
  const { data: groupsRes } = useGetApproverGroupsQuery({ page: 1, page_size: 100 });
  const roleOptions = useMemo(
    () =>
      (rolesRes?.data ?? [])
        .filter((r) => r.status === "ACTIVE")
        .map((r) => ({ value: r.key, label: `${r.name} · ${r.assigned_users_count ?? 0} holder(s)` })),
    [rolesRes],
  );
  const groupOptions = useMemo(
    () =>
      (groupsRes?.data ?? [])
        .filter((g) => g.is_active)
        .map((g) => ({ value: g.code, label: `${g.name} · ${g.member_count} member(s)` })),
    [groupsRes],
  );
  const positionOptions = useMemo(
    () => (Array.isArray(positionsRes?.data) ? positionsRes!.data : []).map((p) => ({ value: p.code, label: `${p.code} · ${p.title}` })),
    [positionsRes],
  );
  const requesterOptions = useMemo(
    () => (Array.isArray(usersRes?.data) ? usersRes!.data : []).map((u: { id: string; full_name: string; email: string }) => ({ value: u.id, label: `${u.full_name} · ${u.email}` })),
    [usersRes],
  );
  // The preview runs as the signed-in user unless an organogram stage asks to
  // climb from somebody else, which is the only case where the answer moves.
  const [sampleRequester, setSampleRequester] = useState(
    self?.id != null ? String(self.id) : "",
  );

  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<StageForm[]>([emptyStage()]);
  const [routesText, setRoutesText] = useState("");
  const [notifEvents, setNotifEvents] = useState<Record<string, boolean>>({});
  const [prefilled, setPrefilled] = useState(false);
  // The form as it was last saved (or as it started, when creating).
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  // Prefill once when editing an existing template.
  useEffect(() => {
    if (!isEdit || !existing || prefilled) return;
    setName(existing.name);
    setDocumentType(existing.document_type);
    setCode(existing.code);
    setDescription(existing.description ?? "");
    setNotifEvents(existing.notification_events ?? {});
    setStages(
      [...existing.stages]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          code: s.code,
          label: s.label,
          kind: s.kind,
          approver_source: s.approver_source ?? "ROLE",
          approver_scope: s.approver_scope,
          approver_role_key: s.approver_role_key ?? "",
          approver_group_code: s.approver_group_code ?? "",
          dynamic_rules: rulesToForm(s),
          sample_document_text: "",
          organogram_target: s.organogram_target ?? "",
          organogram_levels: String(s.organogram_levels ?? 1),
          organogram_position_code: s.organogram_position_code ?? "",
          advance_rule: s.advance_rule,
          quorum_count: String(s.quorum_count ?? 0),
          on_rejection: s.on_rejection,
          skip_if_no_approvers: s.skip_if_no_approvers,
          inclusion_condition_text: s.inclusion_condition
            ? JSON.stringify(s.inclusion_condition, null, 2)
            : "",
        })),
    );
    setRoutesText(
      existing.routes.length
        ? JSON.stringify(
            [...existing.routes]
              .sort((a, b) => a.order - b.order)
              .map((r) => ({
                from_stage_code: r.from_stage_code,
                to_stage_code: r.to_stage_code,
                order: r.order,
                condition: r.condition,
              })),
            null,
            2,
          )
        : "",
    );
    setPrefilled(true);
  }, [isEdit, existing, prefilled]);

  const signature = formSignature({
    name, documentType, code, description, notifEvents, stages, routesText,
  });
  // Creating starts from the empty form, so the first keystroke arms the button;
  // editing starts from what was loaded.
  useEffect(() => {
    if (savedSignature !== null) return;
    if (isEdit && !prefilled) return;
    setSavedSignature(signature);
  }, [savedSignature, isEdit, prefilled, signature]);

  const hasChanges = savedSignature !== null && signature !== savedSignature;

  const updateStage = (i: number, patch: Partial<StageForm>) =>
    setStages((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addStage = () => setStages((prev) => [...prev, emptyStage()]);
  const removeStage = (i: number) => setStages((prev) => prev.filter((_, j) => j !== i));
  const moveStage = (i: number, dir: -1 | 1) =>
    setStages((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const handlePublish = () => {
    if (!name.trim() || !documentType.trim() || !code.trim()) {
      toast.error("Name, document type, and code are required.");
      return;
    }
    if (stages.length === 0) {
      toast.error("Add at least one stage.");
      return;
    }
    // Build stage payloads, parsing per-stage inclusion conditions.
    const stagePayloads: WorkflowStagePayload[] = [];
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      if (!s.code.trim() || !s.label.trim()) {
        toast.error(`Stage ${i + 1}: code and label are required.`);
        return;
      }
      let inclusion = undefined;
      if (s.inclusion_condition_text.trim()) {
        try {
          inclusion = JSON.parse(s.inclusion_condition_text);
        } catch {
          toast.error(`Stage ${i + 1}: inclusion condition is not valid JSON.`);
          return;
        }
      }
      const isOrg = s.kind === "APPROVAL" && s.approver_source === "ORGANOGRAM";
      if (isOrg && !s.organogram_target) {
        toast.error(`Stage ${i + 1}: pick an organogram target.`);
        return;
      }
      if (isOrg && s.organogram_target === "SPECIFIC_POSITION" && !s.organogram_position_code) {
        toast.error(`Stage ${i + 1}: pick a specific position.`);
        return;
      }
      const isApproval = s.kind === "APPROVAL";
      if (isApproval && s.approver_source === "ROLE" && !s.approver_role_key) {
        toast.error(`Stage ${i + 1}: pick the role that approves this stage.`);
        return;
      }
      if (isApproval && s.approver_source === "WORKFLOW_GROUP" && !s.approver_group_code) {
        toast.error(`Stage ${i + 1}: pick the approver group this stage routes to.`);
        return;
      }
      // Mirror the publish endpoint's rule checks so a bad ladder is caught in
      // the form, where it can be fixed, rather than as a 400 after a save.
      if (isApproval && s.approver_source === "DYNAMIC_ROLE") {
        const problem = validateRules(s.dynamic_rules);
        if (problem) {
          toast.error(`Stage ${i + 1}: ${problem}`);
          return;
        }
      }
      stagePayloads.push({
        code: s.code.trim(),
        label: s.label.trim(),
        kind: s.kind,
        order: i + 1,
        approver_source: s.approver_source,
        // Each source's own field, blanked otherwise: sending a stale role key on
        // a group stage would leave the wrong answer sitting in the row.
        approver_role_key: s.approver_source === "ROLE" ? s.approver_role_key : "",
        approver_group_code: s.approver_source === "WORKFLOW_GROUP" ? s.approver_group_code : "",
        dynamic_role_rules:
          s.approver_source === "DYNAMIC_ROLE" ? rulesPayload(s.dynamic_rules) : undefined,
        approver_scope: s.approver_scope,
        // Organogram fields are OMITTED, not blanked, on any other source: the
        // publish validator checks every key it is given against the enum, so an
        // empty organogram_target is rejected as an invalid value rather than
        // read as "not applicable".
        ...(isOrg
          ? {
              organogram_target: s.organogram_target,
              organogram_levels: Number(s.organogram_levels) || 1,
              organogram_position_code:
                s.organogram_target === "SPECIFIC_POSITION" ? s.organogram_position_code : "",
            }
          : {}),
        advance_rule: s.advance_rule,
        quorum_count: Number(s.quorum_count) || 0,
        on_rejection: s.on_rejection,
        skip_if_no_approvers: s.skip_if_no_approvers,
        inclusion_condition: inclusion,
      });
    }
    // Parse advanced routes JSON.
    let routes = [];
    if (routesText.trim()) {
      try {
        routes = JSON.parse(routesText);
        if (!Array.isArray(routes)) throw new Error("not array");
      } catch {
        toast.error("Routes must be a valid JSON array.");
        return;
      }
    }

    const payload: PublishTemplatePayload = {
      scope: editingShared ? "PLATFORM" : "TENANT",
      name: name.trim(),
      document_type: documentType.trim(),
      code: code.trim(),
      description: description.trim(),
      notification_events: notifEvents,
      stages: stagePayloads,
      routes,
    };

    publish(payload)
      .unwrap()
      .then((t) => {
        // Saved: the form is the new baseline, so the button goes quiet until
        // something else moves.
        setSavedSignature(signature);
        toast.success(
          willFork
            ? "Saved. This school now runs your version."
            : isEdit
              ? "Template updated."
              : "Template published.",
        );
        navigate(routesPath.PROTECTED.WORKFLOW.TEMPLATE_DETAIL(t.id));
      })
      .catch(() => {});
  };

  if (isEdit && isLoadingExisting) {
    return (
      <>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </>
    );
  }

  // The read failed - almost always a template id that does not exist. Without
  // this the builder fell through to an empty "Untitled · 1 stage" form, and
  // publishing it would have created a template out of a bad URL rather than
  // editing anything.
  if (isEdit && (existingFailed || !existing)) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md rounded-lg border border-white-02 bg-white px-6 py-10 text-center">
          <p className="font-mont font-semibold text-gray-01">Template not found</p>
          <p className="mt-1.5 text-xs leading-5 text-gray-01">
            This approval template does not exist, or it has been retired. It cannot be
            edited from here.
          </p>
          <Button
            variant="white"
            className="mt-5"
            onClick={() => navigate(routesPath.PROTECTED.WORKFLOW.TEMPLATES)}
          >
            Back to templates
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell className="space-y-5 text-black-01">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold font-mont text-gray-01">
              {willFork ? "Adjust template" : isEdit ? "Edit template" : "New template"}
            </p>
            <p className="mt-0.5 text-xs text-gray-01">
              {name.trim() || "Untitled"} · {stages.length}{" "}
              {stages.length === 1 ? "stage" : "stages"}
            </p>
          </div>
          <div className="inline-flex flex-wrap items-center gap-3.5">
            {/* The reach sits next to the button that acts on it, so nobody
                updates a shared path without seeing how far it goes. */}
            {editingShared && isEdit && id ? <TemplateReachChip templateId={id} /> : null}
            <Button variant="white" size="lg" onClick={() => navigate(-1)} disabled={isPublishing}>
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={handlePublish}
              disabled={isPublishing || !hasChanges}
              title={hasChanges ? undefined : "Nothing has changed yet"}
            >
              {isPublishing
                ? "Publishing…"
                : willFork
                  ? "Save for this school"
                  : isEdit
                    ? "Update template"
                    : "Publish template"}
            </Button>
          </div>
        </div>

        {/* The stages are the work, so they take the width. Everything you set
            once per template sits in a rail beside them on a wide screen, and
            above them on a narrow one, which is the order you fill them in. */}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          {/* Sticky, but the rail is often taller than the screen - routing sits at
              its foot. Pinned without a height it simply overflowed: the bottom
              of the rail could never be scrolled to, and it sat over the stages
              beside it. Cap it to the viewport and let it scroll itself. */}
          <aside
            data-guide="workflow-template.details"
            className="min-w-0 space-y-5 xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-1"
          >
        {/* Meta */}
        <Section title="Template details">
          <div className="space-y-4">
            <CustomInput
              id="tpl-name"
              label="Name"
              isRequired
              placeholder="e.g. Standard Leave Approval"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CustomInput
                id="tpl-doc-type"
                label="Document type"
                isRequired
                placeholder="e.g. leave.request"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
              />
              <CustomInput
                id="tpl-code"
                label="Code"
                isRequired
                placeholder="e.g. standard"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Description</label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this approval path for?"
              />
            </div>
            {willFork && (
              <p className="rounded-md border border-white-02 bg-pry-01/40 px-3 py-2 text-xs text-gray-01">
                This is the Codex version. Saving keeps theirs as it is and gives this school
                its own version of this path, which it runs from then on. You can go back to
                Codex's version at any time from the template page.
              </p>
            )}
            {editingShared && (
              isEdit && id
                ? <TemplateReachNotice templateId={id} />
                : (
                  <p className="rounded-md border border-white-02 bg-pry-01/40 px-3 py-2 text-xs text-gray-01">
                    This publishes a shared template every school starts on.
                  </p>
                )
            )}
            {isEdit && (
              <FieldHint title="Can I change the document type or code?">
                These two name the template. Publishing with the same pair updates this
                template in place; changing either publishes a <strong>new</strong> template
                and leaves this one exactly as it is, still running for anyone using it. So
                they are safe to correct before anything depends on them, and a rename after
                that is really a new template plus a decision about the old one.
              </FieldHint>
            )}
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notification events">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {NOTIF_EVENTS.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between gap-2 rounded-md border border-white-02 px-3 py-2 text-xs">
                <span className="text-gray-01">{label}</span>
                <Switch
                  checked={!!notifEvents[key]}
                  onCheckedChange={(v) => setNotifEvents((prev) => ({ ...prev, [key]: v }))}
                />
              </label>
            ))}
          </div>
        </Section>

        {/* Advanced routes */}
        <Section title="Routing (advanced)">
          <p className="mb-2 text-xs text-gray-01">
            Leave blank for linear routing (stages run in order). Otherwise provide a JSON array of
            routes: <code className="font-mono">{`{ from_stage_code, to_stage_code, order, condition }`}</code>.
            Use <code className="font-mono">null</code> for ENTRY/EXIT or an always-true condition.
          </p>
          <Textarea
            rows={6}
            className="font-mono text-xs"
            placeholder={`[\n  { "from_stage_code": null, "to_stage_code": "line-manager", "order": 1, "condition": null }\n]`}
            value={routesText}
            onChange={(e) => setRoutesText(e.target.value)}
          />
        </Section>

          </aside>

          <div data-guide="workflow-template.stages" className="min-w-0 space-y-5">
          {/* Stages */}
          <Section
            title="Stages"
            action={
              <Button variant="outline" size="sm" onClick={addStage}>
                <Plus className="size-3.5" /> Add stage
              </Button>
            }
          >
            <div className="space-y-4">
              {stages.map((s, i) => (
                <div key={i} className="space-y-3 rounded-md border border-white-02 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <GripVertical className="size-4 text-gray-05" />
                    <span className="grid size-6 place-content-center rounded-full bg-pry-01 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium">
                      {s.label.trim() || `Stage ${i + 1}`}
                    </span>
                    <button
                      type="button"
                      className="text-gray-01 hover:text-black-01 disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => moveStage(i, -1)}
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="text-gray-01 hover:text-black-01 disabled:opacity-30"
                      disabled={i === stages.length - 1}
                      onClick={() => moveStage(i, 1)}
                    >
                      <ChevronDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="text-gray-01 hover:text-destructive disabled:opacity-30"
                      disabled={stages.length === 1}
                      onClick={() => removeStage(i)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <Band title="What this step is">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <CustomInput
                      id={`stage-code-${i}`}
                      label="Step code"
                      isRequired
                      placeholder="e.g. line-manager"
                      value={s.code}
                      onChange={(e) => updateStage(i, { code: e.target.value })}
                    />
                    <CustomInput
                      id={`stage-label-${i}`}
                      label="Step name"
                      isRequired
                      placeholder="e.g. Line Manager Approval"
                      value={s.label}
                      onChange={(e) => updateStage(i, { label: e.target.value })}
                    />
                    <SearchSelect
                      id={`stage-kind-${i}`}
                      label="This step"
                      options={KIND_OPTIONS}
                      value={s.kind}
                      onChange={(e) => updateStage(i, { kind: e.target.value as StageKind })}
                    />
                    </div>
                  </Band>

                  {s.kind === "APPROVAL" && (
                    <>
                      <Band title="Who approves it">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <SearchSelect
                          id={`stage-source-${i}`}
                          label="Decided by"
                          containerClass="sm:col-span-2 lg:col-span-1"
                          clearable={false}
                          options={
                          canUseOrganogram
                            ? SOURCE_OPTIONS
                            : SOURCE_OPTIONS.filter((o) => o.value !== "ORGANOGRAM")
                        }
                          value={s.approver_source}
                          onChange={(e) => updateStage(i, { approver_source: e.target.value as ApproverSource })}
                        />

                        {s.approver_source === "ROLE" && (
                          <SearchSelect
                            id={`stage-role-${i}`}
                            label="Role"
                            options={roleOptions}
                            value={s.approver_role_key}
                            onChange={(e) => updateStage(i, { approver_role_key: e.target.value })}
                            placeholder="Pick a role"
                          />
                        )}

                        {s.approver_source === "WORKFLOW_GROUP" && (
                          <SearchSelect
                            id={`stage-group-${i}`}
                            label="Group"
                            options={groupOptions}
                            value={s.approver_group_code}
                            onChange={(e) => updateStage(i, { approver_group_code: e.target.value })}
                            placeholder="Pick a group"
                          />
                        )}

                        {s.approver_source === "ORGANOGRAM" && (
                          <>
                            <SearchSelect
                              id={`stage-target-${i}`}
                              label="Whose manager"
                              options={TARGET_OPTIONS}
                              value={s.organogram_target}
                              onChange={(e) => updateStage(i, { organogram_target: e.target.value as OrganogramTarget })}
                            />
                            {s.organogram_target === "N_LEVELS_UP" && (
                              <CustomInput
                                id={`stage-levels-${i}`}
                                label="Levels up"
                                type="number"
                                min={1}
                                value={s.organogram_levels}
                                onChange={(e) => updateStage(i, { organogram_levels: e.target.value })}
                              />
                            )}
                            {s.organogram_target === "SPECIFIC_POSITION" && (
                              <SearchSelect
                                id={`stage-pos-${i}`}
                                label="Position"
                                containerClass="sm:col-span-2 lg:col-span-1"
                                options={positionOptions}
                                value={s.organogram_position_code}
                                onChange={(e) => updateStage(i, { organogram_position_code: e.target.value })}
                                placeholder="Select a seat"
                              />
                            )}
                          </>
                        )}

                        </div>
                        <p className="mt-2 text-xs text-gray-01">
                          {SOURCE_HINT[s.approver_source]}
                        </p>
                      </Band>

                      <Band title="How it advances">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <SearchSelect
                          id={`stage-rule-${i}`}
                          label="How many must approve"
                          options={RULE_OPTIONS}
                          value={s.advance_rule}
                          onChange={(e) => updateStage(i, { advance_rule: e.target.value as StageAdvanceRule })}
                        />
                        {s.advance_rule === "QUORUM" && (
                          <CustomInput
                            id={`stage-quorum-${i}`}
                            label="How many"
                            type="number"
                            min={1}
                            value={s.quorum_count}
                            onChange={(e) => updateStage(i, { quorum_count: e.target.value })}
                          />
                        )}
                        <SearchSelect
                          id={`stage-reject-${i}`}
                          label="If someone rejects"
                          options={REJECT_OPTIONS}
                          value={s.on_rejection}
                          onChange={(e) => updateStage(i, { on_rejection: e.target.value as StageOnRejection })}
                        />
                        </div>
                      </Band>
                    </>
                  )}

                  <Advanced summary={advancedSummary(s, isPlatformTenant)}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {s.kind === "APPROVAL" && s.approver_source !== "ORGANOGRAM" && (
                        <SearchSelect
                          id={`stage-scope-${i}`}
                          label="Approvers looked for in"
                          options={SCOPE_OPTIONS(isPlatformTenant)}
                          value={s.approver_scope}
                          onChange={(e) =>
                            updateStage(i, { approver_scope: e.target.value as ApproverScope })
                          }
                        />
                      )}
                      {s.kind === "APPROVAL" && (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-white-02 px-3 py-2">
                          <span className="text-xs text-gray-01">
                            Skip this step when nobody can approve
                          </span>
                          <Switch
                            checked={s.skip_if_no_approvers}
                            onCheckedChange={(v) => updateStage(i, { skip_if_no_approvers: v })}
                          />
                        </div>
                      )}
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <label className="text-xs font-medium">
                        Only run this step when{" "}
                        <span className="text-gray-01">
                          (optional - leave blank to run it every time)
                        </span>
                      </label>
                      <Textarea
                        rows={2}
                        className="font-mono text-xs"
                        placeholder='{ "op": "gte", "field": "amount", "value": 500000 }'
                        value={s.inclusion_condition_text}
                        onChange={(e) =>
                          updateStage(i, { inclusion_condition_text: e.target.value })
                        }
                      />
                    </div>
                  </Advanced>

                  <div
                    className={cn(
                      "grid grid-cols-1 items-start gap-3",
                      s.approver_source === "DYNAMIC_ROLE" && "2xl:grid-cols-2",
                    )}
                  >
                  {s.kind === "APPROVAL" && s.approver_source === "DYNAMIC_ROLE" && (
                    <DynamicRulesEditor
                      rules={s.dynamic_rules}
                      roleOptions={roleOptions}
                      stageIndex={i}
                      onChange={(next) => updateStage(i, { dynamic_rules: next })}
                    />
                  )}

                  {s.kind === "APPROVAL" && (
                    <ApproverPreview
                      stage={s}
                      requester={sampleRequester}
                      requesterOptions={
                        canSeeDirectory && s.approver_source === "ORGANOGRAM"
                          ? requesterOptions
                          : undefined
                      }
                      onRequesterChange={canSeeDirectory ? setSampleRequester : undefined}
                      sampleText={s.sample_document_text}
                      onSampleChange={(v) => updateStage(i, { sample_document_text: v })}
                      sampleId={`stage-sample-${i}`}
                    />
                  )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
          </div>
        </div>
      </PageShell>
    </>
  );
}
