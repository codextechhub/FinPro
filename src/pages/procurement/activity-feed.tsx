import { formatDistanceToNowStrict } from "date-fns";

import { mergeActivityItems, type MergeActivityInput } from "./activity-feed-model";

function activityAge(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : formatDistanceToNowStrict(date, { addSuffix: true });
}

type ActivityFeedProps = MergeActivityInput & {
  resolveActorName?: (id: string | number | null | undefined) => string;
  emptyMessage?: string;
};

export function ActivityFeed({
  workflowLogs,
  activity,
  created,
  resolveActorName,
  emptyMessage = "No activity has been recorded yet.",
}: ActivityFeedProps) {
  const items = mergeActivityItems({ workflowLogs, activity, created });

  if (!items.length) {
    return <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">{emptyMessage}</div>;
  }

  return (
    <div className="divide-y divide-white-02">
      {items.map((item) => (
        <div key={item.key} className="py-3 first:pt-0">
          <p className="font-mont text-sm font-medium">{item.message}</p>
          <p className="mt-1 font-mont text-xs text-gray-05">
            {item.actorName || (item.actorId ? resolveActorName?.(item.actorId) : "System") || "System"} · {activityAge(item.occurredAt)}
          </p>
        </div>
      ))}
    </div>
  );
}
