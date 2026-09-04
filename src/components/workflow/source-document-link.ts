import { routesPath } from "@/routes/routes-path";
import type {
  WorkflowInstanceDetail,
  WorkflowInstanceStatus,
} from "@/redux/services/dashboard/workflow-types";
import { SOURCE_DOCUMENT_ID_PARAM } from "@/lib/source-document-route";

const F = routesPath.PROTECTED.FINANCE;
const P = routesPath.PROTECTED.PROCUREMENT;

const SOURCE_DOCUMENT_ROUTES: Record<
  string,
  { route: string; lookup: "reference" | "id" }
> = {
  "finance.journal": { route: F.LEDGER, lookup: "reference" },
  "finance.refund": { route: `${F.RECEIVABLES}/refunds`, lookup: "reference" },
  "finance.write_off": { route: `${F.RECEIVABLES}/refunds`, lookup: "reference" },
  "finance.concession": { route: `${F.RECEIVABLES}/concessions`, lookup: "reference" },
  "finance.credit_note": { route: `${F.RECEIVABLES}/credit-notes`, lookup: "reference" },
  "finance.expense_claim": { route: `${F.EXPENSES}/claims`, lookup: "id" },
  "payments.payout_batch": { route: `${F.PAYMENTS}/batches`, lookup: "id" },
  "procurement.requisition": { route: P.REQUISITIONS, lookup: "id" },
  "procurement.purchase_order": { route: P.PURCHASE_ORDERS, lookup: "id" },
  "procurement.vendor_invoice": { route: P.VENDOR_INVOICES, lookup: "id" },
  "procurement.vendor_payment": { route: P.VENDOR_PAYMENTS, lookup: "id" },
};

const SOURCE_DOCUMENT_PROMPTS: Record<
  WorkflowInstanceStatus,
  { title: string; description: string }
> = {
  DRAFT: {
    title: "View the draft document",
    description: "Open the source record to review the draft document.",
  },
  SUBMITTED: {
    title: "Review the source document",
    description: "Open the complete record in its originating module while this approval is pending.",
  },
  IN_PROGRESS: {
    title: "Review the source document",
    description: "Open the complete record in its originating module before making a decision.",
  },
  RETURNED: {
    title: "View the returned document",
    description: "Open the source record to review the document returned for correction.",
  },
  APPROVED: {
    title: "View the approved document",
    description: "Open the complete source record to review the approved document.",
  },
  REJECTED: {
    title: "View the rejected document",
    description: "Open the source record to review the rejected document and its current state.",
  },
  WITHDRAWN: {
    title: "View the withdrawn document",
    description: "Open the source record to review the document after withdrawal.",
  },
  CANCELLED: {
    title: "View the cancelled document",
    description: "Open the source record to review the cancelled document and its current state.",
  },
};

export function sourceDocumentPrompt(status: WorkflowInstanceStatus) {
  return SOURCE_DOCUMENT_PROMPTS[status];
}

function currentScopedLink(link: string | undefined, route: string): string | null {
  if (!link?.startsWith("/")) return null;
  const parsed = new URL(link, "http://console.local");
  if (parsed.origin !== "http://console.local" || parsed.pathname !== route) return null;
  if (!parsed.searchParams.get("entity")) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Resolve the console route for a workflow's source document.
 *
 * Some handlers historically omitted links or stored API-shaped paths in the
 * workflow snapshot. Known document types are resolved from the frontend route
 * contract so existing snapshots are repaired as well as new approvals.
 */
export function sourceDocumentLink(instance: WorkflowInstanceDetail): string | null {
  const config = SOURCE_DOCUMENT_ROUTES[instance.document_type];
  if (config) {
    const scopedLink = currentScopedLink(instance.document_summary?.link, config.route);
    if (scopedLink) return scopedLink;

    if (config.lookup === "id") {
      const id = String(instance.document_object_id ?? "").trim();
      return id
        ? `${config.route}?${SOURCE_DOCUMENT_ID_PARAM}=${encodeURIComponent(id)}`
        : config.route;
    }
    const reference = instance.document_summary?.title?.trim();
    return reference ? `${config.route}?search=${encodeURIComponent(reference)}` : config.route;
  }

  return instance.document_summary?.link || null;
}
