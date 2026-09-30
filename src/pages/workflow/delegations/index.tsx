import { useMemo, useState } from "react";
import { Plus, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CustomInput } from "@/components/custom/custom-input";
import { CustomNativeSelect } from "@/components/custom/custom-native-select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { TabStrip, type TabStripItem } from "@/components/finance-ui/tab-strip";
import { cn } from "@/lib/utils";
import { zonedInstant } from "../../../utils/dates";
import { useAppSelector } from "@/redux/store";
import { usePermissions } from "@/hooks/use-permissions";
import { P } from "@/permissions";
import {
  useGetDelegationsQuery,
  useGetDelegationDocumentTypesQuery,
  useCreateDelegationMutation,
  useRevokeDelegationMutation,
} from "@/redux/services/dashboard/workflow-api";
import type { ApprovalDelegation } from "@/redux/services/dashboard/workflow-types";
import { useUserDirectory } from "@/pages/protected/workflow/components/use-user-directory";
import { InitialsAvatar } from "@/pages/protected/workflow/components/workflow-ui";
import { humanizeDocumentType, sameId } from "@/pages/protected/workflow/components/workflow-format";
import { PageShell } from "@/components/layout/page-shell";
import { useDates } from "../../../lib/display-prefs";
import { listEmptyText } from "../list-state";
import { PersonPicker } from "../../../components/workflow/person-picker";
import { appliedToWaitingMessage } from "../instances/manage-approvals";

type DelegationTab = "mine" | "tome" | "all";

/** How many delegations the "Everyone" tab shows per page. */
const ALL_PAGE_SIZE = 25;

type DelegationState = "Active" | "Scheduled" | "Expired" | "Revoked";

function delegationState(d: ApprovalDelegation): DelegationState {
  if (d.revoked_at) return "Revoked";
  const now = Date.now();
  if (now < new Date(d.starts_at).getTime()) return "Scheduled";
  if (now > new Date(d.ends_at).getTime()) return "Expired";
  return "Active";
}

const STATE_VARIANT: Record<DelegationState, React.ComponentProps<typeof Badge>["variant"]> = {
  Active: "active",
  Scheduled: "pending",
  Expired: "inactive",
  Revoked: "rejected",
};

/**
 * Approval delegations: who acts for whom, and when.
 *
 * Everybody sees the delegations they gave and the ones they received. A reader
 * holding the permission to change approvers also gets everyone's delegations,
 * may revoke any delegation in it, and may set one up for somebody else ("Funke
 * is on leave and could not do it herself"). A delegation that starts at once
 * also joins requests already waiting on the person it covers, and the screen
 * says how many.
 */
