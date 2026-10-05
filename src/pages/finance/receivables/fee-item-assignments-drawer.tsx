/**
 * Who takes one optional fee item.
 *
 * An optional charge (the school bus, a boarding place, a club) is billed only to
 * the customers assigned to it: with "School bus" assigned to Ada alone, the
 * term's run puts the bus on Ada's invoice and on nobody else's. Required items
 * take no assignments, because every customer a run bills pays them.
 *
 * Reading the list needs the fee structure view key; assigning and removing
 * need the edit key, as any change to a structure does.
 */
import { useState } from "react";
import { toast } from "sonner";
import { UserMinus, UserPlus } from "lucide-react";
import { CustomerPicker, DetailDrawer } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { LoadingState, ErrorState, EmptyState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { P } from "../../../permissions";
import {
  useAssignFeeItemMutation, useGetFeeItemAssignmentsQuery, useUnassignFeeItemMutation,
} from "@/redux/services/finance/fees-api";
import type { FeeItem } from "@/redux/services/finance/ar-types";
import { Note } from "./fees-parts";

export function FeeItemAssignmentsDrawer({ entity, structureCode, item, onClose }: {
  entity: string; structureCode: string; item: FeeItem; onClose: () => void;
}) {
  const { can } = useCan();
  const canEdit = can(P.FIN_EDIT_FEE_STRUCTURE);
  const { data, isLoading, isError, refetch } = useGetFeeItemAssignmentsQuery({ entity, structure: structureCode, item: item.id });
  const [adding, setAdding] = useState("");
  const [assign, { isLoading: assigning }] = useAssignFeeItemMutation();
  const [unassign, { isLoading: removing }] = useUnassignFeeItemMutation();
  const customers = data?.data.customers ?? [];

  const add = async () => {
    if (!adding) return;
    try {
      const res = await assign({ entity, structure: structureCode, item: item.id, customers: [adding] }).unwrap();
      toast.success(res.message || "Customer assigned.");
      setAdding("");
    } catch { /* central */ }
  };
  const remove = async (code: string) => {
    try {
      const res = await unassign({ entity, structure: structureCode, item: item.id, customers: [code] }).unwrap();
      toast.success(res.message || "Customer removed.");
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title={`Who takes ${item.description}`}
      description="An optional item is billed only to the customers assigned to it."
      widthClass="sm:max-w-lg"
    >
      <div className="space-y-4">
        {canEdit ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <CustomerPicker entity={entity} value={adding} onChange={setAdding} label="Assign a customer" placeholder="Type a customer name" />
            </div>
            <Button onClick={add} disabled={!adding || assigning} className="gap-1.5"><UserPlus className="size-4" />{assigning ? "Assigning..." : "Assign"}</Button>
          </div>
        ) : null}
        {isLoading ? <LoadingState rows={3} /> : isError ? <ErrorState onRetry={refetch} /> : customers.length === 0 ? (
          <EmptyState title="Nobody takes this yet" message="Assign the customers who take this item. Fee runs leave it off everybody else's invoice." />
        ) : (
          <ul className="divide-y divide-white-02 rounded-md border border-white-02 bg-white">
            {customers.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate font-mont text-sm text-gray-01">{c.name} <span className="text-gray-05">{c.code}</span></span>
                {canEdit ? (
                  <Button variant="ghost" size="sm" disabled={removing} onClick={() => remove(c.code)} className="gap-1 text-destructive"><UserMinus className="size-3.5" /> Remove</Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <Note>A change here applies to the next fee run. Invoices already raised are not changed.</Note>
      </div>
    </DetailDrawer>
  );
}
