import { useAppSelector } from "@/redux/store";

/**
 * Whether the reader is working inside a school's books.
 *
 * Read from the session's tenant kind, the same field the workflow screens read
 * to tell the platform tenant apart. A CodeX operator impersonating a school
 * reads as that school, so the copy matches what the school itself would see.
 *
 * Only the words differ. What a screen offers and what it sends are decided by
 * permissions and by the host, never by this.
 */
export function useIsSchool(): boolean {
  return useAppSelector((state) => state.auth.tenant?.kind === "SCHOOL");
}

/**
 * The word for something that belongs to the whole set of books rather than to
 * one branch, such as a store with no branch.
 *
 * A school calls that "School-wide"; the console's operators work in ledger
 * entities and call it "Entity-wide".
 */
export function wholeBooksLabel(isSchool: boolean): string {
  return isSchool ? "School-wide" : "Entity-wide";
}
