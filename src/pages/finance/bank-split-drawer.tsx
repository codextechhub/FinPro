/**
 * Split a shared bank account into one bank account per branch.
 *
 * Bright Star's GTBank account was used by Ikeja and Lekki alike and belongs to
 * neither. The bursars agree how much of its balance each branch takes. The
 * split retires the shared account (its statements and history stay, read
 * only) and opens a bank account and ledger for each branch named, carrying
 * its agreed share in. The shares must add up exactly to the account's book
 * balance; a branch's share may be an overdraft.
 *
 * A branch's own entries on the shared account rarely come to its agreed share.
 * The bursar chooses what the difference becomes: a debt between branches (the
 * default, booked as inter-branch transfers listed in the register and on the
 * balances) or a permanent move through retained earnings. The result lists the
 * transfers it booked, each linked to the register.
 *
 * It changes several branches at once, so it is offered only to a whole-school
 * reader holding the bank account update key, and only on a live account no
 * branch owns, at a school with more than one branch.
 */

import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ArrowRight, Split } from "lucide-react";

import { ConfirmActionModal, DetailDrawer, FormField, Money, MoneyInput, PostingDateField } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { useSplitBankAccountByBranchMutation } from "@/redux/services/finance/interbranch-api";
import type { BankSplitDifferenceTreatment, BankSplitResult } from "@/redux/services/finance/interbranch-types";
import type { BankAccount } from "@/redux/services/finance/ops-types";
import { DIFFERENCE_TREATMENTS, splitProblems, splitTotals, type SplitRow } from "./bank-split-model";
import { transferLink } from "./inter-branch/links";
import { Note } from "./inter-branch/parts";
import type { InterBranchReader } from "./inter-branch/use-inter-branch";

/** Whether this reader is offered the split on `account`. */
export function canSplitAccount(account: Pick<BankAccount, "branch_id" | "is_active">, { multiBranch, wholeSchool, canUpdate }: {
  multiBranch: boolean; wholeSchool: boolean; canUpdate: boolean;
}): boolean {
  return multiBranch && wholeSchool && canUpdate && account.is_active && account.branch_id == null;
}

interface EditRow extends SplitRow {
  include: boolean;
  overdraft: boolean;
  share: number;
}

function startingRows(account: BankAccount, reader: InterBranchReader): EditRow[] {
  return reader.branches.map((b, index) => ({
    branch: String(b.id),
    include: true,
    overdraft: false,
    share: 0,
    opening_balance: 0,
    bank_account_name: `${account.name} - ${b.name}`,
    ledger_account_code: "",
    ledger_account_name: `${account.gl_account_name || account.name} - ${b.name}`,
    is_primary: index === 0 && account.is_primary,
    is_primary_collection: false,
  }));
}

