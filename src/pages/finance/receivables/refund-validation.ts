export function refundAmountIsWithinAvailableCredit(
  amountKobo: number,
  availableKobo: number,
): boolean {
  return amountKobo > 0 && amountKobo <= availableKobo;
}
