/**
 * Server-side search for a picker over a list that grows with use: customers,
 * vendors, purchase orders, requisitions, RFQs, catalogue items.
 *
 * Those lists are paginated on the server, so a picker that loads one page and
 * filters it in the browser can never offer a row past that page. At Bright
 * Star, with 340 paying families, the payer filed 101st by code could not be
 * chosen on an invoice however their name was typed. A picker built on this
 * hook sends what the reader types to the server instead, after a short pause,
 * and the server's own `?search=` narrows the whole list.
 *
 * The chosen row is looked up on its own whenever the current page does not
 * hold it (see `withChosen`), so a value a form opens with, or one kept while
 * the reader searches for something else, still shows its label.
 */
import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";

/** How long typing must pause before the search reaches the server. */
const SEARCH_DELAY_MS = 250;

/**
 * The reader's search, debounced: `term` is what to send as `?search=` (empty
 * for none), `onSearchChange` goes to SearchSelect, and `searchArg` spreads
 * straight into a list query's arguments.
 */
export function useListSearch() {
  const [typed, setTyped] = useState("");
  const term = useDebounce(typed.trim(), SEARCH_DELAY_MS);
  return { term, onSearchChange: setTyped, searchArg: term ? { search: term } : {} };
}

/** `rows` with `chosen` put first when it is not already among them. */
export function withChosen<Row>(rows: Row[], chosen: Row | undefined, keyOf: (row: Row) => string): Row[] {
  if (!chosen || rows.some((row) => keyOf(row) === keyOf(chosen))) return rows;
  return [chosen, ...rows];
}
