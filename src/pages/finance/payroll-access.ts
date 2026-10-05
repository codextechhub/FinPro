/**
 * Field Access for a salary record, with the three body keys that change a pay
 * figure without being one.
 *
 * The server judges a salary write by what it changes. Three of the record's
 * keys are not registered fields of their own, yet changing one changes a
 * figure the role may be barred from changing: the state of residence decides
 * which state's PAYE is charged, the pension fund administrator decides where
 * pension goes, and the salary structure shapes the pay breakdown. So each is
 * writable only where its figure is (`vs_finance.field_access.PAY_WRITE_ALIASES`),
 * and a form greys it and leaves it out of the body exactly as it would the
 * figure. Reading them is not reading a figure, so whether they show is
 * unchanged.
 *
 * Mrs Okafor may read pay but not change PAYE. Her form shows Aisha's state of
 * residence greyed, so a save that corrects Aisha's name never carries a new
 * state for the server to refuse.
 */

import type { FieldAccess, ReadOnlyOptions } from "@/components/finance-ui";

/** Each body key that changes a figure, mapped to the figure whose write switch governs it. */
export const PAY_WRITE_ALIASES: Readonly<Record<string, string>> = {
  residence_state: "paye_amount",
  pfa: "pension_amount",
  structure: "components",
};

/** `access` with the aliased keys judged by their figure's write switch. */
export function withPayAliases(access: FieldAccess): FieldAccess {
  const isReadOnly = (name: string, options?: ReadOnlyOptions) =>
    access.isReadOnly(PAY_WRITE_ALIASES[name] ?? name, options);
  return {
    ...access,
    isReadOnly,
    writableOnly: (body, options) => Object.fromEntries(
      Object.entries(body).filter(([name]) => !isReadOnly(name, options)),
    ) as typeof body,
  };
}
