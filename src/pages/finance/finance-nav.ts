/**
 * Finance console sidebar (§6) - grouped into labelled sections like the design
 * (Ledger & Setup / Receivables / Operations / Reports & Close). Items are flat
 * leaves (each a real route); each is gated by the backend key prefixes its
 * screen calls. Dashboard is pinned above the first group.
 */

import {
  LayoutDashboard, BookOpen, ListTree, Building2, CalendarDays,
  Coins, Percent, Layers, ReceiptText, Users, CreditCard, FileMinus, Undo2,
  CalendarClock, BadgePercent, BellRing, ListChecks, Landmark, Wallet,
  PiggyBank, Boxes, Scale, TrendingUp, ArrowLeftRight, GitBranch, ScrollText,
  CircleDollarSign, Send, Settings, AlertTriangle,
} from "lucide-react";
import type { ConsoleNavGroup } from "@/components/finance-ui/console-nav";
import { routesPath } from "@/routes/routes-path";

const F = routesPath.PROTECTED.FINANCE;

export const financeNav: ConsoleNavGroup[] = [
  { items: [{ title: "Dashboard", url: F.INDEX, icon: LayoutDashboard }] },

  {
    label: "Ledger & Setup",
    items: [
      { title: "Chart of Accounts", url: `${F.SETUP}/accounts`, icon: ListTree, prefixes: ["finance.account."] },
      { title: "General Ledger", url: F.LEDGER, icon: BookOpen, prefixes: ["finance.journal.", "finance.directentry."] },
      { title: "Entities", url: `${F.SETUP}/entities`, icon: Building2, prefixes: ["finance.entity."] },
      { title: "Fiscal Periods", url: `${F.SETUP}/periods`, icon: CalendarDays, prefixes: ["finance.period."] },
      { title: "Currencies & FX", url: `${F.SETUP}/currencies`, icon: Coins, prefixes: ["finance.currency.", "finance.fxrate."] },
      { title: "Tax Codes", url: `${F.SETUP}/tax-codes`, icon: Percent, prefixes: ["finance.taxcode."] },
      { title: "Cost Centres", url: `${F.SETUP}/cost-centers`, icon: Layers, prefixes: ["finance.costcenter."] },
      { title: "Dimensions", url: `${F.SETUP}/dimensions`, icon: GitBranch, prefixes: ["finance.dimension."] },
    ],
  },

  {
    label: "Receivables",
    items: [
      { title: "Customers / Payers", url: `${F.RECEIVABLES}/customers`, icon: Users, prefixes: ["finance.customer."] },
      { title: "AR Invoices", url: `${F.RECEIVABLES}/invoices`, icon: ReceiptText, prefixes: ["finance.invoice."] },
      { title: "Receipts & Allocation", url: F.RECEIPTS_ALLOCATION, icon: CreditCard, prefixes: ["finance.payment."] },
      { title: "Credit / Debit Notes", url: `${F.RECEIVABLES}/credit-notes`, icon: FileMinus, prefixes: ["finance.creditnote."] },
      { title: "Refunds & Write-offs", url: `${F.RECEIVABLES}/refunds`, icon: Undo2, prefixes: ["finance.refund.", "finance.invoice.writeoff"] },
      { title: "Payment Plans", url: `${F.RECEIVABLES}/payment-plans`, icon: CalendarClock, prefixes: ["finance.paymentplan."] },
      { title: "Concessions", url: `${F.RECEIVABLES}/concessions`, icon: BadgePercent, prefixes: ["finance.concession."] },
      { title: "Dunning", url: `${F.RECEIVABLES}/dunning`, icon: BellRing, prefixes: ["finance.dunning."] },
      { title: "Fee Structures", url: `${F.RECEIVABLES}/fee-structures`, icon: ListChecks, prefixes: ["finance.feestructure."] },
    ],
  },

  {
    label: "Operations",
    items: [
      { title: "Bank Accounts", url: F.BANKING, icon: Landmark, prefixes: ["finance.bankaccount."] },
      { title: "Bank Reconciliation", url: F.BANK_RECON, icon: Scale, prefixes: ["finance.bankaccount."] },
      { title: "Expense Claims", url: `${F.EXPENSES}/claims`, icon: Wallet, prefixes: ["finance.expenseclaim."] },
      { title: "Petty Cash", url: `${F.EXPENSES}/petty-cash`, icon: Coins, prefixes: ["finance.pettycash."] },
      { title: "Payroll", url: F.PAYROLL, icon: Users, prefixes: ["finance.payrollrun."] },
      { title: "Budgets & Forecasts", url: `${F.BUDGETS}/budgets`, icon: PiggyBank, prefixes: ["finance.budget."] },
      { title: "Fixed Assets", url: `${F.BUDGETS}/assets`, icon: Boxes, prefixes: ["finance.fixedasset."] },
      { title: "Tax Remittance", url: `${F.BUDGETS}/tax`, icon: Percent, prefixes: ["finance.tax."] },
    ],
  },

  {
    label: "Payments",
    items: [
      { title: "Collections", url: F.COLLECTIONS, icon: CircleDollarSign, prefixes: ["payments.collection."] },
      { title: "Virtual Accounts", url: `${F.COLLECTIONS}/virtual-accounts`, icon: Landmark, prefixes: ["payments.collection."] },
      { title: "Payouts", url: `${F.PAYMENTS}/payouts`, icon: Send, prefixes: ["payments.payout."] },
      { title: "Batches", url: `${F.PAYMENTS}/batches`, icon: Layers, prefixes: ["payments.payout."] },
      { title: "Settlement", url: `${F.PAYMENTS}/settlement`, icon: ArrowLeftRight, prefixes: ["payments.report."] },
      { title: "Transactions Log", url: `${F.PAYMENTS}/transactions`, icon: ScrollText, prefixes: ["payments.report."] },
      { title: "Needs Attention", url: `${F.PAYMENTS}/webhooks`, icon: AlertTriangle, prefixes: ["payments.webhook."] },
    ],
  },

  {
    label: "Reports & Close",
    items: [
      { title: "Trial Balance", url: `${F.REPORTS}/trial-balance`, icon: Scale, prefixes: ["finance.report."] },
      { title: "Income Statement", url: `${F.REPORTS}/income-statement`, icon: TrendingUp, prefixes: ["finance.report."] },
      { title: "Balance Sheet", url: `${F.REPORTS}/balance-sheet`, icon: Scale, prefixes: ["finance.report."] },
      { title: "Cash Flow", url: `${F.REPORTS}/cash-flow`, icon: ArrowLeftRight, prefixes: ["finance.report."] },
      { title: "Changes in Equity", url: `${F.REPORTS}/changes-in-equity`, icon: GitBranch, prefixes: ["finance.report."] },
      { title: "Cost & Dimension Analysis", url: `${F.REPORTS}/analytics`, icon: Layers, prefixes: ["finance.report."] },
      { title: "Audit Trail", url: F.AUDIT, icon: ScrollText, prefixes: ["finance.audit."] },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Settings", url: F.SETTINGS, icon: Settings, prefixes: ["finance.settings."] },
    ],
  },
];
