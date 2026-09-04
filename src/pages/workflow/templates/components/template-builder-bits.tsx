import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Info,
  CornerDownRight,
  Eye,
  Network,
  Plus,
  Shield,
  TriangleAlert,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CustomInput } from "@/components/custom/custom-input";
import { SearchSelect } from "@/components/custom/search-select";
import { cn } from "@/lib/utils";
import { usePreviewApproversMutation } from "@/redux/services/dashboard/workflow-api";
import {
  type RuleForm,
  type StageForm,
  OP_OPTIONS,
  emptyRule,
  rulesPayload,
} from "./stage-form";

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
    <div className="rounded-md bg-gray-06/30 p-3">
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
    <div className="rounded-md bg-gray-06/30 p-3">
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
        <p className="mt-1.5 rounded-md border border-white-02 bg-gray-06/30 px-3 py-2 leading-relaxed text-gray-01">
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

/**
 * Ordered "when this, then that role" rules for a DYNAMIC_ROLE stage.
 *
 * Order is the contract - the engine takes the first match - so the rows are
 * numbered and movable rather than sorted by anything implicit. The fallback
 * (no condition) is a checkbox rather than a separate concept, and the editor
 * says plainly when it is missing or out of place, because both are refused by
 * the publish endpoint and both mean "a request could reach nobody".
 */
