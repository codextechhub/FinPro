/**
 * The rules behind Manage Approvals, kept apart from React so they can be
 * tested on their own.
 *
 * Three things live here: the list's filters and how they travel (the address
 * bar one way, the API query the other), the words a row uses for its stage
 * and the people it waits on, and what the approver editor allows. The server
 * enforces every one of the editor's rules as well; the screen applies them
 * first so a button that would only be refused is not offered.
 */
import type {
  InstanceApprovers,
  ManagedWorkflowInstance,
  NamedPerson,
  ReplaceApproverResult,
  StageApprovers,
  VoteAction,
  WaitingApprover,
} from "@/redux/services/dashboard/workflow-types";

// ── Filters ─────────────────────────────────────────────────────────────────

/** Every filter the list offers. A blank string or empty list means "not set". */
export interface InstanceFilters {
  documentType: string;
  statuses: string[];
  /** Only meaningful once a document type is chosen: stages belong to one. */
  stage: string;
  requestedBy: string;
  requestFor: string;
  waitingOn: string;
  /** Whole days, as the select offers them. */
  waitingLongerThan: string;
  submittedFrom: string;
  submittedTo: string;
  branch: string;
  search: string;
  page: number;
}

export const EMPTY_FILTERS: InstanceFilters = {
  documentType: "",
  statuses: [],
  stage: "",
  requestedBy: "",
  requestFor: "",
  waitingOn: "",
  waitingLongerThan: "",
  submittedFrom: "",
  submittedTo: "",
  branch: "",
  search: "",
  page: 1,
};

/** The day counts "Waiting longer than" offers. */
export const WAITING_DAY_OPTIONS = [1, 3, 7, 14] as const;

/** The address-bar name of each filter, which is also the API's name for it. */
const URL_KEYS: Record<Exclude<keyof InstanceFilters, "statuses" | "page">, string> = {
  documentType: "document_type",
  stage: "stage",
  requestedBy: "requested_by",
  requestFor: "request_for",
  waitingOn: "waiting_on",
  waitingLongerThan: "waiting_longer_than",
  submittedFrom: "submitted_from",
  submittedTo: "submitted_to",
  branch: "branch",
  search: "search",
};

/** The filters an address describes. Anything absent or malformed reads as unset. */
export function filtersFromSearchParams(params: URLSearchParams): InstanceFilters {
  const filters: InstanceFilters = { ...EMPTY_FILTERS, statuses: [] };
  for (const [field, key] of Object.entries(URL_KEYS) as [keyof typeof URL_KEYS, string][]) {
    filters[field] = (params.get(key) ?? "").trim();
  }
  filters.statuses = (params.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const page = Number(params.get("page"));
  filters.page = Number.isInteger(page) && page > 1 ? page : 1;
  if (!filters.documentType) filters.stage = "";
  if (!/^\d+$/.test(filters.waitingLongerThan)) filters.waitingLongerThan = "";
  return filters;
}

/** The address for a set of filters, naming only the ones that are set. */
export function filtersToSearchParams(filters: InstanceFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(URL_KEYS) as [keyof typeof URL_KEYS, string][]) {
    const value = filters[field];
    if (value) params.set(key, value);
  }
  if (filters.statuses.length) params.set("status", filters.statuses.join(","));
  if (filters.page > 1) params.set("page", String(filters.page));
  if (!filters.documentType) params.delete("stage");
  return params;
}

/**
 * Filters after one change.
 *
 * Any change other than the page itself sends the reader back to page one, and
 * choosing another document type drops the stage, because a stage belongs to
 * one document type's templates.
 */
export function patchFilters(filters: InstanceFilters, patch: Partial<InstanceFilters>): InstanceFilters {
  const next = { ...filters, ...patch };
  if (!("page" in patch)) next.page = 1;
  if ("documentType" in patch && patch.documentType !== filters.documentType && !("stage" in patch)) {
    next.stage = "";
  }
  return next;
}

/** How many filters narrow the list, for a "Clear filters" affordance. */
export function activeFilterCount(filters: InstanceFilters): number {
  return (Object.keys(URL_KEYS) as (keyof typeof URL_KEYS)[]).filter((k) => !!filters[k]).length
    + (filters.statuses.length ? 1 : 0);
}

