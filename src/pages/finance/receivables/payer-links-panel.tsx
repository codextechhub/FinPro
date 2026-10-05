/**
 * The "Payers" tab of a customer's record: who this customer pays for, and who
 * pays for them.
 *
 * Mr Okafor's payer account is linked to Ada and Emeka, so one payment from him
 * can be split across both children's bills. A child may have more than one
 * payer (a parent and a sponsor). Ending a link switches it off and keeps it,
 * so payments already split under it keep their shares; linking the pair again
 * switches it back on. A fee run that bills every active customer leaves a
 * payer's own account out.
 *
 * Changing links needs the customer update key, as any change to a customer
 * record does. Links are listed only where the reader can see both sides.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Link2, Unlink } from "lucide-react";
import { ConfirmActionModal, CustomerPicker, StatusPill, toArray } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { P } from "../../../permissions";
import {
  useCreatePayerLinkMutation, useEndPayerLinkMutation, useGetPayerLinksQuery,
} from "@/redux/services/finance/fees-api";
import type { PayerLink } from "@/redux/services/finance/fees-types";
import type { Customer } from "@/redux/services/finance/ar-types";

export function PayerLinksPanel({ entity, customer }: { entity: string; customer: Customer }) {
  const { can } = useCan();
  const canChange = can(P.FIN_UPDATE_CUSTOMER);
  const paysFor = useGetPayerLinksQuery({ entity, payer: customer.code });
  const paidBy = useGetPayerLinksQuery({ entity, customer: customer.code });
  const [adding, setAdding] = useState("");
  const [ending, setEnding] = useState<PayerLink | null>(null);
  const [link, { isLoading: linking }] = useCreatePayerLinkMutation();
  const [end, { isLoading: unlinking }] = useEndPayerLinkMutation();

  const addLink = async () => {
    if (!adding) return;
    try {
      const res = await link({ entity, payer: customer.code, customer: adding }).unwrap();
      toast.success(res.message || "Linked.");
      setAdding("");
    } catch { /* central */ }
  };
  const endLink = async () => {
    if (!ending) return;
    try {
      const res = await end({ entity, id: ending.id }).unwrap();
      toast.success(res.message || "Link ended.");
      setEnding(null);
    } catch { /* central */ }
  };

  if (paysFor.isLoading || paidBy.isLoading) return <LoadingState rows={3} />;
  if (paysFor.isError || paidBy.isError) return <ErrorState onRetry={() => { paysFor.refetch(); paidBy.refetch(); }} />;
  const forRows = toArray(paysFor.data?.data);
  const byRows = toArray(paidBy.data?.data);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="font-mont text-sm font-semibold text-black-01">Pays for</p>
        {forRows.length === 0 ? (
          <p className="font-mont text-xs text-gray-05">{customer.name} does not pay for anyone.</p>
        ) : (
          <LinkList rows={forRows} side="customer" canChange={canChange} onEnd={setEnding} />
        )}
        {canChange ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <CustomerPicker entity={entity} value={adding} onChange={setAdding} label="Add a customer they pay for" placeholder="Type a customer name" />
            </div>
            <Button onClick={addLink} disabled={!adding || adding === customer.code || linking} className="gap-1.5"><Link2 className="size-4" />{linking ? "Linking..." : "Link"}</Button>
          </div>
        ) : null}
        {adding && adding === customer.code ? <p className="font-mont text-[11px] text-destructive">A customer cannot be its own payer.</p> : null}
      </section>

      <section className="space-y-2">
        <p className="font-mont text-sm font-semibold text-black-01">Paid by</p>
        {byRows.length === 0 ? (
          <p className="font-mont text-xs text-gray-05">Nobody is linked as paying for {customer.name}.</p>
        ) : (
          <LinkList rows={byRows} side="payer" canChange={canChange} onEnd={setEnding} />
        )}
      </section>

      <ConfirmActionModal
        open={ending !== null} onOpenChange={(o) => !o && setEnding(null)}
        title="End this link?"
        description={ending ? `${ending.payer.name} will no longer pay for ${ending.customer.name}. Payments already made keep their shares, and the link can be switched back on by linking them again.` : undefined}
        confirmText="End link" destructive loading={unlinking} onConfirm={endLink}
      />
    </div>
  );
}

function LinkList({ rows, side, canChange, onEnd }: {
  rows: PayerLink[]; side: "payer" | "customer"; canChange: boolean; onEnd: (link: PayerLink) => void;
}) {
  return (
    <ul className="divide-y divide-white-02 rounded-md border border-white-02 bg-white">
      {rows.map((row) => {
        const party = row[side];
        return (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0 font-mont text-sm text-gray-01">
              {party.name} <span className="text-gray-05">{party.code}</span>
            </span>
            <span className="flex items-center gap-2">
              <StatusPill status={row.is_active ? "ACTIVE" : "ENDED"} />
              {canChange && row.is_active ? (
                <Button variant="ghost" size="sm" onClick={() => onEnd(row)} className="gap-1 text-destructive"><Unlink className="size-3.5" /> End</Button>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
