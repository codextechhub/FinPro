// <StatusPill status="POSTED" /> - maps the backend's status vocabularies
// (DocumentStatus, InvoicePaymentStatus, PeriodStatus, payment/collection
// states, etc.) onto the app's existing Badge variants. Unknown statuses still
// render, humanised, with a neutral variant - never a crash.

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

// Renders its own pill rather than delegating to the host's Badge.
//
// The two applications' Badge components share a name and not a variant set:
// this package needs "suspended", which one of them does not define. Depending
// on a host primitive for the package's own presentation means the package
// only renders correctly where that host happens to agree - so it owns the
// styling instead. The classes match the console's Badge, so nothing changes
// visually there.
const PILL_CLASS: Record<BadgeVariant, string> = {
  default:   "bg-primary text-primary-foreground",
  success:   "bg-green-01/10 text-green-01-text",
  active:    "bg-green-01/10 text-green-01-text",
  inactive:  "bg-gray-05/10 text-gray-06-text",
  pending:   "bg-yellow-01/10 text-yellow-01-text",
  rejected:  "bg-destructive/10 text-error-text",
  suspended: "bg-orange-500/10 text-yellow-01-text",
};

export function StatusPill({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-gray-05">-</span>;
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md",
        "border-transparent px-2 py-0.5 font-mont text-xs font-medium whitespace-nowrap",
        PILL_CLASS[statusVariant(status)],
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
