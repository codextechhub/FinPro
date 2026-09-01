// <StatusPill status="POSTED" /> - maps the backend's status vocabularies
// (DocumentStatus, InvoicePaymentStatus, PeriodStatus, payment/collection
// states, etc.) onto the app's existing Badge variants. Unknown statuses still
// render, humanised, with a neutral variant - never a crash.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "active" | "inactive" | "pending" | "rejected" | "suspended";

// Status → variant. Grouped by meaning so new statuses slot in obviously.
const VARIANT_BY_STATUS: Record<string, BadgeVariant> = {
  // settled / good
  POSTED: "success",
  PAID: "success",
  APPROVED: "success",
  ACTIVE: "active",
  SUCCEEDED: "success",
  COMPLETED: "success",
  OPEN: "success",
  MATCHED: "success",
  RECONCILED: "success",
  SETTLED: "success",
  RESPONDED: "success",
  ISSUED: "success",
  RECEIVED: "success",
  RECEIPT: "success",
  IN_STOCK: "success",
  // in-flight / awaiting
  DRAFT: "pending",
  PENDING: "pending",
  PENDING_APPROVAL: "pending",
  PARTIAL: "pending",
  SOFT_CLOSED: "pending",
  QUEUED: "pending",
  RUNNING: "pending",
  // An export run that produced a file with something left out. Amber, not
  // green: a file exists, but the omission is the point (vs_exports
  // RunStatus.COMPLETED_WITH_OMISSIONS).
  COMPLETED_WITH_OMISSIONS: "pending",
  SUBMITTED: "pending",
  SENT: "pending",
  AWAITED: "pending",
  LOW_STOCK: "pending",
  ADJUSTMENT: "pending",
  // closed / neutral-terminal
  UNPAID: "inactive",
  CLOSED: "inactive",
  LOCKED: "inactive",
  REVERSED: "inactive",
  CANCELLED: "inactive",
  EXPIRED: "inactive",
  RENEWED: "inactive",
  NOT_TRACKED: "inactive",
  ISSUE: "inactive",
  // problem
  FAILED: "rejected",
  REJECTED: "rejected",
  BLOCKED: "rejected",
  OVERDUE: "rejected",
  OUT_OF_STOCK: "rejected",
  MISSED: "rejected",
  TERMINATED: "suspended",
  OVER_TOLERANCE: "suspended",
};

// Statuses whose humanised token is not the word a person should read.
// Deliberately short: a label override is a last resort, because the wire token
// and the label drifting apart is how one outcome ends up with two names.
const LABEL_BY_STATUS: Record<string, string> = {
  COMPLETED_WITH_OMISSIONS: "Partly complete",
};

function humanise(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// The Badge variant one status token renders as. Exported so a surface that
// needs extra treatment (a glyph, a pinging dot) can add it WITHOUT forking the
// map - there is one status→colour truth in this app and this is it.
export function statusVariant(status: string): BadgeVariant {
  return VARIANT_BY_STATUS[status.toUpperCase()] ?? "inactive";
}

// The word a person reads for one status token.
export function statusLabel(status: string): string {
  const token = status.toUpperCase();
  return LABEL_BY_STATUS[token] ?? humanise(status);
}

export function StatusPill({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-gray-05">-</span>;
  const variant = statusVariant(status);
  return (
    <Badge variant={variant} className={cn("font-mont", className)}>
      {statusLabel(status)}
    </Badge>
  );
}
