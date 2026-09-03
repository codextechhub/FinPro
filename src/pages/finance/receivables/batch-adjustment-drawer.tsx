import { useMemo, useState } from "react";
import { Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  AccountPicker,
  BankAccountPicker,
  DetailDrawer,
  FormField,
  MoneyInput,
  PostingDateField,
  PostingRecap,
  Segmented,
  toArray,
  type RecapRow,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { SearchSelect } from "@/components/custom/search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { P } from "../../../permissions";
import { gatedBatchRows, isBatchGateRefusal } from "./adjustment-approval";
import { useAdjustmentGate } from "./use-adjustment-gate";
import {
  useCreateArAdjustmentBatchMutation,
  useGetInvoicesQuery,
  useGetRefundAvailabilityQuery,
} from "@/redux/services/finance/ar-api";
import type {
  ArAdjustmentBatchAction,
  ArAdjustmentBatchInput,
  ArAdjustmentBatchKind,
} from "@/redux/services/finance/ar-types";
import { formatMoney } from "@/utils/money";
import { batchAdjustmentLinesAreValid } from "./batch-adjustment-validation";

/**
 * `available` is deliberately NOT held in state. Every line's headroom depends on the
 * batch's posting date - refundable credit is measured as at that date - so a stored
 * snapshot goes stale the moment the date changes, and the user submits against a
 * number the backend no longer agrees with. It is derived on every render instead.
 */
type Line = { id: number; target: string; amount: number };
let lineSequence = 1;
const newLine = (): Line => ({ id: lineSequence++, target: "", amount: 0 });

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-gray-50 px-3 py-2.5">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <p className="mt-0.5 truncate font-mont text-sm font-semibold tabular-nums text-black-01">{value}</p>
    </div>
  );
}

