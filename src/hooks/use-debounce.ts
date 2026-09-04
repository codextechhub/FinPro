import { useEffect, useState } from "react";

/**
 * A value that settles before anybody acts on it.
 *
 * Written here rather than taken from ``react-haiku``, which the console has
 * and the school app does not. A shared package that imports a dependency
 * obliges every host to install it, for eight lines; the cost of carrying those
 * eight lines is lower than the cost of that obligation.
 */
export function useDebounce<T>(value: T, delay = 500): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
