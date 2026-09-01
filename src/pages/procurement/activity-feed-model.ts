import type { WorkflowAuditLog } from "@/redux/services/dashboard/workflow-types";

type DocumentActivity = {
  id: string | number;
  action: string;
  message: string;
  actor_name: string;
  created_at: string;
};

export type ActivityFeedSeed = {
  key: string;
  message: string;
  actorName: string;
  occurredAt: string;
};

export type ActivityFeedItem = {
  key: string;
  message: string;
  actorId?: string | number | null;
  actorName?: string;
  occurredAt: string;
};

export type MergeActivityInput = {
  workflowLogs?: WorkflowAuditLog[];
  activity?: DocumentActivity[];
  created?: ActivityFeedSeed;
};

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function mergeActivityItems({ workflowLogs = [], activity = [], created }: MergeActivityInput): ActivityFeedItem[] {
  const items: Array<ActivityFeedItem & { sourceOrder: number }> = [
    ...workflowLogs.map((log, index) => ({
      key: `workflow-${log.id}`,
      message: log.message || log.event_type.replaceAll("_", " ").toLowerCase(),
      actorId: log.actor,
      occurredAt: log.occurred_at,
      sourceOrder: index,
    })),
    ...activity.map((log, index) => ({
      key: `document-${log.id}`,
      message: log.message || log.action.replaceAll("_", " ").toLowerCase(),
      actorName: log.actor_name || undefined,
      occurredAt: log.created_at,
      sourceOrder: workflowLogs.length + index,
    })),
    ...(created ? [{ ...created, sourceOrder: workflowLogs.length + activity.length }] : []),
  ];

  return items
    .sort((left, right) => timestamp(right.occurredAt) - timestamp(left.occurredAt) || left.sourceOrder - right.sourceOrder)
    .map((item) => ({
      key: item.key,
      message: item.message,
      actorId: item.actorId,
      actorName: item.actorName,
      occurredAt: item.occurredAt,
    }));
}
