/**
 * Shapes for payroll runs that go through approval and can be paid through the
 * payment provider (Paystack), and for the staff bank accounts that payment
 * needs.
 *
 * A figure or a status marked "Field Access" is absent from the payload when the
 * reader's role may not read it, so each is optional and a screen leaves it out
 * rather than showing a blank. Money is integer kobo.
 */

/** Where a payroll run stands with its approval route. */
export type PayrollApprovalState = "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";

/** How a school pays its posted runs: from the branch's own bank, or through the provider. */
export type PayrollPaymentRoute = "OWN_BANK" | "PAYSTACK";

/**
 * Where one payroll line's payment through the provider stands. Blank on a line
 * not sent yet, or paid the ordinary way.
 */
export type PayrollLinePayState = "" | "NEEDS_BANK_DETAILS" | "WAITING_FOR_FUNDS" | "SENT" | "PAID" | "FAILED";

/** The counts a run, or one branch of it, reports by payment state. */
export interface PayrollPaymentCounts {
  not_sent: number;
  needs_bank_details: number;
  waiting_for_funds: number;
  sent: number;
  paid: number;
  failed: number;
}

/** One branch's payout batch for a run: its reference and the batch's own status. */
export interface PayrollPaymentBatch {
  reference: string;
  status: string;
}

/** One branch's part of a run's payment. Counts and batch follow the payment status switch, totals follow net pay. */
export interface PayrollPaymentBranch {
  branch_id: number | null;
  branch_name: string | null;
  lines: number;
  counts?: PayrollPaymentCounts; // Field Access: finance.payrollrun pay_state
  batch?: PayrollPaymentBatch | null; // Field Access: finance.payrollrun pay_state
  net_total?: number; // Field Access: finance.payrollrun net_amount
  paid_total?: number; // Field Access: finance.payrollrun net_amount
}

/** One line of a run as the payment progress shows it. */
export interface PayrollPaymentLine {
  id: number;
  line_no: number;
  employee_id: number | null;
  employee_name?: string; // Field Access: finance.payrollrun
  net_amount?: number; // Field Access: finance.payrollrun
  branch_id: number | null;
  branch_name: string | null;
  pay_state?: PayrollLinePayState; // Field Access: finance.payrollrun pay_state
  pay_state_label?: string;
  paid_via?: "" | "PAYSTACK" | "OWN_BANK";
  paid_via_label?: string;
  /** The reason a transfer failed, or why a line waits. */
  pay_note?: string; // Field Access: finance.payrollrun pay_note
  payout_reference?: string; // Field Access: finance.payrollrun payout_reference
}

/** How paying a run is going, per branch and per line, for the reader's branches. */
export interface PayrollPayments {
  run_id: number;
  run_status: string;
  payment_route: PayrollPaymentRoute;
  branches: PayrollPaymentBranch[];
  lines: PayrollPaymentLine[];
  counts?: PayrollPaymentCounts; // Field Access: finance.payrollrun pay_state
  /** Whether the run has an approved request, which paying through the provider needs. */
  approved?: boolean; // Field Access: finance.payrollrun pay_state
}

/** Whether a staff member's bank account may be paid. */
export type StaffBankState = "UNVERIFIED" | "VERIFIED" | "NEEDS_CONFIRMATION" | "CONFIRMED" | "FAILED";

/** A member of staff's bank account for payroll through the provider. */
export interface StaffBankAccount {
  id: number;
  employee_id: number;
  employee_name?: string; // Field Access: finance.staff_bank employee
  bank_code?: string; // Field Access: finance.staff_bank bank
  bank_name?: string; // Field Access: finance.staff_bank bank
  account_number?: string; // Field Access: finance.staff_bank account_number
  /** The holder's name the bank gave. */
  resolved_account_name?: string; // Field Access: finance.staff_bank resolved_account_name
  verification_state?: StaffBankState; // Field Access: finance.staff_bank verification_state
  verification_state_label?: string;
  verification_note?: string;
  verified_at?: string | null;
  is_payable?: boolean;
  /** True when the reader may confirm this account now; absent when the check status is hidden. */
  can_confirm?: boolean; // Field Access: finance.staff_bank verification_state
  changed_by_name?: string | null; // Field Access: finance.staff_bank changed_by
  confirmed_by_name?: string | null; // Field Access: finance.staff_bank confirmation
  confirmed_at?: string | null;
  updated_at?: string; // Field Access: finance.staff_bank changed_by
  _read_only_fields?: string[];
}

/** A bank the provider can pay into. */
export interface ProviderBank {
  name: string;
  code: string;
}

/** The body that saves a staff member's bank account. */
export interface StaffBankAccountBody {
  bank_code?: string;
  bank_name?: string;
  account_number?: string;
}

/** A member of payroll staff who has no bank account yet. */
export interface StaffWithoutBankAccount {
  employee_id: number;
  employee_name?: string; // Field Access: finance.staff_bank employee
  branch_id: number | null;
  branch_name: string | null;
}
