import { useReducer, useState } from "react";
import { History, Loader2, Pencil, RotateCcw, TriangleAlert, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelativeDate } from "@/utils/helpers";
import { apiErrorMessage } from "@/utils/api-errors";
import {
  useGetInstanceApproversQuery,
  useResetStageApproversMutation,
  useSetStageApproversMutation,
} from "@/redux/services/dashboard/workflow-api";
import type {
  InstanceApprovers,
  StageApprovers,
  VoteAction,
} from "@/redux/services/dashboard/workflow-types";
import { advanceRuleLabel } from "../../../components/workflow/workflow-format";
import { isForbidden } from "../../../lib/api-errors";
import { PersonPicker } from "../../../components/workflow/person-picker";
import { useUserDirectory } from "../../../components/workflow/use-user-directory";
import {
  REASON_MAX,
  approverIdsToSave,
  editorReducer,
  editorSaveProblem,
  initialEditorState,
  reasonProblem,
  removalBlockedReason,
  stageIsEditable,
  stageIsResettable,
  stagePeople,
  stagesInOrder,
  type EditorPerson,
} from "./manage-approvals";

const STATE_BADGE: Record<StageApprovers["state"], { label: string; variant: "inactive" | "pending" | "outline" }> = {
  DONE: { label: "Done", variant: "inactive" },
  ACTIVE: { label: "Waiting now", variant: "pending" },
  UPCOMING: { label: "Upcoming", variant: "outline" },
};

const VOTE_BADGE: Record<VoteAction, { label: string; variant: "active" | "rejected" | "suspended" }> = {
  APPROVED: { label: "Approved", variant: "active" },
  REJECTED: { label: "Rejected", variant: "rejected" },
  RETURNED: { label: "Returned", variant: "suspended" },
};

/**
 * Who approves each stage of one request, and the admin's controls to change it.
 *
 * Rendered only for a reader holding the permission to change approvers; the
 * endpoint behind it refuses anyone else, and a refusal here hides the section
 * rather than showing an error. Stages read in order: finished ones with the
 * votes cast, the waiting one with each person's vote so far, and upcoming ones
 * with who would approve if the stage opened now (marked as a preview) or the
 * people an admin has already assigned to it.
 *
 * A finished request, or one the server will not let this reader change, shows
 * the server's reason and no controls.
 */