export function BankSplitDrawer({ account, bookBalance, entity, currency, reader, onClose }: {
  account: BankAccount;
  bookBalance: number;
  entity: string;
  currency?: string | null;
  reader: InterBranchReader;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<EditRow[]>(() => startingRows(account, reader));
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [treatment, setTreatment] = useState<BankSplitDifferenceTreatment>("DEBT");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BankSplitResult | null>(null);
  const [split, { isLoading }] = useSplitBankAccountByBranchMutation();

  const chosen: SplitRow[] = rows.filter((r) => r.include).map((r) => ({ ...r, opening_balance: r.overdraft ? -r.share : r.share }));
  const totals = splitTotals(bookBalance, chosen);
  const ledgerPrefix = (account.gl_account || "").slice(0, 1);
  const problems = splitProblems({ rows: chosen, bookBalance, ledgerPrefix, agreementReference: reference, splitDate: date });
  const money = (kobo: number) => formatMoney(kobo, currency);
  const edit = (index: number, patch: Partial<EditRow>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : patch.is_primary ? { ...row, is_primary: false } : row)));

  const submit = async () => {
    try {
      const res = await split({
        id: account.id, entity, split_date: date, agreement_reference: reference.trim(), difference_treatment: treatment,
        allocations: chosen.map((row) => ({
          branch: Number(row.branch), opening_balance: row.opening_balance,
          bank_account_name: row.bank_account_name.trim(), ledger_account_code: row.ledger_account_code,
          ledger_account_name: row.ledger_account_name.trim(), is_primary: row.is_primary,
          is_primary_collection: row.is_primary_collection,
        })),
      }).unwrap();
      toast.success(res.message || "Bank account split into branch accounts.");
      setConfirming(false);
      setResult(res.data);
    } catch { setConfirming(false); /* central */ }
  };

  return (
    <>
      <DetailDrawer
        open onOpenChange={(o) => (o || isLoading ? undefined : onClose())}
        title={result ? "Split done" : `Split ${account.name} by branch`}
        description={result ? `${account.name} is retired; its history stays, read only.` : "Give each branch its agreed share of this shared account."}
        widthClass="sm:max-w-3xl"
        footer={result ? <Button onClick={onClose}>Close</Button> : (
          <>
            <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
            <Button disabled={isLoading || problems.length > 0} onClick={() => setConfirming(true)} className="gap-1.5"><Split className="size-4" /> Split account</Button>
          </>
        )}
      >
        {result ? <SplitResult result={result} reader={reader} currency={currency} /> : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Total label="Book balance to share" kobo={bookBalance} currency={currency} />
              <Total label="Agreed so far" kobo={totals.agreed} currency={currency} />
              <Total label="Left to place" kobo={totals.remaining} currency={currency} danger={!totals.balanced} />
            </div>

            <section className="space-y-2">
              <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Each branch's share</p>
              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div key={row.branch} className={cn("space-y-3 rounded-md border p-3", row.include ? "border-white-02" : "border-dashed border-white-02 opacity-60")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-2 font-mont text-sm font-semibold text-black-01">
                        <input type="checkbox" checked={row.include} onChange={(e) => edit(index, { include: e.target.checked })} />
                        {reader.nameOf(Number(row.branch))}
                      </label>
                      {row.include ? (
                        <div className="flex flex-wrap items-center gap-3 font-mont text-xs text-gray-01">
                          <label className="flex items-center gap-1.5"><input type="radio" name="split-primary" checked={row.is_primary} onChange={() => edit(index, { is_primary: true })} /> Main account</label>
                          <label className="flex items-center gap-1.5"><input type="checkbox" checked={row.is_primary_collection} onChange={(e) => edit(index, { is_primary_collection: e.target.checked })} /> Collection account</label>
                        </div>
                      ) : null}
                    </div>
                    {row.include ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <FormField label="Agreed share" required>
                            <MoneyInput valueKobo={row.share} onChangeKobo={(share) => edit(index, { share })} currency={currency} className="[&_input]:h-9" />
                          </FormField>
                          <label className="mt-1 flex items-center gap-1.5 font-mont text-[11px] text-gray-05">
                            <input
                              type="checkbox" checked={row.overdraft} aria-label={`${reader.nameOf(Number(row.branch))}'s share is an overdraft`}
                              onChange={(e) => edit(index, { overdraft: e.target.checked })}
                            /> This share is an overdraft
                          </label>
                        </div>
                        <FormField label="New bank account name" required>
                          <Input value={row.bank_account_name} maxLength={160} onChange={(e) => edit(index, { bank_account_name: e.target.value })} className="h-9 bg-white" />
                        </FormField>
                        <FormField label="New ledger code" required>
                          <Input value={row.ledger_account_code} inputMode="numeric" maxLength={4} placeholder={`${ledgerPrefix || "1"}xxx`} onChange={(e) => edit(index, { ledger_account_code: e.target.value.replace(/\D/g, "") })} className="h-9 bg-white tabular-nums" />
                        </FormField>
                        <FormField label="New ledger name" required>
                          <Input value={row.ledger_account_name} maxLength={160} onChange={(e) => edit(index, { ledger_account_name: e.target.value })} className="h-9 bg-white" />
                        </FormField>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Where a branch's entries differ from its share</p>
              <div className="space-y-2" role="radiogroup" aria-label="Difference treatment">
                {DIFFERENCE_TREATMENTS.map((option) => (
                  <label key={option.value} className={cn("flex cursor-pointer gap-3 rounded-md border p-3", treatment === option.value ? "border-primary bg-primary/5" : "border-white-02")}>
                    <input type="radio" name="split-treatment" className="mt-1" checked={treatment === option.value} onChange={() => setTreatment(option.value)} />
                    <span className="min-w-0">
                      <span className="block font-mont text-sm font-medium text-black-01">{option.label}{option.value === "DEBT" ? " (usual)" : ""}</span>
                      <span className="mt-0.5 block font-mont text-xs leading-5 text-gray-05">{option.help}</span>
                    </span>
                  </label>
                ))}
              </div>
              <Note>
                Each branch's difference is its own entries on this account less its agreed share. This screen cannot read each branch's entries on the account yet, so the differences are worked out when the split is made and listed afterwards.
              </Note>
            </section>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PostingDateField label="Split date" entity={entity} value={date} onChange={setDate} hint="Nothing may be booked on this account after this day." />
              <FormField label="Agreement reference" required>
                <Input value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Bursars' minute 14/2026" className="h-9 bg-white" />
              </FormField>
            </div>

            {problems.length ? (
              <ul className="list-disc space-y-0.5 pl-5 font-mont text-[11px] text-gray-05">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            ) : null}
          </div>
        )}
      </DetailDrawer>
      <ConfirmActionModal
        open={confirming} onOpenChange={(o) => !o && setConfirming(false)} loading={isLoading} onConfirm={submit}
        title={`Split ${account.name}?`}
        description={`It is retired and ${chosen.length} branch accounts open with ${money(totals.agreed)} between them. This cannot be undone.`}
        confirmText="Split account" destructive
      />
    </>
  );
}

