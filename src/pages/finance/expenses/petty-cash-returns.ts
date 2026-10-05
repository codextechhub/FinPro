/**
 * The rules behind returning petty cash to the bank, as plain data.
 *
 * A return starts with the custodian counting the tin. What the count found is
 * held against what the fund's books say, and the cash goes back to a bank
 * account of the fund's own branch:
 *
 * - **Reduce float.** Ikeja's front-desk float drops from N100,000 to N60,000.
 *   The custodian counts N100,000, so N40,000 is banked and the tin keeps
 *   N60,000. Had the count found N98,500, N38,500 is banked and the N1,500
 *   shortage goes to Cash over and short, with a reason.
 * - **Close fund.** Everything counted is banked and the fund stops: no
 *   vouchers, top-ups or float changes until it is reopened. It is refused
 *   while a voucher is still a draft or waiting on approval, or another return
 *   of the fund is waiting.
 *
 * The server checks every one of these rules and refuses what breaks them (409).
 * The forms here check them first so a reader is never sent to a refusal the
 * form could have answered, and say what the posting will do before it does it.
 */

import { formatMoney } from "@/utils/money";
import type { PettyCashFund, PettyCashReturn, PettyCashVoucher } from "@/redux/services/finance/ops-types";

/** What a return will do with the cash counted. Every figure is kobo. */
export interface ReturnFigures {
  /** The count less the books: positive over, negative short. */
  difference: number;
  shortage: number;
  overage: number;
  /** The cash banked. */
  banked: number;
  /** The cash the tin keeps afterwards. */
  tinKeeps: number;
}

/** The figures of a float reduction: bank everything above the new float. */
export function reduceFigures({ counted, book, newFloat }: { counted: number; book: number; newFloat: number }): ReturnFigures {
  const difference = counted - book;
  const banked = Math.max(counted - newFloat, 0);
  return {
    difference,
    shortage: Math.max(-difference, 0),
    overage: Math.max(difference, 0),
    banked,
    tinKeeps: counted - banked,
  };
}

/** The figures of a closure: bank everything counted. */
export function closeFigures({ counted, book }: { counted: number; book: number }): ReturnFigures {
  const difference = counted - book;
  return {
    difference,
    shortage: Math.max(-difference, 0),
    overage: Math.max(difference, 0),
    banked: counted,
    tinKeeps: 0,
  };
}

/** The sentence naming a count difference, or null when the count agrees. */
export function differenceSentence(figures: ReturnFigures, currency?: string | null): string | null {
  if (figures.shortage) return `${formatMoney(figures.shortage, currency)} short. It goes to Cash over and short.`;
  if (figures.overage) return `${formatMoney(figures.overage, currency)} over. It goes to Cash over and short.`;
  return null;
}

/**
 * Why a float reduction cannot be sent yet, in the server's own terms, or null
 * when it can.
 */
export function reduceProblem({ figures, newFloat, currentFloat, hasBank, reason, currency }: {
  figures: ReturnFigures;
  newFloat: number;
  currentFloat: number;
  hasBank: boolean;
  reason: string;
  currency?: string | null;
}): string | null {
  const money = (kobo: number) => formatMoney(kobo, currency);
  if (newFloat <= 0) return "A float cut to nothing is a closure. Use Close fund instead.";
  if (newFloat >= currentFloat) return `The new float must be lower than the current float of ${money(currentFloat)}.`;
  if (figures.banked <= 0) {
    return `Nothing to bank: the count found no more than the new float of ${money(newFloat)}. Change the float with Edit fund instead.`;
  }
  if (!hasBank) return "Choose the bank account the cash goes into.";
  if (figures.difference && !reason.trim()) return "The count differs from the books. Say why.";
  return null;
}

/** The voucher statuses that keep a fund from closing: not yet booked. */
const OPEN_VOUCHER_STATUSES = new Set(["DRAFT", "PENDING_APPROVAL", "APPROVED"]);

/** The return statuses still on their way to the books. */
const OPEN_RETURN_STATUSES = new Set(["PENDING_APPROVAL", "APPROVED"]);

/**
 * What stops ``fundId`` closing, from the vouchers and returns in hand: each a
 * sentence naming the documents and the way past them.
 */
