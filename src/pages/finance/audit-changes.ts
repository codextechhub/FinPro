/**
 * The change list of a finance audit entry, in words a reader of any role can use.
 *
 * An entry's sentence carries no figure. The amounts, the balances and the
 * registered free text of what changed travel in its `before` and `after`
 * snapshots, under the field names the backend registers, already narrowed to
 * what the signed-in reader may see. This module turns the pair into rows: a
 * plain-words label, and each side written the way the school reads it, with an
 * amount as money, a date in the school's format and a state as a word. A key
 * the reader's snapshot does not carry gives no row, and a key present on one
 * side only shows a dash on the other.
 *
 * Labels come from the registered Field Access labels where a key has one, and
 * otherwise from the key itself read as words ("float_amount" becomes "Float
 * amount"), so an unlisted key is still legible and never shown raw.
 */

import type { DateFormatter } from "../../lib/display-prefs";
import { formatMoney } from "../../utils/money";

/** One row of the change list: both sides are ready to show. */
export interface AuditChange {
  key: string;
  label: string;
  before: string;
  after: string;
}

/** What a side needs to be written: the books' currency and the school's date formats. */
export interface AuditValueContext {
  currency?: string | null;
  dates: Pick<DateFormatter, "dateTime" | "day">;
}

/** Keys whose plain-words label differs from the key read as words. */
const LABELS: Readonly<Record<string, string>> = {
  amount: "Amount",
  float_amount: "Float amount",
  previous_float_amount: "Float before",
  new_float_amount: "Float after",
  net_amount: "Net pay",
  gross_amount: "Gross pay",
  paye_amount: "PAYE",
  pension_amount: "Pension",
  taxable_pay: "Taxable pay",
  net_income: "Net result carried to equity",
  opening_balance: "Opening balance",
  closing_balance: "Closing balance",
  book_balance: "Book balance",
  statement_balance: "Statement balance",
  counted_amount: "Cash counted",
  cash_left: "Cash the tin keeps",
  difference: "Difference",
  paye_override: "PAYE override",
  paye_override_reason: "Reason for the PAYE override",
  decline_reason: "Decline reason",
  difference_reason: "Reason for the difference",
  tax_id: "Tax ID",
  pension_pin: "Pension PIN",
  is_active: "Active",
  is_primary: "Main operating account",
  is_primary_collection: "Fee collection account",
  deleted: "Removed",
  posted_at: "Posted at",
  liability_account: "Liability account",
  components: "Pay breakdown",
  lines: "Lines",
  status: "Status",
};

/** Keys that hold an integer amount of kobo but do not end the way an amount does. */
const MONEY_KEYS: ReadonlySet<string> = new Set([
  "taxable_pay", "paye_override", "cash_left", "counted_amount", "difference", "shortage", "overage",
  "net_owed", "lifetime_paid", "annual_rent",
]);

/** The ending of a key that names an amount of kobo. */
const MONEY_ENDING = /(^|_)(amount|balance|total|income)$/;

/** Keys that read like an amount but are words or a share, never kobo. */
const NOT_MONEY = /(_naira|_pct|_percent|_rate|_days|_count|_years|_label|_name)$/;

/** Whether a key names an amount of kobo, so its value is written as money. */
export function isMoneyKey(key: string): boolean {
  if (NOT_MONEY.test(key)) return false;
  return MONEY_KEYS.has(key) || MONEY_ENDING.test(key) || key.startsWith("brought_forward_");
}

/** A key read as words: "float_amount" is "Float amount", "customer_id" is "Customer". */
export function auditFieldLabel(key: string): string {
  const known = LABELS[key];
  if (known) return known;
  const words = key.replace(/_id$/, "").replace(/_/g, " ").trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATE_WORD = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const WHOLE_NUMBER = /^-?\d+$/;
const STATE_KEY = /(^|_)(status|state|kind|method|direction|treatment|basis|stage|type)$/;

function sentenceCase(text: string): string {
  const words = text.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A flat object as "Label: value" pairs, an array of rows as a count, anything else as text. */
function structured(value: unknown, context: AuditValueContext): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    if (value.every((item) => item === null || typeof item !== "object")) {
      return value.map((item) => auditValue("", item, context)).join(", ");
    }
    return value.length === 1 ? "1 item" : `${value.length} items`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "-";
  if (entries.some(([, inner]) => inner !== null && typeof inner === "object")) {
    return entries.length === 1 ? "1 item" : `${entries.length} items`;
  }
  return entries.map(([key, inner]) => `${auditFieldLabel(key)}: ${auditValue(key, inner, context)}`).join("; ");
}

/**
 * One side of a change as a reader wants it.
 *
 * An amount of kobo is money in the books' currency; a timestamp is written like
 * the trail's When column, in the school's format and zone, rather than as the
 * ISO text the ledger stores; a state such as `POSTED` is a word; a yes or no is
 * Yes or No. A missing value is a dash.
 */
export function auditValue(key: string, value: unknown, context: AuditValueContext): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || (typeof value === "string" && WHOLE_NUMBER.test(value))) {
    return isMoneyKey(key) ? formatMoney(Number(value), context.currency) : String(value);
  }
  if (typeof value === "string") {
    if (ISO_DATE_TIME.test(value)) {
      const when = context.dates.dateTime(value, null, { seconds: true });
      return when !== "-" ? when : value;
    }
    if (ISO_DATE.test(value)) {
      const day = context.dates.day(value);
      return day !== "-" ? day : value;
    }
    return STATE_WORD.test(value) && (value.includes("_") || STATE_KEY.test(key)) ? sentenceCase(value) : value;
  }
  return structured(value, context);
}

/**
 * The rows for the keys whose value differs between the two snapshots, as a
 * reader sees them: two sides that read the same (an absent value and an empty
 * list) are no change.
 *
 * Rows follow the order the snapshots give their keys, `before` first, so a
 * change reads in the order the backend wrote it. Either snapshot may be null.
 */
export function auditChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  context: AuditValueContext,
): AuditChange[] {
  const was = before ?? {};
  const now = after ?? {};
  return [...new Set([...Object.keys(was), ...Object.keys(now)])]
    .filter((key) => JSON.stringify(was[key]) !== JSON.stringify(now[key]))
    .map((key) => ({
      key,
      label: auditFieldLabel(key),
      before: auditValue(key, was[key], context),
      after: auditValue(key, now[key], context),
    }))
    .filter((row) => row.before !== row.after);
}
