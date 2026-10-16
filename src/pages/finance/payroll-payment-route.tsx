/**
 * Finance Settings, Payroll: how staff are paid once a run is posted.
 *
 * Two routes. From the school's bank is the ordinary one: the bursar pays each
 * branch's staff from that branch's own bank account and records it against the
 * run. Through Paystack sends each person's net pay from the money Paystack
 * holds for their branch; it is open only while the school's online payments
 * are held for it, and the server says why when they are not, in words shown
 * beside the option. The choice applies to the next payment of any posted run,
 * and binds every branch, so only somebody who covers the whole school changes
 * it.
 *
 * The route is a `finance.settings` Field Access field: a reader who may not
 * see it gets no panel, and one who may not change it sees it greyed.
 */

import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AccessField, fieldWriteErrors, useFieldAccess, type FieldErrors } from "@/components/finance-ui";
import { SettingsPanel } from "@/components/settings/settings-layout";
import { useUpdateFinancePayrollSettingsMutation } from "@/redux/services/finance/payroll-api";
import type { FinancePayrollSettingsValues } from "@/redux/services/finance/payroll-types";
import type { PayrollPaymentRoute } from "@/redux/services/finance/payroll-paystack-types";
import { providerInfo } from "./payment-providers";

/** The two routes in plain words, in the order they are offered. */
export function paymentRouteChoices(provider: string): { value: PayrollPaymentRoute; label: string; detail: string }[] {
  return [
    {
      value: "OWN_BANK",
      label: "From the school's bank",
      detail: "The bursar pays each branch's staff from that branch's own bank account, then records it against the run.",
    },
    {
      value: "PAYSTACK",
      label: `Through ${provider}`,
      detail: `Paying a run sends each person's net pay from the money ${provider} holds for their branch. Staff need a checked bank account, kept under Bank accounts in Payroll.`,
    },
  ];
}

/**
 * Whether a route can be chosen. The current route always can, so a school
 * already on Paystack whose online money is no longer held can still step back.
 */
export function routeSelectable(route: PayrollPaymentRoute, current: PayrollPaymentRoute, paystackAvailable: boolean): boolean {
  return route === "OWN_BANK" || route === current || paystackAvailable;
}

export function PayrollPaymentRouteSection({ entityCode, values, canUpdate, readOnlyReason }: {
  entityCode: string;
  values: FinancePayrollSettingsValues;
  canUpdate: boolean;
  readOnlyReason: string | null;
}) {
  const saved: PayrollPaymentRoute | undefined = values.payment_route;
  const [route, setRoute] = useState<PayrollPaymentRoute>(saved ?? "OWN_BANK");
  const [update, state] = useUpdateFinancePayrollSettingsMutation();
  const access = useFieldAccess("finance.settings", values);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  if (!saved || access.isHidden("payment_route")) return null;
  const editable = canUpdate && !access.isReadOnly("payment_route");

  const provider = providerInfo("PAYSTACK").label;
  const available = values.paystack_route_available !== false;
  const reason = values.paystack_route_unavailable_reason;
  const dirty = route !== saved;

  const save = async () => {
    try {
      const response = await update({ entity: entityCode, payment_route: route }).unwrap();
      setDenied(null);
      toast.success(response.message || "How staff are paid is saved.");
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  return (
    <SettingsPanel title="How staff are paid" description="What happens when a posted payroll run is paid. It applies to the next payment of any posted run.">
      <AccessField access={access} name="payment_route" errors={denied}>
      <fieldset className="space-y-0" disabled={!editable}>
        <legend className="sr-only">How staff are paid</legend>
        {paymentRouteChoices(provider).map((choice) => {
          const selectable = routeSelectable(choice.value, saved, available);
          const closed = choice.value === "PAYSTACK" && !available;
          return (
            <label key={choice.value} className="flex cursor-pointer items-start gap-3 px-4 py-4 sm:px-5">
              <input
                type="radio" name="payroll-payment-route" value={choice.value} checked={route === choice.value}
                disabled={!editable || !selectable} onChange={() => setRoute(choice.value)} className="mt-1"
              />
              <span className="min-w-0">
                <span className="block font-mont text-sm font-medium text-gray-01">{choice.label}</span>
                <span className="mt-0.5 block font-mont text-xs leading-5 text-gray-05">{choice.detail}</span>
                {closed && reason ? <span data-testid="payment-route-reason" className="mt-1.5 block font-mont text-xs leading-5 text-amber-900">{reason}</span> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      </AccessField>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <p className="font-mont text-xs text-gray-05">{readOnlyReason ?? (canUpdate ? "" : "You have read-only access.")}</p>
        <Button onClick={save} disabled={!editable || !dirty || state.isLoading}>
          <Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save how staff are paid"}
        </Button>
      </div>
    </SettingsPanel>
  );
}