/**
 * The list request's query. Only filters that are set are sent, the branch only
 * where the reader can see more than one, and the stage only beside its
 * document type.
 */
export function instanceQuery(
  filters: InstanceFilters,
  { multiBranch }: { multiBranch: boolean },
): Record<string, string | number> {
  const query: Record<string, string | number> = { page: filters.page };
  for (const [field, key] of Object.entries(URL_KEYS) as [keyof typeof URL_KEYS, string][]) {
    const value = filters[field];
    if (!value) continue;
    if (field === "branch" && !multiBranch) continue;
    if (field === "stage" && !filters.documentType) continue;
    query[key] = field === "waitingLongerThan" ? Number(value) : value;
  }
  if (filters.statuses.length) query.status = filters.statuses.join(",");
  return query;
}

// ── Row wording ─────────────────────────────────────────────────────────────

/** "2 of 3 · Vice Principal approval", or the label alone when the position is unknown. */
export function stagePositionLabel(row: Pick<ManagedWorkflowInstance, "stage_position" | "current_stage_label">): string {
  const label = row.current_stage_label ?? "";
  const pos = row.stage_position;
  if (!pos) return label || "-";
  const position = `${pos.index} of ${pos.total}`;
  return label ? `${position} · ${label}` : position;
}

/** "Funke Adeyemi", or "Tunde Bello for Funke Adeyemi" when Tunde stands in for her. */
export function waitingOnLabel(person: WaitingApprover): string {
  return person.on_behalf_of ? `${person.name} for ${person.on_behalf_of.name}` : person.name;
}

// ── Approver editor ─────────────────────────────────────────────────────────

/** One person in the editor's working list. */
export interface EditorPerson {
  id: string;
  name: string;
  onBehalfOf: NamedPerson | null;
  vote: VoteAction | null;
}

const VOTE_WORD: Record<VoteAction, string> = {
  APPROVED: "approved",
  REJECTED: "rejected",
  RETURNED: "returned",
};

/**
 * Who a stage card shows. An upcoming stage with an admin's assignment shows
 * the assignment, since that is who approves when it opens; otherwise the
 * stage's own list (live, done, or a preview).
 */
export function stagePeople(stage: StageApprovers): EditorPerson[] {
  if (stage.state === "UPCOMING" && stage.assignment) {
    return stage.assignment.approvers.map((p) => ({ id: String(p.id), name: p.name, onBehalfOf: null, vote: null }));
  }
  return stage.approvers.map((p) => ({
    id: String(p.id),
    name: p.name,
    onBehalfOf: p.on_behalf_of,
    vote: p.vote,
  }));
}

/**
 * Why a person cannot be taken off, or null when they can.
 *
 * Somebody who has already voted on the stage stays: removing them would erase
 * a decision, and reversing a vote is its own, separate action.
 */
export function removalBlockedReason(person: EditorPerson): string | null {
  if (!person.vote) return null;
  return `${person.name} has already ${VOTE_WORD[person.vote]} this stage. Reverse the vote to remove them.`;
}

/**
 * A request's stages in the order the request meets them, each with its place
 * in that order counting from 1.
 *
 * The place is what a reader is shown ("2. Senior approval"). A stage's own
 * `order` is the template's sort key, often spaced out in tens so a stage can
 * be slotted between two others later, and reads as nonsense on screen.
 */
export function stagesInOrder<T extends Pick<StageApprovers, "order">>(stages: readonly T[]): { stage: T; position: number }[] {
  return [...stages]
    .sort((a, b) => a.order - b.order)
    .map((stage, index) => ({ stage, position: index + 1 }));
}

/** Whether a stage offers "Change approvers" at all. */
export function stageIsEditable(detail: InstanceApprovers, stage: StageApprovers): boolean {
  return detail.may_change && stage.may_change && stage.state !== "DONE";
}

/** Whether a stage offers "Use normal approvers": an upcoming stage an admin assigned. */
export function stageIsResettable(detail: InstanceApprovers, stage: StageApprovers): boolean {
  return stageIsEditable(detail, stage) && stage.state === "UPCOMING" && !!stage.assignment;
}

/** The working list after removing somebody; unchanged when they may not be removed. */
export function removePerson(list: EditorPerson[], id: string): EditorPerson[] {
  const person = list.find((p) => p.id === id);
  if (!person || removalBlockedReason(person)) return list;
  return list.filter((p) => p.id !== id);
}

