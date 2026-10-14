/**
 * Bank accounts: where each member of staff is paid when payroll goes through
 * Paystack.
 *
 * Lists the accounts the reader reaches: staff name, bank, account number, the
 * name Paystack returned for the account, and where the check stands in plain
 * words (staff-bank-model.ts). Saving a bank or an account number has Paystack
 * name the account's holder; a name that does not match the staff member waits
 * for a second person, who is neither the one who made the change nor the staff
 * member, before any pay goes there. Check again asks Paystack once more about
 * an account it could not reach or find.
 *
 * A section of Payroll, so it is reached with `finance.payrollrun.view` and
 * shown to a holder of `finance.staff_bank.view`. Keys: `finance.staff_bank.view`
 * to read, `.update` to add or edit an account or check it again, `.confirm` to
 * confirm one. Confirm is shown only where the server's `can_confirm` says the
 * reader may confirm that account now. Adding is a POST that the server refuses
 * (409) when the person already has an account, and editing a PUT that it refuses
 * when there is none, so an add never replaces an account. The staff offered to
 * add are the server's list of people on the payroll with no account, which
 * needs `.update` alone.
 *
 * Field Access (`finance.staff_bank`): the staff name, the bank, the account
 * number, the holder's name, the check status, and who changed and confirmed an
 * account are separate switches. A hidden one has no column, no line in the
 * drawer and no control; a read-only one is greyed and never sent. Staff are
 * listed through the branches the reader reaches, so another branch's staff
 * never appear.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Landmark, Pencil, Plus, RefreshCw } from "lucide-react";

import {
  AccessField, ConfirmActionModal, DataTable, DetailDrawer, FormField, fieldWriteErrors, toArray, useFieldAccess,
  type Column, type FieldErrors,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { SearchSelect } from "@/components/custom/search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useConfirmStaffBankAccountMutation,
  useGetStaffBankAccountsQuery,
  useGetStaffBankBanksQuery,
  useAddStaffBankAccountMutation,
  useGetStaffWithoutBankAccountQuery,
  useSaveStaffBankAccountMutation,
  useVerifyStaffBankAccountMutation,
} from "@/redux/services/finance/payroll-paystack-api";
import type { StaffBankAccount } from "@/redux/services/finance/payroll-paystack-types";
import { cn } from "@/lib/utils";
import { P } from "../../permissions";
import { usePaymentBranchColumn } from "./payment-branches";
import { useDates } from "../../lib/display-prefs";
import { fieldRefusals } from "./payroll-refusals";
import {
  STAFF_BANK_FILTERS, bankChanges, bankFormOf, bankFormProblem, confirmOffer, offersCheckAgain, staffBankWord,
  type BankForm,
} from "./staff-bank-model";

const RESOURCE = "finance.staff_bank";
const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";

function StatePill({ state }: { state: StaffBankAccount["verification_state"] }) {
  const word = staffBankWord(state);
  return word ? <span className={cn(PILL, word.tone)}>{word.label}</span> : null;
}

export function StaffBankAccountsTab({ entity }: { entity: string }) {
  const { can } = useCan();
  const access = useFieldAccess(RESOURCE);
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ employeeId: number; name: string; account: StaffBankAccount | null } | null>(null);
  const [adding, setAdding] = useState(false);
  const { data, isLoading, isFetching, isError, refetch } = useGetStaffBankAccountsQuery({ entity, page, ...(state ? { state } : {}) });
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const open = rows.find((row) => row.employee_id === openId) ?? null;
  const mayUpdate = can(P.FIN_UPDATE_STAFF_BANK);

  const columns: Column<StaffBankAccount>[] = [
    ...(!access.isHidden("employee_name") ? [{ header: "Staff", cell: (r: StaffBankAccount) => <span className="font-semibold text-black-01">{r.employee_name || "-"}</span> }] : []),
    ...(!access.isHidden("bank_name") ? [{ header: "Bank", cell: (r: StaffBankAccount) => r.bank_name || r.bank_code || "-" }] : []),
    ...(!access.isHidden("account_number") ? [{ header: "Account number", cell: (r: StaffBankAccount) => <span className="tabular-nums">{r.account_number || "-"}</span> }] : []),
    ...(!access.isHidden("resolved_account_name") ? [{ header: "Name Paystack returned", cell: (r: StaffBankAccount) => r.resolved_account_name || "-" }] : []),
    ...(!access.isHidden("verification_state") ? [{ header: "Check", cell: (r: StaffBankAccount) => <StatePill state={r.verification_state} /> }] : []),
  ];

  return (
    <div className="space-y-4" data-guide="finance-staff-bank.accounts">
      <p className="font-mont text-xs leading-5 text-gray-05">
        Staff are paid through Paystack into the account saved here. Paystack names each account&apos;s holder; a name that does not match the staff member waits for a second person before anything is paid to it.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!access.isHidden("verification_state") ? (
          <select aria-label="Show accounts" value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}
            className="h-9 rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01">
            {STAFF_BANK_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        ) : <span />}
        {mayUpdate ? (
          <Button onClick={() => setAdding(true)} className="gap-1.5"><Plus className="size-4" /> Add a staff account</Button>
        ) : null}
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(r) => setOpenId(r.employee_id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle={state ? "No accounts here" : "No staff bank accounts yet"}
        emptyMessage={state ? "No account is in this state." : "Add the bank account of each member of staff who is paid through Paystack."} />

      <AccountDrawer account={open} entity={entity} onClose={() => setOpenId(null)}
        onEdit={(account) => { setOpenId(null); setEditing({ employeeId: account.employee_id, name: account.employee_name ?? "", account }); }} />
      {editing ? <AccountFormDrawer entity={entity} employeeId={editing.employeeId} name={editing.name} account={editing.account} onClose={() => setEditing(null)} /> : null}
      {adding ? <AddAccountDrawer entity={entity} onClose={() => setAdding(false)}
        onPick={(employeeId, name) => { setAdding(false); setEditing({ employeeId, name, account: null }); }} /> : null}
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <div className="mt-1 break-words font-mont text-sm font-semibold text-black-01">{children}</div>
    </div>
  );
}

/** One account, with what may be done to it. */
export function AccountDrawer({ account, entity, onClose, onEdit }: {
  account: StaffBankAccount | null; entity: string; onClose: () => void; onEdit: (account: StaffBankAccount) => void;
}) {
  const dates = useDates();
  const { can } = useCan();
  const access = useFieldAccess(RESOURCE, account);
  const [verify, { isLoading: checking }] = useVerifyStaffBankAccountMutation();
  const [confirm, { isLoading: confirming }] = useConfirmStaffBankAccountMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (!account) return null;

  const word = staffBankWord(account.verification_state);
  const offer = confirmOffer(account, can(P.FIN_CONFIRM_STAFF_BANK));
  const mayUpdate = can(P.FIN_UPDATE_STAFF_BANK);
  const bankWritable = !access.isReadOnly("bank_code") || !access.isReadOnly("account_number");

  const doVerify = async () => {
    try { toast.success((await verify({ entity, employee: account.employee_id }).unwrap()).message || "Checked again."); } catch { /* central */ }
  };
  const doConfirm = async () => {
    try {
      toast.success((await confirm({ entity, employee: account.employee_id }).unwrap()).message || "Account confirmed.");
      setConfirmOpen(false);
    } catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
        title={account.employee_name || "Bank account"} description={account.bank_name || undefined} widthClass="sm:max-w-lg"
        footer={
          <>
            {mayUpdate && bankWritable && !access.isHidden("account_number") ? (
              <Button variant="outline" onClick={() => onEdit(account)} className="gap-1.5"><Pencil className="size-4" /> Edit</Button>
            ) : null}
            {mayUpdate && offersCheckAgain(account) ? (
              <Button variant="outline" disabled={checking} onClick={doVerify} className="gap-1.5">
                <RefreshCw className={cn("size-4", checking && "animate-spin")} />{checking ? "Checking…" : "Check again"}
              </Button>
            ) : null}
            {offer.offered ? (
              <Button onClick={() => setConfirmOpen(true)} className="gap-1.5"><CheckCircle2 className="size-4" /> Confirm</Button>
            ) : null}
          </>
        }>
        <div className="space-y-5">
          {word ? (
            <section data-testid="staff-bank-state" className="space-y-1.5 rounded-md border border-white-02 bg-white p-4">
              <StatePill state={account.verification_state} />
              <p className="font-mont text-xs leading-5 text-gray-05">{word.detail}</p>
              {account.verification_note ? <p className="font-mont text-xs leading-5 text-gray-05">{account.verification_note}</p> : null}
            </section>
          ) : null}
          {offer.hint ? <p role="note" data-testid="staff-bank-confirm-hint" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-900">{offer.hint}</p> : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!access.isHidden("bank_name") ? <Line label="Bank">{account.bank_name || account.bank_code || "-"}</Line> : null}
            {!access.isHidden("account_number") ? <Line label="Account number"><span className="tabular-nums">{account.account_number || "-"}</span></Line> : null}
            {!access.isHidden("resolved_account_name") ? <Line label="Name Paystack returned">{account.resolved_account_name || "-"}</Line> : null}
            {!access.isHidden("changed_by_name") ? (
              <Line label="Last changed by">{[account.changed_by_name, account.updated_at ? dates.day(account.updated_at) : null].filter(Boolean).join(" · ") || "-"}</Line>
            ) : null}
            {!access.isHidden("confirmed_by_name") && account.confirmed_by_name ? (
              <Line label="Confirmed by">{[account.confirmed_by_name, account.confirmed_at ? dates.day(account.confirmed_at) : null].filter(Boolean).join(" · ")}</Line>
            ) : null}
          </div>
        </div>
      </DetailDrawer>
      <ConfirmActionModal open={confirmOpen} onOpenChange={setConfirmOpen} loading={confirming} onConfirm={doConfirm}
        title={`Confirm ${account.employee_name || "this"} account?`} confirmText="Confirm account"
        description={`${account.resolved_account_name ? `Paystack names ${account.resolved_account_name} as the holder` : "The account holder's name"}, which does not match the staff member. Confirm only after you have asked ${account.employee_name || "the staff member"} that the account is theirs. Payroll will then pay into it.`} />
    </>
  );
}

/** Bank and account number for one member of staff. */
export function AccountFormDrawer({ entity, employeeId, name, account, onClose }: {
  entity: string; employeeId: number; name: string; account: StaffBankAccount | null; onClose: () => void;
}) {
  const access = useFieldAccess(RESOURCE, account);
  const [form, setForm] = useState<BankForm>(bankFormOf(account));
  const [errors, setErrors] = useState<FieldErrors | null>(null);
  const banks = useGetStaffBankBanksQuery({ entity });
  const [add, adding] = useAddStaffBankAccountMutation();
  const [save, saving] = useSaveStaffBankAccountMutation();
  const isLoading = adding.isLoading || saving.isLoading;
  const options = toArray(banks.data?.data).map((bank) => ({ value: bank.code, label: bank.name }));
  const creating = account === null;
  const problem = bankFormProblem(form);
  const changes = access.writableOnly(bankChanges(account, form), { creating });
  const nothingToSave = Object.keys(changes).length === 0;

  const submit = async () => {
    if (problem || nothingToSave) return;
    setErrors(null);
    try {
      const res = await (creating ? add : save)({ entity, employee: employeeId, ...changes }).unwrap();
      toast.success(res.message || "Bank account saved.");
      if (res.data?.verification_state === "NEEDS_CONFIRMATION") {
        toast.warning("Paystack named a different holder. A second person must confirm this account before staff are paid into it.");
      }
      onClose();
    } catch (error) {
      setErrors(fieldWriteErrors(error) ?? (Object.keys(fieldRefusals(error)).length ? fieldRefusals(error) : null));
    }
  };

  return (
    <DetailDrawer open onOpenChange={(o) => (o || isLoading ? undefined : onClose())}
      title={creating ? "Add a bank account" : "Change the bank account"} description={name || undefined} widthClass="sm:max-w-md"
      footer={
        <>
          <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
          <Button disabled={isLoading || !!problem || nothingToSave} onClick={submit} className="gap-1.5">
            <Landmark className="size-4" />{isLoading ? "Saving…" : "Save and check"}
          </Button>
        </>
      }>
      <div className="space-y-4">
        <p className="font-mont text-xs leading-5 text-gray-05">Paystack is asked who holds the account when you save. A change to the bank or the number starts the check again.</p>
        <AccessField access={access} name="bank_code" label="Bank" required creating={creating} errors={errors}>
          <SearchSelect options={options} value={form.bankCode} loading={banks.isLoading} placeholder="Choose the bank"
            onChange={(e) => setForm((f) => ({ ...f, bankCode: e.target.value, bankName: options.find((o) => o.value === e.target.value)?.label ?? "" }))} />
        </AccessField>
        <AccessField access={access} name="account_number" label="Account number" required creating={creating} errors={errors}>
          <Input aria-label="Account number" inputMode="numeric" maxLength={13} value={form.accountNumber} className="bg-white tabular-nums"
            onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} />
        </AccessField>
        {problem && (form.bankCode || form.accountNumber) ? <p className="font-mont text-[11px] text-gray-05">{problem}</p> : null}
      </div>
    </DetailDrawer>
  );
}

