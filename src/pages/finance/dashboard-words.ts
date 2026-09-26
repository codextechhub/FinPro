/**
 * The words the Finance overview uses, by whose books it is showing.
 *
 * The same screen serves a school's books and books that are not a school's (the
 * platform's own, which bill schools for subscriptions). A school's bursar reads
 * "How parents paid" and "Collected this term"; the platform's finance team reads
 * "How customers paid" and "Collected this month", because their payers are
 * schools and their year has no terms. The server says which books these are
 * (`FinanceDashboard.books`); nothing here guesses from the app it runs in.
 */

import type { FinanceDashboard } from "@/redux/services/finance/reports-types";

export interface DashboardWords {
  payers: string;
  channelsTitle: string;
  overdueTitle: string;
  trendSubtitle: string;
  budgetTitle: string;
  branchesTitle: (windowLabel: string) => string;
  /** Money received against invoices, on the cash movement chart. */
  receiptsLabel: string;
  /** Money paid back to payers, on the cash movement chart. */
  refundsLabel: string;
}

const SCHOOL: DashboardWords = {
  payers: "parents",
  channelsTitle: "How parents paid",
  overdueTitle: "Most overdue payers",
  trendSubtitle: "Fee invoices raised and money received, by month",
  budgetTitle: "Against the school's budget",
  branchesTitle: (w) => `Branches ${w.toLowerCase()}`,
  receiptsLabel: "Fee receipts",
  refundsLabel: "Refunds to parents",
};

const GENERAL: DashboardWords = {
  payers: "customers",
  channelsTitle: "How customers paid",
  overdueTitle: "Most overdue customers",
  trendSubtitle: "Invoices raised and money received, by month",
  budgetTitle: "Against the budget",
  branchesTitle: (w) => `Branches ${w.toLowerCase()}`,
  receiptsLabel: "Customer receipts",
  refundsLabel: "Refunds",
};

export function dashboardWords(books: FinanceDashboard["books"] | undefined): DashboardWords {
  return books === "school" ? SCHOOL : GENERAL;
}

/** "This term" → "Collected this term"; "Year to date" → "Collected year to date". */
export function collectedLabel(windowLabel: string): string {
  return `Collected ${windowLabel.charAt(0).toLowerCase()}${windowLabel.slice(1)}`;
}

/** "Good morning", "Good afternoon" or "Good evening" for the reader's local hour. */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