export function ApproversSection({ instanceId }: { instanceId: string }) {
  const { data, error, isLoading, isError, refetch } = useGetInstanceApproversQuery(instanceId);
  const [editing, setEditing] = useState<StageApprovers | null>(null);
  const [resetting, setResetting] = useState<StageApprovers | null>(null);

  if (isLoading) {
    return (
      <SectionFrame>
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      </SectionFrame>
    );
  }
  // A reader the server refuses sees no section, as one without the permission does.
  if (isForbidden(error)) return null;
  if (isError || !data) {
    return (
      <SectionFrame>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-01">Who approves this request could not be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
        </div>
      </SectionFrame>
    );
  }

  const stages = stagesInOrder(data.stages);

  return (
    <SectionFrame>
      {!data.may_change && data.blocked_reason && (
        <p className="mb-4 rounded-md border border-white-02 bg-gray-50 px-4 py-3 text-xs text-gray-01">
          {data.blocked_reason}
        </p>
      )}

      <ol className="space-y-3">
        {stages.map(({ stage, position }) => (
          <li key={stage.stage_id}>
            <StageCard
              detail={data}
              stage={stage}
              position={position}
              onEdit={() => setEditing(stage)}
              onReset={() => setResetting(stage)}
            />
          </li>
        ))}
      </ol>

      <ChangeHistory history={data.history} />

      {editing && (
        <ApproverEditor
          key={editing.stage_id}
          instanceId={instanceId}
          stage={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {resetting && (
        <ResetDialog
          key={resetting.stage_id}
          instanceId={instanceId}
          stage={resetting}
          onClose={() => setResetting(null)}
        />
      )}
    </SectionFrame>
  );
}

function SectionFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white-02 bg-white p-5" data-guide="workflow-instance.approvers">
      <h3 className="mb-3 text-sm font-semibold">Approvers</h3>
      {children}
    </div>
  );
}

function StageCard({ detail, stage, position, onEdit, onReset }: {
  detail: InstanceApprovers;
  stage: StageApprovers;
  /** The stage's place in the request, counting from 1. */
  position: number;
  onEdit: () => void;
  onReset: () => void;
}) {
  const people = stagePeople(stage);
  const state = STATE_BADGE[stage.state];
  const editable = stageIsEditable(detail, stage);
  const resettable = stageIsResettable(detail, stage);

  return (
    <div className="rounded-md border border-white-02 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-black-01">
            {position}. {stage.label}
          </p>
          <p className="text-xs text-gray-01">{advanceRuleLabel(stage.advance_rule, stage.quorum_count ?? undefined)}</p>
        </div>
        <Badge variant={state.variant}>{state.label}</Badge>
      </div>

      {people.length === 0 ? (
        <p className="mt-3 text-xs text-gray-01">Nobody is named for this stage.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm text-black-01">
                {p.name}
                {p.onBehalfOf && <span className="text-gray-01"> for {p.onBehalfOf.name}</span>}
              </span>
              {stage.state !== "UPCOMING" && (
                p.vote
                  ? <Badge variant={VOTE_BADGE[p.vote].variant}>{VOTE_BADGE[p.vote].label}</Badge>
                  : stage.state === "ACTIVE" && <span className="text-xs text-gray-01">Not decided</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {stage.state === "UPCOMING" && stage.assignment && (
        <p className="mt-3 text-xs text-gray-01">
          Assigned by {stage.assignment.set_by.name} {formatRelativeDate(stage.assignment.set_at)}:{" "}
          <span className="italic">{stage.assignment.reason}</span>
        </p>
      )}
      {stage.state === "UPCOMING" && !stage.assignment && stage.preview && (
        <p className="mt-3 text-xs text-gray-01">
          Preview: who would approve if this stage opened now. The request's route may still skip it.
        </p>
      )}

      {(editable || resettable) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {editable && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="size-3.5" /> Change approvers
            </Button>
          )}
          {resettable && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RotateCcw className="size-3.5" /> Use normal approvers
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ChangeHistory({ history }: { history: InstanceApprovers["history"] }) {
  if (history.length === 0) return null;
  const rows = [...history].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <div className="mt-5">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-black-01">
        <History className="size-4 text-gray-01" /> Changes
      </p>
      <ul className="divide-y divide-white-02">
        {rows.map((h, i) => (
          <li key={`${h.at}-${i}`} className="py-2.5">
            <p className="text-sm text-black-01">
              {h.stage_label}:{" "}
              {h.removed && h.added
                ? <>{h.added.name} in place of {h.removed.name}</>
                : h.added
                  ? <>{h.added.name} added</>
                  : h.removed
                    ? <>{h.removed.name} removed</>
                    : "approvers reset to normal"}
            </p>
            {h.reason && <p className="text-xs italic text-gray-01">{h.reason}</p>}
            <p className="text-[11px] text-gray-06">
              {h.by.name}, {formatRelativeDate(h.at)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The editor for one stage's people.
 *
 * It works on a copy of the stage's list and saves the whole list at once; the
 * server works out who was added and who was removed. Somebody who has already
 * voted cannot be taken off, and the control says why rather than vanishing.
 * A refusal from the server ("Tunde Bello cannot approve: he raised this
 * request") is shown inside the editor, beside the list it is about, until the
 * list or the reason changes (see `editorReducer`).
 */
function ApproverEditor({ instanceId, stage, onClose }: {
  instanceId: string;
  stage: StageApprovers;
  onClose: () => void;
}) {
  const { get } = useUserDirectory();
  const [save, { isLoading }] = useSetStageApproversMutation();
  const [original] = useState<EditorPerson[]>(() => stagePeople(stage));
  const [{ list, reason, failure }, dispatch] = useReducer(editorReducer, original, initialEditorState);

  const problem = editorSaveProblem(original, list, reason);
  const upcoming = stage.state === "UPCOMING";

  const add = (id: string) => {
    if (!id) return;
    const person = get(id);
    dispatch({ type: "add", person: { id, name: person?.full_name || person?.email || `User ${id.slice(0, 8)}` } });
  };

  const submit = () => {
    if (problem) return;
    dispatch({ type: "saving" });
    save({ id: instanceId, body: { stage: stage.stage_id, approvers: approverIdsToSave(list), reason: reason.trim() } })
      .unwrap()
      .then(() => {
        toast.success(upcoming ? `Approvers set for ${stage.label}.` : `Approvers changed on ${stage.label}.`);
        onClose();
      })
      .catch((err) => dispatch({ type: "refused", message: apiErrorMessage(err, "The approvers could not be changed. Try again.") }));
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change approvers: {stage.label}</DialogTitle>
          <DialogDescription>
            {upcoming
              ? "These people approve this stage when the request reaches it, in place of its normal approvers."
              : "The people who decide this stage now. Anyone added is told the request is waiting on them; anyone removed is told it no longer needs them."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ul className="divide-y divide-white-02 rounded-md border border-white-02">
            {list.length === 0 && <li className="px-3 py-2.5 text-xs text-gray-01">Nobody yet. Add somebody below.</li>}
            {list.map((p) => {
              const blocked = removalBlockedReason(p);
              const remove = (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!blocked}
                  aria-label={blocked ?? `Remove ${p.name}`}
                  onClick={() => dispatch({ type: "remove", id: p.id })}
                >
                  <UserMinus className="size-4" />
                </Button>
              );
              return (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm text-black-01">
                    {p.name}
                    {p.onBehalfOf && <span className="text-gray-01"> for {p.onBehalfOf.name}</span>}
                    {p.vote && <span className="text-xs text-gray-01"> ({p.vote.toLowerCase()})</span>}
                  </span>
                  {blocked ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>{remove}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{blocked}</TooltipContent>
                    </Tooltip>
                  ) : remove}
                </li>
              );
            })}
          </ul>

          <PersonPicker
            id="editor-add"
            label="Add a person"
            activeOnly
            placeholder="Search an active member"
            exclude={list.map((p) => p.id)}
            value=""
            onChange={add}
          />

          <div className="space-y-1.5">
            <label htmlFor="editor-reason" className="text-sm text-black-01 after:pl-1.5 after:text-error after:content-['*']">
              Reason
            </label>
            <Textarea
              id="editor-reason"
              rows={3}
              maxLength={REASON_MAX}
              placeholder="E.g. Funke is on leave until 14 October."
              value={reason}
              onChange={(e) => dispatch({ type: "reason", reason: e.target.value })}
            />
          </div>

          {failure ? (
            <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {failure}
            </p>
          ) : problem ? (
            <p className="text-xs text-gray-01">{problem}</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={submit} disabled={isLoading || !!problem}>
            {isLoading ? "Saving…" : "Save approvers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Drop an upcoming stage's assignment, so it finds its approvers normally when it opens.
 *
 * A refusal from the server stays until the reason is edited, as in the editor.
 */
function ResetDialog({ instanceId, stage, onClose }: {
  instanceId: string;
  stage: StageApprovers;
  onClose: () => void;
}) {
  const [reset, { isLoading }] = useResetStageApproversMutation();
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState("");
  const problem = reasonProblem(reason);

  const submit = () => {
    if (problem) return;
    setFailure("");
    reset({ id: instanceId, body: { stage: stage.stage_id, reason: reason.trim() } })
      .unwrap()
      .then(() => {
        toast.success(`${stage.label} will use its normal approvers.`);
        onClose();
      })
      .catch((err) => setFailure(apiErrorMessage(err, "The stage could not be reset. Try again.")));
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Use normal approvers for {stage.label}?</DialogTitle>
          <DialogDescription>
            The people assigned to this stage are dropped. When the request reaches it, the stage
            finds its approvers the usual way.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={3}
          maxLength={REASON_MAX}
          aria-label="Reason"
          placeholder="Why the assignment is no longer needed"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setFailure("");
          }}
        />
        {failure && (
          <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {failure}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Keep assignment</Button>
          <Button onClick={submit} disabled={isLoading || !!problem}>
            {isLoading ? "Resetting…" : "Use normal approvers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
