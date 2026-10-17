/**
 * Receivables -> Deposits: refundable deposits held for customers.
 *
 * A fee line marked "Refundable deposit" (a caution deposit) credits Deposits
 * held (2170), never revenue, and is kept here per customer. When the customer
 * leaves, the deposit becomes credit to refund; it is set against their unpaid
 * bills first only where the school has switched that on (Settings >
 * Receivables, off by default). A deposit still unclaimed a set number of years
 * after the customer left (six by default) is forfeited to income (4820) by a
 * run that covers every branch, so only a whole-school holder of the key runs it.
 *
 * Returning a customer's deposits by hand needs the branches that hold them; the
 * server refuses a reader who does not work in one of them.
 *
 * Every column and filter here is a `finance.deposit` Field Access field, all
 * of them read-only. A role that may not read one has it left out together with
 * its filter, and the filter is not sent: the server refuses a filter on a
 * field the role cannot read. Returning a customer's deposits names the
 * customer by code, so a role that may not read the customer is not offered it.
 * The action releases every deposit the customer holds whichever row opened it,
 * so a role that may not read the status is still offered it, and the server
 * answers a customer with nothing held.
 * The explanatory note borrows two receivables settings (`finance.settings`)
 * and says only what the role may read of them.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Archive, RotateCcw } from "lucide-react";
import {
  ConfirmActionModal, CustomerPicker, DataTable, DetailDrawer, Money, PostingDateField, Segmented,
  StatusPill, toArray, useFieldAccess, type Column,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { P } from "../../../permissions";
import { useWholeSchoolAccess } from "@/components/finance-ui/whole-school-access";
import { useDates } from "../../../lib/display-prefs";
import {
  useForfeitDepositsMutation, useGetDepositsQuery, useGetReceivablesSettingsQuery, useReleaseDepositsMutation,
} from "@/redux/services/finance/fees-api";
import type { CustomerDeposit, DepositStatus } from "@/redux/services/finance/fees-types";
import { DetailField, Note, useBranchColumn } from "./fees-parts";
import { ListBranchSelect, listBranchArg, useListBranch } from "@/components/finance-ui/list-branch";

/**
 * The one word for each state a deposit takes (vs_finance DepositStatus), read
 * by the status filter, the row pill and the drawer alike. RELEASED is
 * "Returned", after the Return deposits action that puts it there, whether the
 * deposit became credit to refund or was set against bills.
 */
export const DEPOSIT_STATUS: Record<DepositStatus, string> = {
  HELD: "Held", RELEASED: "Returned", FORFEITED: "Forfeited", CANCELLED: "Cancelled",
};
const STATUSES: [DepositStatus | "", string][] = [
  ["", "All"], ...(Object.entries(DEPOSIT_STATUS) as [DepositStatus, string][]),
];
const selectCls = "h-9 rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01";

