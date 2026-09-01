export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
export const ACCOUNT_CODE_LENGTH = 4;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

const ACCOUNT_TYPE_BY_PREFIX: Record<string, AccountType> = {
  "1": "ASSET",
  "2": "LIABILITY",
  "3": "EQUITY",
  "4": "INCOME",
  "5": "EXPENSE",
};

export function accountTypeFromCode(code: string): AccountType | null {
  return ACCOUNT_TYPE_BY_PREFIX[code.trim().charAt(0)] ?? null;
}

export function accountCodeError(code: string, existingCodes?: ReadonlySet<string>): string | null {
  const value = code.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return "Code can contain numbers only.";
  if (!accountTypeFromCode(value)) return "Code must start with 1, 2, 3, 4, or 5.";
  if (value.length !== ACCOUNT_CODE_LENGTH) return `Code must be exactly ${ACCOUNT_CODE_LENGTH} digits.`;
  if (existingCodes?.has(value)) return "This account code already exists.";
  return null;
}

export function isValidAccountCode(code: string, existingCodes?: ReadonlySet<string>): boolean {
  return code.trim() !== "" && accountCodeError(code, existingCodes) === null;
}

export function accountsInCodeLine<T extends { account_type: string; code: string }>(
  accounts: T[],
  code: string,
): T[] {
  const type = accountTypeFromCode(code);
  if (!type) return [];
  return accounts.filter(
    (account) => account.account_type === type && accountTypeFromCode(account.code) === type,
  );
}
