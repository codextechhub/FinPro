import { useMemo, useState } from "react";
import {
  ChevronRight,
  Network,
  Plus,
  RefreshCw,
  Search,
  Shield,
  TriangleAlert,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CustomInput } from "@/components/custom/custom-input";
import { UserAvatar } from "@xvs/finance/host";
import PermissionGate from "@/components/custom/permission-gate";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { usePermissions } from "@/hooks/use-permissions";
import {
  useCreateApproverGroupMutation,
  useDeleteApproverGroupMutation,
  useGetApproverGroupsQuery,
  useGetWorkflowTemplatesQuery,
  useRemoveApproverGroupMemberMutation,
  useResolveApproverGroupQuery,
  useUpdateApproverGroupMutation,
} from "@/redux/services/dashboard/workflow-api";
import type {
  ApproverGroup,
  ApproverGroupMember,
  ApproverGroupResolvedMember,
  GroupMemberKind,
} from "@/redux/services/dashboard/workflow-types";
import { humanizeDocumentType } from "@/pages/protected/workflow/components/workflow-format";
import AddMemberSheet from "./add-member-sheet";

const KIND_LABEL: Record<GroupMemberKind, string> = {
  USER: "Person",
  ROLE: "Role",
  POSITION: "Position",
};

function memberLabel(m: ApproverGroupMember): string {
  if (m.kind === "USER") return m.user_name || m.user_email || "Unknown user";
  if (m.kind === "ROLE") return m.role_name || m.role_key || "Unknown role";
  return m.position_title || m.position_code || "Unknown position";
}

function people(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

/** Reads the backend's 409 body without trusting its shape. */
function errorCode(err: unknown): string {
  const data = (err as { data?: { error?: { code?: string } } })?.data;
  return data?.error?.code ?? "";
}
function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string } })?.data;
  return data?.message ?? fallback;
}

