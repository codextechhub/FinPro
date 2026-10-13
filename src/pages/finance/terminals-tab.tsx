/**
 * Branch Terminals: each branch's payment terminal at the payment provider.
 *
 * A card per terminal, in plain words: whether it is open, waiting for a phone
 * number, being set up, failed (with the reason, and Try again for someone who
 * may change it) or switched off. An open terminal shows how a parent pays at
 * it: the payment page with a code to scan, the poster, and the payment
 * methods, whichever of these the provider returned. A terminal also shows
 * where its money goes, and the WhatsApp numbers it notifies, which a holder
 * of `payments.terminal.update` can add to (up to five) and remove from, except
 * the last: the provider needs one, and the server refuses with its reason.
 *
 * At a school with one branch the branch is not named: there is just the one
 * terminal. Every part follows `payments.terminal` Field Access, and the
 * numbers follow `payments.terminal_destination`: a part the role may not read
 * is absent, not blanked. Reading the numbers needs the update key, so a
 * viewer sees the terminal without them.
 */

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";

import { AccessField, ConfirmActionModal, EmptyState, ErrorState, LoadingState, fieldWriteErrors, toArray, useFieldAccess, type FieldErrors } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { refusalSentence } from "../../lib/api-errors";
import {
  useAddTerminalDestinationMutation,
  useGetTerminalDestinationsQuery,
  useGetTerminalsQuery,
  useRemoveTerminalDestinationMutation,
  useRetryTerminalMutation,
} from "@/redux/services/payments/payments-api";
import type { TerminalDestination, VirtualTerminal } from "@/redux/services/payments/payments-types";
import { P } from "../../permissions";
import { providerInfo } from "./payment-providers";
import { usePaymentBranchColumn } from "./payment-branches";
import {
  codeImage,
  hasPaymentDetails,
  mayAddNumber,
  mayRemoveNumber,
  methodLines,
  numberError,
  paymentPageLink,
  posterLink,
  retryLabel,
  routeWords,
  terminalWord,
  terminalsInOrder,
} from "./terminal-model";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const DESTINATION = "payments.terminal_destination";