/** Staff on the payroll who have no account yet, as the server lists them, searched by name. */
function AddAccountDrawer({ entity, onClose, onPick }: {
  entity: string; onClose: () => void; onPick: (employeeId: number, name: string) => void;
}) {
  const branchColumn = usePaymentBranchColumn();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState("");
  const term = useDebounce(search.trim(), 300);
  const missing = useGetStaffWithoutBankAccountQuery({ entity, page_size: 50, ...(term ? { search: term } : {}) });
  const staff = toArray(missing.data?.data);
  const options = staff.map((row) => ({
    value: String(row.employee_id),
    label: [row.employee_name ?? `Staff ${row.employee_id}`, branchColumn.show ? row.branch_name : null].filter(Boolean).join(" · "),
  }));
  const chosen = staff.find((row) => String(row.employee_id) === picked);
  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())} title="Add a staff account"
      description="Choose the member of staff, then their bank and account number." widthClass="sm:max-w-md"
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!chosen} onClick={() => chosen && onPick(chosen.employee_id, chosen.employee_name ?? "")}>Continue</Button>
      </>}>
      <FormField label="Staff member" required>
        <SearchSelect options={options} value={picked} loading={missing.isLoading} placeholder="Search staff with no account"
          onChange={(e) => setPicked(e.target.value)} onSearchChange={setSearch} />
      </FormField>
      {!missing.isLoading && staff.length === 0 && !term ? <p className="mt-3 font-mont text-xs text-gray-05">Everyone on the payroll already has an account saved.</p> : null}
    </DetailDrawer>
  );
}
