/**
 * Turning a template the API *returned* back into a payload the publish
 * endpoint accepts.
 *
 * Publishing replaces a template wholesale: there is no "patch one stage"
 * endpoint, so any screen that changes one thing has to resend everything else
 * exactly as it was. Doing that mapping per screen is how a stage quietly loses
 * its quorum count, so it lives here once, with a test, and every caller that
 * edits part of a published template goes through it.
 */
import type {
  DynamicRulePayload,
  PublishTemplatePayload,
  WorkflowRoutePayload,
  WorkflowStage,
  WorkflowStagePayload,
  WorkflowTemplate,
} from "@/redux/services/dashboard/workflow-types";

/**
 * A central template has no tenant: one definition every tenant shares.
 *
 * It matters for writes. The publish endpoint upserts on
 * (tenant, branch, document_type, code) using the *caller's* tenant, so a
 * tenant admin republishing a central template does not edit it - it creates a
 * tenant-scoped copy that then wins the cascade, silently forking the shared
 * definition. Callers check this before offering an edit.
 */
export function isCentralTemplate(template: Pick<WorkflowTemplate, "tenant">): boolean {
  return template.tenant == null;
}

/** The rules of a DYNAMIC_ROLE stage, renumbered into evaluation order. */
export function stageRulesPayload(stage: WorkflowStage): DynamicRulePayload[] {
  return [...(stage.dynamic_role_rules ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((r, i) => ({
      order: i,
      condition: r.condition,
      role_key: r.role_key,
      label: r.label,
    }));
}

/**
 * One returned stage as the publish endpoint wants it back.
 *
 * Only the fields that belong to the stage's own source are sent. The publish
 * validator checks every key it is given against its enum, so passing
 * `organogram_target: ""` on a role stage is rejected as an invalid value
 * rather than ignored as "not applicable".
 */
export function stageToPayload(stage: WorkflowStage, order: number): WorkflowStagePayload {
  const base: WorkflowStagePayload = {
    code: stage.code,
    label: stage.label,
    kind: stage.kind,
    order,
    advance_rule: stage.advance_rule,
    quorum_count: stage.quorum_count,
    on_rejection: stage.on_rejection,
    skip_if_no_approvers: stage.skip_if_no_approvers,
    inclusion_condition: stage.inclusion_condition,
  };

  // A BRANCH stage is routing only - it resolves no approvers at all.
  if (stage.kind !== "APPROVAL") return base;

  base.approver_source = stage.approver_source;
  base.approver_scope = stage.approver_scope;

  switch (stage.approver_source) {
    case "WORKFLOW_GROUP":
      base.approver_group_code = stage.approver_group_code ?? "";
      break;
    case "DYNAMIC_ROLE":
      base.dynamic_role_rules = stageRulesPayload(stage);
      break;
    case "ORGANOGRAM":
      base.organogram_target = stage.organogram_target;
      base.organogram_levels = stage.organogram_levels;
      if (stage.organogram_target === "SPECIFIC_POSITION") {
        base.organogram_position_code = stage.organogram_position_code ?? "";
      }
      break;
    default:
      base.approver_role_key = stage.approver_role_key;
  }
  return base;
}

function routeToPayload(route: WorkflowTemplate["routes"][number]): WorkflowRoutePayload {
  return {
    from_stage_code: route.from_stage_code,
    to_stage_code: route.to_stage_code,
    order: route.order,
    condition: route.condition,
  };
}

/**
 * The whole template as a republishable payload, optionally with one stage's
 * dynamic rules swapped out.
 *
 * `replaceRules` is how a screen edits a ladder without owning the rest of the
 * template: everything else round-trips untouched, and a stage code that is not
 * in the template changes nothing rather than inventing a stage.
 */
export function templateToPublishPayload(
  template: WorkflowTemplate,
  replaceRules?: { stageCode: string; rules: DynamicRulePayload[] },
): PublishTemplatePayload {
  const stages = [...(template.stages ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => {
      const payload = stageToPayload(s, i + 1);
      if (replaceRules && s.code === replaceRules.stageCode) {
        payload.dynamic_role_rules = replaceRules.rules.map((r, j) => ({ ...r, order: j }));
      }
      return payload;
    });

  return {
    document_type: template.document_type,
    code: template.code,
    name: template.name,
    description: template.description ?? "",
    notification_events: template.notification_events ?? {},
    stages,
    routes: (template.routes ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(routeToPayload),
  };
}
