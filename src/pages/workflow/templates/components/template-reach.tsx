/**
 * How far an edit to a shared template actually reaches.
 *
 * Editing the shared version changes the approval path for every tenant still
 * following it, and for nobody who has adjusted it. That is the number the person
 * pressing Update needs *before* they press it, not on a page they might visit
 * afterwards - so it sits beside the button and in the form itself.
 *
 * Reuses the same `adoption` read the template page's panel uses. A refusal
 * renders nothing: for anyone but a platform operator on a shared template the
 * question does not arise, and a red box would be answering a question nobody
 * asked.
 */
import { Users } from "lucide-react";

import { useGetTemplateAdoptionQuery } from "@/redux/services/dashboard/workflow-api";

/** Plural-safe "N school(s)". */
const schools = (count: number) => `${count} ${count === 1 ? "school" : "schools"}`;

/**
 * The one-line reach summary, for the header beside Publish.
 *
 * `skip` keeps this from firing on a new template (nothing to adopt yet) or on a
 * tenant's own version (the endpoint refuses it anyway).
 */
export function TemplateReachChip({ templateId, skip }: {
  templateId: string; skip?: boolean;
}) {
  const { data, isError } = useGetTemplateAdoptionQuery(templateId, { skip });
  if (skip || isError || !data) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md bg-pry-01/40 px-2.5 py-1.5 text-xs font-medium text-gray-01"
      title={`${schools(data.following_count)} run this as published; ${data.adjusted_count} run their own version.`}
    >
      <Users className="size-3.5 shrink-0" />
      Reaches {schools(data.following_count)}
    </span>
  );
}

/**
 * The fuller sentence for the form body.
 *
 * Says both halves out loud, because "reaches 40" alone invites the reading that
 * the other four are about to be overwritten too, and they are not.
 */
export function TemplateReachNotice({ templateId, skip }: {
  templateId: string; skip?: boolean;
}) {
  const { data, isError } = useGetTemplateAdoptionQuery(templateId, { skip });

  // Until the count is known, say the shape of the thing without a number rather
  // than an interim number that could be wrong.
  if (skip || isError || !data) {
    return (
      <p className="rounded-md border border-white-02 bg-pry-01/40 px-3 py-2 text-xs text-gray-01">
        You are editing the shared version. Every school still running it picks this up;
        schools running their own are unaffected.
      </p>
    );
  }

  const { following_count: following, adjusted_count: adjusted, customer_count: total } = data;
  return (
    <p className="rounded-md border border-white-02 bg-pry-01/40 px-3 py-2 text-xs text-gray-01">
      <span className="font-semibold">{reachHeadline(following)}</span>{" "}
      {reachRemainder(following, adjusted, total)}
    </p>
  );
}

/** What publishing does, in one clause. */
function reachHeadline(following: number): string {
  return following === 0
    ? "No school picks this up right now."
    : `Publishing this changes the approval path for ${schools(following)}.`;
}

/**
 * Who is left over, and why they are unaffected.
 *
 * Split out because the honest sentence differs at each end: with nobody on the
 * platform there is no "rest" to describe, and with everybody on their own
 * version the useful thing to say is that the edit reaches nobody today - not
 * "0 of the 1 schools", which is both clumsy and easy to misread.
 */
function reachRemainder(following: number, adjusted: number, total: number): string {
  if (total === 0) return "No school is set up on the platform yet.";
  if (adjusted === 0) return "That is every school on the platform.";
  if (following === 0) {
    return total === 1
      ? "The only school on the platform runs its own version, so this edit reaches nobody today."
      : `All ${total} schools run their own version, so this edit reaches nobody today.`;
  }
  return adjusted === 1
    ? "One other school runs its own version and is unaffected."
    : `${adjusted} other schools run their own version and are unaffected.`;
}
