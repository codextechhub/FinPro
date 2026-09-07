import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeDate } from "@/utils/helpers";
import { useGetImportNotificationsQuery } from "@/redux/services/dashboard/import-api";

export function NotificationsTab({ batchId }: { batchId: number }) {
  const { data, isLoading, isError, refetch } = useGetImportNotificationsQuery({ batchId });
  const items = data?.data ?? [];

  const statusBadge: Record<string, "active" | "pending" | "suspended"> = {
    sent: "active",
    pending: "pending",
    failed: "suspended",
  };

  if (isLoading) return <div className="flex h-32 items-center justify-center"><div className="loader" /></div>;
  if (isError) return (
    <div className="flex h-32 flex-col items-center justify-center gap-2">
      <p className="text-sm text-destructive">Failed to load notifications.</p>
      <Button size="sm" variant="white" onClick={() => refetch()}>Retry</Button>
    </div>
  );
  if (items.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-01">No notifications sent for this batch.</div>;
  }

  return (
    <div className="rounded-md border border-white-02 divide-y divide-white-02 overflow-hidden">
      {items.map((n) => (
        <div key={n.id} className="flex items-start gap-3 px-4 py-3">
          <MessageSquare className="size-3.5 text-gray-300 mt-1 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={statusBadge[n.status] ?? "inactive"} className="text-[10px] capitalize">
                {n.status}
              </Badge>
              <span className="text-xs font-medium text-black-01 capitalize">{n.event_type.replace(/_/g, " ")}</span>
            </div>
            <p className="text-sm text-black-01 mt-1 font-medium">{n.title}</p>
            <p className="text-xs text-gray-01 mt-0.5">{n.body}</p>
            <p className="text-[10px] text-gray-400 mt-1">
              {n.recipient?.full_name || n.recipient?.email || "-"}
              {n.sent_at && <span className="ml-2">{formatRelativeDate(n.sent_at)}</span>}
            </p>
            {n.error_message && (
              <p className="text-[10px] text-destructive mt-0.5">{n.error_message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