export function BatchAdjustmentDrawer({
  open,
  onClose,
  entity,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  entity: string;
  currency?: string | null;
}) {
  const { can } = useCan();
  const canCreateRefund = can(P.FIN_CREATE_REFUND);
  const canCreateWriteOff = can(P.FIN_CREATE_WRITE_OFF);
  const [kind, setKind] = useState<ArAdjustmentBatchKind>(
    canCreateRefund ? "REFUND" : "WRITEOFF",
  );
  const [date, setDate] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [writeOffAccount, setWriteOffAccount] = useState("");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<ArAdjustmentBatchAction>("DRAFT");
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [createBatch, { isLoading }] = useCreateArAdjustmentBatchMutation();
  const [gateRefusal, setGateRefusal] = useState<string | null>(null);
  const writeOff = kind === "WRITEOFF";
  const refundGate = useAdjustmentGate("finance.refund");
  const writeOffGate = useAdjustmentGate("finance.write_off");
  const rule = writeOff ? writeOffGate.rule : refundGate.rule;

  // Every line in the batch shares one posting date, so eligibility is asked for as at
  // that date. A customer whose credit arrives after it has nothing to refund, and an
  // invoice raised after it cannot be written off - neither may be offered.
  const refundAvailability = useGetRefundAvailabilityQuery(
    { entity, page_size: 100, ...(date ? { as_of: date } : {}) },
    { skip: !open || writeOff || !date },
  );
  const invoices = useGetInvoicesQuery(
    { entity, status: "POSTED", page_size: 100 },
    { skip: !open || !writeOff },
  );
  const refundTargets = useMemo(
    () => toArray(refundAvailability.data?.data),
    [refundAvailability.data],
  );
  const invoiceTargets = useMemo(
    () => toArray(invoices.data?.data).filter(
      (invoice) => invoice.balance_due > 0 && (!date || invoice.invoice_date <= date),
    ),
    [invoices.data, date],
  );
  const options = useMemo(
    () => writeOff
      ? invoiceTargets.map((invoice) => ({
          value: String(invoice.id),
          label: `${invoice.document_number} - ${invoice.customer_name} · ${formatMoney(invoice.balance_due, currency)} due`,
        }))
      : refundTargets.map((customer) => ({
          value: customer.customer_code,
          label: `${customer.customer_code} - ${customer.customer_name} · ${formatMoney(customer.refundable_credit, currency)} available`,
        })),
    [writeOff, invoiceTargets, refundTargets, currency],
  );

  const actionOptions = useMemo(() => {
    const values: { value: ArAdjustmentBatchAction; label: string }[] = [
      { value: "DRAFT", label: "Save all as drafts" },
    ];
    if (can(writeOff ? P.FIN_SUBMIT_WRITE_OFF : P.FIN_SUBMIT_REFUND)) {
      values.push({ value: "SUBMIT", label: "Submit all for approval" });
    }
    if (can(writeOff ? P.FIN_POST_WRITE_OFF : P.FIN_POST_REFUND)) {
      values.push({ value: "POST", label: "Post all now" });
    }
    return values;
  }, [can, writeOff]);

  // Headroom for a target, read from the *current* (date-scoped) eligibility lists.
  const availableFor = (target: string) => (writeOff
    ? invoiceTargets.find((invoice) => String(invoice.id) === target)?.balance_due ?? 0
    : refundTargets.find((customer) => customer.customer_code === target)?.refundable_credit ?? 0);
  const resolved = useMemo(
    () => lines.map((line) => ({ ...line, available: availableFor(line.target) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, invoiceTargets, refundTargets, writeOff],
  );

  const setLine = (id: number, patch: Partial<Line>) => {
    setLines((current) => current.map((line) => (
      line.id === id ? { ...line, ...patch } : line
    )));
  };
  const pickTarget = (id: number, target: string) => {
    setLine(id, { target, amount: availableFor(target) });
  };
  const total = lines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const valid = batchAdjustmentLinesAreValid(resolved);
  const duplicateTargets = new Set(
    lines
      .filter((line, index) => (
        !!line.target && lines.findIndex((other) => other.target === line.target) !== index
      ))
      .map((line) => line.target),
  );
  const canCreateKind = writeOff ? canCreateWriteOff : canCreateRefund;
  const canSubmit = canCreateKind && valid && !!date && (writeOff || !!bankAccount);

  const recap = useMemo<{ dr: RecapRow[]; cr: RecapRow[] }>(() => writeOff
    ? {
        dr: [{ code: writeOffAccount || "5300", name: "Bad debt expense", amount: total }],
        cr: [{ code: "AR", name: "Accounts Receivable (control)", amount: total }],
      }
    : {
        dr: [{ code: "2140", name: "Customer credit", amount: total }],
        cr: [{ code: "Bank", name: "cash out", amount: total }],
      }, [writeOff, writeOffAccount, total]);

  const defaultAction = (nextKind: ArAdjustmentBatchKind): ArAdjustmentBatchAction => {
    const isWriteOff = nextKind === "WRITEOFF";
    if (can(isWriteOff ? P.FIN_POST_WRITE_OFF : P.FIN_POST_REFUND)) return "POST";
    if (can(isWriteOff ? P.FIN_SUBMIT_WRITE_OFF : P.FIN_SUBMIT_REFUND)) return "SUBMIT";
    return "DRAFT";
  };
  const changeKind = (nextKind: ArAdjustmentBatchKind) => {
    setKind(nextKind);
    setLines([newLine()]);
    setAction(defaultAction(nextKind));
  };
  const reset = () => {
    const initialKind = canCreateRefund ? "REFUND" : "WRITEOFF";
    lineSequence = 1;
    setKind(initialKind);
    setDate("");
    setBankAccount("");
    setWriteOffAccount("");
    setReason("");
    setLines([newLine()]);
    setAction(defaultAction(initialKind));
  };
  const close = () => {
    reset();
    setGateRefusal(null);
    onClose();
  };
  const submit = async () => {
    if (!canSubmit) return;
    const input: ArAdjustmentBatchInput = {
      entity,
      kind,
      action,
      date,
      reason: reason.trim() || undefined,
      narration: reason.trim() || undefined,
      ...(writeOff
        ? { write_off_account: writeOffAccount || undefined }
        : { bank_account: bankAccount }),
      items: writeOff
        ? lines.map((line) => ({ invoice: Number(line.target), amount: line.amount }))
        : lines.map((line) => ({ customer: line.target, amount: line.amount })),
    };
    setGateRefusal(null);
    try {
      const response = await createBatch(input).unwrap();
      toast.success(response.message || `${response.data.count} adjustments processed.`);
      close();
    } catch (error) {
      // A mixed batch is refused whole rather than posted in part, and the server
      // does not say which rows caused it. The screen has the amounts the user
      // typed, so it can name them - the difference between "something in here is
      // too big" and "rows 3 and 7 are".
      if (isBatchGateRefusal(error)) {
        const culprits = gatedBatchRows(rule, lines.map((line) => line.amount));
        setGateRefusal(
          culprits.length === 0
            ? "One or more of these need approval, so the batch cannot be posted. Choose \u201cSubmit for approval\u201d instead."
            : `Row${culprits.length > 1 ? "s" : ""} ${culprits.map((row) => row.index).join(", ")} need approval, so the whole batch cannot be posted. Nothing was saved. Choose \u201cSubmit for approval\u201d to send them all together.`,
        );
        return;
      }
      /* central */
    }
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(nextOpen) => (nextOpen ? undefined : close())}
      title={writeOff ? "Batch write-offs" : "Batch refunds"}
      description="Process up to 100 adjustments in one all-or-nothing batch."
      widthClass="sm:max-w-3xl"
      footer={(
        <>
          <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
          <div className="flex-1" />
          <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5">
            <Send className="size-4" />
            {isLoading
              ? "Processing…"
              : action === "POST"
                ? `Post ${lines.length}`
                : action === "SUBMIT"
                  ? `Submit ${lines.length}`
                  : `Save ${lines.length} drafts`}
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        {gateRefusal ? (
          <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="font-mont text-xs font-semibold text-amber-900">This batch was not posted</p>
            <p className="mt-1 font-mont text-xs leading-5 text-amber-900">{gateRefusal}</p>
            <Button
              size="sm" variant="outline" className="mt-2.5"
              onClick={() => { setAction("SUBMIT"); setGateRefusal(null); }}
            >
              Submit the batch instead
            </Button>
          </div>
        ) : null}
        <Segmented
          label="Adjustment type"
          value={kind}
          onChange={changeKind}
          options={[["REFUND", "Refunds"], ["WRITEOFF", "Write-offs"]]}
          isDisabled={(value) => (
            value === "REFUND" ? !canCreateRefund : !canCreateWriteOff
          )}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Lines" value={String(lines.length)} />
          <Metric label="Batch total" value={formatMoney(total, currency)} />
          <div className="col-span-2 sm:col-span-1">
            <Metric label="Processing" value="All or nothing" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PostingDateField
            label="Posting date" entity={entity} value={date} onChange={setDate}
            hint={writeOff
              ? "Only invoices raised on or before this date can be written off."
              : "Refundable credit is measured on this date."}
          />
          {writeOff ? (
            <FormField label="Write-off expense account">
              <AccountPicker
                entity={entity}
                value={writeOffAccount}
                onChange={setWriteOffAccount}
                accountType="EXPENSE"
                postableOnly
                placeholder="Defaults to bad debt (5300)"
              />
            </FormField>
          ) : (
            <FormField label="Refund bank account" required>
              <BankAccountPicker entity={entity} value={bankAccount} onChange={setBankAccount} />
            </FormField>
          )}
        </div>
        <FormField label="Reason">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Applied to every line"
            className="bg-white"
          />
        </FormField>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">
              Batch lines
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={lines.length >= 100}
              onClick={() => setLines((current) => [...current, newLine()])}
              className="h-7 gap-1 text-xs"
            >
              <Plus className="size-3.5" /> Add line
            </Button>
          </div>
          <div className="space-y-2">
            {resolved.map((line) => {
              const duplicate = duplicateTargets.has(line.target);
              const overLimit = line.amount > line.available;
              // The target was picked, then the date moved and it stopped qualifying.
              const ineligible = !!line.target && line.available <= 0;
              return (
                <div key={line.id} className="rounded-md border border-white-02 bg-white p-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_auto]">
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="mb-1 font-mont text-[11px] text-gray-05">
                        {writeOff ? "Invoice" : "Customer credit"}
                      </p>
                      <SearchSelect
                        options={options}
                        value={line.target}
                        onChange={(event) => pickTarget(line.id, event.target.value)}
                        loading={writeOff ? invoices.isFetching : refundAvailability.isFetching}
                        disabled={!date}
                        placeholder={!date
                          ? "Choose a posting date first"
                          : writeOff ? "Select an open invoice" : "Select refundable credit"}
                        revealOnSearch
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 font-mont text-[11px] text-gray-05">Amount</p>
                      <MoneyInput
                        valueKobo={line.amount}
                        onChangeKobo={(amount) => setLine(line.id, { amount })}
                        currency={currency}
                        disabled={!line.target}
                        className="[&_input]:h-9"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={lines.length === 1}
                      onClick={() => setLines((current) => (
                        current.length > 1
                          ? current.filter((candidate) => candidate.id !== line.id)
                          : current
                      ))}
                      className="size-9 text-gray-05 hover:text-destructive"
                      aria-label="Remove line"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  {line.target ? (
                    <p className={cn(
                      "mt-1.5 font-mont text-[11px]",
                      duplicate || overLimit || ineligible ? "text-destructive" : "text-gray-05",
                    )}>
                      {duplicate
                        ? "This target already appears in the batch."
                        : ineligible
                          ? writeOff
                            ? `This invoice is not open as at ${date} - it cannot be written off on that date.`
                            : `No credit available as at ${date} - pick a later posting date or another customer.`
                          : overLimit
                            ? `Amount cannot exceed ${formatMoney(line.available, currency)} available as at ${date}.`
                            : `${formatMoney(line.available, currency)} available as at ${date}.`}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          {(writeOff ? invoices.isError : refundAvailability.isError) ? (
            <p className="mt-2 font-mont text-xs text-destructive">
              Eligible targets could not be loaded. Try again.
            </p>
          ) : null}
        </div>

        <PostingRecap
          title={writeOff ? "Combined write-off posting" : "Combined refund posting"}
          dr={recap.dr}
          cr={recap.cr}
          currency={currency}
          stackOnMobile
          helper="Each line keeps its own document and audit trail; the batch only commits when every line succeeds."
        />

        <FormField label="Next action">
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as ArAdjustmentBatchAction)}
            className="h-9 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-black-01 focus:border-primary focus:outline-none"
          >
            {actionOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </FormField>
      </div>
    </DetailDrawer>
  );
}
