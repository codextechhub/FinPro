// The published approval rule for one AR adjustment type, for labelling a form.
//
// Only ever powers copy and a button label. What actually happens is decided by
// the document's own `approval_required`, which the server computes with the same
// function the post endpoint calls - see `adjustment-approval.ts` for why the two
// are kept apart.
//
// One request serves every adjustment screen: the template list is small, cached
// under the shared `WorkflowTemplates` tag, and already fetched by the workflow
// console, so opening a concession form usually costs nothing.

import { useMemo } from "react";

import { useGetWorkflowTemplatesQuery } from "@/redux/services/dashboard/workflow-api";
import { toArray } from "@/redux/services/finance/api-types";
import { useCan } from "@/components/finance-ui/can";
import { P } from "../../../permissions";
import { resolveGateRule, type AdjustmentDocType, type GateRule } from "./adjustment-approval";

/**
 * The gate rule for `documentType`, and whether it is still being read.
 *
 * A failure resolves to "no gate": the caller then labels the button Post, and if
 * the document does turn out to be gated the server refuses and the screen shows
 * the real answer. Erring the other way would put a Submit button on a document
 * type nobody has published a ladder for.
 */
export function useAdjustmentGate(documentType: AdjustmentDocType): {
  rule: GateRule; isLoading: boolean;
} {
  // Reading the ladder is a workflow grant, and a finance user need not hold
  // one: three AR screens each asked on open and each collected a 403 and a red
  // toast for a label. Without the key we take the documented failure path -
  // "no gate", the button reads Post, and the server still refuses anything
  // that is actually gated - rather than asking a question we may not ask.
  const { can } = useCan();
  const canReadTemplates = can(P.VIEW_WORKFLOW_TEMPLATES);
  // page_size is generous on purpose: the rule is only right if the document
  // type's template is actually in the page we read.
  const { data, isLoading } = useGetWorkflowTemplatesQuery(
    { page_size: 200 }, { skip: !canReadTemplates },
  );
  const rule = useMemo(
    () => resolveGateRule(toArray(data?.data), documentType),
    [data, documentType],
  );
  return { rule, isLoading };
}
