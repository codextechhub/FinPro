/**
 * Finance console sidebar, grouped into labelled sections (Ledger & Setup,
 * Receivables, Operations, Between Branches, Payments, Reports & Close). Items
 * are flat leaves, each a real route, gated by the view permission its landing
 * list requires; see console-nav.ts for the rules. Dashboard is pinned above
 * the first group. Between Branches is offered only at a school with more than
 * one branch (`multiBranch`).
 */

import {
  LayoutDashboard, BookOpen, ListTree, Building2, CalendarDays,
  Coins, Percent, Layers, ReceiptText, Users, CreditCard, FileMinus, Undo2,
  CalendarClock, BadgePercent, BellRing, ListChecks, Landmark, Wallet,
  PiggyBank, Boxes, Scale, TrendingUp, ArrowLeftRight, GitBranch, ScrollText,
  CircleDollarSign, Send, Settings, AlertTriangle, ArrowRightLeft, HandCoins, Split, Handshake,
  Gavel, ShieldCheck, Hourglass, ShieldAlert, Lock,
} from "lucide-react";
import type { ConsoleNavGroup } from "@/components/finance-ui/console-nav";
import { routesPath } from "@/routes/routes-path";
import { P } from "../../permissions";
import { INTER_BRANCH_PATH } from "./console-sections";

const F = routesPath.PROTECTED.FINANCE;
const IB = INTER_BRANCH_PATH;