/** The working list after adding somebody; unchanged when they are already on it. */
export function addPerson(list: EditorPerson[], person: NamedPerson): EditorPerson[] {
  const id = String(person.id);
  if (list.some((p) => p.id === id)) return list;
  return [...list, { id, name: person.name, onBehalfOf: null, vote: null }];
}

/** The ids the save sends: the complete list, each person once. */
export function approverIdsToSave(list: EditorPerson[]): string[] {
  return Array.from(new Set(list.map((p) => p.id)));
}

export const REASON_MAX = 500;

/** Why a reason is not acceptable, or null when it is. */
export function reasonProblem(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return "Give a reason. It is kept with the change.";
  if (trimmed.length > REASON_MAX) return `Keep the reason to ${REASON_MAX} characters.`;
  return null;
}

/**
 * Why the editor cannot save yet, or null when it can.
 *
 * Nothing changed, nobody left on the stage, or no reason. The server refuses
 * each of these too; the editor says so before the reader presses Save.
 */
export function editorSaveProblem(original: EditorPerson[], list: EditorPerson[], reason: string): string | null {
  const before = approverIdsToSave(original).sort().join(",");
  const after = approverIdsToSave(list).sort().join(",");
  if (before === after) return "Add or remove somebody to save a change.";
  if (list.length === 0) return "A stage needs at least one approver.";
  return reasonProblem(reason);
}

/** What the approver editor holds while it is open. */
export interface EditorState {
  list: EditorPerson[];
  reason: string;
  /** The server's refusal of the last save, or blank. */
  failure: string;
}

export type EditorAction =
  | { type: "add"; person: NamedPerson }
  | { type: "remove"; id: string }
  | { type: "reason"; reason: string }
  | { type: "saving" }
  | { type: "refused"; message: string };

export function initialEditorState(list: EditorPerson[]): EditorState {
  return { list, reason: "", failure: "" };
}

/**
 * The approver editor's state after one step.
 *
 * A refusal from the server is about the list and reason it was sent, so any
 * change to either clears it. Otherwise "Funke Adeyemi cannot approve this
 * request, because they raised it" stays on screen after Funke has been taken
 * off, and the reader cannot tell whether the list in front of them is the one
 * that was refused.
 */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "add": {
      const list = addPerson(state.list, action.person);
      return list === state.list ? state : { ...state, list, failure: "" };
    }
    case "remove": {
      const list = removePerson(state.list, action.id);
      return list === state.list ? state : { ...state, list, failure: "" };
    }
    case "reason":
      return action.reason === state.reason ? state : { ...state, reason: action.reason, failure: "" };
    case "saving":
      return state.failure ? { ...state, failure: "" } : state;
    case "refused":
      return { ...state, failure: action.message };
  }
}

// ── Bulk replace ────────────────────────────────────────────────────────────

/** The most requests one replace call accepts. */
export const REPLACE_LIMIT = 200;

/** Why the replace sheet cannot run yet, or null when it can. */
export function replaceProblem({ from, to, reason, count }: {
  from: string; to: string; reason: string; count: number;
}): string | null {
  if (count === 0) return "Select at least one request.";
  if (count > REPLACE_LIMIT) return `Select at most ${REPLACE_LIMIT} requests at a time.`;
  if (!from) return "Choose who is being replaced.";
  if (!to) return "Choose who takes their place.";
  if (from === to) return "Choose two different people.";
  return reasonProblem(reason);
}

const requests = (n: number) => `${n} ${n === 1 ? "request" : "requests"}`;

/** "Replaced on 11 requests. 1 skipped." */
export function replaceSummary(result: Pick<ReplaceApproverResult, "replaced" | "skipped">): string {
  const replaced = `Replaced on ${requests(result.replaced)}.`;
  return result.skipped ? `${replaced} ${result.skipped} skipped.` : replaced;
}

// ── Delegations ─────────────────────────────────────────────────────────────

/** What a new delegation also did, or null when it reached no waiting request. */
export function appliedToWaitingMessage(count: number | undefined, delegatorName: string): string | null {
  if (!count || count < 1) return null;
  return `Also added to ${requests(count)} already waiting on ${delegatorName}.`;
}
