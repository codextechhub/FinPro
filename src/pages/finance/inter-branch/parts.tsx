/**
 * Small pieces the Between Branches screens share: a stage pill, a branch
 * select over a given list, and a labelled value row for detail drawers.
 */

import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { InterBranchTransfer } from "@/redux/services/finance/interbranch-types";
import { stageLabel, stageTone } from "./transfer-actions";
import { SENT_BACK_WORD, isSentBack, type ReturnedFacts } from "@/components/finance-ui/returned-correction";
import type { BranchOption } from "./use-inter-branch";

const PILL = "inline-flex whitespace-nowrap rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const TONE = {
  good: "bg-green-01/10 text-green-01",
  waiting: "bg-amber-50 text-amber-800",
  closed: "bg-gray-03/60 text-gray-05",
  sentBack: "bg-orange-500/10 text-yellow-01-text",
} as const;

/** The transfer's stage, or "Sent back" while an approver has handed a send back to whoever sent it. */
export function StagePill({ transfer }: { transfer: Pick<InterBranchTransfer, "kind" | "stage"> & ReturnedFacts }) {
  if (isSentBack(transfer, true)) return <span className={cn(PILL, TONE.sentBack)}>{SENT_BACK_WORD}</span>;
  return <span className={cn(PILL, TONE[stageTone(transfer)])}>{stageLabel(transfer)}</span>;
}

export function TonePill({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={cn(PILL, TONE[tone])}>{children}</span>;
}

/** A select over `branches`. `placeholder` is the empty choice ("Any branch"). */
export function BranchSelect({ branches, value, onChange, placeholder = "Select branch", label, allowEmpty = false, disabled, className }: {
  branches: BranchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  /** Offer the placeholder as a real choice (a filter), not only as a prompt. */
  allowEmpty?: boolean;
  disabled?: boolean;
  /** Classes for the select itself; a filter bar passes `h-9` to match its neighbours. */
  className?: string;
}) {
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled} className={className}>
      <option value="" disabled={!allowEmpty}>{placeholder}</option>
      {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
    </NativeSelect>
  );
}

/** A label and its value, stacked, for a detail drawer's facts grid. */
export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mont text-[11px] text-gray-05">{label}</dt>
      <dd className="mt-0.5 break-words font-mont text-sm text-black-01">{children}</dd>
    </div>
  );
}

/** A quiet explanatory note inside a drawer or dialog. */
export function Note({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "warn" }) {
  return (
    <p className={cn(
      "rounded-md border px-3 py-2 font-mont text-[11px] leading-5",
      tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-gray-03 bg-gray-03 text-gray-05",
    )}
    >
      {children}
    </p>
  );
}