export const financeNav: ConsoleNavGroup[] = [
  { items: [{ title: "Dashboard", url: F.INDEX, icon: LayoutDashboard }] },

  {
    label: "Ledger & Setup",
    items: [
      { title: "Chart of Accounts", url: `${F.SETUP}/accounts`, icon: ListTree, permissions: [P.FIN_VIEW_ACCOUNTS] },
      { title: "General Ledger", url: F.LEDGER, icon: BookOpen, permissions: [P.FIN_VIEW_JOURNALS], resources: ["finance.directentry"] },
      { title: "Entities", url: `${F.SETUP}/entities`, icon: Building2, permissions: [P.FIN_VIEW_ENTITIES] },
      { title: "Fiscal Periods", url: `${F.SETUP}/periods`, icon: CalendarDays, permissions: [P.FIN_VIEW_PERIODS], resources: ["finance.fiscalyear"] },
      { title: "Currencies & FX", url: `${F.SETUP}/currencies`, icon: Coins, permissions: [P.FIN_VIEW_CURRENCIES, P.FIN_VIEW_FX_RATES] },
      { title: "Tax Codes", url: `${F.SETUP}/tax-codes`, icon: Percent, permissions: [P.FIN_VIEW_TAX_CODES] },
      { title: "Cost Centres", url: `${F.SETUP}/cost-centers`, icon: Layers, permissions: [P.FIN_VIEW_COST_CENTERS] },
      { title: "Dimensions", url: `${F.SETUP}/dimensions`, icon: GitBranch, permissions: [P.FIN_VIEW_DIMENSIONS] },
      // The national PAYE tables, states and PFAs. Everybody in finance may read
      // them, but the screen is for the platform staff who keep them, so it opens
      // on the keys that change them.
      { title: "Tax Tables", url: `${F.SETUP}/tax-tables`, icon: Gavel, permissions: [P.FIN_CREATE_STATUTORY, P.FIN_UPDATE_STATUTORY] },
    ],
  },

  {
    label: "Receivables",
    items: [
      { title: "Customers / Payers", url: `${F.RECEIVABLES}/customers`, icon: Users, permissions: [P.FIN_VIEW_CUSTOMERS] },
      { title: "AR Invoices", url: `${F.RECEIVABLES}/invoices`, icon: ReceiptText, permissions: [P.FIN_VIEW_INVOICES] },
      { title: "Receipts & Allocation", url: F.RECEIPTS_ALLOCATION, icon: CreditCard, permissions: [P.FIN_VIEW_PAYMENTS] },
      { title: "Credit / Debit Notes", url: `${F.RECEIVABLES}/credit-notes`, icon: FileMinus, permissions: [P.FIN_VIEW_CREDIT_NOTES] },
      { title: "Refunds & Write-offs", url: `${F.RECEIVABLES}/refunds`, icon: Undo2, permissions: [P.FIN_VIEW_REFUNDS, P.FIN_VIEW_WRITE_OFFS] },
      { title: "Payment Plans", url: `${F.RECEIVABLES}/payment-plans`, icon: CalendarClock, permissions: [P.FIN_VIEW_PAYMENT_PLANS] },
      { title: "Concessions", url: `${F.RECEIVABLES}/concessions`, icon: BadgePercent, permissions: [P.FIN_VIEW_CONCESSIONS] },
      { title: "Dunning", url: `${F.RECEIVABLES}/dunning`, icon: BellRing, permissions: [P.FIN_VIEW_DUNNING] },
      { title: "Fee Structures", url: `${F.RECEIVABLES}/fee-structures`, icon: ListChecks, permissions: [P.FIN_VIEW_FEE_STRUCTURES] },
      { title: "Payer Payments", url: `${F.RECEIVABLES}/payer-payments`, icon: HandCoins, permissions: [P.FIN_VIEW_PAYMENTS] },
      { title: "Credit Transfers", url: `${F.RECEIVABLES}/credit-transfers`, icon: ArrowRightLeft, permissions: [P.FIN_VIEW_CREDIT_TRANSFERS] },
      { title: "Deferred Income", url: `${F.RECEIVABLES}/deferred-income`, icon: Hourglass, permissions: [P.FIN_VIEW_DEFERRED_INCOME] },
      { title: "Doubtful Debts", url: `${F.RECEIVABLES}/provisions`, icon: ShieldAlert, permissions: [P.FIN_VIEW_PROVISIONS] },
      { title: "Deposits", url: `${F.RECEIVABLES}/deposits`, icon: Lock, permissions: [P.FIN_VIEW_DEPOSITS] },
    ],
  },

  {
    label: "Operations",
    items: [
      { title: "Bank Accounts", url: F.BANKING, icon: Landmark, permissions: [P.FIN_VIEW_BANK_ACCOUNTS], resources: ["finance.banktransaction", "finance.banktransfer"] },
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
    label: "Between Branches",
    items: [
      { title: "Inter-branch Transfers", url: `${IB}/transfers`, icon: ArrowRightLeft, permissions: [P.FIN_VIEW_INTERBRANCH], resources: ["finance.interbranch"], multiBranch: true },
      { title: "Inter-branch Balances", url: `${IB}/balances`, icon: Scale, permissions: [P.FIN_VIEW_INTERBRANCH], multiBranch: true },
      { title: "Held Receipts", url: `${IB}/held-receipts`, icon: HandCoins, permissions: [P.FIN_VIEW_PAYMENTS], multiBranch: true },
      { title: "Recharges", url: `${IB}/recharges`, icon: Split, permissions: [P.FIN_VIEW_INTERBRANCH], multiBranch: true },
      { title: "Shared Cost Rules", url: `${IB}/cost-rules`, icon: Handshake, permissions: [P.FIN_VIEW_INTERBRANCH], multiBranch: true },
    ],
  },

  {
    label: "Payments",
    items: [
      { title: "Collections", url: F.COLLECTIONS, icon: CircleDollarSign, permissions: [P.PAY_VIEW_COLLECTIONS] },
      { title: "Virtual Accounts", url: `${F.COLLECTIONS}/virtual-accounts`, icon: Landmark, permissions: [P.PAY_VIEW_VIRTUAL_ACCOUNTS] },
      { title: "Payouts", url: `${F.PAYMENTS}/payouts`, icon: Send, permissions: [P.PAY_VIEW_PAYOUTS] },
      { title: "Batches", url: `${F.PAYMENTS}/batches`, icon: Layers, permissions: [P.PAY_VIEW_PAYOUTS], resources: ["payments.payout_batch"] },
      { title: "Settlement", url: `${F.PAYMENTS}/settlement`, icon: ArrowLeftRight, permissions: [P.PAY_VIEW_PAYMENT_REPORTS], resources: ["payments.settlement"] },
      // A school reads what the platform paid its branches; a platform operator
      // reads every school's settlements and puts them forward for approval.
      { title: "Held Settlements", url: `${F.PAYMENTS}/held-settlements`, icon: HandCoins, permissions: [P.PAY_VIEW_PAYMENT_REPORTS, P.PAY_VIEW_PLATFORM_SETTLEMENTS], resources: ["payments.platform_settlement"] },
      // Platform only: the daily check of held money against the provider, and
      // the platform's own provider account settings.
      { title: "Held Reconciliations", url: `${F.PAYMENTS}/held-reconciliations`, icon: ShieldCheck, permissions: [P.PAY_VIEW_PLATFORM_SETTLEMENTS, P.PAY_VIEW_PLATFORM_PROVIDER, P.PAY_UPDATE_PLATFORM_PROVIDER], resources: ["payments.platform_provider"] },
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
      { title: "Sealed Figures", url: `${F.REPORTS}/seals`, icon: ShieldCheck, permissions: [P.FIN_VIEW_SEALS] },
      { title: "Audit Trail", url: F.AUDIT, icon: ScrollText, permissions: [P.FIN_VIEW_AUDIT] },
    ],
  },
  {
    label: "Administration",
    items: [
      // Online payments (custody, branch subaccounts) is a panel under Banking and cash.
      { title: "Settings", url: F.SETTINGS, icon: Settings, permissions: [P.FIN_VIEW_SETTINGS], resources: ["payments.settings"] },
    ],
  },
];
