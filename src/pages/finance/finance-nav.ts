/**
 * Finance console sidebar, grouped into labelled sections (Ledger & Setup,
 * Receivables, Operations, Payments, Reports & Close). Items are flat leaves,
 * each a real route, gated by the view permission its landing list requires;
 * see console-nav.ts for the rules. Dashboard is pinned above the first group.
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
import { P } from "../../permissions";

const F = routesPath.PROTECTED.FINANCE;

export const financeNav: ConsoleNavGroup[] = [
  { items: [{ title: "Dashboard", url: F.INDEX, icon: LayoutDashboard }] },

  {
    label: "Ledger & Setup",
    items: [
      { title: "Chart of Accounts", url: `${F.SETUP}/accounts`, icon: ListTree, permissions: [P.FIN_VIEW_ACCOUNTS] },
      { title: "General Ledger", url: F.LEDGER, icon: BookOpen, permissions: [P.FIN_VIEW_JOURNALS], resources: ["finance.directentry"] },
      { title: "Entities", url: `${F.SETUP}/entities`, icon: Building2, permissions: [P.FIN_VIEW_ENTITIES] },
      { title: "Fiscal Periods", url: `${F.SETUP}/periods`, icon: CalendarDays, permissions: [P.FIN_VIEW_PERIODS] },
      { title: "Currencies & FX", url: `${F.SETUP}/currencies`, icon: Coins, permissions: [P.FIN_VIEW_CURRENCIES, P.FIN_VIEW_FX_RATES] },
      { title: "Tax Codes", url: `${F.SETUP}/tax-codes`, icon: Percent, permissions: [P.FIN_VIEW_TAX_CODES] },
      { title: "Cost Centres", url: `${F.SETUP}/cost-centers`, icon: Layers, permissions: [P.FIN_VIEW_COST_CENTERS] },
      { title: "Dimensions", url: `${F.SETUP}/dimensions`, icon: GitBranch, permissions: [P.FIN_VIEW_DIMENSIONS] },
    ],
  },

  {
    label: "Receivables",
    items: [
      { title: "Customers / Payers", url: `${F.RECEIVABLES}/customers`, icon: Users, permissions: [P.FIN_VIEW_CUSTOMERS] },
      { title: "AR Invoices", url: `${F.RECEIVABLES}/invoices`, icon: ReceiptText, permissions: [P.FIN_VIEW_INVOICES] },
      { title: "Receipts & Allocation", url: F.RECEIPTS_ALLOCATION, icon: CreditCard, permissions: [P.FIN_VIEW_PAYMENTS] },
      { title: "Credit / Debit Notes", url: `${F.RECEIVABLES}/credit-notes`, icon: FileMinus, permissions: [P.FIN_VIEW_CREDIT_NOTES] },
      { title: "Refunds & Write-offs", url: `${F.RECEIVABLES}/refunds`, icon: Undo2, permissions: [P.FIN_VIEW_REFUNDS], resources: ["finance.writeoff"] },
      { title: "Payment Plans", url: `${F.RECEIVABLES}/payment-plans`, icon: CalendarClock, permissions: [P.FIN_VIEW_PAYMENT_PLANS] },
      { title: "Concessions", url: `${F.RECEIVABLES}/concessions`, icon: BadgePercent, permissions: [P.FIN_VIEW_CONCESSIONS] },
      { title: "Dunning", url: `${F.RECEIVABLES}/dunning`, icon: BellRing, permissions: [P.FIN_VIEW_DUNNING] },
      { title: "Fee Structures", url: `${F.RECEIVABLES}/fee-structures`, icon: ListChecks, permissions: [P.FIN_VIEW_FEE_STRUCTURES] },
    ],
  },

  {
    label: "Operations",
    items: [
      { title: "Bank Accounts", url: F.BANKING, icon: Landmark, permissions: [P.FIN_VIEW_BANK_ACCOUNTS] },
      { title: "Bank Reconciliation", url: F.BANK_RECON, icon: Scale, permissions: [P.FIN_VIEW_BANK_ACCOUNTS] },
      { title: "Expense Claims", url: `${F.EXPENSES}/claims`, icon: Wallet, permissions: [P.FIN_VIEW_EXPENSE_CLAIMS] },
      { title: "Petty Cash", url: `${F.EXPENSES}/petty-cash`, icon: Coins, permissions: [P.FIN_VIEW_PETTY_CASH], resources: ["finance.pettycashvoucher"] },
      { title: "Payroll", url: F.PAYROLL, icon: Users, permissions: [P.FIN_VIEW_PAYROLL], resources: ["finance.salary"] },
      { title: "Budgets & Forecasts", url: `${F.BUDGETS}/budgets`, icon: PiggyBank, permissions: [P.FIN_VIEW_BUDGETS] },
      { title: "Fixed Assets", url: `${F.BUDGETS}/assets`, icon: Boxes, permissions: [P.FIN_VIEW_FIXED_ASSETS] },
      { title: "Tax Remittance", url: `${F.BUDGETS}/tax`, icon: Percent, permissions: [P.FIN_VIEW_TAX] },
    ],
  },

  {
    label: "Payments",
    items: [
      { title: "Collections", url: F.COLLECTIONS, icon: CircleDollarSign, permissions: [P.PAY_VIEW_COLLECTIONS] },
      { title: "Virtual Accounts", url: `${F.COLLECTIONS}/virtual-accounts`, icon: Landmark, permissions: [P.PAY_VIEW_VIRTUAL_ACCOUNTS] },
      { title: "Payouts", url: `${F.PAYMENTS}/payouts`, icon: Send, permissions: [P.PAY_VIEW_PAYOUTS] },
      { title: "Batches", url: `${F.PAYMENTS}/batches`, icon: Layers, permissions: [P.PAY_VIEW_PAYOUTS], resources: ["payments.payout_batch"] },
      { title: "Settlement", url: `${F.PAYMENTS}/settlement`, icon: ArrowLeftRight, permissions: [P.PAY_VIEW_PAYMENT_REPORTS] },
      { title: "Transactions Log", url: `${F.PAYMENTS}/transactions`, icon: ScrollText, permissions: [P.PAY_VIEW_PAYMENT_REPORTS] },
      { title: "Needs Attention", url: `${F.PAYMENTS}/webhooks`, icon: AlertTriangle, permissions: [P.PAY_VIEW_WEBHOOKS] },
    ],
  },

  {
    label: "Reports & Close",
    items: [
      { title: "Trial Balance", url: `${F.REPORTS}/trial-balance`, icon: Scale, permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Income Statement", url: `${F.REPORTS}/income-statement`, icon: TrendingUp, permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Balance Sheet", url: `${F.REPORTS}/balance-sheet`, icon: Scale, permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Cash Flow", url: `${F.REPORTS}/cash-flow`, icon: ArrowLeftRight, permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Changes in Equity", url: `${F.REPORTS}/changes-in-equity`, icon: GitBranch, permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Cost & Dimension Analysis", url: `${F.REPORTS}/analytics`, icon: Layers, permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Audit Trail", url: F.AUDIT, icon: ScrollText, permissions: [P.FIN_VIEW_AUDIT] },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Settings", url: F.SETTINGS, icon: Settings, permissions: [P.FIN_VIEW_SETTINGS] },
    ],
  },
];