export default function Delegations() {
  const dates = useDates();
  const user = useAppSelector((s) => s.auth.user);
  const uid = user?.id != null ? String(user.id) : "";
  const { name, initials, role } = useUserDirectory();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(P.CHANGE_APPROVERS);

  const [tab, setTab] = useState<DelegationTab>("mine");
  const [allPage, setAllPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApprovalDelegation | null>(null);

  const { data, error, isLoading, isFetching, refetch } = useGetDelegationsQuery(
    { page: 1, page_size: 100 },
    { refetchOnMountOrArgChange: true },
  );
  // Everyone's delegations, paged, fetched only while their tab is open.
  const everyone = useGetDelegationsQuery(
    { page: allPage, page_size: ALL_PAGE_SIZE },
    { skip: !canManage || tab !== "all", refetchOnMountOrArgChange: true },
  );
  const [revoke, { isLoading: isRevoking }] = useRevokeDelegationMutation();

  const all = useMemo(() => data?.data ?? [], [data]);
  const mine = useMemo(() => all.filter((d) => sameId(d.delegator, uid)), [all, uid]);
  const toMe = useMemo(() => all.filter((d) => sameId(d.delegate, uid)), [all, uid]);
  const list = tab === "mine" ? mine : tab === "tome" ? toMe : everyone.data?.data ?? [];
  const listLoading = tab === "all" ? everyone.isLoading : isLoading;
  const listError = tab === "all" ? everyone.error : error;
  const allPages = everyone.data?.pagination;

  const scopeTabs: TabStripItem<DelegationTab>[] = [
    { value: "mine", label: `My Delegations (${mine.length})` },
    { value: "tome", label: `Delegated to me (${toMe.length})` },
    ...(canManage ? [{ value: "all" as const, label: "Everyone" }] : []),
  ];

  const doRevoke = () => {
    if (!revokeTarget) return;
    revoke(revokeTarget.id)
      .unwrap()
      .then(() => {
        toast.success("Delegation revoked.");
        setRevokeTarget(null);
      })
      .catch(() => {});
  };

  return (
    <>
      <PageShell className="space-y-5 text-black-01">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold font-mont text-gray-01">Approval Delegations</p>
            <p className="text-xs text-gray-01 mt-0.5">
              Hand off your approval authority to another approver for a period.
            </p>
          </div>
          <Button data-guide="workflow-delegations.new" size="lg" onClick={() => setNewOpen(true)}>
            <Plus /> New Delegation
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <TabStrip
            items={scopeTabs}
            value={tab}
            onChange={setTab}
            variant="pill-soft"
            ariaLabel="Delegation scope"
            dataGuide="workflow-delegations.scope"
          />
          <Button
            variant="white"
            size="lg"
            className="ml-auto [&_svg]:size-5 font-medium font-mont"
            onClick={() => (tab === "all" ? everyone.refetch() : refetch())}
            disabled={tab === "all" ? everyone.isFetching : isFetching}
          >
            <RefreshCw className={cn((tab === "all" ? everyone.isFetching : isFetching) && "animate-spin")} /> Refresh
          </Button>
        </div>

        <div data-guide="workflow-delegations.records">
          {listLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg border border-white-02 bg-gray-50" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-lg border border-white-02 bg-white py-16 text-center">
              <span className="mx-auto grid size-12 place-content-center rounded-full bg-pry-01 text-primary">
                <Users className="size-6" />
              </span>
              <p className="mt-3 text-sm text-gray-01">
                {listEmptyText(
                  listError,
                  tab === "mine"
                    ? "You haven't delegated your approvals to anyone."
                    : tab === "tome"
                      ? "No one has delegated their approvals to you."
                      : "Nobody has delegated their approvals.",
                  "view delegations",
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((d) => {
                const state = delegationState(d);
                const counterpartId = tab === "tome" ? d.delegator : d.delegate;
                const live = state === "Active" || state === "Scheduled";
                const canRevoke = live && tab !== "tome";
                const setUpBy = d.created_by && !sameId(d.created_by.id, d.delegator) ? d.created_by.name : null;
                return (
                  <div key={d.id} className="rounded-lg border border-white-02 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <InitialsAvatar initials={initials(counterpartId)} seed={counterpartId} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-black-01">
                          {tab === "all"
                            ? <>{name(d.delegator)} to {name(d.delegate)}</>
                            : <>{tab === "mine" ? "To " : "From "}{name(counterpartId)}</>}
                        </p>
                        <p className="text-xs text-gray-01">
                          {tab === "all" ? role(d.delegator) : role(counterpartId)}
                          {setUpBy && <span> · Set up by {setUpBy}</span>}
                        </p>
                      </div>
                      <Badge variant={STATE_VARIANT[state]}>{state}</Badge>
                      {canRevoke && (
                        <Button variant="outline" size="sm" onClick={() => setRevokeTarget(d)}>
                          Revoke
                        </Button>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-01">
                      <span>
                        {dates.day(d.starts_at)} → {dates.day(d.ends_at)}
                      </span>
                      <span>
                        Scope:{" "}
                        <span className="text-black-01">
                          {d.document_type ? humanizeDocumentType(d.document_type, d.document_type_label) : "All document types"}
                        </span>
                      </span>
                      {d.exclusive && <span className="text-orange-600">Exclusive</span>}
                    </div>
                    {d.reason && <p className="mt-2 text-xs text-gray-01 italic">“{d.reason}”</p>}
                  </div>
                );
              })}
              {tab === "all" && allPages && allPages.totalPages > 1 && (
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" disabled={allPage <= 1} onClick={() => setAllPage((n) => n - 1)}>
                    Prev
                  </Button>
                  <span className="font-mont text-sm text-gray-01">
                    Page {allPages.currentPage} of {allPages.totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={allPage >= allPages.totalPages}
                    onClick={() => setAllPage((n) => n + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </PageShell>

      <NewDelegationSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        selfId={uid}
        canActForOthers={canManage}
      />

      <Dialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke this delegation?</DialogTitle>
            <DialogDescription>
              {revokeTarget && (
                <>
                  {name(revokeTarget.delegate)} stops acting for{" "}
                  {sameId(revokeTarget.delegator, uid) ? "you" : name(revokeTarget.delegator)} at once,
                  and is taken off requests still waiting on them where they have not yet decided.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={isRevoking}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={doRevoke} disabled={isRevoking}>
              {isRevoking ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── New delegation sheet ───────────────────────────────────────────────────────
/**
 * The form for a new delegation.
 *
 * `canActForOthers` adds "On behalf of", starting on the reader themselves; an
 * admin picks the person whose approvals are handed over. Naming anybody else
 * is checked again by the server, which needs the permission to change approvers.
 */
function NewDelegationSheet({
  open,
  onClose,
  selfId,
  canActForOthers,
}: {
  open: boolean;
  onClose: () => void;
  selfId: string;
  canActForOthers: boolean;
}) {
  const dates = useDates();
  const { name } = useUserDirectory();
  const [createDelegation, { isLoading }] = useCreateDelegationMutation();

  // Blank means the reader themselves, which also covers a session still loading.
  const [onBehalfOf, setOnBehalfOf] = useState("");
  const delegator = onBehalfOf || selfId;
  const forSomebodyElse = canActForOthers && !!delegator && !sameId(delegator, selfId);
  const [delegate, setDelegate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [docType, setDocType] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [reason, setReason] = useState("");

  // Picked by name from what this school raises; blank means every type.
  const documentTypes = useGetDelegationDocumentTypesQuery(undefined, { skip: !open });
  const docTypeOptions = documentTypes.data ?? [];
  const docTypeLabel = docTypeOptions.find((t) => t.value === docType)?.label;

  const reset = () => {
    setOnBehalfOf("");
    setDelegate("");
    setStartDate("");
    setEndDate("");
    setDocType("");
    setExclusive(false);
    setReason("");
  };

  // The save button mirrors this so it can't be clicked while the required
  // fields are missing or the date range is invalid.
  const datesOutOfOrder = !!startDate && !!endDate && new Date(endDate) < new Date(startDate);
  const isValid = !!delegator && !!delegate && !sameId(delegate, delegator) && !!startDate && !!endDate && !datesOutOfOrder;

  const handleSubmit = () => {
    if (!delegate || !startDate || !endDate) {
      toast.error("Pick a delegate and a start/end date.");
      return;
    }
    if (datesOutOfOrder) {
      toast.error("End date must be after the start date.");
      return;
    }
    createDelegation({
      ...(forSomebodyElse ? { delegator } : {}),
      delegate,
      // the picked days run from the school's midnight to its last second
      starts_at: zonedInstant(startDate, "00:00:00", dates.prefs.timeZone) ?? "",
      ends_at: zonedInstant(endDate, "23:59:59", dates.prefs.timeZone) ?? "",
      document_type: docType,
      exclusive,
      reason: reason.trim(),
    })
      .unwrap()
      .then((created) => {
        const reach = appliedToWaitingMessage(
          created?.applied_to_waiting,
          forSomebodyElse ? name(delegator) : "you",
        );
        toast.success("Delegation created.", reach ? { description: reach } : undefined);
        reset();
        onClose();
      })
      .catch(() => {});
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-white-02">
          <SheetTitle className="text-base font-semibold text-black-01">New Delegation</SheetTitle>
          <SheetDescription className="text-xs text-gray-01">
            {forSomebodyElse
              ? `The delegate receives ${name(delegator)}'s pending items and acts with their authority for the period.`
              : "Your delegate receives your pending items and acts with your authority for the period."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {canActForOthers && (
            <PersonPicker
              id="del-delegator"
              label="On behalf of"
              isRequired
              activeOnly
              placeholder="Whose approvals are handed over"
              value={delegator}
              onChange={setOnBehalfOf}
            />
          )}

          <PersonPicker
            id="del-delegate"
            label="Delegate to"
            isRequired
            activeOnly
            placeholder="Search an active approver…"
            exclude={delegator ? [delegator] : undefined}
            value={delegate}
            onChange={setDelegate}
          />

          <div className="grid grid-cols-2 gap-3">
            <CustomInput
              id="del-start"
              label="Start date"
              isRequired
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <CustomInput
              id="del-end"
              label="End date"
              isRequired
              type="date"
              value={endDate}
              min={startDate || undefined}
              error={datesOutOfOrder ? "End date must be on or after the start date." : ""}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <CustomNativeSelect
            id="del-doc-type"
            label="Applies to"
            placeholder="All document types"
            loading={documentTypes.isLoading}
            options={docTypeOptions}
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          />

          <div className="flex items-start justify-between gap-4 rounded-md border border-white-02 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-black-01">Exclusive delegation</p>
              <p className="text-xs text-gray-01">
                {exclusive
                  ? "Only the delegate will appear in approver queues during this period."
                  : "Both the delegator and the delegate can act - either vote counts."}
              </p>
            </div>
            <Switch checked={exclusive} onCheckedChange={setExclusive} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-black-01">Reason</label>
            <Textarea
              rows={3}
              maxLength={240}
              placeholder="E.g. Out of office for term break."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {delegate && startDate && endDate && (
            <div className="rounded-md bg-pry-01/50 border border-primary/10 px-4 py-3 text-xs text-gray-01">
              <span className="font-medium text-primary">Summary:</span> From{" "}
              <strong>{dates.day(startDate)}</strong> to{" "}
              <strong>{dates.day(endDate)}</strong>,{" "}
              {docType ? humanizeDocumentType(docType, docTypeLabel) : "all"} approvals route to{" "}
              <strong>{name(delegate)}</strong>
              {forSomebodyElse ? <> on behalf of <strong>{name(delegator)}</strong></> : null}.
              {exclusive
                ? forSomebodyElse
                  ? ` ${name(delegator)} won't appear in queues during this period.`
                  : " You won't appear in queues during this period."
                : ""}
            </div>
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t border-white-02 flex flex-row justify-end gap-3">
          <Button variant="outline" size="lg" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button size="lg" onClick={handleSubmit} disabled={isLoading || !isValid}>
            {isLoading ? "Saving…" : "Save delegation"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
