import type { PaymentsSection } from "./console-sections";

/**
 * The title and subtitle of each Payments screen. The provider-activity
 * subtitle names whoever made the requests in the application's own voice
 * (`platformName` from the host: XVS in the school app, CodeX in the console),
 * so a school never meets the company's name and an operator never meets the
 * product's.
 */
export function paymentsHeadings(product: string): Record<PaymentsSection, { label: string; subtitle: string }> {
  return {
    payouts: { label: "Payouts", subtitle: "Money out - single disbursements to recipients." },
    batches: { label: "Payout Batches", subtitle: "Assemble a batch of payouts and submit them in one run." },
    settlement: { label: "Settlement", subtitle: "Match the provider's payouts to the bank, and book them as settlements." },
    transactions: { label: "Transactions Log", subtitle: "Lists the money coming in and going out: every collection, payout and transfer." },
    "provider-activity": { label: "Payment provider activity", subtitle: `Every request ${product} made to the payment provider, including refused and failed ones.` },
    webhooks: { label: "Needs Attention", subtitle: "Provider events that did not make it into the books." },
    "held-settlements": { label: "Held Settlements", subtitle: "Online payments held for each branch, paid into its bank." },
    "held-reconciliations": { label: "Held Reconciliations", subtitle: "The daily check of held money against the payment provider." },
  };
}
