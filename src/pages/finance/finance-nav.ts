/**
 * Finance console navigation.
 *
 * Dashboard and Settings are direct destinations. Fixed section labels divide
 * the console, and each menu beneath them expands to its destination links.
 * Permission, branch-shape and custody gates remain on the leaf screens.
 */

import {
  Activity, ArrowLeftRight, BarChart3, BellRing, BookOpen, CircleDollarSign,
  Coins, FileMinus, GitBranch, HandCoins, Hourglass, Layers, LayoutDashboard,
  Landmark, PiggyBank, ReceiptText, Scale, Send, Settings, ShieldCheck, Wallet,
} from "lucide-react";
import type { ConsoleNavGroup, ConsoleNavItem } from "@/components/finance-ui/console-nav";
import { routesPath } from "@/routes/routes-path";
import { P } from "../../permissions";
import { INTER_BRANCH_PATH } from "./console-sections";

const F = routesPath.PROTECTED.FINANCE;
const IB = INTER_BRANCH_PATH;
const branch = (title: string, children: ConsoleNavItem[]): ConsoleNavItem => ({
  title, url: children[0]?.url ?? F.INDEX, children,
});

export const financeNav: ConsoleNavGroup[] = [
  { items: [{ title: "Dashboard", url: F.INDEX, icon: LayoutDashboard }] },
  {
    label: "Ledger & Setup",
    items: [
      { ...branch("Books", [
        { title: "General Ledger", url: F.LEDGER, permissions: [P.FIN_VIEW_JOURNALS], resources: ["finance.directentry"] },
        { title: "Chart of Accounts", url: `${F.SETUP}/accounts`, permissions: [P.FIN_VIEW_ACCOUNTS] },
        { title: "Fiscal Periods", url: `${F.SETUP}/periods`, permissions: [P.FIN_VIEW_PERIODS], resources: ["finance.fiscalyear"] },
      ]), icon: BookOpen },
      { ...branch("Organisation & Analysis", [
        { title: "Entities", url: `${F.SETUP}/entities`, aliases: [F.SETUP], permissions: [P.FIN_VIEW_ENTITIES] },
        { title: "Cost Centres", url: `${F.SETUP}/cost-centers`, permissions: [P.FIN_VIEW_COST_CENTERS] },
        { title: "Dimensions", url: `${F.SETUP}/dimensions`, permissions: [P.FIN_VIEW_DIMENSIONS] },
      ]), icon: GitBranch },
      { ...branch("Tax & Currency", [
        { title: "Currencies & FX", url: `${F.SETUP}/currencies`, permissions: [P.FIN_VIEW_CURRENCIES, P.FIN_VIEW_FX_RATES] },
        { title: "Tax Codes", url: `${F.SETUP}/tax-codes`, permissions: [P.FIN_VIEW_TAX_CODES] },
        { title: "Tax Tables", url: `${F.SETUP}/tax-tables`, permissions: [P.FIN_CREATE_STATUTORY, P.FIN_UPDATE_STATUTORY] },
      ]), icon: Scale },
    ],
  },
  { label: "Receivables", items: [
    { ...branch("Customers & Billing", [
      { title: "Customers / Payers", url: `${F.RECEIVABLES}/customers`, permissions: [P.FIN_VIEW_CUSTOMERS] },
      { title: "Fee Structures", url: `${F.RECEIVABLES}/fee-structures`, permissions: [P.FIN_VIEW_FEE_STRUCTURES] },
      { title: "Invoices", url: `${F.RECEIVABLES}/invoices`, aliases: [F.RECEIVABLES], permissions: [P.FIN_VIEW_INVOICES] },
    ]), icon: ReceiptText },
    { ...branch("Money Received", [
      { title: "Receipts & Allocation", url: F.RECEIPTS_ALLOCATION, permissions: [P.FIN_VIEW_PAYMENTS] },
      { title: "Payer Payments", url: `${F.RECEIVABLES}/payer-payments`, permissions: [P.FIN_VIEW_PAYMENTS] },
      { title: "Deposits", url: `${F.RECEIVABLES}/deposits`, permissions: [P.FIN_VIEW_DEPOSITS] },
      { title: "Credit Transfers", url: `${F.RECEIVABLES}/credit-transfers`, permissions: [P.FIN_VIEW_CREDIT_TRANSFERS] },
    ]), icon: HandCoins },
    { ...branch("Adjustments", [
      { title: "Credit / Debit Notes", url: `${F.RECEIVABLES}/credit-notes`, permissions: [P.FIN_VIEW_CREDIT_NOTES] },
      { title: "Refunds & Write-offs", url: `${F.RECEIVABLES}/refunds`, permissions: [P.FIN_VIEW_REFUNDS, P.FIN_VIEW_WRITE_OFFS] },
      { title: "Concessions", url: `${F.RECEIVABLES}/concessions`, permissions: [P.FIN_VIEW_CONCESSIONS] },
    ]), icon: FileMinus },
    { ...branch("Collection Follow-up", [
      { title: "Payment Plans", url: `${F.RECEIVABLES}/payment-plans`, permissions: [P.FIN_VIEW_PAYMENT_PLANS] },
      { title: "Dunning", url: `${F.RECEIVABLES}/dunning`, permissions: [P.FIN_VIEW_DUNNING] },
      { title: "Doubtful Debts", url: `${F.RECEIVABLES}/provisions`, permissions: [P.FIN_VIEW_PROVISIONS] },
    ]), icon: BellRing },
    { ...branch("Revenue Timing", [
      { title: "Deferred Income", url: `${F.RECEIVABLES}/deferred-income`, permissions: [P.FIN_VIEW_DEFERRED_INCOME] },
    ]), icon: Hourglass },
  ] },
  { label: "Operations", items: [
    { ...branch("Banking", [
      { title: "Bank Accounts", url: F.BANKING, permissions: [P.FIN_VIEW_BANK_ACCOUNTS], resources: ["finance.banktransaction", "finance.banktransfer"] },
      { title: "Bank Reconciliation", url: F.BANK_RECON, permissions: [P.FIN_VIEW_BANK_ACCOUNTS] },
    ]), icon: Wallet },
    { ...branch("Spending", [
      { title: "Expense Claims", url: `${F.EXPENSES}/claims`, aliases: [F.EXPENSES], permissions: [P.FIN_VIEW_EXPENSE_CLAIMS] },
      { title: "Petty Cash", url: `${F.EXPENSES}/petty-cash`, permissions: [P.FIN_VIEW_PETTY_CASH], resources: ["finance.pettycashvoucher"] },
      { title: "Payroll", url: F.PAYROLL, permissions: [P.FIN_VIEW_PAYROLL], resources: ["finance.salary"] },
    ]), icon: Coins },
    { ...branch("Planning & Compliance", [
      { title: "Budgets & Forecasts", url: `${F.BUDGETS}/budgets`, aliases: [F.BUDGETS], permissions: [P.FIN_VIEW_BUDGETS] },
      { title: "Fixed Assets", url: `${F.BUDGETS}/assets`, permissions: [P.FIN_VIEW_FIXED_ASSETS] },
      { title: "Tax Remittance", url: `${F.BUDGETS}/tax`, permissions: [P.FIN_VIEW_TAX] },
    ]), icon: PiggyBank },
  ] },
  { label: "Between Branches", items: [
    { ...branch("Money Movement", [
      { title: "Inter-branch Transfers", url: `${IB}/transfers`, permissions: [P.FIN_VIEW_INTERBRANCH], resources: ["finance.interbranch"], multiBranch: true },
      { title: "Held Receipts", url: `${IB}/held-receipts`, permissions: [P.FIN_VIEW_PAYMENTS], multiBranch: true },
    ]), icon: ArrowLeftRight },
    { ...branch("Balances & Shared Costs", [
      { title: "Inter-branch Balances", url: `${IB}/balances`, permissions: [P.FIN_VIEW_INTERBRANCH], multiBranch: true },
      { title: "Recharges", url: `${IB}/recharges`, permissions: [P.FIN_VIEW_INTERBRANCH], multiBranch: true },
      { title: "Shared Cost Rules", url: `${IB}/cost-rules`, permissions: [P.FIN_VIEW_INTERBRANCH], multiBranch: true },
    ]), icon: Layers },
  ] },
  { label: "Payments", items: [
    { ...branch("Money In", [
      { title: "Collections", url: F.COLLECTIONS, permissions: [P.PAY_VIEW_COLLECTIONS] },
      { title: "Virtual Accounts", url: `${F.COLLECTIONS}/virtual-accounts`, permissions: [P.PAY_VIEW_VIRTUAL_ACCOUNTS] },
    ]), icon: CircleDollarSign },
    { ...branch("Money Out", [
      { title: "Payouts", url: `${F.PAYMENTS}/payouts`, aliases: [F.PAYMENTS], permissions: [P.PAY_VIEW_PAYOUTS], heldCustody: true },
      { title: "Batches", url: `${F.PAYMENTS}/batches`, permissions: [P.PAY_VIEW_PAYOUTS], resources: ["payments.payout_batch"], heldCustody: true },
    ]), icon: Send },
    { ...branch("Settlement", [
      { title: "Settlement", url: `${F.PAYMENTS}/settlement`, permissions: [P.PAY_VIEW_PAYMENT_REPORTS], resources: ["payments.settlement"] },
    ]), icon: Landmark },
    { ...branch("Platform Controls", [
      { title: "Held Settlements", url: `${F.PAYMENTS}/held-settlements`, permissions: [P.PAY_VIEW_PAYMENT_REPORTS, P.PAY_VIEW_PLATFORM_SETTLEMENTS], resources: ["payments.platform_settlement"] },
      { title: "Held Reconciliations", url: `${F.PAYMENTS}/held-reconciliations`, permissions: [P.PAY_VIEW_PLATFORM_SETTLEMENTS, P.PAY_VIEW_PLATFORM_PROVIDER, P.PAY_UPDATE_PLATFORM_PROVIDER], resources: ["payments.platform_provider"] },
    ]), icon: ShieldCheck },
    { ...branch("Monitoring", [
      { title: "Transactions Log", url: `${F.PAYMENTS}/transactions`, permissions: [P.PAY_VIEW_PAYMENT_REPORTS] },
      { title: "Payment provider activity", url: `${F.PAYMENTS}/provider-activity`, permissions: [P.PAY_VIEW_PAYMENT_REPORTS] },
      { title: "Needs Attention", url: `${F.PAYMENTS}/webhooks`, permissions: [P.PAY_VIEW_WEBHOOKS] },
    ]), icon: Activity },
  ] },
  { label: "Reports & Close", items: [
    { ...branch("Financial Statements", [
      { title: "Trial Balance", url: `${F.REPORTS}/trial-balance`, aliases: [F.REPORTS], permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Income Statement", url: `${F.REPORTS}/income-statement`, permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Balance Sheet", url: `${F.REPORTS}/balance-sheet`, permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Cash Flow", url: `${F.REPORTS}/cash-flow`, permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Changes in Equity", url: `${F.REPORTS}/changes-in-equity`, permissions: [P.FIN_VIEW_REPORTS] },
      { title: "Statutory Pack", url: `${F.REPORTS}/statutory-pack`, permissions: [P.FIN_VIEW_REPORTS], wholeSchool: true },
    ]), icon: Scale },
    { ...branch("Analysis", [
      { title: "Cost & Dimension Analysis", url: `${F.REPORTS}/analytics`, permissions: [P.FIN_VIEW_REPORTS] },
    ]), icon: BarChart3 },
    { ...branch("Close & Assurance", [
      { title: "Closed figures", url: `${F.REPORTS}/seals`, permissions: [P.FIN_VIEW_SEALS] },
      { title: "Audit Trail", url: F.AUDIT, permissions: [P.FIN_VIEW_AUDIT] },
    ]), icon: ShieldCheck },
  ] },
  { label: "Administration", items: [{ title: "Settings", url: F.SETTINGS, icon: Settings, permissions: [P.FIN_VIEW_SETTINGS], resources: ["payments.settings"] }] },
];
