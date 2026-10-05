/**
 * Approval for petty cash returns: the ready-made route a school may adopt.
 *
 * No school has it until it adopts it, and with no route a return posts the
 * moment it is raised. Adopting publishes one step: a second person from the
 * approver group `finance-petty-cash-approver` approves any count more than the
 * school's chosen shortage figure short (N5,000 suggested), and every closure.
 * The group is created empty, so the card says to fill it; until somebody is in
 * it, a return the route stops waits with nobody able to approve it.
 *
 * Reading the route needs `workflow.template.view`. Adopting needs
 * `workflow.template.publish` and a reader who covers the whole school, since a
 * route binds every branch: Mrs Bello, bursar for Ikeja and Lekki, may adopt it;
 * Mrs Adeyemi, Lekki's own bursar, reads it but is not offered Adopt. At a
 * school with one branch, that branch's bursar covers the whole school. A route
 * the school has already given steps is left as configured, and the card shows
 * it as adopted rather than offering to replace it.
 */

import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Users } from "lucide-react";

import { FormField, MoneyInput } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { routesPath } from "@/routes/routes-path";
import { formatMoney } from "@/utils/money";
import {
  useAdoptPettyCashReturnRouteMutation, useGetPettyCashReturnRouteQuery,
} from "@/redux/services/finance/ops-api";
import { P } from "../../../permissions";
import { useReaderReach } from "../../../host";
import { useServesPath } from "../../../lib/host-routes";

/** The shortage the server suggests when the route has not loaded: N5,000 in kobo. */
export const SUGGESTED_SHORTAGE = 500_000;

/** Why Adopt is not offered to this reader, or null when it is. */
export function adoptRefusal({ canPublish, wholeSchool }: { canPublish: boolean; wholeSchool: boolean }): string | null {
  if (!canPublish) return "Adopting it needs permission to publish approval routes.";
  if (!wholeSchool) return "Only someone who covers the whole school can adopt it, because the route applies to every branch.";
  return null;
}

export function PettyCashApprovalRouteCard({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const reach = useReaderReach();
  const servesPath = useServesPath();
  const canView = can(P.VIEW_WORKFLOW_TEMPLATES);
  const { data, isLoading } = useGetPettyCashReturnRouteQuery({ entity }, { skip: !canView });
  const [adopt, { isLoading: adopting }] = useAdoptPettyCashReturnRouteMutation();
  const [threshold, setThreshold] = useState<number | null>(null);
  if (!canView) return null;

  const route = data?.data;
  const shortage = threshold ?? route?.threshold ?? SUGGESTED_SHORTAGE;
  const refusal = adoptRefusal({ canPublish: can(P.PUBLISH_WORKFLOW_TEMPLATE), wholeSchool: reach.wholeSchool });
  const group = route?.approver_group_code ?? "finance-petty-cash-approver";
  const groupsHref = routesPath.PROTECTED.WORKFLOW.APPROVER_GROUPS;
  const routeHref = route?.route_id ? `/workflow/templates/${route.route_id}` : null;

  const doAdopt = async () => {
    try {
      const res = await adopt({ entity, threshold: shortage }).unwrap();
      toast.success(res.message || "Approval route adopted.");
    } catch { /* central */ }
  };

  return (
    <section className="rounded-md bg-white p-4 ring-1 ring-white-02" data-guide="finance-petty-cash.approval-route" aria-label="Approval for petty cash returns">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="size-4" /></span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="font-mont text-sm font-semibold text-black-01">Approval for petty cash returns</h2>
            {isLoading || !route ? (
              <p className="mt-0.5 font-mont text-xs text-gray-05">{isLoading ? "Loading…" : "The route could not be read."}</p>
            ) : route.adopted ? (
              <p className="mt-0.5 font-mont text-xs text-gray-05" data-testid="route-adopted">
                Adopted. A count short by more than the school's figure, and every closure, wait for a second person before they reach the books.
              </p>
            ) : (
              <p className="mt-0.5 font-mont text-xs text-gray-05" data-testid="route-none">
                Not adopted. A return posts as soon as it is raised.
              </p>
            )}
          </div>

          {route && route.adopted ? (
            <div className="rounded-md border border-yellow-01/30 bg-yellow-01/10 px-3 py-2 font-mont text-xs leading-5 text-yellow-01-text" data-testid="route-group-reminder">
              <p>
                The approver group <span className="font-semibold">{group}</span> starts empty. Add the people who approve
                returns, or a return the route stops waits with nobody able to approve it.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {servesPath(groupsHref) ? (
                  <a href={groupsHref} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><Users className="size-3.5" /> Approver groups</a>
                ) : null}
                {routeHref && servesPath(routeHref) ? (
                  <a href={routeHref} className="font-medium text-primary hover:underline">Open the route</a>
                ) : null}
              </div>
            </div>
          ) : null}

          {route && !route.adopted ? (
            <div className="space-y-3 rounded-md border border-gray-03 px-3 py-3">
              <p className="font-mont text-xs font-semibold text-black-01">The ready-made route</p>
              <ul className="list-disc space-y-1 pl-4 font-mont text-xs leading-5 text-gray-01" data-testid="route-stages">
                {route.stages.map((stage) => <li key={stage.code}>{stage.label}, by someone in <span className="font-semibold">{stage.approver_group_code}</span>.</li>)}
                <li>It stops a count more than {formatMoney(shortage, currency)} short, and every closure. Anything else posts at once.</li>
                <li>Adopting creates the approver group <span className="font-semibold">{group}</span> empty. Fill it afterwards.</li>
              </ul>
              {refusal ? (
                <p className="font-mont text-xs text-gray-05" data-testid="adopt-refusal">{refusal}</p>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="sm:w-60">
                    <FormField label="Shortage that needs a second person">
                      <MoneyInput valueKobo={shortage} onChangeKobo={setThreshold} currency={currency} className="[&_input]:h-9" />
                    </FormField>
                  </div>
                  <Button onClick={doAdopt} disabled={adopting} className="gap-1.5"><ShieldCheck className="size-4" />{adopting ? "Adopting…" : "Adopt route"}</Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
