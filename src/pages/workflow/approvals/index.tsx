import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronRight, Inbox, RefreshCw, Search, Users, FileText, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/utils/helpers";
import { routesPath } from "../paths";
import { useGetPendingApprovalsQuery } from "@/redux/services/dashboard/workflow-api";
import type { PendingApproval } from "@/redux/services/dashboard/workflow-types";
import { useFilterParam } from "@/hooks/use-filter-param";
import { useUserDirectory } from "@/pages/protected/workflow/components/use-user-directory";
import { DocumentRef, InitialsAvatar } from "@/pages/protected/workflow/components/workflow-ui";
import { humanizeDocumentType } from "@/pages/protected/workflow/components/workflow-format";
import { PageShell } from "@/components/layout/page-shell";

export default function PendingApprovals() {
  const navigate = useNavigate();
  const { name, initials, role } = useUserDirectory();
  const { data, isLoading, isFetching, refetch } = useGetPendingApprovalsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  const [selectedType, setSelectedType] = useState<string>("all");
  const [actingAs, setActingAs] = useState<"all" | "delegated">("all");
  // Dashboard deep-link: the delegate box lands here as ?acting=delegated.
  useFilterParam("acting", ["delegated"] as const, setActingAs);
  const [search, setSearch] = useState("");

  const items = useMemo(() => data?.results ?? [], [data]);

  // Doc-type counts for the filter rail (computed off the unfiltered set).
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.document_type, (m.get(it.document_type) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const delegatedCount = items.filter((i) => i.on_behalf_of).length;

  const filtered = useMemo(() => {
    let out = items;
    if (selectedType !== "all") out = out.filter((i) => i.document_type === selectedType);
    if (actingAs === "delegated") out = out.filter((i) => i.on_behalf_of);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (i) =>
          i.document_object_id.toLowerCase().includes(q) ||
          i.document_type.toLowerCase().includes(q) ||
          name(i.requested_by).toLowerCase().includes(q),
      );
    }
    return out;
  }, [items, selectedType, actingAs, search, name]);

  return (
    <>
      <PageShell className="text-black-01">
        <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-6">
          {/* ── Filter rail ─────────────────────────────────────────────── */}
          <aside data-guide="workflow-approvals.filters" className="space-y-5">
            <div>
              <h4 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-01 mb-1.5">
                Document type
              </h4>
              <RailItem
                icon={<Layers className="size-4" />}
                label="All types"
                count={items.length}
                active={selectedType === "all"}
                onClick={() => setSelectedType("all")}
              />
              {typeCounts.map(([t, c]) => (
                <RailItem
                  key={t}
                  icon={<FileText className="size-4" />}
                  label={humanizeDocumentType(t)}
                  count={c}
                  active={selectedType === t}
                  onClick={() => setSelectedType(t)}
                />
              ))}
            </div>
            <div>
              <h4 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-01 mb-1.5">
                Acting as
              </h4>
              <RailItem
                icon={<Inbox className="size-4" />}
                label="My queue"
                count={items.length}
                active={actingAs === "all"}
                onClick={() => setActingAs("all")}
              />
              <RailItem
                icon={<Users className="size-4" />}
                label="On behalf of"
                count={delegatedCount}
                active={actingAs === "delegated"}
                onClick={() => setActingAs("delegated")}
              />
            </div>
          </aside>

          {/* ── List ────────────────────────────────────────────────────── */}
          <section data-guide="workflow-approvals.queue" className="space-y-4 min-w-0">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold font-mont">Pending Approvals</h1>
                  <Badge variant="pending">{filtered.length} awaiting action</Badge>
                </div>
                <p className="text-xs text-gray-01 mt-0.5">
                  Documents waiting for your vote. Items you've already voted on are hidden.
                </p>
              </div>
              <Button
                variant="white"
                size="lg"
                className="[&_svg]:size-4 font-medium shrink-0"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn(isFetching && "animate-spin")} /> Refresh
              </Button>
            </div>

            <div className="relative max-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-01" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by ID, type, or requester…"
                className="w-full h-10 rounded-md border border-white-02 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>

            {isLoading ? (
              <ListSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-2.5">
                {filtered.map((item) => (
                  <ApprovalRow
                    key={item.id}
                    item={item}
                    requesterName={name(item.requested_by)}
                    requesterInitials={initials(item.requested_by)}
                    requesterRole={role(item.requested_by)}
                    delegatorName={item.on_behalf_of ? name(item.on_behalf_of) : null}
                    onReview={() => navigate(routesPath.PROTECTED.WORKFLOW.APPROVAL_DETAIL(item.id))}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </PageShell>
    </>
  );
}

function RailItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        active ? "bg-pry-01 text-primary font-medium" : "text-gray-01 hover:bg-gray-50",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 text-xs",
          active ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-01",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ApprovalRow({
  item,
  requesterName,
  requesterInitials,
  requesterRole,
  delegatorName,
  onReview,
}: {
  item: PendingApproval;
  requesterName: string;
  requesterInitials: string;
  requesterRole: string;
  delegatorName: string | null;
  onReview: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onReview}
      className="flex w-full items-center gap-4 rounded-lg border border-white-02 bg-white px-4 py-3.5 text-left transition-shadow hover:shadow-sm"
    >
      <span className="grid size-10 shrink-0 place-content-center rounded-lg bg-pry-01 text-primary">
        <FileText className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate">
          <DocumentRef documentType={item.document_type} objectId={item.document_object_id} />
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-01 min-w-0">
          <InitialsAvatar initials={requesterInitials} seed={item.requested_by} size={18} />
          <span className="truncate text-black-01">{requesterName}</span>
          {requesterRole && (
            <>
              <span className="size-1 rounded-full bg-gray-300" />
              <span className="truncate">{requesterRole}</span>
            </>
          )}
        </div>
      </div>

      <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0">
        <Badge variant="pending">{item.awaiting_on_stage}</Badge>
        {delegatorName && (
          <Badge variant="outline" className="text-teal-600">
            <Users className="size-3" /> On behalf of {delegatorName}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden md:block text-right text-xs text-gray-01">
          <span className="block text-gray-05">In your queue</span>
          {item.awaiting_since
            ? formatRelativeDate(item.awaiting_since)
            : item.submitted_at
              ? formatRelativeDate(item.submitted_at)
              : "-"}
        </div>
        <span className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white">
          Review <ChevronRight className="size-4" />
        </span>
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-white-02 bg-white py-16 text-center">
      <span className="mx-auto grid size-14 place-content-center rounded-full bg-green-01/10 text-green-01">
        <Inbox className="size-7" />
      </span>
      <p className="mt-3 text-base font-semibold text-black-01">You're all caught up.</p>
      <p className="text-sm text-gray-01">No pending approvals in your queue.</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-lg border border-white-02 bg-gray-50" />
      ))}
    </div>
  );
}
