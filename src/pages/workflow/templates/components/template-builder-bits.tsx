import { useState } from "react";
import {
  ChevronRight,
  CornerDownRight,
  Eye,
  Info,
  Network,
  Shield,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/custom/search-select";
import { MoneyInput } from "@/components/finance-ui";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/utils/api-errors";
import { usePreviewApproversMutation } from "@/redux/services/dashboard/workflow-api";
import type { StageForm } from "./stage-form";

/**
 * The fill behind a band of one stage's settings, and behind the panels that
 * sit inside a stage card.
 *
 * Light on purpose. A band holds white inputs beside dropdowns whose own
 * background is transparent, so on a darker fill the dropdowns take on its
 * colour and read as disabled, and the small grey hints fade into it.
 * `gray-03` is a fill, never a line - see card-surface.ts.
 */
export const BAND_SURFACE = "bg-gray-03";

/**
 * A labelled slice of one stage's settings.
 *
 * A stage carries a dozen fields that answer four unrelated questions, and as
 * one flat grid they read as a wall. Naming the questions is what makes the
 * card scannable: you look for "who approves it" rather than for a field name
 * you have to remember.
 */
export function Band({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-md p-3", BAND_SURFACE)}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-01">
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * A stage's rarely-touched settings, folded away until asked for.
 *
 * Most steps are "this role approves, any one of them, rejection ends it" -
 * the defaults. Showing scope, auto-skip and a condition editor on every stage
 * made a four-stage template a wall of controls, most of which nobody was going
 * to change. They stay one click away, and the summary says when a stage is
 * carrying something other than the default so nothing hides.
 */
export function Advanced({
  summary,
  children,
}: {
  summary: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-md p-3", BAND_SURFACE)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <ChevronRight className={cn("size-3.5 text-gray-01 transition-transform", open && "rotate-90")} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-01">
          More settings
        </span>
        {!open && summary && (
          <span className="truncate text-[11px] text-gray-01">· {summary}</span>
        )}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

/**
 * An explanation that waits to be asked for.
 *
 * The consequence of changing a template's identity fields matters exactly
 * once - when somebody is about to change one - so it sits behind an info
 * control rather than as a standing banner that is read once and then becomes
 * furniture.
 */
export function FieldHint({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-gray-01 hover:text-black-01"
      >
        <Info className="size-3.5" />
        <span className="underline decoration-dotted underline-offset-2">{title}</span>
      </button>
      {open && (
        <p className={cn("mt-1.5 rounded-md border border-white-02 px-3 py-2 leading-relaxed text-gray-01", BAND_SURFACE)}>
          {children}
        </p>
      )}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-white-02 bg-white p-5")}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// Whether a stage carries enough approver config for the preview to mean anything.
function previewReady(stage: StageForm): boolean {
  if (stage.approver_source === "ROLE") return !!stage.approver_role_key;
  if (stage.approver_source === "WORKFLOW_GROUP") return !!stage.approver_group_code;
  if (stage.approver_source === "DYNAMIC_ROLE")
    return !!stage.dynamic_role_code || stage.legacy_rules.length > 0;
  return (
    !!stage.organogram_target &&
    (stage.organogram_target !== "SPECIFIC_POSITION" || !!stage.organogram_position_code)
  );
}

const SOURCE_ICON = {
  ROLE: Shield,
  WORKFLOW_GROUP: Users,
  DYNAMIC_ROLE: CornerDownRight,
  ORGANOGRAM: Network,
} as const;

/**
 * Live "who would approve?" for one unsaved stage.
 *
 * The answer comes from the engine's own resolver server-side rather than
 * anything re-implemented here, so a preview that says "nobody" is the same
 * "nobody" an activation would produce. For a Dynamic Role stage it also says
 * which rule decides for the person and amount being tried, which is the way to
 * check the stage before a real request depends on it.
 *
 * The person matters to two sources: an organogram climb starts from them, and
 * a Dynamic Role's rules can test their role and branch. Every other source
 * resolves the same for anybody, so it runs as you.
 */
export function ApproverPreview({
  stage,
  requester,
  documentType = "",
  hasAmount = false,
  sampleAmount = null,
  onSampleAmountChange,
  sampleId = "sample-document",
  requesterOptions,
  onRequesterChange,
}: {
  stage: StageForm;
  /** Who the preview resolves as. Defaults to the signed-in user upstream. */
  requester: string;
  /** The template's document type, which a Dynamic Role's rules are read against. */
  documentType?: string;
  /** Whether that document type has an amount a rule can test. */
  hasAmount?: boolean;
  /** Whole kobo. */
  sampleAmount?: number | null;
  onSampleAmountChange?: (kobo: number | null) => void;
  sampleId?: string;
  /** Supplied only where the answer depends on the person. */
  requesterOptions?: { value: string; label: string }[];
  onRequesterChange?: (v: string) => void;
}) {
  const [preview, { data, isLoading, error }] = usePreviewApproversMutation();

  const isDynamic = stage.approver_source === "DYNAMIC_ROLE";
  const isOrganogram = stage.approver_source === "ORGANOGRAM";
  const ready = !!requester && previewReady(stage);
  const Icon = SOURCE_ICON[stage.approver_source] ?? Shield;
  const amount = hasAmount && sampleAmount != null ? sampleAmount : undefined;

  // A named Dynamic Role is tried by code; rules a stage carries itself go as they are.
  const dynamicPart = !isDynamic
    ? {}
    : stage.dynamic_role_code
      ? {
          dynamic_role_code: stage.dynamic_role_code,
          sample: {
            ...(amount != null ? { amount } : {}),
            ...(documentType ? { document_type: documentType } : {}),
          },
        }
      : {
          dynamic_role_rules: stage.legacy_rules,
          sample_document: amount != null ? { amount } : {},
        };

  const run = () => {
    if (!ready) return;
    preview({
      requester,
      approver_source: stage.approver_source,
      approver_scope: stage.approver_scope,
      approver_role_key: stage.approver_source === "ROLE" ? stage.approver_role_key : "",
      approver_group_code:
        stage.approver_source === "WORKFLOW_GROUP" ? stage.approver_group_code : "",
      ...dynamicPart,
      organogram_target: stage.approver_source === "ORGANOGRAM" ? stage.organogram_target : "",
      organogram_levels: Number(stage.organogram_levels) || 1,
      organogram_position_code: stage.organogram_position_code,
    });
  };

  const empty = data && data.count === 0;
  const dyn = data?.dynamic_role;
  const picked = dyn?.evaluations.find((e) => e.picked);
  const pickedName =
    dyn?.matched_target?.name ?? dyn?.matched_role_name ?? picked?.target?.name ?? picked?.role_name;

  return (
    <div
      className={cn(
        "mt-3 rounded-md border px-3 py-2.5",
        empty ? "border-yellow-01/40 bg-yellow-01/5" : cn("border-white-02", BAND_SURFACE),
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-01">
          <Icon className="size-3 text-primary" />
          {isDynamic ? "Try a request" : "Who would approve?"}
        </span>
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={!ready || isLoading}
          onClick={run}
          title={!ready ? "Finish choosing who approves this step" : "Resolve approvers"}
        >
          <Eye className="size-3.5" /> {isLoading ? "Resolving…" : "Preview"}
        </Button>
      </div>

      {isDynamic && hasAmount && onSampleAmountChange && (
        <div className="mt-2 max-w-xs space-y-1">
          <label htmlFor={sampleId} className="text-[11px] font-medium text-black-01">
            Amount to try
          </label>
          <MoneyInput id={sampleId} valueKobo={sampleAmount} onChangeKobo={onSampleAmountChange} />
        </div>
      )}

      {(isOrganogram || isDynamic) && requesterOptions && onRequesterChange ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-gray-01">
            {isOrganogram ? "Climbing from" : "Raised by"}
          </span>
          <div className="min-w-52 flex-1 sm:max-w-xs">
            <SearchSelect
              id={`${sampleId}-requester`}
              options={requesterOptions}
              value={requester}
              onChange={(e) => onRequesterChange(e.target.value)}
              placeholder={isOrganogram ? "Whose chain to climb" : "Who is raising it?"}
            />
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-gray-01">
          {isOrganogram
            ? "Climbing from you. Previewing for someone else needs staff directory access."
            : "Resolved as if you raised this request."}
        </p>
      )}

      {error != null && (
        <p className="mt-1.5 text-[11px] text-destructive">
          {/* The endpoint names the mistyped role, missing group or switched-off
              Dynamic Role, which says far more than a generic line. */}
          {apiErrorMessage(error, "Could not resolve approvers.")}
        </p>
      )}

      {dyn && (
        <div className="mt-2 space-y-1">
          {picked && pickedName ? (
            <p className="text-[12px] text-black-01">
              {picked.is_fallback ? (
                <>No rule fits, so Otherwise sends it to <strong>{pickedName}</strong>.</>
              ) : (
                <>
                  Rule <strong>{picked.order + 1}</strong> decides: it goes to{" "}
                  <strong>{pickedName}</strong>.
                </>
              )}
            </p>
          ) : (
            <p className="text-[12px] font-medium text-yellow-01-text">
              {dyn.note ?? "No rule matched, so this stage would resolve to nobody."}
            </p>
          )}
          <ul className="space-y-0.5">
            {dyn.evaluations.map((e) => (
              <li
                key={e.rule_id ?? e.order}
                className={cn(
                  "flex flex-wrap items-center gap-x-2 text-[11px]",
                  e.picked ? "font-medium text-primary" : "text-gray-01",
                )}
              >
                <span>{e.is_fallback ? "Otherwise" : `Rule ${e.order + 1}`}</span>
                <span aria-hidden>→</span>
                <span>{e.target?.name ?? e.role_name}</span>
                <span className={cn(e.trace.result && !e.picked && "text-green-01-text")}>
                  {e.picked
                    ? "decides"
                    : e.trace.result
                      ? "fits, but an earlier rule decided"
                      : "does not fit"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data &&
        (empty ? (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-yellow-01-text">
            <TriangleAlert className="size-3.5" /> No eligible approvers
            {stage.skip_if_no_approvers ? " - stage auto-skips" : " - stage would stall"}.
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.approvers.map((a) => (
              <span
                key={a.user.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-white-02 bg-white px-2 py-0.5 text-[12px] text-black-01"
              >
                {a.user.full_name}
                {a.on_behalf_of && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-01">
                    <CornerDownRight className="size-2.5" /> for {a.on_behalf_of.full_name}
                  </span>
                )}
              </span>
            ))}
          </div>
        ))}
    </div>
  );
}