export default function GroupsTab() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(P.MANAGE_APPROVER_GROUPS);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showEffective, setShowEffective] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApproverGroup | null>(null);
  const [inUse, setInUse] = useState("");

  const { data, isLoading, isFetching, refetch } = useGetApproverGroupsQuery(
    { page: 1, page_size: 100 },
    { refetchOnMountOrArgChange: true },
  );
  const groups = useMemo(() => data?.data ?? [], [data]);

  // The selection is derived rather than synced: the clicked group wins while it
  // exists, and the first group stands in when it doesn't (first load, a delete,
  // a filter that dropped it). No effect, so no cascading render on every fetch.
  const selected = useMemo(
    () => groups.find((g) => g.id === selectedId) ?? groups[0] ?? null,
    [groups, selectedId],
  );
  const activeId = selected?.id ?? "";

  // The live picture for the selected group only. Resolving every group to fill
  // the rail would be one resolution per member row per group.
  const { data: resolution, isFetching: isResolving } = useResolveApproverGroupQuery(
    { id: activeId },
    { skip: !activeId },
  );

  // Which stages route here. Needs template view rights, so it is skipped for a
  // user who only holds group rights rather than 403-ing on their behalf.
  const canSeeTemplates = hasPermission(P.VIEW_WORKFLOW_TEMPLATES);
  const { data: templates } = useGetWorkflowTemplatesQuery(
    { page: 1, page_size: 100 },
    { skip: !canSeeTemplates },
  );

  const usedBy = useMemo(() => {
    if (!selected || !templates?.data) return [];
    const out: string[] = [];
    for (const t of templates.data) {
      for (const s of t.stages ?? []) {
        if (s.approver_group_code && s.approver_group_code === selected.code) {
          out.push(`${s.label} (${humanizeDocumentType(t.document_type)})`);
        }
      }
    }
    return out;
  }, [selected, templates]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q),
    );
  }, [groups, query]);

  const [removeMember] = useRemoveApproverGroupMemberMutation();
  const [updateGroup, { isLoading: isUpdating }] = useUpdateApproverGroupMutation();
  const [deleteGroup, { isLoading: isDeleting }] = useDeleteApproverGroupMutation();

  const resolvedById = useMemo(() => {
    const map = new Map<string, ApproverGroupResolvedMember>();
    for (const r of resolution?.members ?? []) map.set(r.id, r);
    return map;
  }, [resolution]);

  const effectiveCount = resolution?.resolved_count ?? 0;
  const emptyMembers = (selected?.members ?? []).filter(
    (m) => (resolvedById.get(m.id)?.resolved_count ?? 0) === 0,
  );
  // Red only when live steps are actually waiting on a group that reaches nobody.
  const stalling =
    !!selected && !isResolving && effectiveCount === 0 && usedBy.length > 0;

  const doRemove = (member: ApproverGroupMember) => {
    if (!selected) return;
    removeMember({ id: selected.id, memberId: member.id })
      .unwrap()
      .then(() => toast.success(`${memberLabel(member)} removed.`))
      .catch(() => {});
  };

  const toggleActive = () => {
    if (!selected) return;
    updateGroup({ id: selected.id, body: { is_active: !selected.is_active } })
      .unwrap()
      .then(() =>
        toast.success(selected.is_active ? "Group deactivated." : "Group reactivated."),
      )
      .catch(() => {});
  };

  const doDelete = () => {
    if (!deleteTarget) return;
    deleteGroup(deleteTarget.id)
      .unwrap()
      .then(() => {
        toast.success("Group deleted.");
        setDeleteTarget(null);
        setInUse("");
      })
      .catch((err) => {
        // A group a live stage still routes to cannot be deleted; the dialog
        // stays open and offers the deactivate route the backend suggests.
        if (errorCode(err) === "APPROVER_GROUP_IN_USE") {
          setInUse(
            errorMessage(err, "A live workflow step still routes to this group."),
          );
          return;
        }
        toast.error(errorMessage(err, "Could not delete this group."));
      });
  };

  return (
    <>
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-01">
            Named pools a workflow step can route to. Roles and seats resolve to whoever
            holds them at the moment a step activates, so a group stays correct as people move.
          </p>
          <div className="inline-flex items-center gap-3.5">
            <Button variant="white" size="lg" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn(isFetching && "animate-spin")} /> Refresh
            </Button>
            <PermissionGate permission={P.MANAGE_APPROVER_GROUPS}>
              <Button size="lg" onClick={() => setNewOpen(true)}>
                <Plus /> New group
              </Button>
            </PermissionGate>
          </div>
        </div>

        {/* Phone: the group rail stacks above the detail; md+: fixed 280px rail. */}
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[280px_1fr]">
          <aside className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md p-3")}>
            <div className="flex h-9 items-center gap-2 rounded-md border border-white-02 px-3">
              <Search className="size-4 shrink-0 text-gray-01" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search groups"
                aria-label="Search groups"
                className="h-full w-full min-w-0 border-none bg-transparent text-sm outline-none placeholder:text-gray-01"
              />
            </div>

            <p className="px-1 pb-1 pt-3 text-xs font-semibold uppercase text-gray-01">
              {query
                ? `${shown.length} ${shown.length === 1 ? "match" : "matches"}`
                : `${groups.length} ${groups.length === 1 ? "group" : "groups"}`}
            </p>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-md bg-gray-50" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <p className="px-1 py-8 text-center text-xs text-gray-01">
                {query ? `No group matches “${query}”.` : "No approver groups yet."}
              </p>
            ) : (
              <ul className="space-y-1">
                {shown.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(g.id);
                        setExpanded({});
                        setShowEffective(false);
                      }}
                      aria-current={g.id === activeId}
                      className={cn(
                        "w-full rounded-md px-3 py-2 text-left transition-colors",
                        g.id === activeId ? "bg-pry-01" : "hover:bg-gray-50",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm font-medium",
                            g.id === activeId ? "text-primary" : "text-black-01",
                          )}
                        >
                          {g.name}
                        </span>
                        {!g.is_active && (
                          <Badge variant="inactive" className="shrink-0">
                            Off
                          </Badge>
                        )}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 flex items-center gap-1 text-xs tabular-nums",
                          g.member_count === 0 ? "text-yellow-01-text" : "text-gray-01",
                        )}
                      >
                        {g.member_count === 0 && <TriangleAlert className="size-3" />}
                        {g.member_count === 0
                          ? "No members"
                          : `${g.member_count} ${g.member_count === 1 ? "member" : "members"}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* Detail */}
          <section className="min-w-0 space-y-4">
            {isLoading ? (
              <div className="h-64 animate-pulse rounded-md bg-gray-50" />
            ) : !selected ? (
              <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md py-16 text-center")}>
                <span className="mx-auto grid size-12 place-content-center rounded-full bg-pry-01 text-primary">
                  <Users className="size-6" />
                </span>
                <p className="mt-3 text-sm text-gray-01">
                  No approver groups yet. Create one to route a workflow step at a named pool.
                </p>
                <PermissionGate permission={P.MANAGE_APPROVER_GROUPS}>
                  <Button className="mt-4" onClick={() => setNewOpen(true)}>
                    <Plus /> New group
                  </Button>
                </PermissionGate>
              </div>
            ) : (
              <>
                <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-4")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-black-01">{selected.name}</h2>
                        <span className="rounded border border-white-02 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-01">
                          {selected.code}
                        </span>
                        <Badge variant={selected.is_active ? "active" : "inactive"}>
                          {selected.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {selected.description && (
                        <p className="mt-1 text-xs text-gray-01">{selected.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-01">
                        <span>
                          {selected.member_count}{" "}
                          {selected.member_count === 1 ? "member" : "members"}
                        </span>
                        <span aria-hidden>·</span>
                        <button
                          type="button"
                          onClick={() => setShowEffective((v) => !v)}
                          aria-expanded={showEffective}
                          disabled={isResolving}
                          className={cn(
                            "rounded border px-2 py-0.5 font-medium tabular-nums transition-colors",
                            effectiveCount === 0 && !isResolving
                              ? "border-destructive/20 bg-destructive/5 text-error-text"
                              : "border-white-02 text-black-01 hover:bg-gray-50",
                          )}
                        >
                          {isResolving
                            ? "Resolving…"
                            : `${effectiveCount} effective approver${effectiveCount === 1 ? "" : "s"}`}
                        </button>
                      </div>
                    </div>

                    <PermissionGate permission={P.MANAGE_APPROVER_GROUPS}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={toggleActive} disabled={isUpdating}>
                          {selected.is_active ? "Deactivate" : "Reactivate"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setInUse("");
                            setDeleteTarget(selected);
                          }}
                        >
                          <Trash2 /> Delete
                        </Button>
                      </div>
                    </PermissionGate>
                  </div>
                </div>

                {stalling ? (
                  <div className="flex gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-error-text">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">This group cannot approve anything.</p>
                      <p className="mt-0.5 text-xs">
                        It resolves to nobody right now, and {usedBy.length}{" "}
                        {usedBy.length === 1 ? "live step routes" : "live steps route"} to it.
                        Requests reaching {usedBy.length === 1 ? "it" : "them"} will wait.
                      </p>
                    </div>
                  </div>
                ) : emptyMembers.length > 0 && !isResolving ? (
                  <div className="flex gap-3 rounded-md border border-yellow-01/30 bg-yellow-01/10 p-4 text-yellow-01-text">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        {/* The noun counts the total, the verb counts the empty ones:
                            "1 of 3 members resolves", "2 of 3 members resolve". */}
                        {emptyMembers.length} of {selected.member_count}{" "}
                        {selected.member_count === 1 ? "member" : "members"}{" "}
                        {emptyMembers.length === 1 ? "resolves" : "resolve"} to nobody
                      </p>
                      <p className="mt-0.5 text-xs">
                        {emptyMembers.map(memberLabel).join(", ")} currently{" "}
                        {emptyMembers.length === 1 ? "has" : "have"} no one behind{" "}
                        {emptyMembers.length === 1 ? "it" : "them"}. The rest of the group can
                        still approve.
                      </p>
                    </div>
                  </div>
                ) : null}

                {showEffective && effectiveCount > 0 && (
                  <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
                    <div className="border-b border-white-02 px-4 py-3">
                      <p className="text-sm font-semibold">
                        Who can approve right now{" "}
                        <span className="font-normal text-gray-01 tabular-nums">
                          {effectiveCount}
                        </span>
                      </p>
                    </div>
                    <div className="grid gap-x-6 gap-y-2 p-4 sm:grid-cols-2">
                      {(resolution?.resolved_users ?? []).map((u) => {
                        const via = (resolution?.members ?? [])
                          .filter((m) => m.resolved_users.some((r) => r.id === u.id))
                          .map((m) => (m.kind === "USER" ? "added directly" : `via ${m.label}`));
                        return (
                          <div key={u.id} className="flex items-center gap-2.5">
                            <UserAvatar
                              userId={u.id}
                              name={u.name}
                              className="size-8"
                              fallbackClassName="text-[10px]"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-black-01">{u.name}</p>
                              <p className="truncate text-xs text-gray-01">
                                {via.join(" + ") || u.email}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white-02 px-4 py-3">
                    <p className="text-sm font-semibold">
                      Members{" "}
                      <span className="font-normal text-gray-01 tabular-nums">
                        {selected.member_count}
                      </span>
                    </p>
                    <PermissionGate permission={P.MANAGE_APPROVER_GROUPS}>
                      <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                        <Plus /> Add member
                      </Button>
                    </PermissionGate>
                  </div>

                  {selected.members.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <p className="text-sm font-medium text-black-01">No approvers yet</p>
                      <p className="mx-auto mt-1 max-w-md text-xs text-gray-01">
                        {usedBy.length
                          ? "Steps routed to this group cannot be approved until someone is added."
                          : "Add people, roles, or positions. Roles and positions keep themselves current as staff change."}
                      </p>
                      {canManage && (
                        <Button className="mt-4" size="sm" onClick={() => setAddOpen(true)}>
                          <Plus /> Add member
                        </Button>
                      )}
                    </div>
                  ) : (
                    <ul>
                      {selected.members.map((m) => {
                        const res = resolvedById.get(m.id);
                        const count = res?.resolved_count ?? 0;
                        const isEmpty = !!res && count === 0;
                        const open = !!expanded[m.id];
                        return (
                          <li key={m.id} className="border-b border-white-02 last:border-b-0">
                            <div
                              className={cn(
                                "flex items-center gap-3 px-4 py-3",
                                isEmpty && "bg-yellow-01/5",
                              )}
                            >
                              {m.kind === "USER" ? (
                                <UserAvatar
                                  userId={m.user}
                                  name={memberLabel(m)}
                                  className="size-9"
                                  fallbackClassName="text-xs"
                                />
                              ) : (
                                <span className="grid size-9 shrink-0 place-content-center rounded-md bg-pry-01 text-primary">
                                  {m.kind === "ROLE" ? (
                                    <Shield className="size-4" />
                                  ) : (
                                    <Network className="size-4" />
                                  )}
                                </span>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-medium text-black-01">
                                    {memberLabel(m)}
                                  </p>
                                  <Badge variant={m.kind === "USER" ? "inactive" : "pending"}>
                                    {KIND_LABEL[m.kind]}
                                  </Badge>
                                </div>
                                <p
                                  className={cn(
                                    "mt-0.5 truncate text-xs",
                                    isEmpty ? "text-yellow-01-text" : "text-gray-01",
                                  )}
                                >
                                  {m.kind === "USER"
                                    ? m.user_email || "Person"
                                    : !res
                                      ? `${KIND_LABEL[m.kind]} · resolving…`
                                      : isEmpty
                                        ? `${KIND_LABEL[m.kind]} · resolves to nobody`
                                        : `${KIND_LABEL[m.kind]} · resolves to ${people(count)}`}
                                </p>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                {m.kind !== "USER" && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpanded((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                                    }
                                    aria-expanded={open}
                                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-gray-50"
                                  >
                                    <span className="tabular-nums">{count}</span>
                                    <ChevronRight
                                      className={cn(
                                        "size-3.5 transition-transform",
                                        open && "rotate-90",
                                      )}
                                    />
                                    <span className="sr-only">
                                      Show who {memberLabel(m)} resolves to
                                    </span>
                                  </button>
                                )}
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() => doRemove(m)}
                                    aria-label={`Remove ${memberLabel(m)}`}
                                    className="rounded p-1.5 text-gray-01 hover:bg-destructive/10 hover:text-error-text"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {m.kind !== "USER" && open && (
                              <div className="ml-4 mr-4 mb-3 border-l-2 border-white-02 pl-4 sm:ml-16">
                                {count === 0 ? (
                                  <p className="py-1.5 text-xs text-yellow-01-text">
                                    {m.kind === "ROLE"
                                      ? "No one currently holds this role."
                                      : "This seat is vacant."}
                                  </p>
                                ) : (
                                  (res?.resolved_users ?? []).map((u) => (
                                    <div
                                      key={u.id}
                                      className="flex items-center gap-2.5 border-b border-dashed border-white-02 py-1.5 last:border-b-0"
                                    >
                                      <UserAvatar
                                        userId={u.id}
                                        name={u.name}
                                        className="size-7"
                                        fallbackClassName="text-[10px]"
                                      />
                                      <span className="truncate text-xs font-medium text-black-01">
                                        {u.name}
                                      </span>
                                      <span className="truncate text-xs text-gray-01">
                                        {u.email}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {canSeeTemplates && (
                  <p className="text-xs text-gray-01">
                    {usedBy.length ? (
                      <>
                        Used by{" "}
                        <span className="font-medium text-black-01">
                          {usedBy.length} workflow {usedBy.length === 1 ? "step" : "steps"}
                        </span>
                        : {usedBy.join(" · ")}
                      </>
                    ) : (
                      "Not used by any workflow step yet."
                    )}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </section>

      {selected && (
        <AddMemberSheet open={addOpen} onClose={() => setAddOpen(false)} group={selected} />
      )}

      <NewGroupSheet open={newOpen} onClose={() => setNewOpen(false)} onCreated={setSelectedId} />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) {
            setDeleteTarget(null);
            setInUse("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{inUse ? "This group is in use" : "Delete this group?"}</DialogTitle>
            <DialogDescription>
              {inUse ||
                `${deleteTarget?.name ?? "This group"} will be removed. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setInUse("");
              }}
              disabled={isDeleting}
            >
              {inUse ? "Close" : "Keep it"}
            </Button>
            {inUse ? (
              <Button
                onClick={() => {
                  if (!deleteTarget) return;
                  updateGroup({ id: deleteTarget.id, body: { is_active: false } })
                    .unwrap()
                    .then(() => {
                      toast.success("Group deactivated.");
                      setDeleteTarget(null);
                      setInUse("");
                    })
                    .catch(() => {});
                }}
                disabled={isUpdating}
              >
                Deactivate instead
              </Button>
            ) : (
              <Button variant="destructive" onClick={doDelete} disabled={isDeleting}>
                {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── New group ─────────────────────────────────────────────────────────────────

/** Codes are the handle templates publish against, so they are slugged here and
 *  immutable afterwards - the backend rejects a change. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function NewGroupSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [createGroup, { isLoading }] = useCreateApproverGroupMutation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState("");

  const effectiveCode = codeTouched ? code : slugify(name);
  const isValid = !!name.trim() && !!effectiveCode;

  const close = () => {
    setName("");
    setCode("");
    setCodeTouched(false);
    setDescription("");
    onClose();
  };

  const submit = () => {
    if (!isValid) return;
    createGroup({
      name: name.trim(),
      code: effectiveCode,
      description: description.trim(),
    })
      .unwrap()
      .then((group) => {
        toast.success("Group created.");
        if (group?.id) onCreated(group.id);
        close();
      })
      .catch(() => {});
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-white-02">
          <SheetTitle className="text-base font-semibold text-black-01">New approver group</SheetTitle>
          <SheetDescription className="text-xs text-gray-01">
            A workflow step points at a group by its code. Add members after creating it.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <CustomInput
            id="group-name"
            label="Name"
            isRequired
            placeholder="e.g. PO Approvers"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <CustomInput
            id="group-code"
            label="Code"
            isRequired
            placeholder="po-approvers"
            value={effectiveCode}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(slugify(e.target.value));
            }}
          />
          <p className="-mt-3 text-xs text-gray-01">
            Templates reference this code, so it cannot be changed once the group exists.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="group-desc" className="text-xs font-medium text-black-01">
              Description
            </label>
            <Textarea
              id="group-desc"
              rows={3}
              maxLength={240}
              placeholder="What this group signs off on."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <SheetFooter className="flex flex-row justify-end gap-3 border-t border-white-02 px-6 py-4">
          <Button variant="outline" size="lg" onClick={close} disabled={isLoading}>
            Cancel
          </Button>
          <Button size="lg" onClick={submit} disabled={isLoading || !isValid}>
            {isLoading ? "Creating…" : "Create group"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
