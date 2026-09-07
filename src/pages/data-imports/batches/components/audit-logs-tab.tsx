import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeDate } from "@/utils/helpers";
import { useGetImportAuditLogsQuery } from "@/redux/services/dashboard/import-api";

export function AuditLogsTab({ batchId }: { batchId: number }) {
  const { data, isLoading, isError, refetch } = useGetImportAuditLogsQuery({ batchId });
  const logs = data?.data ?? [];

  if (isLoading) return <div className="flex h-32 items-center justify-center"><div className="loader" /></div>;
  if (isError) return (
    <div className="flex h-32 flex-col items-center justify-center gap-2">
      <p className="text-sm text-destructive">Failed to load audit logs.</p>
      <Button size="sm" variant="white" onClick={() => refetch()}>Retry</Button>
    </div>
  );
  if (logs.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-01">No audit events for this batch.</div>;
  }

  return (
    <div className="rounded-md border border-white-02 divide-y divide-white-02 overflow-hidden">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-3 px-4 py-3">
          <ShieldAlert className="size-3.5 text-gray-300 mt-1 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={log.severity === "CRITICAL" ? "suspended" : log.severity === "WARNING" ? "locked" : "inactive"}
                className="text-[10px] uppercase"
              >
                {log.severity}
              </Badge>
              <span className="text-xs font-medium text-black-01">{log.action_type}</span>
              <span className="text-[10px] text-gray-400">·</span>
              <span className="text-[10px] text-gray-01">
                {log.actor_user?.full_name || log.actor_user?.email || log.actor_label || "System"}
              </span>
            </div>
            {log.summary && <p className="text-xs text-black-01 mt-0.5">{log.summary}</p>}
            <p className="text-[10px] text-gray-400 mt-0.5">
              {formatRelativeDate(log.event_at)}
              {log.ip_address && <span className="ml-2 font-mono">{log.ip_address}</span>}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
