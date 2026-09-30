import { useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiErrorMessage } from "@/utils/api-errors";
import { useReplaceApproverMutation } from "@/redux/services/dashboard/workflow-api";
import type { ReplaceApproverResult } from "@/redux/services/dashboard/workflow-types";
import { PersonPicker } from "../../../components/workflow/person-picker";
import { useUserDirectory } from "../../../components/workflow/use-user-directory";
import { REASON_MAX, replaceProblem, replaceSummary } from "./manage-approvals";

/**
 * Put one person in another's place across the selected requests.
 *
 * "Funke is on leave: move everything waiting on her to Tunde." On each request
 * the server swaps Funke for Tunde on the active stage and on any upcoming
 * stage an admin assigned her to. A request where that cannot happen (Funke has
 * already voted, or Tunde may not work in that request's branch) is skipped
 * with its reason rather than failing the rest, so the sheet ends on what
 * happened to each one.
 *
 * `initialFrom` prefills the person being replaced when the list is filtered to
 * requests waiting on somebody, which is how this is usually reached.
 */
export function ReplaceApproverSheet({
  open,
  onClose,
  instanceIds,
  initialFrom,
  describe,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  instanceIds: string[];
  initialFrom: string;
  /** How a request is named in the skipped list. */
  describe: (instanceId: string) => string;
  /** Called after a run, whatever its outcome, so the caller can clear its selection. */
  onDone: () => void;
}) {
  const { name } = useUserDirectory();
  const [replace, { isLoading }] = useReplaceApproverMutation();
  const [from, setFromValue] = useState(initialFrom);
  const [to, setToValue] = useState("");
  const [reason, setReasonValue] = useState("");
  const [result, setResult] = useState<ReplaceApproverResult | null>(null);
  const [failure, setFailure] = useState("");

  // A refusal is about what was sent; editing any field clears it.
  const setFrom = (v: string) => { setFromValue(v); setFailure(""); };
  const setTo = (v: string) => { setToValue(v); setFailure(""); };
  const setReason = (v: string) => { setReasonValue(v); setFailure(""); };

  const problem = replaceProblem({ from, to, reason, count: instanceIds.length });

  const run = () => {
    if (problem) return;
    setFailure("");
    replace({ from_user: from, to_user: to, instance_ids: instanceIds, reason: reason.trim() })
      .unwrap()
      .then((res) => {
        setResult(res);
        onDone();
      })
      .catch((err) => setFailure(apiErrorMessage(err, "The approver could not be replaced. Try again.")));
  };

  const skipped = result?.results.filter((r) => r.outcome === "skipped") ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-white-02 px-6 pb-4 pt-6">
          <SheetTitle className="text-base font-semibold text-black-01">Replace approver</SheetTitle>
          <SheetDescription className="text-xs text-gray-01">
            {result
              ? "Here is what happened to each request."
              : `On ${instanceIds.length === 1 ? "the selected request" : `the ${instanceIds.length} selected requests`}, one person takes another's place wherever they are still waiting to decide.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {result ? (
            <>
              <div className="flex items-start gap-3 rounded-md border border-white-02 bg-pry-01/40 px-4 py-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-black-01">{replaceSummary(result)}</p>
                  <p className="text-xs text-gray-01">
                    {name(to)} now approves in place of {name(from)} on the requests replaced.
                  </p>
                </div>
              </div>
              {skipped.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-black-01">Skipped</p>
                  <ul className="divide-y divide-white-02 rounded-md border border-white-02">
                    {skipped.map((r) => (
                      <li key={r.instance_id} className="px-4 py-3">
                        <p className="break-words text-sm font-medium text-black-01">{describe(r.instance_id)}</p>
                        <p className="text-xs text-gray-01">{r.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              <PersonPicker
                id="replace-from"
                label="Replace"
                isRequired
                placeholder="Who is being replaced"
                value={from}
                onChange={setFrom}
              />
              <PersonPicker
                id="replace-to"
                label="With"
                isRequired
                activeOnly
                placeholder="Who takes their place"
                exclude={from ? [from] : undefined}
                value={to}
                onChange={setTo}
              />
              <div className="space-y-1.5">
                <label htmlFor="replace-reason" className="text-sm text-black-01 after:pl-1.5 after:text-error after:content-['*']">
                  Reason
                </label>
                <Textarea
                  id="replace-reason"
                  rows={3}
                  maxLength={REASON_MAX}
                  placeholder="E.g. Funke is on leave until 14 October."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <p className="text-xs text-gray-01">Kept with each request's history.</p>
              </div>
              {failure && (
                <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {failure}
                </p>
              )}
            </>
          )}
        </div>

        <SheetFooter className="flex flex-row justify-end gap-3 border-t border-white-02 px-6 py-4">
          {result ? (
            <Button size="lg" onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" size="lg" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button size="lg" onClick={run} disabled={isLoading || !!problem} title={problem ?? undefined}>
                {isLoading ? "Replacing…" : "Replace"}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
