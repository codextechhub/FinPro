// Ledger-entity types - mirror vs_finance LedgerEntitySerializer /
// LedgerEntityCreateSerializer exactly (read, then write shapes).

/** GET /finance/entities/ - read shape (LedgerEntitySerializer). */
export interface LedgerEntity {
  id: number;
  code: string;
  number_code: string; // 2-3 char reporting code, not the live document-number prefix
  name: string;
  kind: string;
  base_currency: string; // 3-letter ISO code (its PK on the backend)
  is_active: boolean;
  source_school_id: number | null;
}

/** GET /finance/entities/ query params. */
export interface EntityListParams {
  kind?: string;
  is_active?: boolean;
}

/**
 * POST /finance/entities/ - provisioning a new set of books. One call seeds the
 * chart of accounts plus an open fiscal calendar. The fiscal anchors are optional.
 */
export interface CreateEntityPayload {
  code: string;
  number_code?: string; // optional reporting code; backend derives one when blank
  name: string;
  kind?: string;
  base_currency?: string;
  fiscal_year?: number;
  fiscal_start_month?: number;
  fiscal_start_day?: number;
  fiscal_period_frequency?: "MONTHLY" | "QUARTERLY";
}