export function DepositsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const access = useFieldAccess("finance.deposit");
  const settingsAccess = useFieldAccess("finance.settings");
  const { can } = useCan();
  const { canWholeSchool } = useWholeSchoolAccess();
  const branches = useBranchColumn();
  const list = useListBranch();
  const [status, setStatus] = useState<DepositStatus | "">("HELD");
  const [customer, setCustomer] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CustomerDeposit | null>(null);
  const [forfeiting, setForfeiting] = useState(false);
  const statusHidden = access.isHidden("status");
  const customerHidden = access.isHidden("customer_code");
  const params = useMemo(() => ({
    entity, page,
    ...(status && !statusHidden ? { status } : {}),
    ...(customer && !customerHidden ? { customer } : {}),
    ...listBranchArg(list.view),
  }), [entity, page, status, customer, list.view, statusHidden, customerHidden]);
  const { data, isLoading, isFetching, isError, refetch } = useGetDepositsQuery(params);
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const settings = useGetReceivablesSettingsQuery({ entity }, { skip: !can(P.FIN_VIEW_SETTINGS) }).data?.data.settings;

  const columns: Column<CustomerDeposit>[] = [
    ...(access.anyVisible("customer_name", "customer_code") ? [{
      header: "Customer",
      cell: (d: CustomerDeposit) => (
        <span className="font-medium text-gray-01">
          {!access.isHidden("customer_name") ? d.customer_name : null}
          {!access.isHidden("customer_name") && !access.isHidden("customer_code") ? " " : null}
          {!access.isHidden("customer_code") ? <span className="text-gray-05">{d.customer_code}</span> : null}
        </span>
      ),
    }] : []),
    ...(branches.show && list.view.selected === "all" ? [{ header: "Branch", cell: (d: CustomerDeposit) => branches.name(d.branch_id, d.branch_name) }] : []),
    ...(!access.isHidden("invoice_number") ? [{ header: "Invoice", cell: (d: CustomerDeposit) => <span className="tabular-nums text-gray-05">{d.invoice_number}</span> }] : []),
    ...(!access.isHidden("amount") ? [{ header: "Amount", align: "right" as const, cell: (d: CustomerDeposit) => <Money kobo={d.amount ?? 0} currency={currency} align="right" /> }] : []),
    ...(!access.isHidden("claim_opened_on") ? [{ header: "Left on", cell: (d: CustomerDeposit) => <span className="tabular-nums">{d.claim_opened_on ? dates.day(d.claim_opened_on) : "-"}</span> }] : []),
    ...(!statusHidden ? [{ header: "Status", cell: (d: CustomerDeposit) => <StatusPill status={d.status} label={d.status ? DEPOSIT_STATUS[d.status] : undefined} /> }] : []),
  ];
  const offsetKnown = !settingsAccess.isHidden("deposits_offset_unpaid_bills") && settings?.deposits_offset_unpaid_bills !== undefined;
  const yearsKnown = !settingsAccess.isHidden("unclaimed_deposit_years") && settings?.unclaimed_deposit_years !== undefined;
  const years = yearsKnown ? settings?.unclaimed_deposit_years : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          {!statusHidden ? (
            <select value={status} onChange={(e) => { setStatus(e.target.value as DepositStatus | ""); setPage(1); }} className={selectCls} aria-label="Status">
              {STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          ) : null}
          <ListBranchSelect view={list.view} onChange={(v) => { setPage(1); list.choose(v); }} />
          {!customerHidden ? (
            <div className="w-64 max-w-full">
              <CustomerPicker entity={entity} value={customer} onChange={(v) => { setCustomer(v); setPage(1); }} placeholder="Any customer" />
            </div>
          ) : null}
          {customer && !customerHidden ? <Button variant="ghost" size="sm" onClick={() => setCustomer("")}>Clear</Button> : null}
        </div>
        {canWholeSchool(P.FIN_FORFEIT_DEPOSITS) ? (
          <Button variant="outline" onClick={() => setForfeiting(true)} className="gap-1.5"><Archive className="size-4" /> Forfeit unclaimed</Button>
        ) : null}
      </div>
      {settings ? (
        <Note>
          A leaver&apos;s deposit becomes credit to refund
          {offsetKnown && settings.deposits_offset_unpaid_bills ? ", set against their unpaid bills first" : ""}. Deposits unclaimed
          {years ? ` ${years} year${years === 1 ? "" : "s"}` : " past the school's limit"} after the
          customer left can be forfeited to income.
        </Note>
      ) : null}
      <DataTable
        columns={columns} rows={rows} rowKey={(d) => d.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setSelected}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No deposits"
        emptyMessage="A fee line marked as a refundable deposit is held here for its customer."
      />
      <DepositDrawer
        deposit={selected} entity={entity} currency={currency}
        offsetAllowed={offsetKnown && settings?.deposits_offset_unpaid_bills === true}
        onClose={() => setSelected(null)}
      />
      <ForfeitModal open={forfeiting} onClose={() => setForfeiting(false)} entity={entity} years={years} />
    </div>
  );
}

