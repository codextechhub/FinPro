/**
 * What withdrawing a request says it does, by the kind of document it is for.
 *
 * Withdrawing ends the request. Most documents go back to a draft their sender
 * can change and send again from their own screen. A petty cash return cannot
 * be sent again, so withdrawing it cancels it, and so does withdrawing money one
 * branch sent another unasked; money a branch asked for goes back to waiting to
 * be sent. The confirm says which, so nobody withdraws Ikeja's float return
 * meaning to fix its count and finds it cancelled.
 */
export function withdrawDescription(documentType: string | null | undefined): string {
  switch (documentType) {
    case "finance.petty_cash_return":
      return "Withdrawing ends this approval request and cancels the return. To bank the cash, raise a new return.";
    case "finance.inter_branch_transfer":
      return "Withdrawing ends this approval request. Money sent without being asked for is cancelled; money another branch asked for goes back to waiting to be sent.";
    default:
      return "Withdrawing ends this approval request. You'll need to submit again from the module to restart.";
  }
}
