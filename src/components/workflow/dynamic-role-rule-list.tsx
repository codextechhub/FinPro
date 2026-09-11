import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useGetDynamicRoleFieldsQuery } from "@/redux/services/dashboard/workflow-api";
import type { DynamicRoleRule } from "@/redux/services/dashboard/workflow-types";
import { conditionSentence, targetSentence } from "./dynamic-role-format";
import { useRuleNames } from "./use-rule-names";

/**
 * A Dynamic Role's rules, numbered and in words, with the Otherwise row last.
 *
 * Read-only, for the places a stage names a Dynamic Role: the template page and
 * the builder. Each field's label comes from the server's field list for the
 * role's own document types, so a rule reads here exactly as it does in the
 * editor on the Approvers screen.
 */
export function DynamicRoleRuleList({
  rules,
  documentTypes,
  className,
}: {
  rules: DynamicRoleRule[];
  documentTypes: string[];
  className?: string;
}) {
  const { data } = useGetDynamicRoleFieldsQuery(documentTypes);
  const fields = useMemo(() => new Map((data?.fields ?? []).map((f) => [f.key, f])), [data]);
  const names = useRuleNames();
  const ordered = useMemo(() => [...rules].sort((a, b) => a.order - b.order), [rules]);

  return (
    <ol className={cn("space-y-1 text-xs", className)}>
      {ordered.map((rule, i) => (
        <li key={rule.id} className="flex gap-2">
          <span className="w-4 shrink-0 text-gray-01 tabular-nums">
            {rule.is_fallback ? "" : `${i + 1}.`}
          </span>
          <span className="min-w-0">
            {rule.is_fallback ? (
              <span className="text-gray-01">Otherwise</span>
            ) : (
              <>
                <span className="text-gray-01">When </span>
                {conditionSentence(rule.condition, fields, names)}
              </>
            )}
            <span className="text-gray-01"> → </span>
            <span className="font-medium text-black-01">{targetSentence(rule)}</span>
            {rule.label && <span className="text-gray-01"> · {rule.label}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
