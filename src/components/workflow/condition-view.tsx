import type { WorkflowCondition } from "@/redux/services/dashboard/workflow-types";

const OP_LABEL: Record<string, string> = {
  eq: "=",
  ne: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  in: "in",
  not_in: "not in",
  contains: "contains",
};

function fmtValue(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(fmtValue).join(", ")}]`;
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

/** Render a condition JSON tree as a compact human-readable sentence. */
function describeCondition(cond: WorkflowCondition): string {
  if (cond == null) return "Always";
  if ("all" in cond) return cond.all.map(describeCondition).join(" AND ");
  if ("any" in cond) return cond.any.map(describeCondition).join(" OR ");
  if ("not" in cond) return `NOT (${describeCondition(cond.not)})`;
  if ("fn" in cond) {
    const args = cond.args ? `(${JSON.stringify(cond.args)})` : "()";
    return `${cond.fn}${args}`;
  }
  if ("op" in cond) {
    return `${cond.field} ${OP_LABEL[cond.op] ?? cond.op} ${fmtValue(cond.value)}`;
  }
  return JSON.stringify(cond);
}

export function ConditionView({
  condition,
  className,
}: {
  condition: WorkflowCondition;
  className?: string;
}) {
  return (
    <span className={className}>
      {condition == null ? (
        <span className="text-gray-01 italic">Always applies</span>
      ) : (
        <code className="rounded bg-gray-50 border border-white-02 px-1.5 py-0.5 text-xs text-black-01">
          {describeCondition(condition)}
        </code>
      )}
    </span>
  );
}