export function TerminalsTab({ entity }: { entity: string }) {
  const branchColumn = usePaymentBranchColumn();
  const { can } = useCan();
  const query = useGetTerminalsQuery({ entity });
  const rows = terminalsInOrder(toArray(query.data?.data));

  if (query.isLoading) return <LoadingState rows={3} />;
  if (query.isError) return <ErrorState onRetry={query.refetch} />;
  if (rows.length === 0) {
    return <EmptyState title="No payment terminals yet" message="Each branch gets its own terminal when it is set up. They appear here once the payment provider has opened them." />;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-guide="finance-terminals.workbench">
      {rows.map((terminal) => (
        <TerminalCard key={terminal.id} entity={entity} terminal={terminal} showBranch={branchColumn.show} mayUpdate={can(P.PAY_UPDATE_TERMINAL)} />
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t border-white-02 pt-3">
      <p className="font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">{title}</p>
      {children}
    </div>
  );
}

function TerminalCard({ entity, terminal, showBranch, mayUpdate }: {
  entity: string; terminal: VirtualTerminal; showBranch: boolean; mayUpdate: boolean;
}) {
  const access = useFieldAccess("payments.terminal", terminal);
  const [retry, { isLoading: retrying }] = useRetryTerminalMutation();
  /** A part the role may not read is absent from the payload; the switch map agrees. */
  const absent = (key: keyof VirtualTerminal) => access.isHidden(key) || terminal[key] === undefined;
  const word = terminalWord(terminal.status);
  // Only someone who may change terminals can add the number a waiting terminal needs.
  const detail = terminal.status === "NEEDS_NUMBER" && !mayUpdate
    ? "Someone who can change terminals must add a WhatsApp number before it opens."
    : word.detail;
  const label = retryLabel(terminal.status);
  const route = absent("routed_to_branch_bank") ? null : routeWords(terminal.routed_to_branch_bank);
  const title = showBranch ? terminal.branch_name : (terminal.name || "Payment terminal");

  const doRetry = async () => {
    try { toast.success((await retry({ id: terminal.id, entity }).unwrap()).message || "Terminal checked again."); } catch { /* central */ }
  };

  return (
    <article className="space-y-3 rounded-md border border-white-02 bg-white p-4" data-testid={`terminal-${terminal.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-mont text-sm font-semibold text-black-01">{title}</h2>
          <p className="font-mont text-[11px] text-gray-05">
            {providerInfo(terminal.provider).label}
            {!absent("code") && terminal.code ? ` · ${terminal.code}` : ""}
            {showBranch && !absent("name") && terminal.name ? ` · ${terminal.name}` : ""}
          </p>
        </div>
        {absent("status") ? null : <span className={cn(PILL, word.tone)}>{word.label}</span>}
      </div>

      {absent("status") ? null : <p className="font-mont text-xs leading-5 text-gray-05">{detail}</p>}

      {terminal.status === "FAILED" && !absent("last_error") && terminal.last_error ? (
        <p role="alert" data-testid="terminal-error" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mont text-xs leading-5 text-destructive">
          Why it failed: {terminal.last_error}
        </p>
      ) : null}

      {mayUpdate && label ? (
        <Button size="sm" variant={terminal.status === "ACTIVE" ? "outline" : "default"} disabled={retrying} onClick={doRetry} className="gap-1.5">
          <RefreshCw className={cn("size-4", retrying && "animate-spin")} />{retrying ? "Working…" : label}
        </Button>
      ) : null}

      {route ? <p className="font-mont text-xs text-gray-05">{route}</p> : null}

      {!absent("payment_details") && terminal.status === "ACTIVE" ? (
        <HowToPay terminal={terminal} />
      ) : null}

      {mayUpdate ? <TerminalNumbers entity={entity} terminal={terminal} /> : null}
    </article>
  );
}

/** How a parent pays at the terminal: its payment page with a code, the poster, the methods. */
function HowToPay({ terminal }: { terminal: VirtualTerminal }) {
  const details = terminal.payment_details;
  const page = paymentPageLink(details);
  const image = codeImage(details);
  const poster = posterLink(details);
  const methods = methodLines(details);
  const [copied, setCopied] = useState(false);

  if (!hasPaymentDetails(details)) {
    return (
      <Section title="How to pay">
        <p className="font-mont text-xs text-gray-05">The payment provider has not returned a payment page for this terminal yet. Refresh its details in a moment.</p>
      </Section>
    );
  }
  const copy = async () => {
    if (!page) return;
    try { await navigator.clipboard.writeText(page); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { toast.error("Couldn't copy the link."); }
  };
  return (
    <Section title="How to pay">
      {page || image ? (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start">
          <div className="shrink-0 rounded-md border border-white-02 bg-white p-2">
            {image
              ? <img src={image} alt="Payment code" className="size-36 object-contain" />
              : <QRCodeSVG value={page!} size={144} level="M" marginSize={1} title="Payment code" />}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {page ? (
              <>
                <Input readOnly value={page} className="bg-gray-50 font-mont text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Payment page" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={copy} className="gap-1.5">
                    {copied ? <Check className="size-3.5 text-green-01" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy link"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => window.open(page, "_blank", "noopener")} className="gap-1.5">
                    <ExternalLink className="size-3.5" /> Open
                  </Button>
                  {poster ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => window.open(poster, "_blank", "noopener")} className="gap-1.5">
                      <ExternalLink className="size-3.5" /> Poster
                    </Button>
                  ) : null}
                </div>
              </>
            ) : poster ? (
              <Button type="button" size="sm" variant="outline" onClick={() => window.open(poster, "_blank", "noopener")} className="gap-1.5">
                <ExternalLink className="size-3.5" /> Poster
              </Button>
            ) : null}
          </div>
        </div>
      ) : poster ? (
        <Button type="button" size="sm" variant="outline" onClick={() => window.open(poster, "_blank", "noopener")} className="gap-1.5">
          <ExternalLink className="size-3.5" /> Poster
        </Button>
      ) : null}
      {methods.length ? (
        <ul className="list-inside list-disc font-mont text-xs text-gray-01">
          {methods.map((m) => <li key={m}>{m}</li>)}
        </ul>
      ) : null}
    </Section>
  );
}

/** The WhatsApp numbers a terminal notifies: list, add, remove. */
function TerminalNumbers({ entity, terminal }: { entity: string; terminal: VirtualTerminal }) {
  const access = useFieldAccess(DESTINATION);
  const query = useGetTerminalDestinationsQuery({ id: terminal.id, entity });
  const [add, { isLoading: adding }] = useAddTerminalDestinationMutation();
  const [remove, { isLoading: removing }] = useRemoveTerminalDestinationMutation();
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TerminalDestination | null>(null);

  const rows: TerminalDestination[] = toArray(query.data?.data);
  // A value the role may not read is absent from every row; with no rows the switches answer.
  const nameVisible = !access.isHidden("name") && (rows.length === 0 || rows.some((r) => r.name !== undefined));
  const numberVisible = !access.isHidden("number") && (rows.length === 0 || rows.some((r) => r.number !== undefined));
  const readable = nameVisible || numberVisible;
  const formError = (name || number) ? numberError(name, number) : null;
  const canAdd = mayAddNumber(rows.length);

  if (query.isLoading) return <Section title="WhatsApp numbers"><p className="font-mont text-xs text-gray-05">Loading…</p></Section>;
  if (query.isError) return null;

  const submit = async () => {
    setDenied(null);
    setNotice(null);
    const body = access.writableOnly({ name: name.trim(), number: number.trim() }, { creating: true });
    try {
      const res = await add({ id: terminal.id, entity, ...body } as { id: number; entity: string; name: string; number: string }).unwrap();
      toast.success(res.message || "Number added.");
      setName("");
      setNumber("");
    } catch (error) {
      setDenied(fieldWriteErrors(error));
      setNotice(refusalSentence(error));
    }
  };
  const confirmRemove = async () => {
    if (!removeTarget?.number) return;
    setNotice(null);
    try {
      toast.success((await remove({ id: terminal.id, entity, number: removeTarget.number }).unwrap()).message || "Number removed.");
      setRemoveTarget(null);
    } catch (error) {
      setNotice(refusalSentence(error));
      setRemoveTarget(null);
    }
  };

  return (
    <Section title="WhatsApp numbers">
      <p className="font-mont text-xs text-gray-05">
        {terminal.status === "NEEDS_NUMBER"
          ? "This branch has no phone number on file. Add one and the terminal opens."
          : "These people are told on WhatsApp when someone pays at this terminal. A terminal keeps at least one and at most five."}
      </p>
      {readable ? (
        <ul className="divide-y divide-white-02 rounded-md border border-white-02">
          {rows.map((row, index) => (
            <li key={row.number ?? index} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 font-mont text-xs text-black-01">
                {nameVisible ? <span className="font-semibold">{row.name}</span> : null}
                {nameVisible && numberVisible ? " · " : null}
                {numberVisible ? <span className="tabular-nums">{row.number}</span> : null}
              </span>
              {numberVisible && row.number ? (
                <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${row.number}`} disabled={removing || !mayRemoveNumber(rows.length)}
                  title={mayRemoveNumber(rows.length) ? undefined : "A terminal keeps at least one number."}
                  onClick={() => setRemoveTarget(row)} className="shrink-0 gap-1 text-destructive hover:text-destructive">
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              ) : null}
            </li>
          ))}
          {rows.length === 0 ? <li className="px-3 py-2 font-mont text-xs text-gray-05">No numbers yet.</li> : null}
        </ul>
      ) : null}

      {notice ? <p role="alert" data-testid="terminal-notice" className="font-mont text-xs text-destructive">{notice}</p> : null}

      {canAdd ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <AccessField access={access} name="name" label="Name" creating errors={denied}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mrs Adeyemi" className="h-9 bg-white" />
          </AccessField>
          <AccessField access={access} name="number" label="WhatsApp number" creating errors={denied}>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="08012345678" inputMode="tel" className="h-9 bg-white" />
          </AccessField>
          <Button type="button" size="sm" disabled={adding || !name || !number || !!formError} onClick={submit} className="h-9 gap-1.5">
            <Plus className="size-4" />{adding ? "Adding…" : "Add"}
          </Button>
        </div>
      ) : (
        <p className="font-mont text-xs text-gray-05">This terminal has five numbers, the most it keeps. Remove one to add another.</p>
      )}
      {formError && canAdd ? <p className="font-mont text-[11px] text-gray-05">{formError}</p> : null}

      <ConfirmActionModal
        open={removeTarget !== null}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Remove this number?"
        description={`${removeTarget?.name ? `${removeTarget.name} (${removeTarget.number})` : removeTarget?.number ?? "This number"} will stop being told when someone pays at this terminal.`}
        confirmText="Remove"
        destructive
        loading={removing}
        onConfirm={confirmRemove}
      />
    </Section>
  );
}
