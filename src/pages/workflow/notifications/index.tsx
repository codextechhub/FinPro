import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PageShell } from "@/components/layout/page-shell";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { cn } from "@/lib/utils";
import { P } from "@/permissions";
import { usePermissions } from "@/hooks/use-permissions";
import { apiErrorMessage } from "@/utils/api-errors";
import {
  useGetWorkflowNotificationSettingQuery,
  useSetWorkflowNotificationSettingMutation,
} from "@/redux/services/dashboard/workflow-api";

/** The moments an approval writes to somebody, in the order a request meets them. */
const MOMENTS = [
  "A step activates, and the people who can approve it are told it is waiting.",
  "A request is sent back for changes, and whoever raised it is told why.",
  "A request is rejected, and whoever raised it is told.",
  "A request is fully approved, and whoever raised it is told.",
];

/**
 * Whether this school's approvals tell people what is happening.
 *
 * One answer for the school, not four questions on every template. The template
 * screen used to ask which of these four moments should notify, on every path,
 * which was both more decisions than anybody wants to take twice and a trap: a
 * template nobody had configured notified on everything, and the moment one of
 * the four was set the other three counted as off - so a school could stop
 * telling people their request was rejected without ever choosing to.
 *
 * Switching this off silences all four. It changes nothing about the approvals
 * themselves: a request still waits for the same decision from the same people,
 * who will find it in their own queue.
 */
export default function WorkflowNotifications() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(P.MANAGE_WORKFLOW_TEMPLATES);
  const { data, isLoading } = useGetWorkflowNotificationSettingQuery();
  const [save, { isLoading: saving }] = useSetWorkflowNotificationSettingMutation();
  // Notifying is what the engine does when a school has chosen nothing, so the
  // switch reads as on while the answer is still loading.
  const enabled = data?.enabled ?? true;

  const choose = (next: boolean) => {
    save(next)
      .unwrap()
      .then(() =>
        toast.success(
          next
            ? "Approvals will tell people what is happening."
            : "Approvals will not notify anybody.",
        ),
      )
      .catch((err) => toast.error(apiErrorMessage(err, "That could not be changed.")));
  };

  return (
    <PageShell className="space-y-5 text-black-01">
      <div>
        <p className="font-semibold font-mont text-gray-01">Notifications</p>
        <p className="mt-0.5 text-xs text-gray-01">
          Whether approvals tell people what is happening. One answer for the whole
          school, rather than a question on every approval path.
        </p>
      </div>

      <div className={cn(INFORMATION_CARD_SURFACE, "max-w-2xl rounded-md p-5")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-black-01">
              <BellRing className="size-4 text-primary" />
              Tell people what is happening
            </p>
            <p className="mt-1 text-xs text-gray-01">
              {isLoading
                ? "Reading this school's answer…"
                : enabled
                  ? "On. Approvers hear when something needs them, and whoever raised a request hears how it ended."
                  : "Off. Nobody is written to. Approvals still run, and approvers find what is waiting in their own queue."}
            </p>
          </div>
          {isLoading ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <Switch
              checked={enabled}
              disabled={!canManage || saving}
              onCheckedChange={choose}
              aria-label="Tell people what is happening"
            />
          )}
        </div>

        <div className="mt-4 border-t border-white-02 pt-4">
          <p className="text-xs font-medium text-black-01">
            {enabled ? "What people are told" : "What people would be told"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {MOMENTS.map((moment) => (
              <li key={moment} className="flex gap-2 text-xs text-gray-01">
                <span aria-hidden className="text-gray-05">·</span>
                <span className="min-w-0">{moment}</span>
              </li>
            ))}
          </ul>
        </div>

        {!canManage && (
          <p className="mt-4 text-xs text-gray-01">
            Changing this needs the same access as changing an approval path.
          </p>
        )}
      </div>
    </PageShell>
  );
}
