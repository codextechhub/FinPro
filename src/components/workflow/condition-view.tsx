import type { WorkflowCondition } from "@/redux/services/dashboard/workflow-types";

/**
 * What a condition reads as when the server sent no words for it: only a
 * server older than the descriptions does that, and the stored condition is a
 * field path, an operator key and a value in kobo, which is never shown.
 */
const UNDESCRIBED_CONDITION = "A condition set on this template";

/**
 * A stored condition, in the words the server wrote for it.
 *
 * Every payload that carries a condition carries its description beside it
 * (`inclusion_condition_description`, a route's or a rule's
 * `condition_description`), worded from the field catalogue with money in
 * naira and branches, people and roles by name. This shows that sentence as
 * prose. A missing condition always applies.
 */
export function ConditionView({
  condition,
  description,
  className,
}: {
  condition: WorkflowCondition;
  description?: string | null;
  className?: string;
}) {
  return (
    <span className={className}>
      {condition == null ? (
        <span className="text-gray-01 italic">Always applies</span>
      ) : (
        <span className="text-black-01">{description || UNDESCRIBED_CONDITION}</span>
      )}
    </span>
  );
}
