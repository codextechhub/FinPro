import { useMemo, useState } from "react";
import { Plus, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CustomInput } from "@/components/custom/custom-input";
import { SearchSelect } from "@/components/custom/search-select";
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
import { formatDate } from "@/utils/relative-date";
import { useAppSelector } from "@/redux/store";
import {
  useGetDelegationsQuery,
  useCreateDelegationMutation,
  useRevokeDelegationMutation,
} from "@/redux/services/dashboard/workflow-api";
import type { ApprovalDelegation } from "@/redux/services/dashboard/workflow-types";
import { useUserDirectory } from "@/pages/protected/workflow/components/use-user-directory";
import { InitialsAvatar } from "@/pages/protected/workflow/components/workflow-ui";
import { humanizeDocumentType, sameId } from "@/pages/protected/workflow/components/workflow-format";
import { PageShell } from "@/components/layout/page-shell";

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

export default function Delegations() {
  const user = useAppSelector((s) => s.auth.user);
  const uid = user?.id != null ? String(user.id) : "";
  const { name, initials, role } = useUserDirectory();

  const [tab, setTab] = useState<"mine" | "tome">("mine");
  const [newOpen, setNewOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApprovalDelegation | null>(null);

  const { data, isLoading, isFetching, refetch } = useGetDelegationsQuery(
    { page: 1, page_size: 100 },
    { refetchOnMountOrArgChange: true },
  );
  const [revoke, { isLoading: isRevoking }] = useRevokeDelegationMutation();

  const all = useMemo(() => data?.data ?? [], [data]);
  const mine = useMemo(() => all.filter((d) => sameId(d.delegator, uid)), [all, uid]);
  const toMe = useMemo(() => all.filter((d) => sameId(d.delegate, uid)), [all, uid]);
  const list = tab === "mine" ? mine : toMe;

  const scopeTabs: TabStripItem<"mine" | "tome">[] = [
    { value: "mine", label: `My Delegations (${mine.length})` },
    { value: "tome", label: `Delegated to me (${toMe.length})` },
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
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn(isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>

        <div data-guide="workflow-delegations.records">
          {isLoading ? (
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
                {tab === "mine"
                  ? "You haven't delegated your approvals to anyone."
                  : "No one has delegated their approvals to you."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((d) => {
                const state = delegationState(d);
                const counterpartId = tab === "mine" ? d.delegate : d.delegator;
                const canRevoke = state === "Active" || state === "Scheduled";
                return (
                  <div key={d.id} className="rounded-lg border border-white-02 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <InitialsAvatar initials={initials(counterpartId)} seed={counterpartId} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-black-01">
                          {tab === "mine" ? "To " : "From "}
                          {name(counterpartId)}
                        </p>
                        <p className="text-xs text-gray-01">{role(counterpartId)}</p>
                      </div>
                      <Badge variant={STATE_VARIANT[state]}>{state}</Badge>
                      {tab === "mine" && canRevoke && (
                        <Button variant="outline" size="sm" onClick={() => setRevokeTarget(d)}>
                          Revoke
                        </Button>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-01">
                      <span>
                        {formatDate(new Date(d.starts_at))} → {formatDate(new Date(d.ends_at))}
                      </span>
                      <span>
                        Scope:{" "}
                        <span className="text-black-01">
                          {d.document_type ? humanizeDocumentType(d.document_type) : "All document types"}
                        </span>
                      </span>
                      {d.exclusive && <span className="text-orange-600">Exclusive</span>}
                    </div>
                    {d.reason && <p className="mt-2 text-xs text-gray-01 italic">“{d.reason}”</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PageShell>

      <NewDelegationSheet open={newOpen} onClose={() => setNewOpen(false)} selfId={uid} />

      <Dialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke this delegation?</DialogTitle>
            <DialogDescription>
              {revokeTarget && (
                <>
                  {name(revokeTarget.delegate)} will stop appearing in approver queues on your
                  behalf immediately.
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
function NewDelegationSheet({
  open,
  onClose,
  selfId,
}: {
  open: boolean;
  onClose: () => void;
  selfId: string;
}) {
  const { byId, name } = useUserDirectory();
  const [createDelegation, { isLoading }] = useCreateDelegationMutation();

  const [delegate, setDelegate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [docType, setDocType] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [reason, setReason] = useState("");

  const userOptions = useMemo(
    () =>
      Array.from(byId.values())
        .filter((u) => !sameId(u.id, selfId) && u.status === "ACTIVE")
        .map((u) => ({ value: u.id, label: u.full_name || u.email })),
    [byId, selfId],
  );

  const reset = () => {
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
  const isValid = !!delegate && !!startDate && !!endDate && !datesOutOfOrder;

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
      delegate,
      // Send ISO datetimes (start of day → end of day) for the date-only inputs.
      starts_at: new Date(`${startDate}T00:00:00`).toISOString(),
      ends_at: new Date(`${endDate}T23:59:59`).toISOString(),
      document_type: docType.trim(),
      exclusive,
      reason: reason.trim(),
    })
      .unwrap()
      .then(() => {
        toast.success("Delegation created.");
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
            Your delegate receives your pending items and acts with your authority for the period.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <SearchSelect
            id="del-delegate"
            label="Delegate to"
            isRequired
            placeholder="Search an active approver…"
            options={userOptions}
            value={delegate}
            onChange={(e) => setDelegate(e.target.value)}
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

          <CustomInput
            id="del-doc-type"
            label="Applies to"
            placeholder="e.g. leave.request - leave blank for all types"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          />

          <div className="flex items-start justify-between gap-4 rounded-md border border-white-02 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-black-01">Exclusive delegation</p>
              <p className="text-xs text-gray-01">
                {exclusive
                  ? "Only your delegate will appear in approver queues during this period."
                  : "Both you and your delegate can act - either vote counts."}
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
              <strong>{formatDate(new Date(`${startDate}T00:00:00`))}</strong> to{" "}
              <strong>{formatDate(new Date(`${endDate}T00:00:00`))}</strong>,{" "}
              {docType ? humanizeDocumentType(docType) : "all"} approvals route to{" "}
              <strong>{name(delegate)}</strong>.
              {exclusive ? " You won't appear in queues during this period." : ""}
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