export function DynamicRulesEditor({
  rules,
  roleOptions,
  onChange,
  stageIndex,
}: {
  rules: RuleForm[];
  roleOptions: { value: string; label: string }[];
  onChange: (next: RuleForm[]) => void;
  stageIndex: number;
}) {
  const update = (i: number, patch: Partial<RuleForm>) =>
    onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rules, emptyRule()]);
  const remove = (i: number) => onChange(rules.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const fallbackAt = rules.findIndex((r) => r.is_fallback);
  const noFallback = fallbackAt === -1;
  const fallbackNotLast = fallbackAt > -1 && fallbackAt !== rules.length - 1;

  return (
    <div className="mt-3 space-y-3 rounded-md border border-white-02 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-black-01">
          Rules <span className="font-normal text-gray-01">first match wins</span>
        </p>
        <Button variant="outline" size="sm" type="button" onClick={add}>
          <Plus className="size-3.5" /> Add rule
        </Button>
      </div>

      {noFallback && (
        <p className="flex items-start gap-2 rounded-md border border-yellow-01/30 bg-yellow-01/10 px-3 py-2 text-xs text-yellow-01-text">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          No fallback rule. A request matching none of these resolves to nobody - add a
          final rule with "Otherwise" ticked to catch everything else.
        </p>
      )}
      {fallbackNotLast && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-error-text">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          The "Otherwise" rule is rule {fallbackAt + 1} of {rules.length}. It matches
          everything, so the {rules.length - fallbackAt - 1} rule(s) after it can never
          fire. Move it last - publishing will refuse it otherwise.
        </p>
      )}

      {rules.map((r, i) => (
        <div
          key={r.key}
          className={cn(
            "rounded-md border p-3",
            r.is_fallback ? "border-white-02 bg-gray-06/30" : "border-white-02",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="grid size-5 shrink-0 place-content-center rounded bg-pry-01 text-[11px] font-semibold text-primary tabular-nums">
              {i + 1}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-gray-01">
              <input
                type="checkbox"
                checked={r.is_fallback}
                onChange={(e) => update(i, { is_fallback: e.target.checked })}
              />
              Otherwise (catches everything else)
            </label>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="text-gray-01 hover:text-black-01 disabled:opacity-30"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={`Move rule ${i + 1} up`}
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                className="text-gray-01 hover:text-black-01 disabled:opacity-30"
                disabled={i === rules.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move rule ${i + 1} down`}
              >
                <ChevronDown className="size-4" />
              </button>
              <button
                type="button"
                className="text-gray-01 hover:text-destructive disabled:opacity-30"
                disabled={rules.length === 1}
                onClick={() => remove(i)}
                aria-label={`Remove rule ${i + 1}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>

          {!r.is_fallback &&
            (r.raw !== null ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  Condition{" "}
                  <span className="text-gray-01">
                    (JSON - this rule uses a shape the simple editor cannot show)
                  </span>
                </label>
                <Textarea
                  rows={3}
                  className="font-mono text-xs"
                  value={r.raw_text}
                  onChange={(e) => {
                    let parsed: RuleForm["raw"] = r.raw;
                    try {
                      parsed = JSON.parse(e.target.value);
                    } catch {
                      // Keep the last valid tree while the text is mid-edit;
                      // publish re-parses and reports if it never became valid.
                    }
                    update(i, { raw_text: e.target.value, raw: parsed });
                  }}
                />
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => update(i, { raw: null, raw_text: "" })}
                >
                  Replace with a simple comparison
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <CustomInput
                  id={`rule-field-${stageIndex}-${i}`}
                  label="When field"
                  placeholder="e.g. amount"
                  value={r.field}
                  onChange={(e) => update(i, { field: e.target.value })}
                />
                <SearchSelect
                  id={`rule-op-${stageIndex}-${i}`}
                  label="Operator"
                  clearable={false}
                  options={OP_OPTIONS}
                  value={r.op}
                  onChange={(e) => update(i, { op: e.target.value })}
                />
                <CustomInput
                  id={`rule-value-${stageIndex}-${i}`}
                  label="Value"
                  placeholder="e.g. 100000"
                  value={r.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              </div>
            ))}

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SearchSelect
              id={`rule-role-${stageIndex}-${i}`}
              label="Then approved by role"
              options={roleOptions}
              value={r.role_key}
              onChange={(e) => update(i, { role_key: e.target.value })}
              placeholder="Pick a role"
            />
            <CustomInput
              id={`rule-label-${stageIndex}-${i}`}
              label="Note (optional)"
              placeholder="e.g. Desk limit"
              value={r.label}
              onChange={(e) => update(i, { label: e.target.value })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Whether a stage carries enough approver config for the preview to mean anything.
function previewReady(stage: StageForm): boolean {
  if (stage.approver_source === "ROLE") return !!stage.approver_role_key;
  if (stage.approver_source === "WORKFLOW_GROUP") return !!stage.approver_group_code;
  if (stage.approver_source === "DYNAMIC_ROLE")
    return stage.dynamic_rules.length > 0 && stage.dynamic_rules.every((r) => !!r.role_key);
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
 * "nobody" an activation would produce. For a dynamic stage it also returns
 * which rule won against the sample document, which is the only way to check a
 * rule ladder before a real request depends on it.
 */
export function ApproverPreview({
  stage,
  requester,
  sampleText,
  onSampleChange,
  sampleId = "sample-document",
  requesterOptions,
  onRequesterChange,
}: {
  stage: StageForm;
  /** Who the preview resolves as. Defaults to the signed-in user upstream. */
  requester: string;
  sampleText?: string;
  onSampleChange?: (v: string) => void;
  sampleId?: string;
  /** Only supplied where the answer depends on the person, i.e. an organogram climb. */
  requesterOptions?: { value: string; label: string }[];
  onRequesterChange?: (v: string) => void;
}) {
  const [preview, { data, isLoading, error }] = usePreviewApproversMutation();

  const isDynamic = stage.approver_source === "DYNAMIC_ROLE";
  const isOrganogram = stage.approver_source === "ORGANOGRAM";
  const ready = !!requester && previewReady(stage);
  const Icon = SOURCE_ICON[stage.approver_source] ?? Shield;

  let sampleInvalid = false;
  let sampleDocument: Record<string, unknown> = {};
  if (isDynamic && sampleText?.trim()) {
    try {
      sampleDocument = JSON.parse(sampleText);
    } catch {
      sampleInvalid = true;
    }
  }

  const run = () => {
    if (!ready || sampleInvalid) return;
    preview({
      requester,
      approver_source: stage.approver_source,
      approver_scope: stage.approver_scope,
      approver_role_key: stage.approver_source === "ROLE" ? stage.approver_role_key : "",
      approver_group_code:
        stage.approver_source === "WORKFLOW_GROUP" ? stage.approver_group_code : "",
      dynamic_role_rules: isDynamic ? rulesPayload(stage.dynamic_rules) : undefined,
      sample_document: isDynamic ? sampleDocument : undefined,
      organogram_target: stage.approver_source === "ORGANOGRAM" ? stage.organogram_target : "",
      organogram_levels: Number(stage.organogram_levels) || 1,
      organogram_position_code: stage.organogram_position_code,
    });
  };

  const empty = data && data.count === 0;
  const dyn = data?.dynamic_role;

  return (
    <div
      className={cn(
        "mt-3 rounded-md border px-3 py-2.5",
        empty ? "border-yellow-01/40 bg-yellow-01/5" : "border-white-02 bg-gray-06/30",
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
          disabled={!ready || isLoading || sampleInvalid}
          onClick={run}
          title={!ready ? "Finish choosing who approves this step" : "Resolve approvers"}
        >
          <Eye className="size-3.5" /> {isLoading ? "Resolving…" : "Preview"}
        </Button>
      </div>

      {isDynamic && onSampleChange && (
        <div className="mt-2 space-y-1">
          <label htmlFor={sampleId} className="text-[11px] font-medium text-black-01">
            Sample document <span className="text-gray-01">(JSON the rules are tried against)</span>
          </label>
          <Textarea
            id={sampleId}
            rows={2}
            className="font-mono text-xs"
            placeholder={`{ "amount": 250000 }`}
            value={sampleText ?? ""}
            onChange={(e) => onSampleChange(e.target.value)}
          />
          {sampleInvalid && (
            <p className="text-[11px] text-destructive">Sample document is not valid JSON.</p>
          )}
        </div>
      )}

      {/* Role, group and rule stages resolve the same for anybody, so the
          preview simply runs as you. An organogram climb is the exception:
          "the requester's manager" has no answer without a requester, so the
          person is asked for here, where it means something. */}
      {isOrganogram ? (
        requesterOptions && onRequesterChange ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-gray-01">Climbing from</span>
            <div className="min-w-52 flex-1 sm:max-w-xs">
              <SearchSelect
                id={`${sampleId}-requester`}
                options={requesterOptions}
                value={requester}
                onChange={(e) => onRequesterChange(e.target.value)}
                placeholder="Whose chain to climb"
              />
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-gray-01">
            Climbing from you. Previewing for someone else needs staff directory access.
          </p>
        )
      ) : (
        <p className="mt-1.5 text-[11px] text-gray-01">Resolved as if you raised this request.</p>
      )}

      {error != null && (
        <p className="mt-1.5 text-[11px] text-destructive">
          {/* The endpoint's own message names the mistyped role, missing group or
              bad operator - far more useful than a generic failure line. */}
          {(error as { data?: { detail?: string } })?.data?.detail ??
            "Could not resolve approvers."}
        </p>
      )}

      {dyn && (
        <div className="mt-2 space-y-1">
          {dyn.matched_role_key ? (
            <p className="text-[12px] text-black-01">
              Rule{" "}
              <strong>
                {(dyn.evaluations.findIndex((e) => e.picked) + 1) || "?"}
              </strong>{" "}
              wins, so this goes to <strong>{dyn.matched_role_name}</strong>.
            </p>
          ) : (
            <p className="text-[12px] font-medium text-yellow-01-text">
              {dyn.note ?? "No rule matched, so this stage would resolve to nobody."}
            </p>
          )}
          <ul className="space-y-0.5">
            {dyn.evaluations.map((e) => (
              <li
                key={e.order}
                className={cn(
                  "flex items-center gap-2 text-[11px]",
                  e.picked ? "font-medium text-primary" : "text-gray-01",
                )}
              >
                <span className="tabular-nums">{e.order + 1}.</span>
                <span>{e.is_fallback ? "Otherwise" : "When condition"}</span>
                <span aria-hidden>→</span>
                <span>{e.role_name}</span>
                <span className={cn(e.trace.result ? "text-green-01-text" : "text-gray-01")}>
                  {e.picked ? "matched" : e.trace.result ? "matched (not reached)" : "no match"}
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
