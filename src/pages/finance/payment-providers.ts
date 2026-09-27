/**
 * The payment gateways money moves through, as every payments screen names them.
 *
 * `FAKE` is the backend's in-memory test gateway: it issues made-up account
 * numbers and moves no money. It is offered as a choice only in a development
 * build, because a bursar who picks it in production gets a checkout link or a
 * virtual account that no payer can ever pay into. A row that already names it
 * is still labelled, so old test data reads as what it is.
 */

export interface ProviderInfo {
  label: string;
  /** The colour of the small square beside the name. */
  dot: string;
}

const PROVIDERS: Record<string, ProviderInfo & { test?: true }> = {
  PAYSTACK: { label: "Paystack", dot: "bg-blue-500" },
  FAKE: { label: "Fake (test)", dot: "bg-gray-400", test: true },
};

/** How a stored provider code reads; an unknown code is shown as stored. */
export function providerInfo(code?: string | null): ProviderInfo {
  const known = code ? PROVIDERS[code] : undefined;
  return known ? { label: known.label, dot: known.dot } : { label: code || "-", dot: "bg-gray-400" };
}

/** The providers a picker or filter offers, test gateways only when asked for. */
export function providerChoices(includeTest: boolean): [string, ProviderInfo][] {
  return Object.entries(PROVIDERS)
    .filter(([, info]) => includeTest || !info.test)
    .map(([code, { label, dot }]) => [code, { label, dot }]);
}

/** The providers this build offers: the test gateway in a development build only. */
export const PROVIDER_CHOICES = providerChoices(import.meta.env.DEV);
