/**
 * The note a finance document's drawer shows in place of Submit, Send or Edit
 * when an approver sent the document back (see sent-back.ts).
 */
import { SENT_BACK_NOTE, sentBackForChanges, type SentBackFacts } from "./sent-back";

export function SentBackNote({ doc }: { doc: SentBackFacts }) {
  if (!sentBackForChanges(doc)) return null;
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-900">
      {SENT_BACK_NOTE}
    </p>
  );
}