function Total({ label, kobo, currency, danger }: { label: string; kobo: number; currency?: string | null; danger?: boolean }) {
  return (
    <div className="rounded-md border border-white-02 bg-white p-3">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <p className={cn("mt-1 font-mont text-base font-semibold tabular-nums", danger ? "text-destructive" : "text-black-01")}>{formatMoney(kobo, currency)}</p>
    </div>
  );
}

function SplitResult({ result, reader, currency }: { result: BankSplitResult; reader: InterBranchReader; currency?: string | null }) {
  const money = (kobo: number) => formatMoney(kobo, currency);
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">New branch accounts</p>
        <div className="divide-y divide-white-02 rounded-md border border-white-02">
          {result.bank_accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="font-mont text-sm text-black-01">{a.name}</p>
                <p className="font-mont text-[11px] text-gray-05">{reader.nameOf(a.branch_id)} · ledger {a.gl_account_code}{a.is_primary ? " · main account" : ""}{a.is_primary_collection ? " · collection account" : ""}</p>
              </div>
              <Money kobo={a.opening_balance} currency={currency} />
            </div>
          ))}
        </div>
      </section>
      {result.difference_treatment === "PERMANENT_MOVE" ? (
        <Note>Each branch's difference moved through retained earnings, so nothing is owed between branches.</Note>
      ) : result.inter_branch_transfers.length === 0 ? (
        <Note>Every branch's entries matched its share, so nothing is owed between branches.</Note>
      ) : (
        <section className="space-y-2">
          <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Now owed between branches</p>
          <ul className="space-y-1.5">
            {result.inter_branch_transfers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white-02 px-3 py-2">
                <span className="font-mont text-sm text-black-01">{`${reader.nameOf(t.to_branch_id)} owes ${reader.nameOf(t.from_branch_id)} ${money(t.amount)}`}</span>
                <Link to={transferLink(t.id)} className="inline-flex items-center gap-1 font-mont text-xs font-medium text-primary hover:underline">
                  {t.document_number} <ArrowRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="font-mont text-[11px] leading-5 text-gray-05">These are never voided. The branch that owes repays with a cash transfer.</p>
        </section>
      )}
    </div>
  );
}
