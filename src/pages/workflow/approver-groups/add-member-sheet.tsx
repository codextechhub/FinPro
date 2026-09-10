import { useMemo, useState } from "react";
import { Check, Network, Search, Shield, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { UserAvatar } from "@xvs/finance/host";
import { TabStrip, type TabStripItem } from "@/components/finance-ui/tab-strip";
import { cn } from "@/lib/utils";
import { useDirectory, usePositions, useRoles } from "@xvs/finance/host";
import { useAddApproverGroupMemberMutation } from "@/redux/services/dashboard/workflow-api";
import type {
  ApproverGroup,
  ApproverGroupMemberPayload,
  GroupMemberKind,
} from "@/redux/services/dashboard/workflow-types";

/** One selectable target, flattened from the three source directories. */
type Candidate = {
  kind: GroupMemberKind;
  /** What the API is posted: user id, role key, or position code. */
  target: string;
  name: string;
  sub: string;
  /** Live headcount behind a role/position - null for a person. */
  reach: number | null;
  userId?: string;
};

const TABS: TabStripItem<GroupMemberKind>[] = [
  { value: "USER", label: "People" },
  { value: "ROLE", label: "Roles" },
];

const POSITIONS_TAB: TabStripItem<GroupMemberKind> = {
  value: "POSITION",
  label: "Positions",
};

function payloadFor(c: Candidate): ApproverGroupMemberPayload {
  if (c.kind === "USER") return { kind: "USER", user: c.target };
  if (c.kind === "ROLE") return { kind: "ROLE", role_key: c.target };
  return { kind: "POSITION", position_code: c.target };
}

/**
 * Adds people, roles, or organogram seats to a group from one searchable list.
 *
 * The three kinds share a single picker on purpose: an administrator thinks
 * "who approves this", not "which directory do I need". Roles and positions
 * carry their live headcount here so picking one that currently reaches nobody
 * is a visible choice rather than a surprise on the members list afterwards.
 *
 * The directories are only fetched while the sheet is open - a page that never
 * opens it pays for none of them.
 */
export default function AddMemberSheet({
  open,
  onClose,
  group,
}: {
  open: boolean;
  onClose: () => void;
  group: ApproverGroup;
}) {
  const [tab, setTab] = useState<GroupMemberKind>("USER");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Candidate[]>([]);

  // All three directories come from the host, and none of them is the
  // package's to query. Who a caller may name, which roles exist and whether
  // there is an organogram at all are answers only the surrounding application
  // has: the console reads platform users and the CX reporting structure, and a
  // school reads its own staff and has no organogram. The package asking
  // directly is what put a platform endpoint behind a school's picker and
  // answered 403 to every school administrator who opened this sheet.
  const { data: people, isLoading: peopleLoading } = useDirectory();
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const [addMember, { isLoading: isAdding }] = useAddApproverGroupMemberMutation();

  // Offered only where the host has an organogram. A tab that can never list
  // anything is not an empty state, it is a promise the application cannot
  // keep - and the reader has no way to tell "no seats yet" from "this product
  // does not have seats". Hidden while the answer is still loading, so it
  // appears once rather than flickering in and out.
  const tabs = useMemo(
    () => (positions && positions.length > 0 ? [...TABS, POSITIONS_TAB] : TABS),
    [positions],
  );
  // A tab that has just disappeared must not stay selected.
  const activeTab = tabs.some((t) => t.value === tab) ? tab : "USER";

  const isLoading =
    (activeTab === "USER" && peopleLoading) ||
    (activeTab === "ROLE" && rolesLoading) ||
    (activeTab === "POSITION" && positionsLoading);

  // Membership is keyed the same way the API identifies a target, so an
  // already-added row can be shown as added instead of silently no-opping.
  const alreadyIn = useMemo(() => {
    const keys = new Set<string>();
    for (const m of group.members) {
      if (m.kind === "USER" && m.user != null) keys.add(`USER:${String(m.user)}`);
      if (m.kind === "ROLE" && m.role_key) keys.add(`ROLE:${m.role_key}`);
      if (m.kind === "POSITION" && m.position_code) keys.add(`POSITION:${m.position_code}`);
    }
    return keys;
  }, [group.members]);

  const candidates = useMemo<Candidate[]>(() => {
    if (activeTab === "USER") {
      return (people ?? [])
        .filter((u) => u.status === "ACTIVE")
        .map((u) => ({
          kind: "USER" as const,
          target: String(u.id),
          userId: String(u.id),
          name: u.full_name || u.email,
          sub: u.email,
          reach: null,
        }));
    }
    if (activeTab === "ROLE") {
      return (roles ?? [])
        .filter((r) => r.status === "ACTIVE")
        .map((r) => ({
          kind: "ROLE" as const,
          target: r.key,
          name: r.name,
          sub: r.key,
          reach: r.assigned_users_count ?? 0,
        }));
    }
    return (positions ?? [])
      .filter((p) => p.is_active)
      .map((p) => ({
        kind: "POSITION" as const,
        target: p.code,
        name: p.title,
        sub: p.code,
        reach: p.holders,
      }));
  }, [activeTab, people, roles, positions]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) => c.name.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const isSelected = (c: Candidate) =>
    selected.some((s) => s.kind === c.kind && s.target === c.target);

  const toggle = (c: Candidate) => {
    setSelected((prev) =>
      prev.some((s) => s.kind === c.kind && s.target === c.target)
        ? prev.filter((s) => !(s.kind === c.kind && s.target === c.target))
        : [...prev, c],
    );
  };

  const close = () => {
    setSelected([]);
    setQuery("");
    onClose();
  };

  const submit = async () => {
    if (!selected.length) return;
    // Sequential rather than parallel: each add returns the whole group, and
    // the last response is the one that should win the cache write.
    let added = 0;
    for (const c of selected) {
      try {
        await addMember({ id: group.id, body: payloadFor(c) }).unwrap();
        added += 1;
      } catch {
        // The interceptor has already surfaced the reason; keep going so one
        // rejected target does not discard the rest of the selection.
      }
    }
    if (added) {
      toast.success(added === 1 ? "Member added." : `${added} members added.`);
      close();
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-white-02">
          <SheetTitle className="text-base font-semibold text-black-01">Add approvers</SheetTitle>
          <SheetDescription className="text-xs text-gray-01">
            Add a named person, or a role or seat that keeps itself current as staff change.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 pt-4 pb-3 space-y-3 border-b border-white-02">
          <TabStrip
            items={tabs}
            value={activeTab}
            onChange={setTab}
            variant="pill-soft"
            ariaLabel="Directory to add from"
          />

          <div className="flex h-9 items-center gap-2 rounded-md border border-white-02 px-3">
            <Search className="size-4 shrink-0 text-gray-01" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people, roles or positions"
              aria-label="Search people, roles or positions"
              className="h-full w-full min-w-0 border-none bg-transparent text-sm outline-none placeholder:text-gray-01"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-md bg-gray-50" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-gray-01">
              {query ? `Nothing matches “${query}”.` : "Nothing to add here yet."}
            </p>
          ) : (
            <ul>
              {shown.map((c) => {
                const added = alreadyIn.has(`${c.kind}:${c.target}`);
                const picked = isSelected(c);
                return (
                  <li key={`${c.kind}:${c.target}`}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => toggle(c)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left",
                        added ? "opacity-55" : "hover:bg-gray-50",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-content-center rounded border",
                          picked
                            ? "border-primary bg-primary text-white"
                            : "border-white-02 text-transparent",
                          added && "border-transparent",
                        )}
                      >
                        {!added && <Check className="size-3" />}
                      </span>

                      {c.kind === "USER" ? (
                        <UserAvatar
                          userId={c.userId}
                          name={c.name}
                          className="size-7"
                          fallbackClassName="text-[10px]"
                        />
                      ) : (
                        <span className="grid size-7 shrink-0 place-content-center rounded-md bg-pry-01 text-primary">
                          {c.kind === "ROLE" ? (
                            <Shield className="size-3.5" />
                          ) : (
                            <Network className="size-3.5" />
                          )}
                        </span>
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-black-01">
                          {c.name}
                        </span>
                        <span className="block truncate text-xs text-gray-01">{c.sub}</span>
                      </span>

                      {added ? (
                        <span className="shrink-0 text-xs text-green-01-text">Added</span>
                      ) : c.reach === null ? null : c.reach === 0 ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-yellow-01-text">
                          <TriangleAlert className="size-3.5" />
                          {c.kind === "POSITION" ? "Vacant" : "Nobody"}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-01 tabular-nums">
                          {c.reach} {c.reach === 1 ? "person" : "people"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <SheetFooter className="flex flex-row items-center justify-end gap-3 border-t border-white-02 px-6 py-4">
          <span className="mr-auto text-xs text-gray-01">
            {selected.length ? `${selected.length} selected` : "Nothing selected"}
          </span>
          <Button variant="outline" size="lg" onClick={close} disabled={isAdding}>
            Cancel
          </Button>
          <Button size="lg" onClick={submit} disabled={isAdding || !selected.length}>
            {isAdding ? "Adding…" : `Add${selected.length ? ` ${selected.length}` : ""}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