export function closeBlockers(fundId: number, vouchers: PettyCashVoucher[], returns: PettyCashReturn[]): string[] {
  const out: string[] = [];
  const open = vouchers.filter((v) => v.fund_id === fundId && OPEN_VOUCHER_STATUSES.has(v.status));
  if (open.length) {
    const names = open.slice(0, 6).map((v) => v.document_number || `#${v.id}`).join(", ");
    out.push(`Vouchers not yet posted: ${names}. Post or cancel them first.`);
  }
  const waiting = returns.find((r) => r.fund_id === fundId && OPEN_RETURN_STATUSES.has(r.status));
  if (waiting) {
    out.push(`Return ${waiting.document_number} of this fund is still waiting on approval. Settle it before counting the tin again.`);
  }
  return out;
}

/** Why a closure cannot be sent yet, or null when it can. */
export function closeProblem({ blockers, figures, hasBank, reason }: {
  blockers: string[];
  figures: ReturnFigures;
  hasBank: boolean;
  reason: string;
}): string | null {
  if (blockers.length) return blockers[0];
  if (figures.banked > 0 && !hasBank) return "Choose the bank account the cash goes into.";
  if (figures.difference && !reason.trim()) return "The count differs from the books. Say why.";
  return null;
}

/** Whether a return offers Void: a posted one is reversed, a draft cancelled. */
export function returnVoidable(ret: PettyCashReturn): boolean {
  return ret.status === "POSTED" || ret.status === "DRAFT";
}

/**
 * Why voiding ``ret`` would be refused, from what the screen knows, or null.
 *
 * The server refuses a void after a later return of the same fund, once a
 * closed fund has been reopened, or once the float has changed since. It also
 * refuses while the bank line is matched on a reconciliation, which only it can
 * see, so a null here is not a promise.
 */
export function voidBlocker(ret: PettyCashReturn, { returns, fund, currency }: {
  returns: PettyCashReturn[];
  fund?: PettyCashFund;
  currency?: string | null;
}): string | null {
  if (ret.status !== "POSTED") return null;
  const later = returns.find((r) => r.fund_id === ret.fund_id && r.status === "POSTED" && r.id > ret.id);
  if (later) return `Return ${later.document_number} of this fund came after ${ret.document_number}. Void it first.`;
  if (!fund) return null;
  if (ret.kind === "CLOSE" && fund.state !== "CLOSED") {
    return `The fund has been reopened since ${ret.document_number} closed it.`;
  }
  if (fund.float_amount !== ret.new_float_amount) {
    return `The float has changed since ${ret.document_number}. Put it back to ${formatMoney(ret.new_float_amount, currency)} first.`;
  }
  return null;
}

/** How a register row reads: its category's tone. */
export type RegisterTone = "in" | "out" | "bank" | "short" | "over";

/** The tone of a register category; see the server's fund register. */
export function registerTone(category: string, inflow: number): RegisterTone {
  if (category === "Returned to bank") return "bank";
  if (category === "Count short") return "short";
  if (category === "Count over") return "over";
  return inflow ? "in" : "out";
}

/** What a fund edit may not do, as the refusal pointing at the action that may. */
export function fundEditProblem({ fund, onHand, floatAmount, isActive }: {
  fund: PettyCashFund;
  onHand: number;
  floatAmount: number;
  isActive: boolean;
}, currency?: string | null): { message: string; action: "reduce" | "close" | "reopen" } | null {
  const money = (kobo: number) => formatMoney(kobo, currency);
  const closed = fund.state === "CLOSED";
  if (closed && (floatAmount !== fund.float_amount || isActive !== fund.is_active)) {
    return { message: "This fund is closed. Its float and status change only by reopening it.", action: "reopen" };
  }
  if (floatAmount < fund.float_amount && floatAmount < onHand) {
    return {
      message: `The fund holds ${money(onHand)}, more than a float of ${money(floatAmount)}. Reduce the float instead, which banks the cash above it.`,
      action: "reduce",
    };
  }
  if (!isActive && fund.is_active && onHand !== 0) {
    return {
      message: `The fund still holds ${money(onHand)}. Close the fund instead, which banks the cash and records the count.`,
      action: "close",
    };
  }
  return null;
}

/** The float a reopened fund starts on: the one its last closure ended. */
export function floatBeforeClosure(fundId: number, returns: PettyCashReturn[]): number {
  const closure = returns
    .filter((r) => r.fund_id === fundId && r.kind === "CLOSE" && r.status === "POSTED")
    .sort((a, b) => b.id - a.id)[0];
  return closure?.previous_float_amount ?? 0;
}