function DepositDrawer({ deposit, entity, currency, offsetAllowed, onClose }: {
  deposit: CustomerDeposit | null; entity: string; currency?: string | null; offsetAllowed: boolean; onClose: () => void;
}) {
  const dates = useDates();
  const access = useFieldAccess("finance.deposit", deposit);
  const { can } = useCan();
  const branches = useBranchColumn();
  const [confirming, setConfirming] = useState(false);
  const [mode, setMode] = useState<"credit" | "offset">("credit");
  const [release, { isLoading }] = useReleaseDepositsMutation();
  if (!deposit) return null;

  const customerNamed = !access.isHidden("customer_name");
  const customerCoded = !access.isHidden("customer_code");
  const invoiced = !access.isHidden("invoice_number");
  const statusHidden = access.isHidden("status");
  const mayReturn = customerCoded && !!deposit.customer_code && (statusHidden || deposit.status === "HELD") && can(P.FIN_SETTLE_DEPOSITS);
  const facts = branches.show || access.anyVisible("amount", "status", "invoice_number", "claim_opened_on", "release_note_number");

  const submit = async () => {
    try {
      const res = await release({ entity, customer: deposit.customer_code!, offset: mode === "offset" }).unwrap();
      toast.success(res.message || "Deposits returned.");
      setConfirming(false);
      onClose();
    } catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer
        open onOpenChange={(o) => (o ? undefined : onClose())}
        title={customerNamed ? `${deposit.customer_name}'s deposit` : "Deposit"}
        description={[customerCoded ? deposit.customer_code : null, invoiced ? deposit.invoice_number : null].filter(Boolean).join(" · ") || undefined}
        widthClass="sm:max-w-lg"
        footer={mayReturn ? (
          <Button onClick={() => setConfirming(true)} className="gap-1.5"><RotateCcw className="size-4" /> Return deposits</Button>
        ) : undefined}
      >
        {facts ? (
          <div className="grid grid-cols-2 gap-4">
            {!access.isHidden("amount") ? <DetailField label="Amount"><Money kobo={deposit.amount ?? 0} currency={currency} /></DetailField> : null}
            {!statusHidden ? <DetailField label="Status"><StatusPill status={deposit.status} label={deposit.status ? DEPOSIT_STATUS[deposit.status] : undefined} /></DetailField> : null}
            {branches.show ? <DetailField label="Branch">{branches.name(deposit.branch_id, deposit.branch_name)}</DetailField> : null}
            {invoiced ? <DetailField label="Billed on">{deposit.invoice_number}</DetailField> : null}
            {!access.isHidden("claim_opened_on") ? <DetailField label="Customer left on">{deposit.claim_opened_on ? dates.day(deposit.claim_opened_on) : "Still a customer"}</DetailField> : null}
            {!access.isHidden("release_note_number") && deposit.release_note_number ? <DetailField label="Returned by">{deposit.release_note_number}</DetailField> : null}
          </div>
        ) : null}
      </DetailDrawer>
      <ConfirmActionModal
        open={confirming} onOpenChange={(o) => !o && setConfirming(false)}
        title={customerNamed ? `Return ${deposit.customer_name}'s deposits?` : "Return this customer's deposits?"}
        description="Releases every deposit this customer holds, one credit note per branch. The part of a deposit its own bill never collected is cancelled; the rest becomes credit to refund."
        confirmText="Return deposits" loading={isLoading} onConfirm={submit}
      >
        {offsetAllowed ? (
          <Segmented
            label="What happens to it"
            value={mode}
            onChange={(v) => setMode(v as "credit" | "offset")}
            options={[["credit", "Credit to refund"], ["offset", "Set against unpaid bills first"]]}
          />
        ) : null}
      </ConfirmActionModal>
    </>
  );
}

function ForfeitModal({ open, onClose, entity, years }: { open: boolean; onClose: () => void; entity: string; years?: number }) {
  const dates = useDates();
  const [asOf, setAsOf] = useState("");
  const [forfeit, { isLoading }] = useForfeitDepositsMutation();
  const value = asOf || dates.today();
  const submit = async () => {
    try {
      const res = await forfeit({ entity, as_of: value }).unwrap();
      toast.success(res.message || "Unclaimed deposits forfeited.");
      setAsOf("");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal
      open={open} onOpenChange={(o) => !o && onClose()}
      title="Forfeit unclaimed deposits?"
      description={`Moves every deposit still unclaimed ${years ? `${years} year${years === 1 ? "" : "s"}` : "the school's limit"} after its customer left to Forfeited deposit income, one journal per branch.`}
      confirmText="Forfeit" destructive loading={isLoading} onConfirm={submit} confirmDisabled={value > dates.today()}
    >
      <PostingDateField label="As of" entity={entity} value={value} onChange={setAsOf} />
    </ConfirmActionModal>
  );
}
